#!/usr/bin/env python3

"""
Skill Bundler — In-place version of package_skill.py.

Copies referenced `shared/resources/<file>` into `<skill>/references/<file>` and
rewrites `shared/resources/X` → `references/X` in the skill's .md and .js files
in place. Idempotent — running again is a no-op when already in sync.

This makes each skill directory self-contained so tools like `npx skills add`
that copy a skill's directory verbatim (without bundling) install a working
skill.

Usage:
    python bundle_skill.py <path/to/skill-folder>
    python bundle_skill.py --all                  # bundle every skill under skills/

Exit codes: 0 success; 1 a skill failed to bundle; 2 usage error.
"""

import functools
import os
import re
import sys
from pathlib import Path

from quick_validate import collect_shared_refs, find_repo_root

# `(?<![\w-]/)` — never match inside an absolute URL: the link pass below writes
# `https://…/blob/develop/shared/resources/x.md` into bundled copies for targets
# a skill does not ship, and a README may quote such a URL. Rewriting that to
# `…/blob/develop/references/x.md` would break the one link that was correct.
# `../shared/resources/` is preceded by `./`, which the class does not include,
# so relative spellings still match.
SHARED_REF_RE = re.compile(r'(?<![\w-]/)(?:\.\./)*shared/resources/([^\s`\'")\]*]+)')
JS_SHARED_RE = re.compile(
    r'(require\(["\'])(?:\.\./)+shared/resources/([^"\']+)(["\'])\)'
)
# ESM counterpart of JS_SHARED_RE, for `.mjs` (and any `.js` written as ESM):
#   import { x } from "../../../shared/resources/x.js"
#   import "../../shared/resources/x.js"
#   await import("../../shared/resources/x.js")
# `require()` and `import` are different syntax for the same edge, so both must be
# rewritten or a `.mjs` skill script breaks in every bundled install while passing
# in-repo — the un-bundled relative path resolves only here.
JS_ESM_SHARED_RE = re.compile(
    r'((?:from|import)\s+["\']|import\s*\(\s*["\'])(?:\.\./)+shared/resources/([^"\']+)(["\'])'
)
# Shell scripts under <skill>/scripts/ source shared libs via a relative path.
# Rewrite any `../…/shared/resources/<name>` to `../references/<name>` (the
# bundled location, one level up from scripts/).
SH_SHARED_RE = re.compile(r'(?:\.\./)+shared/resources/([A-Za-z0-9._-]+)')
# Matches already-rewritten in-tree references (so re-runs and partial states work).
REFS_REF_RE = re.compile(r'(?:^|[\s(\[`\'"/])references/([A-Za-z0-9._-]+\.(?:json|md|sh|js|mjs|py))')
# Sibling require/import in JS — `require("./foo.js")` — used to follow transitive
# deps inside bundled shared .js files.
JS_SIBLING_RE = re.compile(r'require\(["\']\./([A-Za-z0-9._/-]+\.js)["\']\)')
# ESM sibling counterpart — `import … from "./foo.js"` / `import("./foo.mjs")` —
# so transitive deps are followed inside bundled shared ESM files too.
JS_ESM_SIBLING_RE = re.compile(
    r'(?:(?:from|import)\s+["\']|import\s*\(\s*["\'])\./([A-Za-z0-9._/-]+\.m?js)["\']'
)
# Sibling source/exec in shell — for transitive deps inside bundled shared .sh
# files. Matches:
#   source "$(dirname "$0")/foo.sh"   |   exec "$(dirname "$0")/foo.sh" "$@"
#   source ./foo.sh                   |   . ./foo.sh
#   source foo.sh
#   source "${_dir}/foo.sh"           |   source "$_dir/foo.sh"
#
# The `${var}/` spelling was missing for a long time. The three forms are
# interchangeable to bash and distinct to this regex, so the one nobody wrote a
# case for was invisible until a consumer ran the script: the sourced sibling was
# never bundled, the resolver warned and carried on, and the tier it provided
# silently did not exist. Widening this is exact, not speculative — across every
# shared shell source in the tree it adds one match and no false positives.
SH_SIBLING_RE = re.compile(
    r'(?:source|exec|\.)\s+["\']?'
    r'(?:\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/|\$\(dirname[^)]*\)/|\./)?'
    r'([A-Za-z0-9._-]+\.sh)["\']?'
)
# Deliberately INDEPENDENT of SH_SIBLING_RE, and broader: it accepts ANY prefix
# before the filename. `assert_sourced_siblings_landed` must not reuse the matcher
# it exists to check — when the defect IS the matcher's blind spot, a check built
# on the same regex inherits the blind spot and passes vacuously, which is the
# failure mode that lets a missing dependency ship. Verified: reverting
# SH_SIBLING_RE with this check in place makes the check fire.
SH_ANY_SOURCE_RE = re.compile(
    r'(?:^|[\s;&(])(?:source|exec|\.)\s+["\']?(?:[^"\'\s;&|)]*/)?([A-Za-z0-9._-]+\.sh)'
)
EXCLUDE_DIRS = {'__pycache__', '.git', 'node_modules', '.DS_Store'}
# Suffixes that legitimately carry no provenance banner. Kept for documentation:
# absence of a banner is not evidence about these. It is NOT a licence to write —
# an early `return True` here made an authored `.json` silently destroyable, and
# Evidence 2 (byte-equality with the rewritten source) is available for these
# suffixes precisely because no header is injected, so every genuine copy still
# passes.
HEADERLESS_SUFFIXES = {'.json'}
AUTOGEN_MARKER = "AUTO-GENERATED — DO NOT EDIT"


def autogen_header(filename, suffix):
    msg = (
        f"{AUTOGEN_MARKER}. "
        f"Source: shared/resources/{filename}. "
        f"Regenerate via `npm run bundle`."
    )
    if suffix == '.md':
        return f"<!-- {msg} -->\n"
    if suffix in ('.sh', '.py'):
        return f"# {msg}\n"
    if suffix in ('.js', '.mjs'):
        return f"// {msg}\n"
    return ""


