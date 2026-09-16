#!/usr/bin/env bash
# AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/read-config.sh. Regenerate via `npm run bundle`.
# read-config.sh — shared readers for skills-config.yaml.
#
# Usage (in a skill, script, or another shared resolver):
#   source shared/resources/read-config.sh
#
# Provides:
#   config_python                     — echo an interpreter that can parse YAML; return 1 if none
#   config_file_status                — echo missing | ok | malformed | unverified
#   read_config_key <key>             — top-level scalar. Echoes the value, "auto" when the key is
#                                       absent/null, or "__MAP__" when the key holds a mapping or
#                                       sequence rather than a scalar.
#   read_nested_config_key <p> <c>    — two-level scalar. Echoes the value or an empty string.
#   config_child_shape <parent>       — echo absent | mapping | scalar. Lets a caller reject a key
#                                       written in a shape it cannot honour, instead of silently
#                                       reading nothing out of it.
#
# Two tiers:
#   Tier 1 — python + pyyaml. Full YAML: distinguishes a mapping from a scalar, an absent key from
#            a parse failure, and understands the inline flow form. Its answer is AUTHORITATIVE —
#            when tier 1 runs, tier 2 is not consulted. (Letting an "absent" answer fall through to
#            awk is what made `tracker: null` halt: tier 1 correctly said "not configured", awk then
#            returned the literal text `null`, and validation rejected it.)
#   Tier 2 — awk. Handles `key: value`, two-level block mappings, and the inline flow mapping
#            `parent: {child: value}`. No dependencies.
#
# The tier-1 probe tries `python3` first and falls back to `python`, and is MEMOISED — it used to
# re-run `command -v` plus `import yaml` on every call, costing ten python spawns and about a second
# per `source`. The copies this file replaces invoked a bare `python`, which macOS has not shipped
# since 12.3, so tier 1 was dead on most machines and awk was silently the only tier.
#
# The config path and every key name are passed to python as ARGUMENTS, never spliced into the
# program text. Splicing made a path containing a quote both break the parse and execute arbitrary
# code.
#
# Testing hook: AGENT_SKILLS_CONFIG_TIER=awk forces the tier-2 path; =python skips the tier-2
# fallback. Unset (normal operation) tries tier 1, then tier 2. The tiers can only be told apart on
# inputs a real parser grades differently, so any suite covering those must force each tier
# explicitly — and must SKIP loudly, not silently pass, when the forced tier is unavailable.

# Where the config path came from. An explicit SKILLS_CONFIG_FILE is a redirect, and a redirect that
# lands on nothing must be refused rather than degraded — see the check in resolve-platform.sh.
#
# Decided by comparing against the literal default rather than by "was the variable set?", because
# this file is sourced more than once per shell (the resolver sources it as a sibling) and after the
# first source the variable is always set — by this very line. A memoised "was it set the first
# time?" answer is then wrong for a caller that sets the variable BETWEEN two sources, and wrong in
# the fail-open direction. Stateless is the fix: the only value this misreads is an explicit
# `SKILLS_CONFIG_FILE=skills-config.yaml`, which names the default and so behaves identically to
# leaving it unset.
if [ -n "${SKILLS_CONFIG_FILE:-}" ] && [ "$SKILLS_CONFIG_FILE" != "skills-config.yaml" ]; then
  # Quoted: `env` is a shell builtin, so an unquoted assignment is read by
  # ShellCheck (SC2209) as a mistyped `$(env)`. Both arms quoted for symmetry.
  _CONFIG_FILE_ORIGIN="env"
else
  _CONFIG_FILE_ORIGIN="default"
fi
SKILLS_CONFIG_FILE="${SKILLS_CONFIG_FILE:-skills-config.yaml}"

# Memoised probe result: "" = not yet probed, "-" = no usable interpreter, else the interpreter.
_CONFIG_PY=""
# The isolation flag that interpreter accepts: "-P", "-I", or "" (neither). See _config_probe.
_CONFIG_PY_ISOLATE=""
# Prologue prepended to every probe command, for the same reason the shared program carries one.
_CONFIG_PY_SAFE_PATH='import sys; sys.path[:] = [p for p in sys.path if p not in ("", ".")]; '

# One program, three modes — so a single file read serves every question and there is one place
# where YAML semantics are decided. Sentinels are chosen to be impossible YAML scalars.
_CONFIG_PY_PROG='
import sys
# `python -c` prepends the CURRENT DIRECTORY to sys.path, so a file named yaml.py beside
# skills-config.yaml was imported instead of PyYAML — arbitrary code execution on merely sourcing
# the resolver, and total control of the resolved access value. This reader is carefully hardened
# against the config as DATA (record forgery, NUL, separators); that hardening is worth nothing if
# the parser itself can be replaced. `sys` is a builtin module and cannot be shadowed, so this
# runs before anything importable is touched. _config_probe additionally passes -P/-I where the
# interpreter supports it, which closes the same hole earlier (at site import) — this line is what
# covers the interpreters that support neither.
sys.path[:] = [p for p in sys.path if p not in ("", ".")]
import yaml

# YAML says last-wins on a duplicate key; that is technically correct and operationally awful here.
# A copy-pasted second `access:` block made the first one vanish, silently resolving a declared
# `manual` back to `full` — and the same shape flipped `tracker:`. Treat a duplicate as the config
# error it is, so the malformed branch fails closed rather than quietly picking one.
class _StrictLoader(yaml.SafeLoader):
    pass

