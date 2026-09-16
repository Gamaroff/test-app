---
name: observation-log-contract
description: The canonical storage format for the observation log — the directory layout, the frontmatter fields, the id rule, the archival gate, parked semantics, skill families and siblings_checked, the carrier pattern, and the version-control hazards. Every read and write of the log goes through observation-log.js; this file specifies what that engine stores and why each rule is shaped the way it is.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/observation-log-contract.md. Regenerate via `npm run bundle`. -->

# The observation log

> **The methodology in this document is adapted from _task-observer_ ("One Skill
> to Rule Them All") by Eoghan Henn / [rebelytics.com](https://rebelytics.com),
> licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Canonical
> source: <https://github.com/rebelytics/one-skill-to-rule-them-all>.
> **Changes were made.** The methodology is kept; the mechanism is a rewrite.
> Upstream expresses its correctness guards as POSIX shell snippets embedded in
> prose, which the agent must retype correctly before every write — here those
> guards live inside [`observation-log.js`](observation-log.js), where they
> cannot be skipped. Upstream's `[ABSOLUTE PATH]` placeholder substitution is
> replaced by [`resolve-observation-workspace.sh`](resolve-observation-workspace.sh).
> Upstream's pre-3.0 single-file log migration path is omitted — no such log can
> exist in a fresh install.**

An **observation** is one recorded moment where an agent's behaviour could have
been better, written down at the time it happened rather than reconstructed
later. The log is the durable, cross-session record of those moments.

> **Every read and every write goes through `observation-log.js`.** Not because
> the file format is hard to parse — it is deliberately trivial — but because the
> rules *around* the format are the part that is easy to get wrong, and prose
> asking an agent to remember them is the thing this file exists to replace. The
> engine is a peer of `tracker-comment.js` and
> `change-log.js`: same exit codes, same `--json` `reason`
> contract, same posture that an agent who has read one has read all of them.

---

## Layout

`init` creates this tree and nothing else creates any part of it:

```
$OBS_WORKSPACE/skill-observations/
├── observation-log/
│   ├── 0001-short-slug.md            # one file per observation
│   └── archive/
│       ├── .id-floor                 # highest id ever issued
│       └── 0002-resolved-slug.md
├── cross-cutting-principles.md
├── skill-families.md
├── last-review-date.txt              # the literal `never` until a review runs
└── checkpoints.log
```

**One file per observation, not one file holding many.** Two writers appending
to a shared file race; two writers creating differently-named files in a
directory do not. The per-file layout is also what lets `scan` read frontmatter
only and never touch a body.

**`last-review-date.txt` is seeded with the literal string `never`.** Never a
date. A date means a review actually ran, and seeding one at setup suppresses
the first review forever — the log accumulates, the "days since review" figure
stays plausible, and nothing ever surfaces.

The workspace root is resolved once by
[`resolve-observation-workspace.sh`](resolve-observation-workspace.sh) and
never derived from the current working directory. See **Resolving the
workspace** below.

---

## Frontmatter

Each observation is a Markdown file: a YAML frontmatter block, then a body
structured as Issue → Improvement → Principle.

| Field | Meaning |
|---|---|
| `id` | Integer; matches the `NNNN-` filename prefix. **Never reused.** |
| `title` | Short descriptive title. |
| `status` | `open` \| `actioned` \| `declined` \| `superseded` \| `parked`. **Missing is read as `open`, never as nonexistent.** |
| `parked_until` | **Mandatory when `status: parked`**, empty otherwise. One line naming the condition, phrased so a later review can answer it yes or no. |
| `type` | `open-source` \| `internal`. |
| `skill` | **Always a list**, even with one entry. First entry is primary. May be empty. |
| `proposes_skill` | List of new-skill candidates by working name. Independent of `skill`. |
| `siblings_checked` | **Mandatory, never blank.** Family name, members evaluated, verdict. The literal `none` only where the target belongs to no family. |
| `area`, `date`, `session_context` | Context fields. |
| `resolved` | Resolution date, `YYYY-MM-DD`. **Archival is gated on it.** |
| `resolution` | What was done, or why it was declined. |
| `reference` | Optional path to durable saved evidence — must outlive the session and be resolvable by a different one. |

**`skill:` is always a list.** Even with one entry, even with none. The
alternative — a string when there is one and a list when there are several —
makes every consumer branch on the shape of a field before reading it, and one
consumer that forgets is a silent single-skill read of a multi-skill
observation.

**A missing `status:` is `open`.** This is a read rule, not a repair rule: the
engine does not write the field in, it treats its absence as the least-resolved
state. The opposite default would make a malformed file disappear from the work
queue, which is the one failure mode a work queue must not have.

---

## The id rule

The next id is **one more than the highest of three values**:

1. the highest `NNNN-` prefix in `observation-log/`
2. the highest `NNNN-` prefix in `observation-log/archive/`
3. the number in `archive/.id-floor`

**The floor is the third input for a reason.** Without it, a log whose every
entry has been archived derives its next id from an empty active directory and
restarts at 1 — colliding with an archived file, or worse, not colliding and
producing two observations that share an id across the active/archive boundary.

**Prefixes are parsed base-10, explicitly.** `parseInt(prefix, 10)`. This is the
whole of the fix for a defect upstream ships and mitigates in prose: feeding a
zero-padded prefix into shell arithmetic evaluates it as octal, so `0105` reads
as `69` and `0108` is not a valid octal constant at all and errors the entire
derivation. Upstream's mitigation is a `sed` that strips leading zeros, which
works exactly as often as it is retyped. JavaScript with an explicit radix has
no octal interpretation of a leading zero, so the defect class does not exist
here.

> **Do not add a zero-stripping step.** It is unnecessary, and its presence
> would imply to the next reader that the hazard is still live.

**`next-id` performs the archival sweep first, inside itself.** See below.

---

## The archival gate

A file archives when **both** halves hold:

1. its `status` is one of `actioned`, `declined`, `superseded`, **and**
2. its `resolved:` date is a well-formed ISO date **strictly before today**.

ISO dates compare lexically, so the second half is a string comparison and needs
no date library.

**The grace period lives in the file, not in session memory.** A file resolved
today stays put until tomorrow, whichever session resolved it and whichever
session sweeps. That is what makes the rule hold under parallel sessions: a
rule phrased as "don't archive what you just resolved" is only enforceable
within one session's memory, and there is more than one session.

**A resolved file whose `resolved:` date is unreadable is skipped, not
archived.** The date is repaired deliberately and separately. Archiving on a
malformed date would mean the least-trustworthy files are the ones that get
filed away.

**The sweep is folded into `next-id`, not asked for.** Upstream couples the two
by convention — a prose preamble saying "on every write, first archive" — and
records that the preamble under-fires. Here `nextId()` calls the sweep as its
first statement, so no write path can reach an id without having swept. The
coupling survives simplification because it is a function call rather than a
paragraph.

### `parked` is not resolved

**`parked` means decided-but-blocked: the decision has been made, and an
external precondition has not.** It leaves the work queue, it requires
`parked_until:`, and it **never archives**.

It satisfies neither half of the gate — it is not in the resolved set, and it
carries no `resolved:` date. Both facts must stay true. The tempting
simplification is "it has left the work queue, so archive it", and that
simplification silently removes live entries from view: a parked entry that
archives never has its `parked_until:` condition re-checked, so it is lost
rather than deferred.

**Never stamp a `resolved:` date onto a parked entry to tidy it away.** That is
the same bug wearing a date.

---

## The work queue

```
queue = files − resolved − parked
```

Derived from the **directory listing**, never from a `grep 'status: open'`. A
grep over an optional field silently drops every file that omits it — and
`status` is optional, and its absence means `open`, so the grep drops exactly
the files that most belong in the queue.

`queue` emits a reconciliation assertion in its payload:

```json
{ "reason": "ok", "total": 12,
  "open": ["..."], "parked": ["..."], "resolved": ["..."],
  "statusless": ["0007-foo.md"],
  "reconciled": true }
```

`statusless` files are **counted as OPEN and named explicitly**. Counting them
without naming them would make the queue correct and the reason for its size
invisible.

---

## An empty result is a claim about the instrument

This is the rule the engine exists to enforce, so it is stated once, plainly:

> **A scan that returns nothing is reporting on two possibilities at once, and
> only one of them is a finding.** Either there is nothing to find, or the
> instrument is broken. Those are not the same answer, and they are byte-identical
> from the caller's side.

So every read that can return empty carries an independent check:

| Reading | Guard | `reason` when it trips |
|---|---|---|
| `scan` | files were enumerated but zero frontmatter headers parsed | `scan-broken` |
| `next-id` | the log is non-empty but no ids were extracted | `id-broken` |

**The two counts must be derived by different means** — one from the directory
enumeration, one from the parse — and the count must live outside the stream it
guards. Upstream records the exact failure that shapes this: a counter
incremented inside a printing loop lived in a subshell once the loop was piped,
so the guard reported "0 parsed" directly underneath a screen of correctly
parsed output.

`empty` and `scan-broken` are **different `reason` values**. A genuinely empty
log is a fine, normal state; a log that cannot be read is not. Collapsing them
is how "the one answer that never gets questioned" gets returned forever.

---

## Skill families and `siblings_checked`

A **family** is a set of skills that must stay coherent with one another —
`review-story` / `review-task` / `review-bug`, say. `skill-families.md` records
each family's members, what they must share, and what each member is allowed to
differ on.

`siblings_checked:` is **mandatory and never blank**, and the reason is
specific:

> The two states of a one-entry `skill:` list — *siblings were evaluated and
> correctly excluded* versus *siblings were never considered* — are
> byte-identical. Nothing downstream can distinguish them.

Recording the judgement does not make the judgement better. It makes the
judgement's **absence** visible, which is the only property that lets anything
enforce it. That is why the CLI rejects an empty `--siblings-checked` at the
boundary rather than defaulting it to `none`: a default would restore exactly
the indistinguishability the field exists to remove.

Where the target genuinely belongs to no family, the literal `none` is the
correct value — and it is a recorded judgement, not a missing one.

`families --audit` greps each member for each shared rule and reports gaps,
judging an absence against the family's `Member-specific` column before calling
it drift.

---

## The carrier pattern

When one session acts on **part** of a multi-skill observation's `skill:` list,
both obvious moves lie:

- marking it `actioned` claims the whole thing was done;
- leaving it `open` claims none of it was.

So do both halves explicitly:

1. Mark the original `actioned`, with a `resolution:` naming **which portions
   were applied**.
2. Log a **carrier** observation holding the remainder — only the outstanding
   skills in its `skill:` list, and enough substance to stand alone.

**The carrier must stand alone.** A bare pointer back to the original is not
enough, because the original is about to archive, and a pointer into the
archive is a pointer a reviewer will not follow.

---

## A note on the sibling references

`tracker-comment.js`, `change-log.js`, `resolve-platform.sh` and this file are peers in the
repository's shared-resources directory; `observation-log.js` sits beside them too.

**They are named here rather than linked, deliberately.** A relative link resolves in situ and
breaks the moment the bundler copies this file into a skill's `references/` directory — which it
does, without bringing unrelated siblings along, because it keys on the literal
`references/<name>` form and never sees a `./`-prefixed link. Writing them in that linkable
form instead would drag three unrelated engines into every consumer of a skill that bundles this
contract, to satisfy six cross-references. Nothing under `skills/` is link-checked in CI, so the
broken form would have shipped green.

---

## Version-control hazards

**A just-written observation is untracked, and `git clean -fd` exists to delete
exactly those.** This is the most likely way to lose the log, and it does not
look like data loss when it happens — it looks like a tidy working tree.

The dangerous commands, in rough order of how much they destroy:

| Command | What it does to the log |
|---|---|
| `git clean -fd` | **Deletes every untracked observation.** Unrecoverable. |
| `git reset --hard` | Discards tracked modifications — a `set-status` edit vanishes. |
| `git checkout -- <path>` | Same, scoped. |
| `git stash` | Recoverable, but silently removes entries from the working tree mid-session. |

Two rules follow:

- **Prefer committing pending observations over reverting them.** The log is
  cheap to commit and expensive to reconstruct.
- **Scope any dirty-tree guard to exclude the workspace.** A pipeline that halts
  on `git status --porcelain` being non-empty, or that offers to clean, must not
  count observation files — otherwise writing an observation breaks the pipeline
  that was supposed to record it.

---

## Resolving the workspace

Never derive the workspace from the current working directory. Source the
resolver, guarded:

```bash
source references/resolve-observation-workspace.sh || exit 1
# OBS_WORKSPACE, OBS_LOG_DIR and OBS_STAGING_DIR are now set.
```

**The `|| exit 1` is not decoration.** A bare `source` prints the resolver's
error and then carries on with unset variables — the same silent-permissive
failure `resolve-platform.sh` documents for itself.

Resolver order:

1. `skills-config.yaml` → `observations.workspace`
2. `$OBS_WORKSPACE`
3. the project-identity default (`<home>/.claude/projects/<encoded-project-path>`)

**All three derived paths are exported, not just the root.** Upstream records
what happens otherwise: pinning only the log directory left the staging root to
be re-derived per session, and parallel sessions derived it plausibly and
differently — three writers, two staging roots, one manifest that saw half the
work.

**An ephemeral anchor is refused with a non-zero exit** — a path under
`.claude/worktrees/`, under `/tmp`, or inside a linked git worktree. State
written to a checkout that is about to be torn down is state that will be torn
down with it. This is `reason: ephemeral-workspace`, not a warning.

### The project root is resolved the same way

Two commands read the **project**, not the workspace: `doctor` looks for the
agent-instruction file (`AGENTS.md` / `CLAUDE.md`) and `families --audit` looks
for `skills/<member>/SKILL.md`. Both anchor at the project root — `--audit-root`
when given, taken verbatim; otherwise the nearest enclosing repository root
(the first ancestor holding a `.git` entry); and the cwd itself only outside any
repository. Both report the `root` they resolved so a wrong answer is checkable.

Neither anchors at the bare cwd, and that is not a stylistic choice. The
documented invocation is `command node references/observation-log.js …` from
inside the skill directory, where no `AGENTS.md` lives, so a cwd-anchored
lookup answered "not configured" for a repository whose `AGENTS.md` says
otherwise — silently, with `reason: ok` and exit 0 — and the family audit
reported every member as `member-not-found` (bug 15). A wrong answer with a
clean exit code is the one nobody questions.

`doctor`'s `activation-configured` check carries a `state` that separates the
two ways it fails, because they call for different actions:

| `state` | Meaning | Do this |
|---|---|---|
| `configured` | an agent-instruction file at `root` mentions the observation log | nothing |
| `not-configured` | the file is there and does not mention it | add the activation instruction to that file |
| `no-agent-file` | no `AGENTS.md` or `CLAUDE.md` at `root` | check `root` first — a wrong root looks exactly like a project that was never set up |

---

## Exit codes and `reason`

Transcribed from `tracker-comment.js` so the
`|| echo "⚠️ …"` subshell idiom keeps working unchanged:

| Code | Meaning |
|---|---|
| `0` | the success family — `ok`, `already`, `empty`, `dry-run` — and any unhandled throw |
| `1` | a guard tripped |
| `2` | usage error: unknown subcommand, unknown flag, missing required argument |

> **Exit `1` means something different here than in `tracker-comment.js`, and
> deliberately.** There, `1` is a skip under `--strict`. Here the guards *are*
> the point of the engine, and a tripped guard is a real failure a caller must
> not proceed past. The success family and the usage code are identical, which
> is what the calling idiom actually depends on.

`reason` vocabulary — every value is reachable from at least one test:

| `reason` | Meaning |
|---|---|
| `ok` | the operation completed |
| `already` | nothing to do; the state was already correct |
| `empty` | the log is genuinely empty — **distinct from `scan-broken`** |
| `scan-broken` | files present, zero frontmatter headers parsed |
| `id-broken` | the log is non-empty and no ids were extracted |
| `collision` | the target path already existed |
| `ephemeral-workspace` | the resolved anchor is torn down with its checkout |
| `fork-detected` | a second `skill-observations/` exists at another plausible anchor |
| `invalid-frontmatter` | a file's header could not be parsed |
| `parked-without-condition` | `status: parked` with no `parked_until` |
| `dry-run` | `--dry-run`; nothing read, nothing written |
| `usage` | the invocation itself was wrong — unknown subcommand or flag, missing required argument, a flag whose value is absent. Always paired with exit `2`, never `1`: a caller that mistyped a flag has a different problem from one whose guard tripped |

**The vocabulary is a contract from the first commit.** Adding a value later is
additive. Changing what an existing value *means* is a breaking change to every
call site, and the first call sites are the step prose of the skill that
consumes this engine.

---

## Two rules the CLI enforces by omission

**There is no `--id` flag.** Not an oversight — the enforcement. A batch that
pre-computes a base id and hardcodes sequential numbers collapses N independent
max-checks into one stale read; upstream records a hardcoded id colliding with
one a parallel review issued between the check and the write. Prose asking the
author to re-derive per file is not enforcement. The absent flag is.

**There is no inline `--body`, only `--body-file`.** Observation bodies carry
backticks, `$(…)` and newlines — the same reason `tracker-comment.js` requires a
body file for comments.

---

## See also

- [`observation-log.js`](observation-log.js) — the engine
- [`resolve-observation-workspace.sh`](resolve-observation-workspace.sh) — the resolver
- `tracker-comment.js` — the exit-code and `reason` idiom this transcribes
- `resolve-platform.sh` — the guarded-source resolver idiom