def inject_header(content, filename, suffix):
    """Prepend an auto-generated header. Idempotent — skips if already present."""
    if AUTOGEN_MARKER in content.split('\n', 1)[0:2][0] or AUTOGEN_MARKER in content[:300]:
        return content
    header = autogen_header(filename, suffix)
    if not header:
        return content
    # .md: insert after YAML frontmatter if present
    if suffix == '.md' and content.startswith('---\n'):
        end = content.find('\n---\n', 4)
        if end != -1:
            cut = end + len('\n---\n')
            return content[:cut] + header + content[cut:]
    # .sh/.js/.mjs: insert after shebang (e.g. #!/usr/bin/env node) if present
    if suffix in ('.sh', '.js', '.mjs') and content.startswith('#!'):
        nl = content.find('\n')
        if nl != -1:
            return content[:nl + 1] + header + content[nl + 1:]
    return header + content


def rewrite_text(content, suffix):
    """Rewrite `shared/resources/X` references to their bundled `references/X` form.

    Module-level rather than nested inside `bundle_skill()` because the freshness
    write path and the ambiguity gate must agree on it exactly: a bundled copy is
    the source PLUS a banner PLUS this rewrite, so a naive checksum can never
    match. One definition, two callers.
    """
    if suffix == '.md':
        return SHARED_REF_RE.sub(lambda m: f"references/{m.group(1)}", content)
    if suffix in ('.js', '.mjs'):
        # Both forms are applied to both suffixes: a `.js` file may be ESM in a
        # consumer whose package.json says so, and a `.mjs` file may still use
        # createRequire(). Each regex is a no-op when its syntax is absent.
        content = JS_SHARED_RE.sub(
            lambda m: f'{m.group(1)}../references/{m.group(2)}{m.group(3)})',
            content,
        )
        return JS_ESM_SHARED_RE.sub(
            lambda m: f'{m.group(1)}../references/{m.group(2)}{m.group(3)}',
            content,
        )
    if suffix == '.sh':
        return SH_SHARED_RE.sub(lambda m: f"../references/{m.group(1)}", content)
    return content


# ---------------------------------------------------------------------------
# Link re-relativisation (task.108).
#
# A shared resource is authored at `shared/resources/` depth, but its bundled
# copy lives at `skills/<skill>/references/`. `rewrite_text` above handles the
# explicit `shared/resources/X` spelling; every OTHER relative link — a bare
# sibling `open-knowledge-format.md`, a `../../docs/…` path, `../../AGENTS.md` —
# was copied verbatim and resolved one level wrong from the copy. 845 broken
# links in 215 bundled files, measured 2026-09-12, and `--check` certified them
# because it compares copy to source.
#
# One rule, applied to each resolved target:
#   * lands inside THIS skill's directory (a file the bundle ships)  → relative
#   * anything else (docs/, AGENTS.md, an unbundled shared sibling…) → upstream URL
#
# "Inside this skill" for a `shared/resources/X` target means "X is in the set
# of names this skill bundles" — decided from the same population the write and
# check passes use, never from what happens to be on disk mid-run, or the first
# bundle would emit URLs for siblings written a moment later and the second run
# would flip them back.
#
# Twin: `tests/lib/markdown-links.js` — the checker half. The two are
# deliberately duplicated across languages and MUST agree on fence tracking
# (line-based), code-span skipping (per line) and the placeholder pattern.
# ---------------------------------------------------------------------------
UPSTREAM_BASE = "https://github.com/Gamaroff/agent-skills/blob/develop/"

FENCE_RE = re.compile(r'^\s{0,3}(`{3,}|~{3,})')
CODE_SPAN_RE = re.compile(r'(`+)[^`]*?[^`]\1(?!`)|(`+)\2')
LINK_RE = re.compile(r'(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))')
SCHEME_RE = re.compile(r'^[a-zA-Z][a-zA-Z0-9+.-]*:')
PLACEHOLDER_LITERALS = {'url', 'path', '…', '...'}


def is_external_target(target):
    """A target the rewriter must leave alone: a URL or other scheme, an in-page
    anchor, or a template placeholder (`url`, `path`, `…`, or any `{…}`, `[…]`,
    `<…>` segment)."""
    if SCHEME_RE.match(target) or target.startswith('#') or target.startswith('/'):
        # A root-absolute target has no repo-relative meaning on either side:
        # os.path.join would discard src_dir and the JS twin's posix.join would
        # not, so the twins must agree to leave it alone.
        return True
    if target in PLACEHOLDER_LITERALS:
        return True
    return any(ch in target for ch in '{}[]<>')


def _code_spans(line):
    """Half-open (start, end) ranges of inline code spans on one line."""
    return [(m.start(), m.end()) for m in CODE_SPAN_RE.finditer(line)]


def rewrite_md_links(content, src_dir, dst_dir, skill_dir, bundled_names):
    """Re-relativise every prose Markdown link in `content`.

    `src_dir`, `dst_dir`, `skill_dir` are repo-relative POSIX directories —
    `shared/resources`, `skills/<s>/references`, `skills/<s>`. `bundled_names`
    is the set of `references/`-relative names this skill ships. Fenced blocks
    and inline code spans are untouched.

    Runs AFTER `rewrite_text`, so a `shared/resources/X` target has already
    become `references/X` — which, read from a shared source, means "the
    skill's references/X" rather than a real relative path, and is mapped as if
    it were `shared/resources/X`.
    """
    out = []
    fence = None
    for line in content.split('\n'):
        m = FENCE_RE.match(line)
        if fence is not None:
            if m and m.group(1)[0] == fence[0] and len(m.group(1)) >= fence[1]:
                fence = None
            out.append(line)
            continue
        if m:
            fence = (m.group(1)[0], len(m.group(1)))
            out.append(line)
            continue
        spans = _code_spans(line)

        def sub(match):
            if any(a <= match.start() < b for a, b in spans):
                return match.group(0)
            new = _relocate_target(
                match.group(2), src_dir, dst_dir, skill_dir, bundled_names
            )
            return f"{match.group(1)}{new}{match.group(3)}"

        out.append(LINK_RE.sub(sub, line))
    return '\n'.join(out)