def _merge_source_keys(loader, mapping, seen=None):
    """Every key ONE mapping node contributes, including those it inherits through its own `<<`.

    The recursion is the point. Collecting only the keys written directly on the source made a
    nested merge invisible to the overlap check below: `<<: {<<: *restrictive, x: 1}` contributes
    `tracker` but spells only `x`, so pairing it with a permissive source read as disjoint and the
    permissive one won, silently, at exit 0. A NAMED source happened to be covered by accident —
    flatten_mapping mutates the anchored node in place when it is constructed, so its inherited keys
    are already written on it by the time the alias site is scanned — but a source declared AT the
    merge site is never constructed in its own right and so was never flattened.

    `seen` guards a recursive anchor, which is legal YAML and would otherwise spin here."""
    if seen is None:
        seen = set()
    if id(mapping) in seen:
        return set()
    seen.add(id(mapping))
    ks = set()
    for k, v in mapping.value:
        if getattr(k, "tag", None) == "tag:yaml.org,2002:merge":
            for sub in (v.value if isinstance(v, yaml.SequenceNode) else [v]):
                if isinstance(sub, yaml.MappingNode):
                    ks |= _merge_source_keys(loader, sub, seen)
            continue
        ks.add(loader.construct_object(k, deep=True))
    return ks

def _merge_source_keysets(loader, node):
    """The key sets each source of ONE `<<` contributes, as written.

    A source is a mapping node, or a sequence of them. An alias is already the anchored node by the
    time the composer is done, so no dereferencing is needed here."""
    sets = []
    for sub in (node.value if isinstance(node, yaml.SequenceNode) else [node]):
        if isinstance(sub, yaml.MappingNode):
            sets.append(_merge_source_keys(loader, sub))
    return sets

def _scan_keys(loader, node):
    """Reject a duplicate among the keys of ONE mapping node, as written."""
    seen = set()
    merged = []          # key sets contributed by every merge source at this mapping
    for k, v in node.value:
        if getattr(k, "tag", None) == "tag:yaml.org,2002:merge":
            # OVERLAPPING merge sources are the escalation: pyyaml resolves them last-wins and
            # silently, so an operator merging a restrictive default and then a permissive one gets
            # the permissive one with no diagnostic. DISJOINT sources are not — pyyaml merges them
            # deterministically, `<<: [*a, *b]` is the documented way to compose two blocks, and the
            # same composition spelled as two `<<` lines means exactly the same thing. Rejecting the
            # whole shape (an earlier, blunter version of this guard) refused a legal config and
            # halted the run, which is the opposite failure and just as bad.
            for ks in _merge_source_keysets(loader, v):
                for prior in merged:
                    clash = prior & ks
                    if clash:
                        raise ValueError(
                            "overlapping merge sources define %s" % (sorted(map(repr, clash))[0],))
                merged.append(ks)
            continue
        key = loader.construct_object(k, deep=True)
        if key in seen:
            raise ValueError("duplicate key: %r" % (key,))
        seen.add(key)

def _scan_merge_sources(loader, node):
    """Scan mappings that appear AS a merge source at this site.

    A merge source defined at the merge site — `<<: {a: 1, a: 2}`, or an anchor declared right
    there, or a sequence of such — is spliced in by flatten_mapping without ever being constructed
    in its own right, so it never reaches the duplicate check. Its duplicates then resolve
    last-wins, silently: a declared `manual` became `full`. A NAMED node is already covered,
    because it is constructed where it is defined."""
    for k, v in node.value:
        if getattr(k, "tag", None) != "tag:yaml.org,2002:merge":
            continue
        for sub in (v.value if isinstance(v, yaml.SequenceNode) else [v]):
            if isinstance(sub, yaml.MappingNode):
                _scan_keys(loader, sub)
                _scan_merge_sources(loader, sub)

def _no_dupes(loader, node):
    # Scan the keys AS WRITTEN, before flatten_mapping runs. Order matters twice over:
    #   * scanning before means a `<<` merge key is skipped explicitly rather than blowing up for
    #     want of a constructor (which graded a legal config malformed);
    #   * scanning before ALSO means an inherited key and a local key that overrides it are not
    #     mistaken for a duplicate — flatten_mapping PREPENDS the merged pairs, and overriding is
    #     the entire purpose of `<<`.
    _scan_keys(loader, node)
    _scan_merge_sources(loader, node)
    loader.flatten_mapping(node)
    # Generator, not a plain return: construct_yaml_map yields the dict before filling it, which is
    # what lets a recursive anchor resolve. Returning a finished dict broke those.
    for data in yaml.SafeLoader.construct_yaml_map(loader, node):
        yield data

_StrictLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _no_dupes)

def _err(exc):
    # `__ERR__:<line>:<reason>` — the same signal, now carrying WHY.
    #
    # A bare `__ERR__` made every halt generic, so the resolver had to enumerate the shapes this
    # reader rejects (duplicate key / two overlapping merge sources / a NUL byte) and hope the
    # operator recognised theirs. A yaml.YAMLError carries `problem_mark.line` and `problem`, and
    # the strict loader raises ValueError naming the offending key. Both beat a list of guesses.
    #
    # The reason is DATA and travels the same hardened transport as any value, so it is flattened
    # to one line, stripped to printable ASCII and truncated HERE — before framing, while the bulk
    # encoder separator check can still refuse it. Line 0 means no position was available, which is
    # the case for the semantic errors: they are about a key, not a column.
    mark = getattr(exc, "problem_mark", None)
    line = (mark.line + 1) if mark is not None else 0
    reason = getattr(exc, "problem", None) or str(exc)
    reason = " ".join(str(reason).split())
    reason = "".join(c for c in reason if 32 <= ord(c) < 127)[:120]
    return "__ERR__:%d:%s" % (line, reason)

path, mode = sys.argv[1], sys.argv[2]
try:
    with open(path) as f:
        d = yaml.load(f, Loader=_StrictLoader)
except Exception as exc:
    print(_err(exc)); sys.exit(0)
if d is None:
    d = {}
if not isinstance(d, dict):
    print("__ERR__:0:the top level of the file is not a mapping"); sys.exit(0)

def emit(v):
    if v is None:
        print("__NONE__")
    elif isinstance(v, bool):
        print("true" if v else "false")
    elif isinstance(v, (dict, list)):
        print("__MAP__")
    else:
        print(v)

