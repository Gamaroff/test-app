---
name: qa-runnable-prose-detection
description: The detection rule that decides when a QA review must EXECUTE a skill's documented shell snippets rather than only read them. Stated once here and referenced by qa-task (Step 4b) and qa-story (Phase 1.7); the orchestrator's step 5-6 doc cross-references it. Covers what counts as runnable prose, block classification (runnable / placeholder / mutating), the fail-closed safety boundary, dual-shell comparison, and how results map onto existing QA finding shapes.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/qa-runnable-prose-detection.md. Regenerate via `npm run bundle`. -->

# QA — Runnable-prose detection rule

## Why this exists

A skill's deliverable is often **runnable prose**: fenced shell snippets and CLI invocations that an
agent will copy out of the markdown and execute verbatim. QA reads that prose. Until this rule existed,
nothing ran it.

That gap has a measured cost. Task 66 (`review-pr`) passed two QA cycles, a DoD gate and eleven mutation
proofs while its Step 3 artifact-collection block used a multi-glob `ls`. Under **zsh** — the default
macOS shell — a glob that matches nothing aborts the entire command, so one absent artifact kind
suppressed every kind that was present:

| Shell | stdout lines | exit |
| ----- | ------------ | ---- |
| bash  | 6            | 1    |
| zsh   | **0** (`no matches found: …/*.bug.*.md`) | 1 |

Note the exit codes. **They agree.** Only the *stdout* comparison separates a working block from a
broken one, which is why stdout is the load-bearing signal in this rule and exit status is not
sufficient on its own.

Contract tests could not have caught it. Forty of them passed. They assert what the prose *says*; this
rule asserts what it *does*.

---

## 1. When the rule fires

A work item is **runnable prose** when its diff adds or modifies at least one file that is

- a `SKILL.md`, **or**
- a `shared/resources/*.md` prompt or protocol document