def _relocate_target(target, src_dir, dst_dir, skill_dir, bundled_names):
    if is_external_target(target):
        return target
    path_part, sep, fragment = target.partition('#')
    if not path_part:
        return target
    trailing = '/' if path_part.endswith('/') else ''
    if path_part.startswith('references/') and src_dir.startswith('shared/resources'):
        # Authored in a SHARED source as "the skill's references/X" (see
        # docstring). From a skill's own file the same spelling is an ordinary
        # relative path and resolves below.
        resolved = f"shared/resources/{path_part[len('references/'):]}"
    else:
        resolved = os.path.normpath(os.path.join(src_dir, path_part))
    resolved = resolved.rstrip('/')
    if resolved.startswith('..'):
        return target  # escapes the repo — not ours to decide
    if resolved == skill_dir or resolved.startswith(skill_dir + '/'):
        # `== skill_dir` — a link to the skill directory itself is inside it.
        new = os.path.relpath(resolved, dst_dir)
    elif resolved.startswith('shared/resources/') and \
            resolved[len('shared/resources/'):] in bundled_names:
        # A bundled name is relative to the skill's references/ ROOT, not to
        # dst_dir — for a source in a shared subdirectory the two differ
        # (dst_dir = skills/s/references/sub), and joining onto dst_dir emitted
        # `sub/y.md` for a sibling that lives at `references/sub/y.md`.
        new = os.path.relpath(
            os.path.join(f"{skill_dir}/references", resolved[len('shared/resources/'):]),
            dst_dir,
        )
    else:
        new = UPSTREAM_BASE + resolved
    return f"{new}{trailing}{sep}{fragment}"


def expected_bytes(src, name, refs_dir, bundled_names):
    """The exact bytes `<skill>/references/<name>` must hold for source `src`.

    This is the single definition of "in sync". Undecodable sources bypass all
    transforms and are copied verbatim, matching the historical behaviour.

    `refs_dir` is the skill's `references/` directory and `bundled_names` the
    set of names it ships — both required, because the link pass needs to know
    where the copy will live and which siblings will live beside it. Every
    caller passes the same population (`needed` ∪ `reconcilable`), so the writer
    and the checker cannot disagree about what "in sync" means.
    """
    suffix = Path(name).suffix
    try:
        content = rewrite_text(src.read_text(), suffix)
    except UnicodeDecodeError:
        return src.read_bytes()
    if suffix == '.md':
        located = _skill_dirs(str(refs_dir))
        if located is not None:
            repo_root, skill_dir = located
            src_dir = src.parent.resolve().relative_to(repo_root).as_posix()
            dst_dir = (refs_dir.resolve() / name).parent.relative_to(repo_root).as_posix()
            content = rewrite_md_links(
                content, src_dir, dst_dir, skill_dir, set(bundled_names)
            )
    return inject_header(content, name, suffix).encode('utf-8')


@functools.lru_cache(maxsize=None)
def _skill_dirs(refs_dir_str):
    """(resolved repo root, repo-relative skill dir) for a `references/` path —
    memoised, because `expected_bytes` is called once per bundled file per pass
    and the repo-root walk is the same answer every time."""
    refs_dir = Path(refs_dir_str).resolve()
    repo_root = find_repo_root(refs_dir)
    if repo_root is None:
        return None
    repo_root = repo_root.resolve()
    return repo_root, refs_dir.parent.relative_to(repo_root).as_posix()


def _within(root, candidate):
    """True when `candidate` stays inside `root` once `..` segments are resolved."""
    try:
        return candidate.resolve().is_relative_to(root.resolve())
    except (OSError, ValueError):
        return False


def discover_needed(skill_path, shared_dir, refs_dir):
    """Resolve the transitive set of shared resources a skill reaches.

    Returns (needed, skill_files). `needed` maps bundled name -> source Path.

    Discovery seeds from the skill's own files — following both `shared/resources/X`
    and `references/X` there — and then follows only the `shared/resources/X` form
    (plus JS/shell sibling imports) out of each shared source, to a fixed point.

    `references/X` is deliberately NOT followed out of shared text. It reads as a
    dependency but is usually prose: `tracker-card-summary.md` names
    `references/jira-sync.js` while explicitly stating that it avoids the
    `shared/resources/` form so the bundler will *not* vendor a Jira client into
    GitHub-only skills. Following it there vendored 38 unwanted files across the
    repo. Copies that no discovery rule reaches are handled after the fact by
    `source_backed_on_disk()` instead, which keys on a file already existing rather
    than on a sentence mentioning it.
    """
    skill_files = (
        list(skill_path.rglob('*.md'))
        + list(skill_path.rglob('*.js'))
        + list(skill_path.rglob('*.mjs'))
        + list(skill_path.rglob('*.sh'))
    )
    skill_files = [
        f for f in skill_files
        if not any(p in EXCLUDE_DIRS for p in f.parts)
        and 'references' not in f.relative_to(skill_path).parts
    ]

    needed = {}           # filename -> source Path
    pending = []          # candidates from shared/resources/X — warn if missing
    pending_quiet = []    # candidates from references/X — many are skill-native, silent
    for f in skill_files:
        try:
            text = f.read_text()
        except (UnicodeDecodeError, OSError):
            # A non-UTF-8 source anywhere in a skill aborted the whole 125-skill
            # `--all` run with a raw traceback and exit 1. Guarded here AND in
            # pass 3 below — an earlier version guarded only this one while
            # claiming it was the only unguarded read, which left the crash live.
            continue
        pending.extend(collect_shared_refs(text))
        for m in REFS_REF_RE.finditer(text):
            pending_quiet.append(m.group(1))

    seen = set()
    while pending or pending_quiet:
        if pending:
            name = pending.pop()
            quiet = False
        else:
            name = pending_quiet.pop()
            quiet = True
        if name in seen:
            continue
        seen.add(name)
        # `name` is an unsanitised regex capture whose class permits `.` and `/`,
        # so `shared/resources/../../OUTSIDE.md` escaped both refs_dir and the
        # skill: the bundler printed `bundled references/../../OUTSIDE.md` and
        # created `skills/OUTSIDE.md`. Overwriting an existing file was already
        # blocked by the write gate; CREATING one was not.
        if not _within(refs_dir, refs_dir / name) or not _within(shared_dir, shared_dir / name):
            print(f"⚠️  refusing out-of-tree reference: {name}")
            continue
        src = shared_dir / name
        if not src.exists():
            if not quiet:
                print(f"⚠️  shared/resources/{name} not found")
            continue
        needed[name] = src
        try:
            text = src.read_text()
        except (UnicodeDecodeError, OSError):
            continue
        pending.extend(collect_shared_refs(text))
        if src.suffix in ('.js', '.mjs'):
            pending.extend(m.group(1) for m in JS_SIBLING_RE.finditer(text))
            pending.extend(m.group(1) for m in JS_ESM_SIBLING_RE.finditer(text))
        if src.suffix == '.sh':
            pending.extend(m.group(1) for m in SH_SIBLING_RE.finditer(text))

    return needed, skill_files