def answer(spec):
    """Return (kind, payload). The KIND comes from provenance, never from what the payload spells —
    inferring it from the text meant a config containing the literal `__MAP__` was classified as a
    signal and obeyed, which is the forgery this framing exists to stop."""
    kind, _, rest = spec.partition(":")
    if kind == "status":
        return ("s", "ok")
    if kind == "key":
        return _scalar(d.get(rest))
    if kind == "shape":
        p = d.get(rest)
        return ("v", "absent" if p is None else ("mapping" if isinstance(p, dict) else "scalar"))
    if kind == "nested":
        parent, _, child = rest.partition(".")
        p = d.get(parent)
        if not isinstance(p, dict):
            return ("s", "__NONE__")
        return _scalar(p.get(child))
    return ("s", "__ERR__")   # unknown spec — fail closed, never "absent"

def _scalar(v):
    if v is None:
        return ("s", "__NONE__")
    if isinstance(v, bool):
        return ("v", "true" if v else "false")
    if isinstance(v, (dict, list)):
        return ("s", "__MAP__")
    return ("v", str(v))

if mode == "status":
    print("ok")
elif mode == "key":
    print(answer("key:" + sys.argv[3])[1])
elif mode == "shape":
    print(answer("shape:" + sys.argv[3])[1])
elif mode == "nested":
    print(answer("nested:%s.%s" % (sys.argv[3], sys.argv[4]))[1])
elif mode == "bulk":
    # One spawn, many answers, NUL-framed and TYPED: each record is
    #     <index> US <kind> US <payload> RS          US = 0x1f, RS = 0x1e, kind ∈ {v, s}
    # `v` = a value the config actually contains; `s` = a signal from this reader.
    #
    # Two earlier attempts failed here and both failures were the same mistake in different clothes:
    # putting data and control on one untyped channel. Bare lines let a multi-line value shift every
    # later answer. Escaping fixed the shifting but added an encoder with no decoder, and mangled the
    # trailing newline every block scalar carries, so a working config started halting.
    #
    # ASCII US/RS need no escaping: they survive command substitution (NUL does not — bash strips it,
    # which is why the obvious choice is unusable here) and do not occur in a real config. And they
    # are belt to the kind bytes braces: a value that somehow contained a separator could at worst
    # truncate its own record, which then fails enum validation loudly. A config containing the
    # literal text `__MAP__` arrives as DATA and is validated like any other value, rather than being
    # obeyed as a signal.
    out = []
    for i, spec in enumerate(sys.argv[3:], 1):
        kind, payload = answer(spec)
        # An unescaped framing is only safe if the payload cannot contain a separator. Without this
        # a value could inject a whole record — records are emitted in index order, and the decoder
        # takes the FIRST match, so a payload in record N lands ahead of every real record after it
        # and wins. That silently turned a declared `manual` into `full`.
        #
        # NUL is here for a different reason than US/RS: it frames nothing, but bash and zsh DELETE
        # it during command substitution, so `access.tracker: "\0"` arrived as an empty payload and
        # read as unconfigured — full, exit 0, no warning. Three bytes the transport cannot carry;
        # refusing costs nothing, since no legal value (enum or filesystem path) contains any of them.
        if any(c in payload for c in ("\x1f", "\x1e", "\x00")):
            kind, payload = "s", "__ERR__"
        # A block scalar always carries a trailing newline; `$( )` used to strip it, so stripping
        # here keeps the bulk path and the individual readers agreeing on the same file.
        if kind == "v":
            payload = payload.rstrip("\n")
        out.append("%d\x1f%s\x1f%s\x1e" % (i, kind, payload))
    sys.stdout.write("".join(out))
'

# _config_probe — populate $_CONFIG_PY; return 0 when tier 1 is usable.
#
# Deliberately sets a global and echoes nothing. Every reader below runs inside a command
# substitution, so a probe that returned its answer on stdout would be memoising into a subshell
# that exits immediately — the cache would never reach the parent and the probe would re-run on
# every call. That is what made one `source` cost ten python spawns. The probe therefore runs ONCE
# at source time (bottom of this file) and the readers consult the variable.
_config_probe() {
  [ "${AGENT_SKILLS_CONFIG_TIER:-}" = "awk" ] && return 1
  if [ -z "$_CONFIG_PY" ]; then
    _CONFIG_PY="-"
    local py flag
    for py in python3 python; do
      command -v "$py" >/dev/null 2>&1 || continue
      # Pick the strongest isolation this interpreter accepts AND under which pyyaml is still
      # importable. Order matters and so does the second half of that sentence:
      #   -P  (3.11+) drops only the current directory from sys.path — exactly the hole, nothing else.
      #   -I  (3.4+)  also ignores PYTHONPATH and user site-packages. That closes the hole one step
      #               earlier (before `site` runs) but can hide a `pip install --user pyyaml`, and
      #               demoting such a host to the awk tier would be a worse outcome than the risk —
      #               hence the import check per flag rather than a blind choice by version.
      #   ""          neither flag exists; the program's own sys.path prologue is the whole defence.
      for flag in -P -I ""; do
        if [ -n "$flag" ]; then
          "$py" "$flag" -c "${_CONFIG_PY_SAFE_PATH}import yaml" >/dev/null 2>&1 || continue
        else
          "$py" -c "${_CONFIG_PY_SAFE_PATH}import yaml" >/dev/null 2>&1 || continue
        fi
        _CONFIG_PY="$py"
        _CONFIG_PY_ISOLATE="$flag"
        break
      done
      [ "$_CONFIG_PY" != "-" ] && break
    done
  fi
  [ "$_CONFIG_PY" != "-" ]
}

# Public form — echoes the interpreter, for callers and tests that want to know which one won.
config_python() {
  _config_probe || return 1
  echo "$_CONFIG_PY"
}

