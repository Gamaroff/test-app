<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/platform-detection.md. Regenerate via `npm run bundle`. -->
# Platform Detection (canonical)

> **Setting up a project? Skip this doc.** Run the [setup wizard](https://github.com/Gamaroff/agent-skills/blob/develop/docs/concepts/getting-started.md#quick-setup-wizard) — it picks the platform interactively and writes the right `skills-config.yaml` for you. This document is the resolver-internals reference for skill authors and for cases where you need to override auto-detection.

This file is the single source of truth for how skills determine the active tracker and VCS platform, and how much access the agent has to each. Skills reference this via the explicit path `references/platform-detection.md`. At package time, `skills/create-skill/scripts/package_skill.py` (zip) and `bundle_skill.py` (in-tree) bundle this file under `references/` and rewrite the path so installed skills are self-contained.

## Canonical helper

The resolver is implemented as a sourceable bash helper: `references/resolve-platform.sh`.

```bash
# In any skill — source once before the first platform branch:
source references/resolve-platform.sh || exit 1
# TRACKER        = jira | github
# VCS            = github | bitbucket
# ACCESS_TRACKER = full | read-only | approve | command | manual
# ACCESS_VCS     = full
```

> **Copy the `|| exit 1`.** The resolver rejects an unrecognised value on any of the four keys by
> writing to stderr and returning non-zero. A caller that sources it bare prints the message and
> carries straight on with a default — which for an access control is the exact silent-permissive
> outcome the validation exists to prevent. Every call site in this repository uses the guarded
> form; a new skill that copies the snippet gets it for free.

`package_skill.py` auto-bundles and rewrites this path into `references/resolve-platform.sh` inside each skill's zip. Installed skills are self-contained.

## Identity vs access

Two independent axes, deliberately not collapsed into one key:

| Axis         | Keys                            | Question it answers                |
| ------------ | ------------------------------- | ---------------------------------- |
| **Identity** | `tracker:` / `vcs:`             | *Which* system is this project on? |
| **Access**   | `access.tracker` / `access.vcs` | *How much* may the agent do to it? |

A restricted run still needs the identity: emitting "move RAPP-605 to In Review" with the right URL
and field names is only possible if the agent knows the tracker is Jira. So `manual` is a value of
`access.tracker`, never of `tracker`.

The five access modes, ordered least to most permissive:

| Mode        | Meaning                                                    |
| ----------- | ---------------------------------------------------------- |
| `manual`    | Agent emits UI instructions; a human performs them         |
| `command`   | Agent emits commands; a human runs them                    |
| `approve`   | Agent holds credentials but must ask before each mutation  |
| `read-only` | Agent may read the tracker, not write to it                |
| `full`      | Today's behaviour. The default when the key is absent      |

`access.vcs` is accepted and validated so the schema is stable, but only `full` is supported today —
VCS write is a hard requirement for the pipelines (`/create-pr` returns a PR URL later steps consume,
`/develop-next` gates on `gh pr merge`). Any other value is rejected with a message naming the reason
rather than being silently ignored.

### Precedence — and why access differs from identity

**Identity** resolves config → env → `.env` (TRACKER only) → git remote (VCS only) → default. First
match wins.

The `.env` rung is read for `TRACKER` alone, and only when the config declared nothing. `setup-consumer.sh`
probed `.env` from the start while this resolver did not, so a repo with no `tracker:` key and `JIRA_URL`
only in `.env` **installed one platform's skills and ran as the other** — silently, the failure surfacing
later inside a pipeline step. Task 91 closed that by teaching this resolver to read `.env` rather than by
deleting the installer's probe: the installer runs once, often in a plain shell, while skills run later in
a shell that already has `JIRA_URL`, so dropping it would trade a rare disagreement for a common one
(`task.83.bug.2.env-probe-asymmetry.md`).

`.env` is **parsed, never sourced** — it is data, and sourcing would execute whatever a checked-in file
happens to contain.

**There is only one `.env` reader now.** `setup-consumer.sh` used to carry its own
`grep -qE '^JIRA_URL=.+'`; that probe is gone, because `_resolve_install_tracker` delegates the whole
resolution to this file. So "both sides agree" is no longer a property to maintain between two greps —
it is structural.

The parse is deliberately more than a `grep`, and each part of it closed a real defect:

| Spelling | Resolves | Why |
| --- | --- | --- |
| `JIRA_URL=https://x` | `jira` | the plain case |
| `export JIRA_URL=https://x` | `jira` | a very common `.env` spelling; a bare `^JIRA_URL=` anchor missed it, so a shell that *sourced* the file resolved `jira` while this resolver said `github` |
| `JIRA_URL=` + CRLF | `github` | a trailing `\r` satisfies `.+`; treating it as set resurrected the exact spelling task 83 was written to fix |
| `JIRA_URL=""` / `JIRA_URL=''` | `github` | an emptied key means *not set*, quotes included |
| the **last** matching line wins | — | a shell that sources the file takes the last assignment, so first-match-wins disagreed with it |

An explicit `tracker:` key still wins outright, and is the one-line opt-out for a repo carrying a stale
`JIRA_URL`.

**Access** does not. Config and env (`AGENT_SKILLS_ACCESS_TRACKER`, `AGENT_SKILLS_ACCESS_VCS`) are
read *independently*, and the **more restrictive** of the two wins, against the permissiveness order
`manual < command < approve < read-only < full`.

The asymmetry is deliberate: picking the wrong *tracker* is a mistake, whereas picking the wrong
*access* is an escalation. Most-restrictive-wins lets a single run or a CI environment lock itself
down without editing committed config, while making it impossible for a stray env var to loosen a
config that deliberately restricts.

| `access.tracker` | `AGENT_SKILLS_ACCESS_TRACKER` | Resolved   |
| ---------------- | ----------------------------- | ---------- |
| absent           | absent                        | `full`     |
| `full`           | `manual`                      | `manual`   |
| `manual`         | `full`                        | `manual`   |
| `read-only`      | `approve`                     | `approve`  |
| absent           | `command`                     | `command`  |

Both tiers are validated — an env var that bypassed validation would be a hole straight through the
check, since it is the tier a CI environment can set most easily.

### Unrecognised values are fatal

Legal sets are **per key**, never shared:

| Key              | Legal values                                     |
| ---------------- | ------------------------------------------------ |
| `tracker`        | `jira` · `github` · `auto` (or absent)           |
| `vcs`            | `github` · `bitbucket` · `auto` (or absent)      |
| `access.tracker` | `manual` · `command` · `approve` · `read-only` · `full` |
| `access.vcs`     | `full`                                           |

One shared set across `tracker` and `vcs` would accept `tracker: bitbucket` and `vcs: jira` —
misconfigurations of exactly the class this closes. `tracker: jria` used to resolve silently to
`github`; it now halts.

A **mapping-valued** `tracker:` is the documented [`tracker.workflowFile`](https://github.com/Gamaroff/agent-skills/blob/develop/docs/reference/tracker-workflow.md)
form, not a typo. It resolves to `auto` (i.e. detect) rather than being graded as a scalar override.

### Malformed or unreachable `skills-config.yaml`

| File state                                        | Behaviour                                             |
| ------------------------------------------------- | ----------------------------------------------------- |
| Missing                                            | Detect, as always                                     |
| Unparseable, and `access` provably **not** a key   | Warn, degrade to detection — as always                |
| Unparseable, and `access` **may** be a key         | **Halt.** "access may be configured, and the file could not be parsed" |
| Outside the tier-2 subset, and `access` provably **not** a key | Warn, degrade to detection — see [Tier 2 — the strict subset](#tier-2--the-strict-subset) |
| Outside the tier-2 subset, and `access` **may** be a key | **Halt.** "this file uses \<construct\>, which the no-dependency config reader cannot parse" |
| Present but **unreadable** (permissions, bad mount) | **Halt.** "exists but cannot be read"                 |
| `SKILLS_CONFIG_FILE` set to an absent or non-regular file | **Halt.** "does not name a readable config file" |

The blanket degrade rule is right for identity, where the default is *detect*. For access the
default is `full`, so the same rule would silently re-grant credentials on a truncated file. The
probe that separates the two cases has to fail **closed**, and that means answering a narrower
question than "is access configured?" — it answers **"can I prove this file declares no access?"**,
and answers *no* whenever it cannot read the file at all.

Three things follow from that framing, each of which the earlier `grep -q '^access:'` got wrong:

- **An unreadable file halts.** The old probe grepped the very file the parser had just failed to
  read, so on a `chmod 000` config the grep failed too and the branch fell through to detection: the
  canonical documented `access:\n  tracker: manual` resolved to `full` at exit 0. The gate failed
  open at precisely the moment it existed to fail closed.
- **The key is matched in any legal spelling**, not just block form at column 0 — a root flow
  mapping, a quoted `"access":`, a space before the colon, a leading BOM, or a block supplied
  through a `<<` merge. The over-match is deliberate: `access` mentioned in a *comment* also counts,
  and the only consequence is that an already-malformed file halts instead of warning.
- **`SKILLS_CONFIG_FILE` may redirect, but it may not point nowhere.** The path is env-overridable;
  pointing it at an absent file or at `/dev/null` (not a regular file, so read as "no config at
  all") used to discard a committed restriction silently, on both tiers — falsifying the guarantee
  that a stray env var can never loosen a config that deliberately restricts. Redirecting at a
  *real* config that happens to be permissive is still honoured: that is a deliberate operator act,
  and it is the form cross-repo callers legitimately use.

### Who reads `access.tracker`

Two families of entry point, **one reader**.

- **Shell** entry points source `resolve-platform.sh`, which reads the config tier through
  `read-config.sh` and reduces it against the environment, most-restrictive-wins.
- **JavaScript** gates — `jira-sync.js`'s `makeHttp`, `jira-stage.js`, `gh-stage.js` and
  `jira-create-epic.js` — go through `dm.resolveAccessTracker` in `defer-mutation.js`, which
  resolves the same config tier by **sourcing `resolve-platform.sh` in a subprocess** and using its
  answer verbatim. `jira-sprint-lib.sh` does the same from bash.

That indirection is deliberate. A second YAML reader written in JavaScript would be a duplicated
contract, and task 53 demonstrated what that costs: three review rounds, three correct fixes, three
new divergences from `read-config.sh`. Delegating makes parity **structural** rather than asserted.
The parity corpus (`access-config-parity.test.mjs`, under this directory's `tests/`) still asserts it
over a derived corpus, on
both tiers, so a regression is a red test rather than a review finding.

Two differences from the shell path, both intentional:

| | Shell | JavaScript |
| --- | --- | --- |
| A config that cannot be read correctly | refuses — non-zero exit halts the skill | resolves to `manual` and prints one line naming the file and the reason |
| A typo in the **env** tier | refuses | throws |

JavaScript cannot halt the process without taking down callers that never write: cycle 4 of task 53
made an unreadable config throw and broke `--check`, `--print-plan` and `--probe-board`, which have
no stake in whether a write would be permitted. `manual` preserves the shell's *meaning* — nothing is
sent, every attempted write is deferred and recorded — while leaving read-only paths working.

A repo whose config declares no access restriction answers `full` and cannot be falsely restricted.
The JS side skips the subprocess entirely when it can *prove* the file declares nothing — which is a
narrower condition than "has no `access:` key": the word `access` anywhere, a backslash escape, a
non-ASCII byte or a YAML aliasing construct all make it run the reader instead. Proving absence is
the only safe direction to be wrong in, so the common case is usually free and never permissive.

### `tracker_write` — the shell chokepoint for `gh` mutations

`resolve-platform.sh` defines the wrapper that non-blocking tracker mutations go through:

```bash
tracker_write gh issue comment 42 --body "…"
tracker_write gh api graphql -f query='…'
```

It does two things, in this order:

1. **Gates.** Under any `ACCESS_TRACKER` other than `full` the command is not run. It is recorded as
   a deferred mutation and the wrapper returns **0**. The kind is inferred from argv for the shapes
   this wrapper actually sees (`gh issue comment` → `github.issue.comment`, `gh pr comment` →
   `github.pr.comment`, and so on); anything unrecognised is recorded as `github.unknown-mutation`,
   never dropped. Set `TRACKER_WRITE_KIND`, `TRACKER_WRITE_INTENT` and `TRACKER_WRITE_SKILL` before
   the call to name it explicitly — an explicit kind always outranks the inference.
2. **Retries.** Under `full`, 3× with exponential backoff (1s, 2s, 4s), passing stdout/stderr
   through and returning the wrapped command's exit code.

Returning 0 on a deferral is deliberate: every caller of this helper is documented as non-blocking —
log a warning and continue — so a non-zero return would convert a policy deferral into a pipeline
failure at ~38 sites at once.

> **`tracker_call_with_retry` is the original name, kept as an alias, and is not safe to delete.**
> ~38 call sites across 11 skill and pipeline-step files still spell it, several in prose a reader
> copies by hand. The rename exists to make the *name* honest about the mode check now inside it —
> not to force a corpus-wide edit. A test asserts the alias resolves and behaves identically.

**What this does not cover, and what does.** Calls whose stdout the caller captures — `gh issue
create`, the milestone create, the sub-issue link — are deliberately *not* wrapped. Under a deferring
mode the wrapper returns nothing, so `$( )` would capture an empty string and the caller would
proceed with a blank issue number.

Those go through **`tracker-issue.js`** instead — a purpose-built CLI rather than a wrapper that
silently lies. It can be honest about not having a value: under a deferring mode it prints nothing to
stdout (every notice goes to stderr, so a capture cannot see it), records the mutation with `produces`
set, and marks a value-producing kind `blocking: true`. The checklist then opens with a banner naming
the **two-run convergence**: perform the action, write the value into the document, re-run. Contract:
[`tracker-issue-cli.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/tracker-issue-cli.md).

No placeholder is ever written. `github_issue: 0` would defeat the idempotent search that stops the
next run creating a duplicate, so a wrong key is worse than no key.

The two GitHub board-field helpers (`set-github-project-priority.sh`,
`set-github-project-estimate.sh`) do not go through this wrapper — they call `gh api graphql`
directly — so each carries its own gate, resolving the mode via `defer-mutation.js --resolve-access`
rather than a second copy of the mode table.

### Tier 2 — the strict subset

Tier 2 is `awk`: a set of anchored line regexes with no grammar. It is not a fallback anyone should
think of as rare — **it is the default tier on a stock macOS host**, where `/usr/bin/python3` ships
without `pyyaml`, so a machine that has never installed it never reaches tier 1.

Until task.60 that tier had two answers, *a value* and *absent*, and everything it could not read
fell into the second one. For `access:` absent means `full`, so a restriction written with a merge
key, an anchor, a quoted key or a space before the colon read as *no restriction at all* — on a
well-formed file, at exit 0, with nothing printed, while tier 1 read the declared value.

It now has a third answer. **Anything outside the documented subset below is refused, not guessed.**

#### The rule

Every construct is judged by one question: *can this change what one of the keys this reader
consumes resolves to, relative to what its own line says?* Two answers, with different blast radii:

| | Constructs | Radius |
| --- | --- | --- |
| **Non-local** | anchor, alias, merge key, flow mapping spanning lines, explicit tag, BOM, document separator | **the whole file** — each can move or reinterpret content declared elsewhere, and a line scanner cannot bound which key it reaches |
| **Local** | quoted key, space before the colon, explicit `? key`, **duplicate key** | **that key only** — refused when it spells a key this reader consumes (`access`, `tracker`, `vcs`, `prd`, `architecture`, `prdShardedLocation`, `architectureShardedLocation`), or when quoting hides an escape a parser would resolve |

Everything else is read from its own line and cannot mislead. That is a closed rule over a closed
key set — a grammar, rather than one more spelling patched shut each cycle.

#### Accepted (or ignorable)

| Construct | Example |
| --- | --- |
| Comment line | `# anything` — including one that mentions `&anchor` or `<<:` |
| Blank line | |
| Top-level scalar | `tracker: github` |
| Top-level block mapping key | `access:` |
| Indented scalar child | `  tracker: manual` |
| Quoted scalar value | `tracker: "github"` |
| Trailing inline comment | `tracker: github  # why` |
| Single-line flow mapping value | `tracker: {workflowFile: x.yaml}` |
| Block sequence item | `  - docs/architecture/concepts/tech-stack.md` |
| Block scalar header and body | `note: \|` then indented free text — the body is never graded as YAML |
| Nesting at **any** depth | `jira:` → `statusMap:` → `ready-for-development: …` |
| Flow sequence value | `ready-for-review: [Waiting for Review, In Review]` |
| Sequence of mappings | `identities:` → `- jira: …` / `  git: …` |
| Empty flow sequence | `worktreeSeedPaths: []` |
| Quoted key this reader never reads | `"my key": 1` |
| Duplicate of a key this reader never reads | `x: 1` … `x: 2` |
| Balanced braces inside a quoted value | `branchPattern: "epic/{n}.{slug}"` |

Nesting depth, sequences and flow sequences are **deliberately** on this list. A shape-based subset
("nothing deeper than two levels") was drafted first and would have refused
[`docs/reference/configuration.md`](https://github.com/Gamaroff/agent-skills/blob/develop/docs/reference/configuration.md)'s own canonical example
config, which carries three- and four-level nesting, a flow sequence and a sequence of mappings.
An over-narrow subset is not the safer failure — every refusal is loud, so it is a locked door on a
config that was always legal.

#### Refused

| Construct | Example |
| --- | --- |
| Anchor | `defaults: &d` |
| Alias | `access: *d` |
| Merge key | `<<: *d` |
| Quoted key this reader consumes | `"access":` |
| Space before the colon | `access :` |
| Explicit key form | `? access` / `: value` |
| Flow mapping spanning lines | `access: {` … `}` |
| Explicit tag | `access: !!map` |
| UTF-8 BOM before the first key | |
| Document separator | `---` / `...` |
| Duplicate of a key this reader consumes | `access:` … `access:` |

The duplicate rule closes the one route that survived the first cut of this subset. YAML resolves a
duplicate **last-wins**; tier 2's block matcher takes the **first** match and stops. So a
copy-pasted second `access:` block resolved to whichever value came first, and when that was the
permissive one, a config whose author plainly meant the second block granted more than it declared,
at exit 0. Tier 1 rejects the shape outright — it is the same defect its duplicate-key guard was
added for. Like the other local rules it is **scoped to the consumed keys**: a repeated `jira:`
cannot change what any of the six resolve to, and refusing it would halt a consumer over a section
this reader never reads.

A mapping where a mode belongs — `access:` → `tracker:` → `mode: manual`, a nesting typo — is
refused on **both** tiers. It was never a tier-2 problem: `pyyaml` parses it correctly and the
reader then collapsed its "this is a mapping" signal into the same empty string it uses for "not
configured". A genuine null (`access:` → `tracker:` with nothing after it) still reads as absent,
because the key really is not configured.

#### What a refusal looks like

```
❌ skills-config.yaml:4: this file uses a merge key (`<<`), which the no-dependency
   config reader cannot parse.

   This host has no python3 + pyyaml, so the reader is running in its limited mode.
   Rather than guess — and risk resolving a declared access restriction to `full` —
   it is refusing. Two ways forward:

     1. Rewrite the file in the documented subset:
        references/platform-detection.md → "Tier 2 — the strict subset"
     2. Install pyyaml (`pip install pyyaml`); the full-YAML tier accepts this file as written.
```

**The two migration paths are the whole point of the message**, so it is raised from one site above
the identity block rather than from the access path. Identity resolves first: a refusal raised only
inside `resolve_access` would never print, because `read_config_key tracker` returns the refusal
sentinel and enum validation halts the run first with *"`__UNSUPPORTED__` is not a recognised
value"* — no line, no construct, neither way out. A suite asserting `rc=1` would call that a pass,
which is why `tracker-access.test.sh` §42 asserts the stderr text rather than the exit code.

#### When it does *not* halt

The refusal is gated on the same fail-closed probe as the malformed branch, and the asymmetry is
the same one: the default for **access** is `full`, so a file that may declare a restriction and
cannot be read correctly must halt — but the default for **identity** is *detection*, which is the
documented behaviour rather than a guess. A file outside the subset that provably declares no
`access` therefore warns and degrades, exactly as a malformed file always has.

#### Breaking change

A config using one of the refused constructs, on a host without `pyyaml`, used to resolve to
defaults at exit 0 and now halts. This is breaking in the correct direction — a silent wrong answer
becomes a loud refusal with two documented fixes — but it is still breaking: a file that worked
yesterday can halt a run today. Tier 1 accepts every one of these constructs as written, so
`pip install pyyaml` is a migration path that needs no edit to the config.

Sections this reader never consumes (`jira:`, `github:`, `developNext:`, `sign-off:`) are **not**
exempt from the non-local constructs. An anchor inside `jira:` almost certainly cannot change what
`access.tracker` resolves to — but "almost certainly", argued locally about a line-oriented
scanner, is exactly the reasoning that left six sibling spellings open across task.51's QA cycles.
The aliasing family is narrow enough that a real config rarely carries one.

#### Relationship to the tier-2 YAML lint

`config_file_status` also scans the whole file on tier 2, and the two lints are **independent**:
`config_file_status` answers *is this YAML at all* and rejects only what cannot be valid YAML in
block context; the subset scan answers *can I read it correctly*. A file can be flawless YAML and
still sit outside the subset — that is the entire point. The relationship is stated in both header
comments rather than left to be inferred, because two overlapping awk lints with an unstated
relationship drift.

Its companion for the Bitbucket branch is `references/bitbucket-auth.sh`, which resolves the REST credential and the auth scheme — see [The Bitbucket credential](#the-bitbucket-credential).

## Resolver (shape, not a copy)

The implementation is [`resolve-platform.sh`](resolve-platform.sh), which reads
`skills-config.yaml` through the shared two-tier reader in [`read-config.sh`](read-config.sh)
(python+pyyaml, then awk). **Read those files for the real thing** — what follows is the shape of
the resolution, kept short precisely so it cannot silently drift out of step with the code the way
a verbatim duplicate does.

```bash
# One batched read — six questions, one python spawn. Falls back to the individual readers when
# tier 1 is unavailable.
config_bulk status key:tracker key:vcs shape:access nested:access.tracker nested:access.vcs

# Identity — first match wins, then validate against a per-key legal set.
# validate_enum takes the SOURCE first, so an env-var rejection does not misdirect the operator to
# a config file that does not contain the value.
[ "$TRACKER" = "__MAP__" ] && TRACKER="auto"   # tracker.workflowFile form ⇒ detect
validate_enum "$SKILLS_CONFIG_FILE" tracker "$TRACKER" jira github auto || return 1
# `.env` is the LAST positive probe for TRACKER, below the process environment. `_rp_dotenv_has_jira`
# is an awk parse, not a grep — it accepts an optional `export` prefix, strips a trailing CR and one
# surrounding quote pair, and takes the LAST match. See "Precedence" above for each defect that shape
# closed. Parsed, never sourced.
if [ "$TRACKER" = "auto" ]; then
  if   [ -n "${JIRA_URL:-}" ];                                  then TRACKER=jira
  elif _rp_dotenv_has_jira;                                     then TRACKER=jira
  else                                                               TRACKER=github
  fi
fi

validate_enum "$SKILLS_CONFIG_FILE" vcs "$VCS" github bitbucket auto || return 1
[ "$VCS" = "auto" ] && VCS=$(git remote get-url origin 2>/dev/null \
  | grep -qi bitbucket.org && echo bitbucket || echo github)

# Access — reject a shape the per-system reader cannot honour (a scalar `access: manual` would
# otherwise read as nothing and resolve to the permissive default), then read both tiers and take
# the MORE RESTRICTIVE.
[ "$(config_child_shape access)" = "scalar" ] && return 1
ACCESS_TRACKER=$(resolve_access tracker) || return 1   # manual<command<approve<read-only<full
ACCESS_VCS=$(resolve_access vcs) || return 1           # rejected unless `full`
```

Two portability rules the resolver learned the hard way, both of which broke every call site on
macOS before they were fixed:

- **No `${!var}`.** Bash-only indirect expansion; zsh raises `bad substitution`. Use
  `eval "v=\${$name:-}"`, which works in both.
- **No unquoted `$LIST` relying on word splitting.** zsh does not split unquoted parameter
  expansions, so a legal-set string arrives as one candidate and rejects everything. Pass the set
  as separate literal arguments.

Two tiers, and they are not interchangeable: only python+pyyaml can tell a mapping from a scalar or
a parse failure from an absent key. The tier-1 probe tries `python3` then `python` — it used to
invoke a bare `python`, which macOS has not shipped since 12.3, so tier 1 was dead on most machines
and awk was silently the only tier. Any test covering tier-sensitive behaviour must force each tier
explicitly (`AGENT_SKILLS_CONFIG_TIER=python|awk`) rather than take whichever the host provides.

## Env vars

- `JIRA_URL` — Jira base URL (e.g. `https://example.atlassian.net`)
- `JIRA_USER_EMAIL`, `JIRA_API_TOKEN` — auth for Jira REST
- `BITBUCKET_ACCESS_TOKEN` — auth for Bitbucket REST via **Bearer**, for a repository, project or
  workspace access token. Optional; when set it **replaces** the username/token pair below rather
  than supplementing it.
- `BITBUCKET_USERNAME`, `BITBUCKET_API_TOKEN` — auth for Bitbucket REST via **Basic**. The default.
  `BITBUCKET_APP_PASSWORD` is still honoured as a fallback; see below.
- `gh` CLI — assumed authenticated for GitHub paths

**Not ambient — passed by a caller only.** These two are honoured only when a caller hands them in
its env snapshot, never when they merely sit in the process environment. The gates snapshot the
access env *before* `loadDotEnv()` so a repo-local `.env` cannot reach the access reader, and
reading these from `process.env` would be a second resolution path `resolve-platform.sh` never
sees:

- `AGENT_SKILLS_CONFIG_TIER` — force the config reader's tier (`python` \| `awk`). Testing knob; it
  materially loosens the answer, since forcing a tier the host cannot honour makes the reader
  answer nothing (T61-M4).
- `AGENT_SKILLS_ACCESS_PROBE_TIMEOUT_MS` — budget in ms for one `resolve-platform.sh` probe
  (default `10000`, capped at `300000`; anything unparseable or out of range falls back to the
  default). It cannot escalate access — a short budget only kills the probe, and a killed probe
  fails closed to `manual` — but a committed `.env` setting it to `1` would restrict, or via a
  typo hard-fail, every pipeline step in a repo that declares `access`. That is the same invariant,
  in the restricting direction.

### The Bitbucket credential

**Two credential types are supported, and the scheme differs between them.** Never hand-roll the
selection — source the helper and use the argument vector it sets:

```bash
source references/bitbucket-auth.sh || exit 1   # or HALT, per the calling skill
curl -sf "${BB_CURL_AUTH[@]}" "https://api.bitbucket.org/2.0/..."
```

| Set | Scheme | What the helper emits |
| --- | ------ | --------------------- |
| `BITBUCKET_ACCESS_TOKEN` | Bearer | `--header "Authorization: Bearer …"` |
| `BITBUCKET_USERNAME` + `BITBUCKET_API_TOKEN` (or `BITBUCKET_APP_PASSWORD`) | Basic | `--user "user:token"` |
| Neither | — | nothing, and a **non-zero status** |

It also sets `BB_AUTH_SCHEME` (`bearer` | `basic` | `none`) for diagnostics. `package_skill.py` and
`bundle_skill.py` bundle `references/bitbucket-auth.sh` into `references/` alongside this
document, so an installed skill sources `references/bitbucket-auth.sh`.

Five things about this credential are easy to get wrong:

- **An Atlassian API token (`ATATT…`) is Basic; an access token is Bearer.** Atlassian removed app
  passwords on **2026-07-28**; only the older variable _name_ survives, as a fallback for `.env`
  files written before the rename. Create an API token at
  [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens),
  or a repository/project/workspace access token from the corresponding Bitbucket settings page.
- **The API token needs Bitbucket scopes ticked.** A scopeless token authenticates against Jira and
  fails against Bitbucket, which reads as a Bitbucket outage rather than a permissions problem.
- **The scheme is chosen by variable _name_, never by inspecting the token's value.** Do not sniff
  for an `ATATT` prefix to guess. Atlassian's credential formats have already changed once inside
  this project's lifetime, and a prefix heuristic silently mis-authenticates the day they change
  again. A variable name is a decision the operator made; a prefix is a guess about a vendor. Bearer
  wins when both are set, so an explicit opt-in is not overridden by stale Basic vars left in a
  `.env`.
- **A Bearer access token has no username.** That is the real structural difference between the two
  credential types, and it is why `BITBUCKET_USERNAME` belongs only on the Basic branch. Setting a
  username alongside an access token does nothing.
- **An unauthenticated — or wrongly-schemed — call returns 404, not 401.** Bitbucket hides private
  repositories from anonymous callers, so a missing credential, an empty one, or Bearer sent where
  Basic was expected all surface as an _empty result_ rather than an error, and are
  indistinguishable from each other. **Read the status code, never the length of the list.** Never
  treat an empty listing as evidence of absence until a repo-root probe has returned 200. This is
  also why the helper fails loudly instead of emitting a half-formed credential: `--user user:` and
  an empty `Authorization: Bearer` are both syntactically valid and authenticate nothing.

## Edge cases

- **Mirror repo** (BB primary, GH read-only): set `tracker: jira` and `vcs: bitbucket` in `skills-config.yaml` to override what `git remote` would detect.
- **Migration in progress** (moving between platforms): use explicit config override during the migration window; revert to `auto` when complete.
- **CI without git remote**: env-var-only path works (`JIRA_URL` set → `tracker: jira`); VCS falls back to `github` default if no remote available.

## Skills migrated to the helper

Sixteen skills source `resolve-platform.sh`, across **eighteen** sourcing forms — `create-epic`,
`qa-task` and `qa-story` each have two, and three of the eighteen are prose sentences rather than
fenced snippets. All eighteen use the guarded `|| exit 1` form, and nothing **executes** the
resolver (`bash …/resolve-platform.sh` never exports to the caller and exits 0 on a rejection).

- `create-epic` (×2), `create-pr`, `create-story`, `create-task`, `develop-next`, `qa-fix`,
  `qa-story`, `qa-task`, `review-bug`, `review-epic`, `review-story`, `review-task`,
  `sync-github-epic`, `sync-github-story`, `sync-github-task`

This list is hand-maintained and has drifted before (it read "All 8 leaf skills" long after it was
15). Re-derive it rather than trusting it:

```bash
grep -rnoE '(^|[^=[:alnum:]_])source[[:space:]]+[^`]*resolve-platform\.sh' skills/*/SKILL.md
```

The repo's own `tracker-access.test.sh` (§11) asserts this repo-wide and fails when any site loses
its guard — including the prose ones, which an anchored pattern silently skips. That assertion is
the reason the list can be trusted; before it existed, an unguarded site shipped unnoticed.

Skills that are platform-agnostic (no resolver needed):

- `create-branch`, `commit-changes`, `qa-gate`, and the docs-only authoring skills