def source_backed_on_disk(refs_dir, shared_dir, needed):
    """Bundled copies present on disk that discovery did not reach, but which have
    a `shared/resources/` counterpart.

    These are stale copies, not orphans in the risky sense: something put them
    there, and the file they mirror still exists. A copy with NO source is
    skill-native and is deliberately excluded — it legitimately lives in
    references/ and must never be rewritten or removed here.
    """
    out = {}
    if not refs_dir.is_dir():
        return out
    for dst in sorted(refs_dir.rglob('*')):
        # A symlink IS included here — membership means "our concern", and a
        # symlinked reference is very much our concern: a consumer copying the
        # directory verbatim gets a dangling link. `writable_copy` refuses to
        # write it. Excluding it here was the same membership-vs-writability
        # conflation: a symlink no rule discovers entered neither set, so the
        # bundler silently accepted whatever it pointed at.
        if not dst.is_symlink() and not dst.is_file():
            continue
        rel_parts = dst.relative_to(refs_dir).parts
        if any(p in EXCLUDE_DIRS for p in rel_parts):
            continue
        rel = dst.relative_to(refs_dir).as_posix()
        if rel in needed:
            continue
        src = shared_dir / rel
        if not src.is_file():
            continue        # no source ⇒ skill-native ⇒ never ours to touch
        # Membership here means "this file is our concern", NOT "we may write it".
        # The write decision is `writable_copy`, applied at both write sites.
        # Conflating the two meant an authored file that merely shared a name with
        # a shared resource was silently overwritten.
        out[rel] = src
    return out


# The banner's own declared source, e.g.
#   AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/foo.md. Regenerate via …
# Matching the STRUCTURE rather than the phrase is what distinguishes a real
# banner from a document that merely quotes one.
BANNER_SOURCE_RE = re.compile(
    re.escape(AUTOGEN_MARKER) + r'\.\s*Source:\s*shared/resources/(\S+?)\.\s'
)


def _banner_head(text):
    """The region a provenance banner can legitimately occupy.

    Line-based, not byte-based. For a `.md` the banner is injected AFTER the YAML
    frontmatter, and a long `description:` pushes it well past any small byte
    window — measured at char 499 in one real file, so a 512-byte slice cut the
    marker in half and silently misclassified a correctly-bundled copy as
    hand-authored. Bounded so an incidental mention deep in a document cannot
    count as provenance.
    """
    return '\n'.join(text.split('\n')[:40])


def declared_source(text, rel):
    """The path a file's own banner claims to come from, or None.

    Returns the declared path ONLY when it matches `rel`, the file's own location
    under references/. Requiring the match is what stops a document that merely
    quotes the banner from being mistaken for one: prose says the phrase, but it
    does not say `Source: shared/resources/<this file's own path>.`

    Keying on the phrase alone overwrote a hand-authored file in testing — the
    very destruction the check exists to prevent, and in the likeliest case,
    since a document about the bundler is exactly what quotes its banner.
    Validated against the tree: 774 bundled files match their own path, 0 do not.
    """
    m = BANNER_SOURCE_RE.search(_banner_head(text))
    if m and m.group(1) == rel:
        return m.group(1)
    return None


def _looks_bundled(dst, src, name):
    """True when `dst` is demonstrably bundler output rather than authored content.

    Sharing a filename with a shared resource is NOT evidence: a hand-authored
    `references/read-config.sh` would be silently overwritten and stamped
    AUTO-GENERATED. Two things do count as evidence:

    1. It carries the provenance banner.
    2. It is byte-identical to the rewritten source *without* the banner — the
       shape every copy bundled before header injection existed still has.

    Case 2 is not hypothetical and is why the banner alone is too strict: three
    of the eight stale copies this change corrected (`verify-push-state.sh`)
    were exactly that, and a banner-only gate would have refused to fix them.

    Anything else is genuinely ambiguous, and the bundler leaves it alone rather
    than overwriting work it did not create.

    **Evidence 2 cannot distinguish** a pre-header bundled copy from an authored
    file that merely happens to be byte-identical to the rewritten source — an
    empty file, or a one-line note matching the source exactly. They are the same
    bytes; nothing in the file says which it is. The consequence is bounded rather
    than absent: such a file is adopted, gains the banner, and thereafter tracks
    the source. No authored content is lost, because the content was already
    identical to what the bundler would have written.

    Suffixes that never get a header (`.json`, and anything else `autogen_header`
    returns "" for) are accepted on the name match alone and return early — they
    cannot supply evidence 1, and requiring evidence 2 would make a legitimately
    edited-then-regenerated JSON permanently unreconcilable. That is the
    pre-existing behaviour for those suffixes, kept deliberately.
    """
    suffix = Path(name).suffix
    if not autogen_header(name, suffix):
        # An unknown suffix cannot carry a banner, so evidence 1 is unavailable —
        # but that is a gap in our knowledge, not a licence to overwrite. Fall
        # through to evidence 2 (identical to the rewritten source).
        pass
    try:
        text = dst.read_text()
    except UnicodeDecodeError:
        return True          # binary — historical behaviour reconciled it
    except OSError:
        return False         # unreadable — never write over what we cannot inspect
    if declared_source(text, name) is not None:
        return True
    try:
        return text == rewrite_text(src.read_text(), suffix)
    except (UnicodeDecodeError, OSError):
        return False


def writable_copy(dst, src, name):
    """May the bundler write `dst`? True when it does not yet exist, or is
    demonstrably its own output.

    A symlink is never writable through: `write_if_changed` unlinks it, but the
    decision to replace a link the operator placed belongs here, visibly.
    """
    if dst.is_symlink():
        return False
    if not dst.exists():
        return True
    return _looks_bundled(dst, src, name)