_config_py_run() {
  # _config_py_run <mode> [args...] — run the shared program, or return 1 if tier 1 is unavailable.
  _config_probe || return 1
  # Two explicit branches rather than an unquoted "$flag": an empty unquoted expansion is elided by
  # both shells, but relying on that is exactly the class of shell subtlety this file has already
  # been bitten by twice (${!var}, $ACCESS_MODES). Spell it out.
  if [ -n "$_CONFIG_PY_ISOLATE" ]; then
    "$_CONFIG_PY" "$_CONFIG_PY_ISOLATE" -c "$_CONFIG_PY_PROG" "$SKILLS_CONFIG_FILE" "$@" 2>/dev/null
  else
    "$_CONFIG_PY" -c "$_CONFIG_PY_PROG" "$SKILLS_CONFIG_FILE" "$@" 2>/dev/null
  fi
}

# config_file_status — can skills-config.yaml be trusted?
#
#   missing     — no file. Every key is absent; callers use their defaults.
#   ok          — tier 1 parsed it and it is a mapping (or empty).
#   malformed   — tier 1 failed to parse it, or tier 2 saw a line that cannot be valid YAML.
#   unverified  — tier 2 only, nothing obviously wrong. NOT a promise of validity.
#
# The distinction matters to one caller: resolve-platform.sh fails closed on `malformed` when an
# `access:` block is present, because silently degrading an access control to its permissive default
# is the one failure that must never happen.
config_file_status() {
  local out
  [ -f "$SKILLS_CONFIG_FILE" ] || { echo missing; return 0; }

  if out=$(_config_py_run status); then
    [ "$out" = "ok" ] && echo ok || echo malformed
    return 0
  fi

  # Tier 2: reject only what cannot be valid YAML in block context — a line whose first non-space
  # character is ':'. Nothing else.
  #
  # This lint used to also require every non-indented line to look like `key:`, which rejected
  # perfectly legal files: a root-level block sequence (`- item` at column 0), a quoted key, a key
  # containing '/' or a space. With an `access:` block present those became a hard halt, and only on
  # hosts without pyyaml — so the same file worked on one machine and bricked the pipeline on
  # another. A heuristic that is not a parser must not invent malformation it cannot prove.
  #
  # Block scalars are still tracked so their free-form body is never graded as YAML.
  if awk '
    {
      n = match($0, /[^ \t]/)
      indent = (n ? n - 1 : -1)
    }
    /^[[:space:]]*$/                         { next }
    in_bs && indent > bs_indent              { next }
                                             { in_bs = 0 }
    /^[[:space:]]*#/                         { next }
    /:[[:space:]]*[|>][0-9+-]*[[:space:]]*$/ { in_bs = 1; bs_indent = indent; next }
    /^[[:space:]]*:/                         { bad = 1; exit }
    END                                      { exit (bad ? 1 : 0) }
  ' "$SKILLS_CONFIG_FILE" 2>/dev/null; then
    echo unverified
  else
    echo malformed
  fi
}

# ── Tier 2's grammar: the documented strict subset ──────────────────────────────────────────────
#
# Tier 2 is a set of anchored line regexes, not a parser, and until now it had only TWO answers:
# a value, or absent. Everything it could not read fell into "absent" — which for `access:` means
# `full`. A merge key, an anchor, a quoted key, a space before the colon: each read as absent, at
# exit 0, with nothing printed, while tier 1 read the declared restriction. Six QA cycles in
# task.51 each closed one more spelling and each left the siblings open, because a regex added per
# spelling is not a grammar.
#
# This is the third answer. `__UNSUPPORTED__` says "I did not read this", which is a different
# statement from "it is not there", and the resolver halts on it rather than defaulting.
#
# WHAT IS REFUSED is judged by ONE question: can this construct change what one of the six keys
# this reader consumes resolves to, relative to what its own line says? Two answers, and they have
# different blast radii:
#
#   NON-LOCAL — an anchor, an alias, a merge key, a flow mapping spanning lines, an explicit tag, a
#   BOM, a document separator. Each can move or reinterpret content declared elsewhere, so a
#   line-oriented scanner cannot bound which key it affects. Refused FILE-WIDE. Local reasoning
#   about "but that anchor is inside a section we never read" is exactly what failed six times in
#   task.51, and the aliasing family is narrow enough that a real config rarely carries one.
#
#   LOCAL — a quoted key, a space before the colon, an explicit `? key`. These change only how ONE
#   key is spelled, and only that key. `"access":` hides the access block from `^access:` and must
#   be refused; `"my key": 1` beside a perfectly readable `access:` block cannot mislead anything
#   and refusing it would lock a consumer out of their own config for a key we never read. So these
#   are refused only when the key so spelled is one this reader CONSUMES ($_CONFIG_GUARDED_KEYS),
#   or when the quoting hides an escape a parser would resolve and this scanner cannot.
#
# That is a closed rule over a closed key set — a grammar, not one more spelling patched shut.
#
# Everything else is read from its own line and cannot mislead, so nesting at ANY depth, block
# sequences, flow sequences and sequences-of-mappings are IGNORABLE and never refused. A
# shape-based subset ("nothing deeper than two levels") would refuse this project own documented
# example config — see docs/reference/configuration.md, whose canonical block carries three- and
# four-level nesting, a flow sequence and a sequence of mappings.
#
# RELATIONSHIP TO config_file_status's awk lint — they are INDEPENDENT and stay that way.
# config_file_status answers "is this YAML at all" and rejects only what cannot be valid YAML in
# block context. This scan answers "can I read it CORRECTLY". A file can be flawless YAML and still
# sit outside the subset; that is the entire point. Two overlapping awk lints with an unstated
# relationship drift — the way _config_denull drifted across two call sites — so the relationship
# is stated here and in config_file_status's own header rather than left to be inferred.
#
# "-"  = within the subset, or tier 1 is authoritative, or there is no file.
# else = "<line>:<construct>" naming the FIRST construct outside it.
_CONFIG_SUBSET_VERDICT=""