**and** that file contains at least one fenced ` ```bash ` block **or** at least one command written
in a **table cell of a command column** (§1a).

Anything else skips the step. The skip is **recorded, never silent** — see §5.

> Only ` ```bash ` fences are in scope. ` ```sh `, ` ```shell `, ` ```console ` and language-less fences
> are out of scope for now: widening the net widens what gets executed, and the fence label is the only
> declaration of intent available. A file that means its snippets to be run should label them `bash`.

### 1a. Table cells in a command column

A markdown table cell can hold a real, runnable command, and the places it happens are
disproportionately **verification** commands — where a false pass is the worst available failure.

Task 77 shipped one. `develop-pipeline-resume-contract.md`'s Steps 5–6 verification cell held a
predicate that returned a **false PASS under zsh** whenever its glob matched nothing: a failed zsh glob
aborts the command substitution, and zsh's `[` then reads the empty operand in `-ge` as `0`. It would
have verified a run with **no QA artifacts at all** as complete. Three QA cycles and a full CI run did
not catch it, for one reason — the extractor only looked at fences, so the cell was never read.

A span is in scope when **all** of these hold:

1. It sits in a genuine table — a row starting with `|`, followed by a delimiter row (`| --- | --- |`).
   The delimiter row is required, not inferred: without it any prose line containing a pipe becomes a
   header and the line beneath it becomes a command.
2. Its column's **header names a command** — matching `/\bcommands?\b/i`. The corpus spells it
   "Verification command", "Command" and "Commands".
3. It is backtick-delimited, and it **contains whitespace**.
4. It is not inside a fenced code block. A table shown inside a fence is an illustration; extracting
   from it would execute a document's own examples.

Two properties of table cells that fenced blocks do not have, and both are load-bearing:

- **`|` is escaped as `\|` inside a cell**, and GFM applies that escape before any other inline
  parsing, code spans included. So the row must be split on **unescaped** pipes only, and the escape
  undone before the text is treated as shell. Split naively and the row gains a phantom column, every
  later column shifts, and the command column read is the wrong text. Nothing else is unescaped: a
  command containing `\\` must survive verbatim.
- **One cell holds several independent commands**, joined by prose (`… AND … AND …`). Each backticked
  span is its own unit of execution; concatenating the cell would run the prose as shell.

**Why the restriction to command columns, and why it is a noise bound rather than a safety one.**
Backticked spans in table cells are overwhelmingly not commands — they are field names, statuses, file
globs and verdict tokens (`PASS`, `accepted`, `task.*.gate.*.yml`). Feeding all of them to the
classifier would push most documents into `no-executable-blocks` on a flood of `unrecognised-command`
refusals, which is exactly the "noise trains reviewers to ignore it" failure §4 warns about. The
safety boundary is unchanged: the allow-list in §2a still decides everything that gets this far, and
the whitespace rule fails toward running **less**, never toward running something unsafe. No single
unspaced word can carry a shell disagreement anyway — that needs a glob inside a substitution, a `[`
test, or a pipeline.

**Two known limitations, stated rather than left to be rediscovered.** Both were found by QA probing
the extractor and both fail toward extracting *less*, never toward running the wrong thing:

- **A blockquoted table is not recognised.** A row must start with `|` after trimming, so
  `> | Step | Verification command |` is skipped. No document in the corpus writes a command column
  inside a blockquote; if one appears, this is the rule to relax.
- **An unequal backtick run truncates the span.** `` `echo a``b` `` extracts `echo a` and drops the
  rest. GFM's own code-span rules are ambiguous at this shape, and no corpus instance exists.

The **escaped** and **unescaped** pipe are both handled, and they are handled by different mechanisms
for different reasons — see the `\|` bullet above for the escape, and note separately that a pipe
inside an *open* backtick span is treated as content. That second rule deliberately diverges from GFM,
which splits an unescaped pipe even inside a code span. The divergence is the point: rendering cares
where the cell boundaries are, this engine cares whether a command was seen at all. Without it, one
unescaped pipe in *any* cell of a row shifted every later column, so a well-formed command in the
command column was dropped and the file reported zero blocks, zero findings and no note. A span left
open at end of line falls back to the naive split, because collapsing the row into a single cell would
make the command column disappear entirely — worse than the bug being fixed.

**An escaped backtick (`\``) outside a span is a literal backtick and does not open one.** Two of them
in a row otherwise read as a span opening and closing, so the real delimiter between them became
content and the whole row collapsed to a single cell — the command column then did not exist and its
command was dropped in silence. That was a *regression introduced by the code-span rule above*, found
by the QA loop's refute pass, and it is the reason a fix is treated as new code rather than as the
closure of a finding. The guard is `spanLen === 0` rather than unconditional because markdown's rule is
asymmetric: inside a code span a backslash is literal, so a backtick there still counts toward the
closing run.

Table-cell commands are classified, sandboxed and dual-shell compared by the **same** code as fenced
blocks, and reported in the same finding shapes. Every result and every finding carries an `origin` of
`fence` or `table-cell`; the human-readable report annotates the latter as `line N (table cell)`,
because the two constructs are fixed in different ways and a reader who cannot tell them apart goes
looking for a fence at a line that holds a table row.

---

## 2. Block classification

Every fenced `bash` block in a changed in-scope file is classified into exactly one of three buckets.

| Class         | Meaning                                                         | Executed? |
| ------------- | --------------------------------------------------------------- | --------- |
| `runnable`    | Every command is on the safe-command allow-list, and every variable it reads is bound | ✅ yes |
| `placeholder` | Contains `{…}` / `<…>` template slots, or reads a variable nothing binds | ❌ no |
| `mutating`    | Matches the deny-list, **or** contains any command not on the allow-list | ❌ no |

### 2a. The safety boundary fails closed

This is the part that must not be softened. Classification is driven by an **allow-list of read-only
commands**, not by the deny-list. The deny-list exists only to produce a precise reason for the cases
worth naming (`git push`, `gh pr comment`, `curl -X POST`, `rm -rf`, …).

**Anything unrecognised is `mutating` and is never executed.** A novel command the allow-list has not
heard of is treated as dangerous, not as safe-by-default. A deny-list alone fails *open*: every command
nobody thought to forbid runs.

The practical consequence, and it is intentional: `gh` and `curl` are **not** on the allow-list in any
form. Read-only `gh pr view` and `curl -sf` are skipped along with the mutating ones. Executing a
network call from inside a QA gate is a side effect QA should not have, and the execution environment
is built from a minimal allow-list (`PATH`, `HOME`, `LANG`, `TERM`, `TMPDIR`) plus the caller's
bindings — the parent process's credentials are never passed through.

Three further rules fall out of the same principle, each added after a review found the boundary open:

- **A write redirection makes any command mutating**, allow-listed or not. `echo x > /tmp/f` writes a
  file, and an absolute or `~`-relative target ignores the working directory entirely, so the sandbox
  is no defence. Redirection to `/dev/null`, `/dev/stdout` or `/dev/stderr` persists nothing and is
  exempt, as is file-descriptor duplication (`2>&1`) — without that exemption the guard in §3a below
  is itself unrunnable.
- **Command runners are refused outright** — `env`, `command`, `time`, `xargs`, `sudo`, `nohup`,
  `eval`, `exec`, and `awk`. Their blast radius is whatever follows, and only the leading word is
  scanned. `awk` belongs here for a different reason: its program is a quoted argument, so
  `awk 'BEGIN{system("…")}'` is arbitrary shell the scanner cannot see. The one exception is
  `command -v` / `command -V`, which print a path and run nothing.
  *This costs real coverage — `awk '{print $2}'` is harmless and gets skipped. That is the fail-closed
  trade accepted deliberately: recognising a safe `awk` program means parsing `awk`.*
- **An unreadable command position is unsafe, not absent.** A leading token that cannot be parsed as a
  command name — a variable command `$CMD`, a glob that expands to a binary (`/usr/bin/[t]ouch`), a
  tilde path — classifies `mutating`. Treating it as "no command here" is how a fail-closed rule fails
  open, and it is the hole an attacker reaches for first: `who'am'i`, `to"u"ch` and `t\ouch` are all
  spellings of one binary.

  The token is unquoted the way a shell would before the name is read, so `\ls` resolves to `ls` and
  stays runnable. A name with *embedded* quotes is refused even when the underlying command is safe —
  quote contents are blanked before the name is read, so `l's'` reconstructs as `l`, not `ls`. That is
  the right direction to be wrong in: no real documentation writes `l's' -la`, and a boundary that
  guesses at a half-erased name is worse than one that refuses it.

  The **one** token in command position that is genuinely not an invocation is a `case` arm pattern,
  recognised by its trailing `)`. That is why the scanner no longer erases bare parentheses — without
  the `)` there is nothing to distinguish `*://*/pull/*)` from `/usr/bin/[t]ouch`.

### 2b. Unbound variables are placeholders, not failures

The caller supplies a binding set (`DOC_FILE`, `D`, `PR_NUMBER`, …). A block that reads a variable which
is neither bound by the caller nor assigned inside the block itself is reclassified `placeholder` — it
was written to be run in a context this gate cannot reconstruct. That is a skip with a reason, not a
defect.

---

## 3. Dual-shell execution

Each `runnable` block is executed under **`bash -c`** and **`zsh -c`**, in a temporary working
directory, with a timeout. stdout, stderr and exit status are captured per shell.

A finding is raised when any of these holds:

| Condition                                              | Finding             | `channel` | `confidence` |
| ------------------------------------------------------ | ------------------- | --------- | ------------ |
| Either shell exits non-zero                            | `execution-failure` | —         | `high`       |
| The two shells disagree on stdout                      | `shell-disagreement` | `stdout` | `medium`     |
| stdout **agrees** but the two shells disagree on exit status | `shell-disagreement` | `status` | `medium` |

`medium` on disagreement is deliberate: some blocks legitimately differ between shells, and a check that
cries wolf is a check reviewers learn to skip.

**Both channels exist because each is the other's blind spot, and the repository has shipped one of
each.** The task-66 fixture disagrees on **stdout** while its exit status agrees — that is the case the
paragraph at the top of this file argues from, and it is why stdout is compared at all. The task-77
predicate is the exact mirror: both shells print nothing, and the entire defect is in the **exit
status** (`bash` 2, `zsh` 0). Comparing only stdout labelled that a bare `execution-failure` and never
named the portability defect, which is the one thing the reader needs to see.

The channels are checked in that order and only one fires per block — a stdout divergence is the more
specific statement, and reporting both would double-count one defect. `shell-disagreement` remains a
single `kind` so every existing consumer keeps working; `channel` says which comparison diverged.

Adding the status channel cannot turn a previously clean file red: a status disagreement implies at
least one non-zero status, which has already raised `execution-failure`. It is a label on a failure the
gate already caught, not a new gate.

### 3aa. Defence in depth — the sandbox sentinel

Classification is the first line, and it has been wrong: a single review found **thirteen** inputs that
reached `runnable`, one of which wrote a file outside the working copy. So the runner keeps a second,
independent line that does not consult the classifier at all.

Each block runs in `work/` inside a private temp root. Before and after the run, the runner snapshots
the temp root **excluding `work/`** — writes inside the copy are expected — and reports any difference
as an `escaped-sandbox` finding at `confidence: high`.

The sandbox root is passed explicitly by the caller. Deriving it from the working directory (`cwd/..`)
was tried and is wrong: `runBlock` accepts any `cwd`, so a bare temp directory made the sentinel walk
the whole of `/tmp` twice per block. **A safety net that guesses its own boundary is not a safety net.**

**Be precise about what this catches, because overstating it is worse than not having it.** The sentinel
watches the sandbox root and nothing else. It detects a block escaping *upward* out of its working copy
— `> ../x`, `cd .. && …` — which is the common shape of an accidental escape. It does **not** see a
write to an absolute path (`/tmp/x`, `$HOME/.zshrc`): there is no OS-level sandbox here, `spawnSync`
runs a real shell with the real `PATH` and the real `HOME`.

So classification remains the primary boundary and the sentinel is a second line under it, not a
containment guarantee. Anything that claims otherwise — including an earlier draft of this file — is
claiming more than the mechanism delivers.

### 3a. The zsh arm is guarded

`zsh` is not guaranteed to exist — CI runs on `ubuntu-latest`. Guard it the way this repository already
guards its one hand-written parity suite (the `tracker-access` shell test suite, §12 "zsh parity"):

```bash
if command -v zsh >/dev/null 2>&1; then
  : # run both arms
else
  : # bash only; record zsh-unavailable
fi
```

When zsh is absent, run the bash arm alone and record `zsh-unavailable` as **information**. It must not
raise a finding, and it must not trip the zero-executed rule in §4 — a missing interpreter is not a
defect in the work item under review.

---

## 4. A run where zero blocks executed is never a pass — but it is two states

If an in-scope file has fenced `bash` blocks and **none** of them classified `runnable`, that is always
**recorded**, never reported as a clean pass. This is the rule's own failure mode, so it is stated
explicitly rather than left to good sense: an over-broad `placeholder` or `mutating` classification
would make the step quietly do nothing, which is precisely the silent-skip shape the step exists to
eliminate. A gate that cannot fail is not a gate.

But "nothing ran" covers two situations, and only one of them is anyone's problem. The engine
discriminates on `counts.placeholder`:

| Condition | Record | Kind | Gate |
|---|---|---|---|
| `placeholder > 0` | **finding**, `confidence: medium` | `zero-blocks-executed` | eligible for `top_issues[]` |
| `placeholder === 0` (every block refused as `mutating`) | **information** | `no-executable-blocks` | never gates; exit `0` |

**`placeholder > 0` — the run was under-configured.** Some block reads a value the run did not supply.
`--bind` / `--copy` fixes it and the `detail` string says so. This is the case the guard was written
for, and it stays a finding.

Its `confidence` is **`medium`**, unlike the two findings in §3. It is a statement about *coverage* —
this gate did nothing here — not a defect in the work item, and `confidence: high` on a `category: bug`
is what makes a finding gate-blocking. A skill whose every snippet reads a caller variable would
otherwise block its own pull request for needing bindings the run did not supply. Measured: `qa-task`
and `qa-story` both classify **0 runnable** without bindings, so at `high` this step would have blocked
the very change that introduced it.

**`placeholder === 0` — every documented command was correctly refused.** The file documents `gh`,
`curl`, `rm` and write redirections because that is what the skill *does*, and those are deny-listed by
design — a QA gate does not make network calls. **No configuration will ever move these into
`runnable`**, so there is nothing to act on, and a finding here is permanent noise. It is emitted as an
informational `no-executable-blocks` record instead: still in the JSON, still in the report, so the step
is never a silent no-op; not a finding, so it does not accumulate.

Measured before the split: six of ten skills surveyed sat permanently in the second state, and three of
those (`develop-next`, `commit-changes`, `tracker-reconcile`) received a bare finding with **no**
remediation hint — the hint is appended only when there is a placeholder to bind. A check that fires on
most of the library with no available fix is one reviewers learn to scroll past, and an ignored check is
a check that does not exist. See `bug.7`.

The informational record carries a **breakdown of refusal reasons with counts**. A
`unrecognised-command (fail-closed)` refusal is not the same thing as a deny-listed one: the first may
be an over-refusal the classifier should learn (see `bug.6`, `bug.10`), and collapsing both into
"correctly refused" is how that would stop being visible.

> **Do not suppress either record**, and do not convert one into the other to quiet a report. If a file
> genuinely should have runnable blocks, the fix is bindings or a classifier correction — not silence.

---

## 5. Reporting

The QA report records, for the file under review:

- how many blocks were found, and the count in each class
- **every skipped block with its line number and reason** — a silent skip recreates the problem
- which shells actually ran (and `zsh-unavailable` when applicable)
- each finding, mapped onto the existing `code_review` finding shape: `category: bug`, with `severity`
  and `confidence` per the table in §3
- **each informational `notes[]` record** — today that is `no-executable-blocks` (§4) and
  `zsh-unavailable` (§3.5). These are reported as information, never as findings, and never dropped:
  dropping them is what would turn a file the step could not execute into one indistinguishable from a
  file it fully covered

No new report or gate schema. An execution failure is eligible for `top_issues[]` under
`code_review_blocking` exactly like any other `category: bug` finding.

---

## 6. Engine

`references/qa-execute-snippets.mjs` implements extraction, classification and dual-shell
execution. It is a library plus a CLI:

```bash
node references/qa-execute-snippets.mjs --file <path.md> --json
```

Exit codes follow the repository convention: `0` clean, `1` findings, `2` hard error. A file whose every
block was correctly refused exits **`0`** — it carries a `notes[]` record, not a finding (§4). The JSON
report carries `findings[]` and `notes[]` side by side; a caller that reads only the exit code sees the
distinction too, which is why the split reaches the exit code and not just the payload.

Bind caller values with repeated `--bind NAME=VALUE`, seed the temp working directory from a real
directory with `--copy <dir>`, and set the per-block timeout with `--timeout <ms>`.