def write_if_changed(dst, src, name, new_bytes):
    """Write a bundled copy when its bytes differ. Returns True if it wrote."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.is_symlink():
        # Defence in depth, and UNREACHABLE via today's call sites: both gate on
        # `writable_copy`, which refuses a symlink first. Kept because writing
        # through a link edits its target — for a reference pointing back at
        # shared/resources/ that is the source itself — and a future caller that
        # forgets the gate should still be safe. Deliberately NOT claimed as
        # test-covered: either guard alone produces the correct outcome, so
        # neither is individually provable; only removing both reds the test.
        dst.unlink()
    src_mode = src.stat().st_mode & 0o777
    if dst.exists() and dst.read_bytes() == new_bytes:
        # Content unchanged — still re-sync the mode, in EITHER direction.
        if (dst.stat().st_mode & 0o777) != src_mode:
            dst.chmod(src_mode)
            return True        # a mode repair IS a change, and must be counted
                               # as one or the status line understates the run
        return False
    # Mirroring the mode unconditionally (cycle 4) made a read-only source
    # self-locking: a 0444 source produced a 0444 copy, and the NEXT run died with
    # PermissionError before it could update it. Restore write permission first —
    # the destination is ours to rewrite, whatever mode we last stamped on it.
    if dst.exists():
        current = dst.stat().st_mode & 0o777
        if not current & 0o200:
            dst.chmod(current | 0o200)
    dst.write_bytes(new_bytes)
    # Mirror the source's mode whatever it is — not only `.sh`, and not only when
    # the source is executable. A 0755 `.js` source with 0644 copies was live in
    # this tree; the reverse (0644 source, 0755 copy) ships an executable bit to
    # consumers that the source never had.
    dst.chmod(src_mode)
    return True


def resolve_paths(skill_path):
    """(skill_path, shared_dir, refs_dir) or None when this is not a bundleable skill."""
    skill_path = Path(skill_path).resolve()
    if not (skill_path / 'SKILL.md').exists():
        print(f"❌ SKILL.md not found in {skill_path}")
        return None
    repo_root = find_repo_root(skill_path)
    if not repo_root:
        print(f"❌ Cannot locate repo root from {skill_path}")
        return None
    return skill_path, repo_root / 'shared' / 'resources', skill_path / 'references'


def assert_sourced_siblings_landed(refs_dir, shared_dir):
    """Assert the dependency graph the bundler produced, rather than assuming it.

    Every bundled `.sh` in `references/` is re-read with `SH_ANY_SOURCE_RE` — a
    matcher independent of the one discovery uses — and every sibling `.sh` it
    sources must be present beside it. A sibling that exists in the shared
    directory but not in `references/` is a discovery miss: the discovery regex
    did not match the spelling used, so the file was never copied.

    This turns a soft runtime failure into a build failure. The miss it was written
    for degraded quietly: the consumer's resolver printed a warning, left a
    function undefined and still exited 0, so a `source X || exit 1` guard never
    tripped and a missing config tier was indistinguishable from an absent one.

    Two properties make it worth having, and it is useless without either:

    - **Independence.** It must not reuse `SH_SIBLING_RE`. A check sharing the
      matcher under test cannot contradict it.
    - **Non-vacuity.** A scan that matches nothing passes. So the sourced-sibling
      count is checked against the presence of `source`/`exec` lines at all: a
      shell file that plainly sources something, from which the scan extracted no
      names, means the scan is broken — not that the graph is clean.

    Returns (missing, scan_broken). `missing` is a list of
    (bundled_sh, missing_sibling); `scan_broken` is a list of filenames whose
    source lines the scan could not read.
    """
    missing = []
    scan_broken = []
    for sh in sorted(refs_dir.glob('*.sh')):
        try:
            text = sh.read_text()
        except (UnicodeDecodeError, OSError):
            continue
        names = [m.group(1) for m in SH_ANY_SOURCE_RE.finditer(text)]

        # Non-vacuity floor: this file visibly sources something, yet the scan
        # extracted nothing. "Found no problems" and "could not look" are the same
        # value otherwise, and the reassuring reading is the one that gets kept.
        sources_something = re.search(r'(?:^|[\s;&(])(?:source|exec|\.)\s+\S*\.sh', text)
        if sources_something and not names:
            scan_broken.append(sh.name)
            continue

        for name in names:
            if name == sh.name:
                continue
            if (refs_dir / name).exists():
                continue
            # Only a sibling that HAS a shared source is a bundler miss. A script
            # sourcing something skill-native or system-wide is not this bug.
            if not _within(shared_dir, shared_dir / name):
                continue
            if (shared_dir / name).exists():
                missing.append((sh.name, name))
    return missing, scan_broken


# ---------------------------------------------------------------------------
# Read-only freshness check (`--check`).
#
# `validate.yml` asserts freshness by running the bundler and diffing the tree.
# That is effective for everything the bundler WRITES, and blind to everything it
# does not: a copy whose source was deleted keeps a banner naming a file that no
# longer exists and stays green forever; a symlinked reference the bundler
# refuses to write through is never diffed; an authored file sharing a name with
# a shared resource is correctly left alone and therefore never reported.
#
# Every comparison below goes through `expected_bytes`, so the check cannot drift
# from the writer: "in sync" has one definition and two readers.
# ---------------------------------------------------------------------------

# Classes a `npm run bundle` run actually clears. Membership here is a claim that
# is verified by measurement (check -> bundle -> check), not by assertion — see
# tests/bundle-check-mode.test.js. Printing the regenerate remedy for a class the
# bundler provably cannot clear leaves CI permanently red under an instruction
# that does nothing, which is worse than no remedy at all.
REGENERABLE = ('STALE', 'MISSING', 'WRONG MODE')

REMEDIES = {
    'STALE': 'run `npm run bundle` and commit the result',
    'MISSING': 'run `npm run bundle` and commit the result',
    'WRONG MODE': 'run `npm run bundle` and commit the result',
    'ORPHANED': (
        'the declared source no longer exists — delete the bundled copy, or '
        'restore the shared/resources/ file it names'
    ),
    'SYMLINK': (
        'replace the link with a real file — the bundler refuses to write '
        'through a symlink, so this can never be regenerated'
    ),
    'AMBIGUOUS': (
        'not bundler output and not a symlink — the bundler leaves it alone. '
        'Rename the authored file, or delete it if it is a stale hand-copy'
    ),
    'MISDECLARED': (
        'the banner names a different path than the file occupies — correct the '
        'banner, or delete the copy and re-bundle from the path it claims'
    ),
    'UNREADABLE': (
        'the file could not be opened, so nothing is known about it — fix its '
        'permissions and re-run the check. This is a broken instrument, not a '
        'clean result'
    ),
}

# The banner's declared source, WITHOUT requiring it to match the file's own
# location. `declared_source` deliberately requires the match, because for the
# write gate a non-matching banner is not provenance. Here the two cases are
# different findings — MISDECLARED vs ORPHANED — so the raw declaration is what
# is needed, and reusing `declared_source` would collapse them into "no banner".
def banner_declaration(text):
    """The path a file's banner claims, whatever that path is, or None."""
    m = BANNER_SOURCE_RE.search(_banner_head(text))
    return m.group(1) if m else None