# Every key any reader in this file can be asked for — the closed set the LOCAL rules above are
# judged against. It is deliberately a LIST rather than a lookup on the caller args: the scan runs
# once, at source time, before any reader is called, so it cannot know what will be asked. Keep it
# in step with the call sites:
#
#   read_config_key                 tracker | vcs
#   read_nested_config_key          prd.prdShardedLocation | architecture.architectureShardedLocation
#                                   observations.workspace
#   read_nested_config_key_strict   access.tracker | access.vcs
#   config_child_shape              access
#
# Widening the surface without widening this list would re-open the hole for the new key, quietly.
# tracker-access.test.sh pins the list against the live call sites so that cannot pass unnoticed.
_CONFIG_GUARDED_KEYS='access|tracker|vcs|prd|architecture|prdShardedLocation|architectureShardedLocation|observations|workspace'

# _config_subset_scan — populate $_CONFIG_SUBSET_VERDICT. Echoes nothing.
#
# ONE awk pass, run ONCE at source time from the bottom of this file — exactly like _config_probe,
# and for exactly its reason: every reader here runs inside a command substitution, so a scan
# memoised on first use caches into a subshell that exits immediately, never reaches the parent,
# and re-runs on every call. That is what made one `source` cost ten python spawns. A
# `$(_config_subset_scan)` call site is self-defeating — the `$( )` is the very subshell the memo
# cannot escape.
#
# Skipped entirely when tier 1 is usable: tier 1 is authoritative when it runs and tier 2 is never
# consulted, so the subset is not a property of that run and scanning would cost an awk spawn to
# produce an answer nobody may act on. That is also what keeps the merge-key and anchor configs
# tier 1 supports working exactly as before.
#
# LC_ALL=C so the byte-order-mark test compares bytes and the character classes stay byte-oriented
# across BWK awk, gawk and mawk.
_config_subset_scan() {
  _CONFIG_SUBSET_VERDICT="-"
  [ "${AGENT_SKILLS_CONFIG_TIER:-}" = "python" ] && return 0
  _config_probe && return 0
  [ -f "$SKILLS_CONFIG_FILE" ] || return 0
  [ -r "$SKILLS_CONFIG_FILE" ] || return 0

  _CONFIG_SUBSET_VERDICT=$(LC_ALL=C awk -v guarded="$_CONFIG_GUARDED_KEYS" '
    function refuse(what) { printf "%d:%s", NR, what; found = 1; exit }
    # True when a key name is one this reader consumes — the LOCAL rules refuse only those.
    function consumed(name) { return (name ~ ("^(" guarded ")$")) }

    BEGIN {
      # Built here rather than written inline because the program is inside shell single quotes,
      # so a literal apostrophe cannot appear in it. \047 is the POSIX octal escape for one.
      QKEY = "^[[:space:]]*[\"\047][^\"\047]*[\"\047][[:space:]]*:"
    }

    # A BOM sits before the first key and hides it from every anchored regex below.
    NR == 1 && substr($0, 1, 3) == "\357\273\277" { refuse("a UTF-8 byte-order mark") }

    { n = match($0, /[^ \t]/); indent = (n ? n - 1 : -1) }

    /^[[:space:]]*$/                         { next }
    # A block scalar body is free text, not YAML. Grading it would refuse prose.
    in_bs && indent > bs_indent              { next }
                                             { in_bs = 0 }
    /^[[:space:]]*#/                         { next }

    /^---([[:space:]]|$)/                    { refuse("a document separator (`---`)") }
    /^\.\.\.[[:space:]]*$/                   { refuse("a document separator (`...`)") }
    /:[[:space:]]*[|>][0-9+-]*[[:space:]]*$/ { in_bs = 1; bs_indent = indent; next }

    # A trailing comment cannot alias anything, and scanning it would refuse a config that merely
    # DESCRIBES an anchor. Stripping can only remove text, so it can never invent a refusal.
    { s = $0; sub(/[[:space:]]#.*$/, "", s); sub(/[[:space:]]+$/, "", s) }

    s ~ /^[[:space:]]*<<[[:space:]]*:/            { refuse("a merge key (`<<`)") }
    s ~ /^[[:space:]]*\?([[:space:]]|$)/          { refuse("an explicit key (`? key`)") }
    s ~ /^[[:space:]]*:([[:space:]]|$)/           { refuse("an explicit key value (`: value`)") }
    # `&` in a real value is always mid-token (a URL query), so requiring a non-space after it is
    # both strict and safe. `*` is looser on purpose in the other direction: a leading alphanumeric
    # matches every real alias name and excludes the globs a path value plausibly carries
    # (`*.env`, `**/x`), which would otherwise be refused for looking like one.
    #
    # That narrowness means the alias rule alone MISSES an alias whose name starts with a
    # non-alphanumeric — `*.d` is a legal alias, and this pattern does not match it. It is not a
    # hole, and the reason is structural rather than lucky: a legal alias requires its anchor to
    # have been declared EARLIER in the same file, `&[^[:space:]]` matches that anchor whatever its
    # name, and the scan reports the FIRST construct it meets. The anchor line is always first, so
    # the file is refused before the alias line is reached. The alias rule is therefore defence in
    # depth, not the primary catch — do not "tighten" it to `[^[:space:]]` without checking what
    # that does to a path value containing a glob.
    s ~ /(^|[[:space:]])&[^[:space:]]/            { refuse("an anchor (`&name`)") }
    s ~ /(^|[[:space:]])\*[A-Za-z0-9_]/           { refuse("an alias (`*name`)") }
    s ~ /(^|[[:space:]])![^[:space:]]/            { refuse("an explicit tag (`!tag`)") }
    # LOCAL rules — the key name decides, because only the key so spelled can be misread.
    s ~ QKEY {
      qk = s
      sub(/^[[:space:]]*["\047]/, "", qk)
      sub(/["\047][[:space:]]*:.*$/, "", qk)
      # A backslash inside a quoted key is an escape a parser resolves and this scanner cannot, so
      # the name it compares is not the name pyyaml would see. Refuse rather than compare.
      if (index(qk, "\\") > 0) refuse("a quoted key containing an escape")
      if (consumed(qk)) refuse("a quoted key (`\"" qk "\":`)")
    }
    s ~ /^[[:space:]]*(-[[:space:]]+)?[A-Za-z0-9_.-]+[[:space:]]+:/ {
      sk = s
      sub(/^[[:space:]]*(-[[:space:]]+)?/, "", sk)
      sub(/[[:space:]]+:.*$/, "", sk)
      if (consumed(sk)) refuse("a space before the colon (`" sk " :`)")
    }

    # A DUPLICATED guarded key. YAML resolves a duplicate last-wins; this reader\047s tier-2 block
    # matcher takes the FIRST match and exits. So `access:` written twice resolves to whichever
    # value was written first — and when that is the permissive one, a config whose author plainly
    # meant the second block silently grants more than it declares, at rc=0. Tier 1 refuses the
    # shape outright (see _no_dupes), so tier 2 was the only tier that both accepted it and picked
    # the permissive reading. read-config.sh\047s own header names this shape as the reason tier 1
    # rejects duplicates: "a copy-pasted second `access:` block made the first one vanish, silently
    # resolving a declared `manual` back to `full`".
    #
    # Scoped to the CONSUMED keys, like the other local rules. A duplicated `jira:` cannot change
    # what any of the six keys resolves to, and refusing it would halt a consumer over a section
    # this reader never reads — the over-refusal the subset is shaped to avoid.
    {
      if (indent == 0) {
        cur_parent = ""; child_indent = -1
        if (match(s, /^[A-Za-z0-9_.-]+[[:space:]]*:/)) {
          k = substr(s, RSTART, RLENGTH); sub(/[[:space:]]*:$/, "", k)
          if (consumed(k)) {
            if (k in seen_top) refuse("a duplicate `" k ":` key")
            seen_top[k] = 1
            cur_parent = k
            for (ck in seen_child) delete seen_child[ck]
          }
        }
      } else if (cur_parent != "" && match(s, /^[[:space:]]+[A-Za-z0-9_.-]+[[:space:]]*:/)) {
        # Only the FIRST child level under a consumed parent — that is the only level the nested
        # readers look at, so a repeat deeper down cannot change what they return.
        ck = s; sub(/^[[:space:]]+/, "", ck); sub(/[[:space:]]*:.*$/, "", ck)
        ci = match(s, /[^ \t]/) - 1
        if (child_indent < 0) child_indent = ci
        if (ci == child_indent) {
          if (ck in seen_child) refuse("a duplicate `" ck ":` key under `" cur_parent ":`")
          seen_child[ck] = 1
        }
      }
    }

    # An unbalanced `{` opens a flow mapping the next line continues — the shape that used to read
    # as "not configured" and resolve access to `full`. Counting braces (rather than matching the
    # opener) also catches a bare `{` continuation line. Quoted values carrying balanced braces,
    # like `branchPattern: "epic/{n}.{slug}"`, are unaffected.
    { if (gsub(/\{/, "{", s) > gsub(/\}/, "}", s)) refuse("a flow mapping spanning lines") }

    END { if (!found) printf "-" }
  ' "$SKILLS_CONFIG_FILE" 2>/dev/null)

  # An awk that died, or a file it could not read, must not read as "clean".
  [ -n "$_CONFIG_SUBSET_VERDICT" ] || _CONFIG_SUBSET_VERDICT="0:an unreadable file"
}

# _config_subset_refuses — true when the tier-2 scan found a construct outside the subset.
# The `-n` guard matters: an EMPTY verdict means the scan has not run (read-config.sh sourced
# without reaching the bottom of the file), which is not the same as "outside the subset" and must
# not be read as one.
_config_subset_refuses() {
  [ -n "$_CONFIG_SUBSET_VERDICT" ] && [ "$_CONFIG_SUBSET_VERDICT" != "-" ]
}

# config_child_shape <parent> — absent | mapping | scalar
# A caller that only knows how to read `parent.child` uses this to tell "not configured" from
# "configured in a shape I am about to ignore". Ignoring it silently is how `access: manual`
# resolved to `full` with exit 0.
config_child_shape() {
  local parent="$1" out
  if out=$(_config_py_run shape "$parent"); then
    case "$out" in
      absent | mapping | scalar) echo "$out"; return 0 ;;
      __ERR__ | __ERR__:*) : ;;
    esac
  fi
  [ "${AGENT_SKILLS_CONFIG_TIER:-}" = "python" ] && { echo absent; return 0; }

  awk -v p="$parent" '
    $0 ~ "^"p":[[:space:]]*$"      { print "mapping"; found=1; exit }
    $0 ~ "^"p":[[:space:]]*\\{"    { print "mapping"; found=1; exit }
    $0 ~ "^"p":[[:space:]]*#"      { print "mapping"; found=1; exit }
    $0 ~ "^"p":[[:space:]]*[^[:space:]]" { print "scalar"; found=1; exit }
    END { if (!found) print "absent" }
  ' "$SKILLS_CONFIG_FILE" 2>/dev/null
}

# _config_denull <value> — echo "" for any YAML null spelling, otherwise the value unchanged.
#
# Shared by BOTH readers. It lived inline in read_config_key first and the nested reader was left
# without it, so `access.tracker: null` halted every guarded call site on an awk-only host and
# `architectureShardedLocation: ~` produced ARCH_ROOT=~ — which unquoted expands to $HOME. One
# definition is the fix; two call sites of one helper cannot drift the way two copies did.
_config_denull() {
  case "$1" in
    null | Null | NULL | '~' | '') printf '' ;;
    *) printf '%s' "$1" ;;
  esac
}

read_config_key() {
  local key="$1" val=""
  # Tier 1 is authoritative when it runs — including when it says "absent".
  if val=$(_config_py_run key "$key"); then
    case "$val" in
      __NONE__) echo auto;     return 0 ;;
      __MAP__)  echo __MAP__;  return 0 ;;
      __ERR__ | __ERR__:*) : ;;             # unparseable — let awk try
      "")       : ;;                        # interpreter died — let awk try
      *)        echo "$val";   return 0 ;;
    esac
  fi

  [ "${AGENT_SKILLS_CONFIG_TIER:-}" = "python" ] && { echo auto; return 0; }

  # Tier 2 only, and file-wide: an aliasing construct anywhere may change what a later line means,
  # so the verdict is not per-key. Returning "absent" here is what silently granted `full` — the
  # defect this whole task exists to close. Read the global; do NOT re-scan (see _config_subset_scan).
  _config_subset_refuses && { echo "__UNSUPPORTED__"; return 0; }


  # Tier 2: simple top-level `key: value`. Strips a trailing inline comment and surrounding quotes —
  # without which `tracker: "jira"` and `tracker: jira  # why` would be rejected by validation, both
  # being legal YAML naming a legal platform.
  #
  # The value is everything after the FIRST colon, taken from the whole line. Splitting on `-F': *'`
  # and taking $2 truncated at the SECOND colon, so the documented flow form
  # `tracker: {workflowFile: .github/tracker-workflow.yaml}` (docs/reference/configuration.md)
  # yielded the field `{workflowFile`, which reached validate_enum and was rejected — and with this
  # task's `|| exit 1` guards on every call site, that aborted the run. It aborted it on the DEFAULT
  # tier of a stock macOS host, where /usr/bin/python3 ships without pyyaml, so the awk tier is the
  # only tier. A flow mapping or sequence is reported as __MAP__, which is what tier 1 already
  # returns for it and what the resolver reads as "no scalar override" → auto.
  val=$(awk "/^${key}:/{
    v = \$0
    sub(/^[^:]*:[[:space:]]*/, \"\", v)
    if (v ~ /^[{[]/) { print \"__MAP__\"; exit }
    sub(/[[:space:]]+#.*\$/, \"\", v)
    gsub(/^[[:space:]]+|[[:space:]]+\$/, \"\", v)
    gsub(/^[\"\\047]|[\"\\047]\$/, \"\", v)
    print v
    exit
  }" "$SKILLS_CONFIG_FILE" 2>/dev/null)
  # __MAP__ is this reader's own signal, not a config value — pass it through untouched so the
  # caller resolves it exactly as it does the tier-1 answer.
  [ "$val" = "__MAP__" ] && { echo __MAP__; return 0; }
  val=$(_config_denull "$val")
  [ -z "$val" ] && val="auto"
  echo "$val"
}

read_nested_config_key() {
  # Args: $1 = parent key (e.g. "prd"), $2 = child key (e.g. "prdShardedLocation")
  # Echoes the value or empty string — NEVER a sentinel.
  #
  # `__UNREADABLE__` (awk met a flow map it cannot read on one line) is meaningful only to the
  # access path, which halts on it. It used to be returned for ANY parent, so resolve-paths.sh —
  # which by contract never fails — produced PRD_ROOT=__UNREADABLE__, consumed by 34 files, and
  # render-retro.sh got as far as `mkdir -p "__UNREADABLE__"`. Callers that want the signal ask for
  # it explicitly via read_nested_config_key_strict.
  local parent="$1" child="$2" val="" raw
  if raw=$(_config_py_run nested "$parent" "$child"); then
    case "$raw" in
      # Tier 1 ran and found nothing — authoritative. Do not let awk invent an answer.
      __NONE__ | __MAP__) echo ""; return 0 ;;
      __ERR__ | __ERR__:*) : ;;              # unparseable — let awk try
      "")                 : ;;               # interpreter died — let awk try
      *)                  echo "$raw"; return 0 ;;
    esac
  fi

  [ "${AGENT_SKILLS_CONFIG_TIER:-}" = "python" ] && { echo ""; return 0; }

  # This reader NEVER fails and NEVER emits a sentinel — resolve-paths.sh is its caller and its
  # roots have safe defaults. `__UNSUPPORTED__` is mapped to "" here for exactly the reason
  # `__UNREADABLE__` was: the sentinel reached PRD_ROOT, which 34 files consume, and render-retro.sh
  # got as far as `mkdir -p "__UNREADABLE__"`. Callers that want the signal use the _strict variant.
  _config_subset_refuses && { echo ""; return 0; }

  # Tier 2: block form (`^parent:` then an indented `child:`) and the inline flow form
  # (`parent: {child: value, ...}`). The flow form used to read as empty here, so an operator who
  # wrote `access: {tracker: manual}` silently got the permissive default on any host without pyyaml.
  val=$(awk -v p="$parent" -v c="$child" '
    $0 ~ "^"p":[[:space:]]*\\{" {
      # A flow map that does not close on this line is beyond what awk should attempt. Emitting
      # nothing here read as "not configured" and resolved access to `full` — a silent escalation.
      # Say so instead; the caller halts. This tier is documented as not a parser, and the right
      # response to syntax it cannot read is to refuse, not to guess.
      if ($0 !~ /\}/) { print "__UNREADABLE__"; exit }
      line = $0
      sub(/^[^{]*\{/, "", line)
      sub(/\}.*$/, "", line)
      n = split(line, parts, ",")
      for (i = 1; i <= n; i++) {
        eq = index(parts[i], ":")
        if (eq == 0) continue
        k = substr(parts[i], 1, eq - 1)
        v = substr(parts[i], eq + 1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", k)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
        gsub(/^["\x27]|["\x27]$/, "", k)
        gsub(/^["\x27]|["\x27]$/, "", v)
        if (k == c) { print v; exit }
      }
      next
    }
    $0 ~ "^"p":" { in_block=1; next }
    in_block && /^[^[:space:]]/ { in_block=0 }
    in_block && $0 ~ "^[[:space:]]+"c":" {
      sub("^[[:space:]]+"c":[[:space:]]*", "")
      sub(/[[:space:]]+#.*$/, "")
      gsub(/[[:space:]]+$/, "")
      gsub(/^["\x27]|["\x27]$/, "")
      print
      exit
    }
  ' "$SKILLS_CONFIG_FILE" 2>/dev/null)
  [ "$val" = "__UNREADABLE__" ] && val=""
  _config_denull "$val"
}

# read_nested_config_key_strict <parent> <child> — as above, but MAY echo `__UNREADABLE__` when the
# awk tier meets a flow mapping it cannot read on one line. Only the access path opts in: for a key
# with a safe default (the path roots) the default is the right answer, whereas silently defaulting
# an access control is the failure this whole task exists to prevent.
read_nested_config_key_strict() {
  local parent="$1" child="$2" raw
  if raw=$(_config_py_run nested "$parent" "$child"); then
    case "$raw" in
      # `__NONE__` is absent — the key really is not there, and the caller's default applies.
      # `__MAP__` is NOT absent. Collapsing the two to "" is how `access:` → `tracker:` →
      # `mode: manual` resolved to `full` at rc=0 under pyyaml: a nesting typo, read as a config
      # that declares nothing. It is a shape this reader cannot honour, so it says so and the
      # caller halts. The non-strict reader keeps collapsing both, so resolve-paths.sh is
      # unaffected — the same split, for the same reason, as `__UNREADABLE__` before it.
      __NONE__)            echo ""; return 0 ;;
      __MAP__)             echo "__MAP__"; return 0 ;;
      __ERR__ | __ERR__:* | "") : ;;
      *)                   printf '%s\n' "$raw"; return 0 ;;
    esac
  fi
  [ "${AGENT_SKILLS_CONFIG_TIER:-}" = "python" ] && { echo ""; return 0; }

  # Tier 2. The `__UNREADABLE__` branch that used to live here — one awk probe for an unclosed flow
  # mapping under this one parent — is FOLDED into the subset scan, not run beside it. It was one
  # construct handled narrowly during task.51; `__UNSUPPORTED__` is the class it belongs to, and the
  # scan sees the whole file rather than one parent's opening line.
  # Tier 2 only, and file-wide: an aliasing construct anywhere may change what a later line means,
  # so the verdict is not per-key. Returning "absent" here is what silently granted `full` — the
  # defect this whole task exists to close. Read the global; do NOT re-scan (see _config_subset_scan).
  _config_subset_refuses && { echo "__UNSUPPORTED__"; return 0; }

  # A mapping-valued child on tier 2. `  tracker:` with nothing after it is either a null (absent,
  # correctly) or the parent of a deeper mapping (a nesting typo, which must NOT read as absent).
  # The two are told apart by the indent of the next content line — the same distinction tier 1
  # draws with `__MAP__` above, so both tiers now refuse the shape instead of granting `full`.
  case "$(_config_nested_shape_awk "$parent" "$child")" in
    mapping) echo "__MAP__"; return 0 ;;
  esac
  read_nested_config_key "$parent" "$child"
}

# _config_nested_shape_awk <parent> <child> — echo "mapping" when tier 2 can see that
# `parent.child` holds a block mapping rather than a scalar or a null. Echoes nothing otherwise.
# Split out of the strict reader so the look-ahead has one home and cannot drift into a second copy.
_config_nested_shape_awk() {
  awk -v p="$1" -v c="$2" '
    $0 ~ "^"p":[[:space:]]*$" { in_block = 1; next }
    in_block && /^[^[:space:]]/ { exit }
    in_block && !want && $0 ~ "^[[:space:]]+"c":[[:space:]]*(#.*)?$" {
      n = match($0, /[^ \t]/); child_indent = (n ? n - 1 : 0)
      want = 1; next
    }
    want {
      if ($0 ~ /^[[:space:]]*$/ || $0 ~ /^[[:space:]]*#/) next
      n = match($0, /[^ \t]/); indent = (n ? n - 1 : 0)
      if (indent > child_indent) print "mapping"
      exit
    }
  ' "$SKILLS_CONFIG_FILE" 2>/dev/null
}


# config_bulk <spec>... — answer several questions in ONE python spawn.
#
# WIRE FORMAT (read this before consuming it): a NUL-framed stream of typed records,
#     <index> US <kind> US <payload> RS             kind: v = value from the config, s = signal
# US/RS (0x1f/0x1e) do not occur in a real config and survive command substitution, so nothing needs
# escaping; the kind byte is what stops a value from ever being read as a signal. Use `config_bulk_get` to read a record rather than open-coding the framing — an earlier
# version shipped an encoder with no decoder and the two drifted immediately.
#
# Specs: `status` | `key:<K>` | `shape:<P>` | `nested:<P>.<C>`. Prints one line per spec, in order,
# using the same sentinels as the individual readers (`__NONE__`, `__MAP__`, `__ERR__`).
# Returns 1 when tier 1 is unavailable, so the caller falls back to the individual readers — which
# is also the only correct behaviour, since the awk tier has to answer each question separately.
#
# Exists because the resolver asks six questions per source. One spawn each cost ~500 ms; batching
# them is the difference between a working pyyaml tier being affordable and being a tax on every
# call site.
config_bulk() {
  _config_py_run bulk "$@"
}
# config_bulk_get <index> <stream> — echo `<kind> <payload>` for one record, or nothing.
# The kind byte is what keeps a config value spelling `__MAP__` from being obeyed as a signal.
config_bulk_get() {
  # String comparison, not awk's default numeric strnum compare — otherwise 01, 1.0, " 1", +1 and
  # 1e0 all match index 1, which widened the record-forgery surface.
  printf '%s' "$2" | awk -v want="$1" -v RS="$(printf '\036')" -v FS="$(printf '\037')" '
    ($1 "") == (want "") { printf "%s %s", $2, $3; exit }'
}

# Probe once, here, in the sourcing shell — see _config_probe for why this cannot be lazy.
_config_probe || true
# Scan once, for the same reason and in the same place. Order matters: the scan asks the probe
# whether tier 1 is authoritative, and skips itself when it is.
_config_subset_scan