def _read_text_or_none(path):
    text, _ = _read_text_or_error(path)
    return text


def _read_text_or_error(path):
    """(text, error) — the text, or None plus a short reason it could not be read.

    Two callers want different things from the same failure, which is why the
    error is returned rather than swallowed: the orphan scan only needs "no text,
    move on", while the main loop must tell an unreadable file apart from one it
    read and found unconvincing.
    """
    try:
        return path.read_text(), None
    except UnicodeDecodeError:
        return None, 'not valid UTF-8'
    except OSError as exc:
        return None, exc.__class__.__name__


def _is_binary(path):
    """True when the file is readable as bytes but not as text.

    Distinguishes "we cannot open this" from "this is not text" — the first is a
    broken instrument, the second is a legitimate file the bundler already has a
    policy for.

    Reads ONE byte, not the file: the question is whether the handle opens, and a
    whole-file read made every non-UTF-8 reference cost three full reads per check
    (this, the failed decode before it, and `_looks_bundled` after).
    """
    try:
        with path.open('rb') as fh:
            fh.read(1)
        return True
    except OSError:
        return False


def _ambiguity_detail(rel):
    """Why the copy could not be shown to be bundler output — per suffix.

    A suffix that never receives a banner cannot supply evidence 1 *by
    construction*, so evidence 2 (byte-equality with the rewritten source) is the
    only test available — and it fails the instant the copy drifts. Every stale
    `.json` therefore lands in AMBIGUOUS, where the generic remedy leads with
    "rename the authored file". That is the wrong action for the common case, and
    it is not hypothetical: it is the exact shape of the live defect this check
    found on its first run against the tree — a bundled `skill-dependencies.json`
    44 bytes behind its source. The generic detail sent the reader the wrong way,
    so the headerless case says its own name.
    """
    suffix = Path(rel).suffix
    if not autogen_header(rel, suffix):
        return (
            f'differs from the rewritten source, and `{suffix}` files carry no '
            f'provenance banner — so a stale bundled copy and an authored file '
            f'are indistinguishable here. If this is a bundled copy, delete it '
            f'and re-bundle'
        )
    return (
        'carries no provenance banner and is not byte-identical to the '
        'rewritten source'
    )


def check_skill(skill_path):
    """Per-file freshness assertion. READ-ONLY — no write, chmod, mkdir or unlink
    is reachable from this path.

    Returns (problems, ok) where `problems` is a list of
    (skill_name, rel, klass, detail) and `ok` is False only when the skill itself
    could not be resolved. An unresolvable skill is not "clean".
    """
    resolved = resolve_paths(skill_path)
    if resolved is None:
        return [], False
    skill_path, shared_dir, refs_dir = resolved

    problems = []

    def report(rel, klass, detail):
        problems.append((skill_path.name, rel, klass, detail))

    needed, _ = discover_needed(skill_path, shared_dir, refs_dir)
    reconcilable = source_backed_on_disk(refs_dir, shared_dir, needed)

    # Everything that has a source: what discovery reaches, plus what is already
    # on disk mirroring a shared file. Same union the two write passes cover, so
    # the check's population is the writer's population.
    expected = dict(needed)
    expected.update(reconcilable)
    bundled_names = set(expected)

    for rel in sorted(expected):
        src = expected[rel]
        dst = refs_dir / rel

        # Symlink first, and before `exists()`: a link to a missing target is not
        # "missing", and reporting it as MISSING would bucket it regenerable —
        # under a remedy that provably cannot clear it, because `writable_copy`
        # refuses a symlink.
        if dst.is_symlink():
            report(rel, 'SYMLINK', f'symlink -> {os.readlink(dst)}')
            continue

        if not dst.exists():
            report(rel, 'MISSING', 'has a shared source but no bundled copy')
            continue

        if not dst.is_file():
            # A directory sitting at a needed reference name. The write gate
            # refuses it forever, so it is emphatically not regenerable — which
            # is exactly why it must not fall through to the MISSING branch.
            report(rel, 'AMBIGUOUS', 'not a regular file (a directory sits at this name)')
            continue

        text, read_error = _read_text_or_error(dst)

        # "Could not look" and "looked and found nothing" must not share a
        # message. `_looks_bundled` collapses them — its OSError arm returns the
        # same False as a file that was read and failed both evidence tests — so
        # an unreadable file was reported as "carries no provenance banner and is
        # not byte-identical", asserting two facts about content nobody had seen.
        # That is the `empty` vs `scan-broken` conflation this repository
        # separates by design elsewhere, and it matters here for the same reason:
        # of the two readings, the reassuring one is the one that gets believed.
        #
        # A non-UTF-8 file is NOT this case. It reads fine as bytes and
        # `_looks_bundled` has a deliberate answer for it (binary — historically
        # reconciled), so it falls through to the byte comparison below.
        if read_error is not None and not _is_binary(dst):
            report(rel, 'UNREADABLE', f'could not be read: {read_error}')
            continue

        if text is not None:
            declared = banner_declaration(text)
            if declared is not None and declared != rel:
                report(
                    rel, 'MISDECLARED',
                    f'banner declares shared/resources/{declared}',
                )
                continue

        if not _looks_bundled(dst, src, rel):
            report(rel, 'AMBIGUOUS', _ambiguity_detail(rel))
            continue

        # From here the file IS bundler output, so both remaining comparisons are
        # ones `npm run bundle` will act on.
        try:
            actual = dst.read_bytes()
        except OSError as exc:
            report(rel, 'AMBIGUOUS', f'unreadable: {exc.__class__.__name__}')
            continue

        if actual != expected_bytes(src, rel, refs_dir, bundled_names):
            report(rel, 'STALE', 'content differs from the rewritten source')
            continue

        # Mode is compared in both directions and keyed on the SOURCE's mode —
        # never on the suffix. `write_if_changed` mirrors the source's mode
        # whatever it is, so a 0644 copy of a 0755 source and a 0755 copy of a
        # 0644 source are both drift, and both are repaired by a bundle run.
        src_mode = src.stat().st_mode & 0o777
        dst_mode = dst.stat().st_mode & 0o777
        if src_mode != dst_mode:
            report(
                rel, 'WRONG MODE',
                f'{dst_mode:04o} on disk, source is {src_mode:04o}',
            )

    # Copies with NO source on disk. `expected` cannot contain these by
    # construction — `source_backed_on_disk` requires `src.is_file()` — so a
    # bundled copy whose source was deleted is invisible to every branch above,
    # and to regenerate-and-diff. Its own banner is the evidence.
    if refs_dir.is_dir():
        # `Path.rglob` swallows a directory it cannot enter and yields nothing for
        # it, so an unreadable subtree under references/ would simply not be
        # walked — and the run would report "0 problems" over files it never
        # listed. That is the third instance in this function of the same
        # conflation: a failed read presented as a clean result. `os.walk` with an
        # `onerror` callback is the version that can tell them apart.
        unwalkable = []
        walked = []
        for dirpath, _dirnames, filenames in os.walk(
            refs_dir, onerror=lambda exc: unwalkable.append(exc)
        ):
            for fname in filenames:
                walked.append(Path(dirpath) / fname)
            # os.walk does not yield directories as entries, and a SYMLINK to a
            # directory is a finding, so collect those explicitly.
            for dname in _dirnames:
                d = Path(dirpath) / dname
                if d.is_symlink():
                    walked.append(d)

        for exc in unwalkable:
            bad = Path(getattr(exc, 'filename', '') or refs_dir)
            try:
                rel = bad.relative_to(refs_dir).as_posix()
            except ValueError:
                rel = '.'
            report(
                rel, 'UNREADABLE',
                f'directory could not be listed ({exc.__class__.__name__}) — '
                f'anything beneath it was not checked',
            )

        for dst in sorted(walked):
            rel_parts = dst.relative_to(refs_dir).parts
            if any(p in EXCLUDE_DIRS for p in rel_parts):
                continue
            rel = dst.relative_to(refs_dir).as_posix()
            if rel in expected:
                continue
            if dst.is_symlink():
                # A symlink with no shared source still ships a dangling link to
                # anyone who copies the directory verbatim.
                report(rel, 'SYMLINK', f'symlink -> {os.readlink(dst)}')
                continue
            if not dst.is_file():
                continue
            text, read_error = _read_text_or_error(dst)

            # The same distinction the main loop draws, and for the same reason.
            # `if text is None: continue` treated "could not open it" as "it
            # makes no provenance claim", so an orphan that was ALSO unreadable
            # produced `0 problems` — a clean result from a failed read, in the
            # one check whose whole purpose is to make invisible staleness
            # visible. Cycle 1 fixed this conflation in the main loop and did not
            # carry it here, twenty lines down in the same function.
            #
            # A non-UTF-8 file is deliberately still skipped in silence: a banner
            # genuinely cannot be read from binary content, which is residual 6 —
            # a documented, bounded limitation — rather than a broken instrument.
            if read_error is not None:
                if not _is_binary(dst):
                    report(rel, 'UNREADABLE', f'could not be read: {read_error}')
                continue

            declared = banner_declaration(text)
            if declared is None:
                continue        # skill-native, no provenance claim — not ours
            if declared != rel:
                report(
                    rel, 'MISDECLARED',
                    f'banner declares shared/resources/{declared}',
                )
            elif not (shared_dir / declared).is_file():
                report(
                    rel, 'ORPHANED',
                    f'banner declares shared/resources/{declared}, which no '
                    f'longer exists',
                )

    return problems, True


def check_all(targets):
    """Run `check_skill` over every target and print a class-correct summary.

    Returns the process exit code.
    """
    all_problems = []
    unresolved = 0
    for t in targets:
        problems, ok = check_skill(t)
        if not ok:
            unresolved += 1
            continue
        if problems:
            print(f"❌ {Path(t).name}: {len(problems)} problem(s)")
            for _skill, rel, klass, detail in problems:
                print(f"  {klass:<12} references/{rel} — {detail}")
            all_problems.extend(problems)

    if not all_problems and not unresolved:
        print(f"✅ bundle freshness: {len(targets)} skill(s) checked, 0 problems")
        return 0

    counts = {}
    for _skill, _rel, klass, _detail in all_problems:
        counts[klass] = counts.get(klass, 0) + 1

    skills_affected = len({p[0] for p in all_problems})
    print("")
    print(
        f"❌ bundle freshness: {len(all_problems)} problem(s) "
        f"across {skills_affected} skill(s)"
    )

    # Only classes that actually occurred are named. A summary that lists the
    # whole taxonomy every run puts every class name in stdout, which makes
    # "this class was not reported" unassertable by anyone reading the output —
    # including a test.
    for klass in REGENERABLE:
        if klass in counts:
            print(f"   {klass} x{counts[klass]} — {REMEDIES[klass]}")
    for klass in sorted(k for k in counts if k not in REGENERABLE):
        print(f"   {klass} x{counts[klass]} — {REMEDIES[klass]}")

    if unresolved:
        print(f"   {unresolved} target(s) could not be resolved as skills")
    return 1


def bundle_skill(skill_path):
    resolved = resolve_paths(skill_path)
    if resolved is None:
        return False
    skill_path, shared_dir, refs_dir = resolved

    # Pass 1: walk skill files (excluding references/) and shared files transitively.
    needed, skill_files = discover_needed(skill_path, shared_dir, refs_dir)

    # Pass 1b: add on-disk copies discovery could not reach but which have a source.
    reconcilable = source_backed_on_disk(refs_dir, shared_dir, needed)
    # The population the link pass decides "bundled sibling" against — the same
    # union `check_skill` uses, so a copy the writer emits is the copy the checker
    # expects.
    bundled_names = set(needed) | set(reconcilable)

    if not needed and not reconcilable:
        # Nothing shared reaches this skill and nothing on disk mirrors a shared
        # file. Any references/ content here is skill-native — leave it alone.
        print(f"✓ {skill_path.name}: no shared refs")
        return True

    # Pass 2: copy shared files into references/, with rewritten content. Idempotent.
    refs_dir.mkdir(exist_ok=True)
    bundled = 0
    protected = 0
    for name, src in needed.items():
        dst = refs_dir / name
        # The ambiguity gate belongs on BOTH write paths. It used to guard only
        # reconciliation, which is the path a file reaches when NOTHING mentions
        # it — so the guarantee held precisely where the danger was smallest. In
        # the ordinary case (a skill's own files name the file, either as
        # `references/X` or `shared/resources/X`) discovery reaches it and pass 2
        # wrote straight over an authored file. The test that claimed otherwise
        # used the one fixture seed that routed to the branch that worked.
        if not writable_copy(dst, src, name):
            protected += 1
            why = "symlink" if (refs_dir / name).is_symlink() else "not bundler output"
            print(f"  SKIPPED references/{name} — {why}, left alone")
            continue
        if write_if_changed(dst, src, name, expected_bytes(src, name, refs_dir, bundled_names)):
            bundled += 1
            print(f"  bundled references/{name}")

    # Pass 2b: reconcile the copies discovery did not reach.
    #
    # Discovery answers "what should this skill have?"; disk answers "what does it
    # already have?". A file in the second set but not the first was previously
    # invisible to every later step INCLUDING the status line, so the bundler
    # reported `in sync` for files it had not opened. Reconciling here means a copy
    # is refreshed on the strength of having a source, not of being reachable.
    reconciled = 0
    for name, src in reconcilable.items():
        dst = refs_dir / name
        if not writable_copy(dst, src, name):
            protected += 1
            why = "symlink" if (refs_dir / name).is_symlink() else "not bundler output"
            print(f"  SKIPPED references/{name} — {why}, left alone")
            continue
        if write_if_changed(dst, src, name, expected_bytes(src, name, refs_dir, bundled_names)):
            reconciled += 1
            print(f"  reconciled references/{name} (not reached by discovery)")

    # Pass 3: rewrite skill source files in place.
    rewritten = 0
    for f in skill_files:
        try:
            original = f.read_text()
        except (UnicodeDecodeError, OSError):
            # A non-UTF-8 file here crashed the whole run with a raw traceback,
            # aborting before later skills were bundled. Guarded like its sibling
            # in `discover_needed`.
            continue
        updated = rewrite_text(original, f.suffix)
        if updated != original:
            f.write_text(updated)
            rewritten += 1
            print(f"  rewrote {f.relative_to(skill_path)}")

    # Assert the graph, do not assume it. Runs after every write path, so it sees
    # what actually landed rather than what discovery intended.
    unlanded, scan_broken = assert_sourced_siblings_landed(refs_dir, shared_dir)
    for sh_name, missing_name in unlanded:
        print(
            f"  ❌ references/{sh_name} sources {missing_name}, which has a source "
            f"at shared/resources/{missing_name} but was not bundled"
        )
    for sh_name in scan_broken:
        print(
            f"  ❌ references/{sh_name} sources a .sh the sibling scan could not "
            f"read — the scan is broken, not the graph clean"
        )

    parts = []
    if bundled:
        parts.append(f"{bundled} bundled")
    if reconciled:
        parts.append(f"{reconciled} reconciled")
    if protected:
        parts.append(f"{protected} left alone")
    if rewritten:
        parts.append(f"{rewritten} rewritten")
    # `in sync` is now an assertion about every source-backed copy on disk, not
    # only about the ones discovery happened to reach.
    status = ", ".join(parts) if parts else "in sync"
    if unlanded or scan_broken:
        detail = []
        if unlanded:
            detail.append(f"{len(unlanded)} sourced sibling(s) not bundled")
        if scan_broken:
            detail.append(f"{len(scan_broken)} file(s) the sibling scan could not read")
        print(f"❌ {skill_path.name}: {status}, " + ", ".join(detail))
        return False
    print(f"✅ {skill_path.name}: {status}")
    return True


USAGE = (
    "Usage: bundle_skill.py <skill-path>... | --all\n"
    "       bundle_skill.py --check [<skill-path>... | --all]"
)


def main():
    args = sys.argv[1:]

    # Unknown flags are rejected outright rather than treated as skill paths: a
    # typo (`--al`, `-all`) must not fall through to a write.
    all_mode = '--all' in args
    # `--check` is READ-ONLY. It shares argument handling with the write path so
    # the two cannot disagree about which skills they address — a check that
    # inspects a different set than the bundler writes proves nothing about it.
    check_mode = '--check' in args
    args = [a for a in args if a not in ('--all', '--check')]

    # ANY leading dash, not just `--`. `-check` was treated as a skill path, so a
    # single-dash typo on a read-only request ran the MUTATING bundle and exited 0.
    unknown = [a for a in args if a.startswith('-')]
    if unknown:
        print(f"❌ Unknown option(s): {' '.join(unknown)}")
        print(USAGE)
        sys.exit(2)

    # `--check` with no target means every skill: the CI use is a whole-tree
    # assertion, and requiring `--check --all` there is a spelling nobody would
    # get wrong twice but everybody gets wrong once.
    if check_mode and not args:
        all_mode = True

    if not all_mode and not args:
        print(USAGE)
        sys.exit(2)

    if all_mode:
        if args:
            print(f"❌ --all takes no skill paths (got: {' '.join(args)})")
            print(USAGE)
            sys.exit(2)
        repo_root = Path(__file__).resolve().parents[3]
        skills_dir = repo_root / 'skills'
        targets = sorted(d for d in skills_dir.iterdir() if (d / 'SKILL.md').exists())
    else:
        targets = [Path(a) for a in args]

    if check_mode:
        sys.exit(check_all(targets))

    failed = 0
    for t in targets:
        if not bundle_skill(t):
            failed += 1
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
