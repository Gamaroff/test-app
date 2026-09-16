---
name: scaffold-tracker-workflow
description: Read a project's live tracker board (Jira or GitHub Projects v2) and scaffold the `tracker-workflow.yaml` status ladder from it — the board's columns in order, plus which pipeline moment targets each. Use when a repo has no `tracker-workflow.yaml` and the develop pipelines are not moving cards correctly, when onboarding a new project onto the pipelines, when the board has been re-configured and the ladder needs re-deriving, or when the user says "scaffold the tracker workflow", "map my board columns", "generate tracker-workflow.yaml", or "why isn't my Jira card moving".
---

# scaffold-tracker-workflow

## Purpose

`tracker-workflow.yaml` tells the develop pipelines what a board's columns are, what order they sit
in, and which status each pipeline moment should move a card to. Without one, moments resolve against
built-in defaults that know nothing about the board, and multi-hop movement does not happen at all.

Writing it by hand means re-deriving three facts the tracker already knows. This reads them and emits
the file.

**The ladder it produces is observed. The `pipeline:` mapping is inferred, and inference is the part
that gets things wrong.** Column names are written by humans for humans — "Ready for Showcase",
"Waiting for merge", "REVIEW" — and this skill maps them onto a closed set of moments with regular
expressions. Your job is not to run the script; it is to walk the user through what it proposed and
why, and get the parts it could not know right.

## When to use this skill

- A repo has no `tracker-workflow.yaml` and cards are not moving, or moving to the wrong column
- A project is being onboarded onto `/develop-story`, `/develop-task` or `/develop-bug`
- The board has been re-configured and the ladder needs re-deriving
- The user asks why a card stopped moving partway through a run

**Do not use it to change one moment.** That is a one-line edit to a file that already exists, and
regenerating would discard the comments explaining every other choice.

## Prerequisites

| Tracker | Needs                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Jira    | `JIRA_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` in `.env`. `JIRA_BOARD_ID` is optional but **strongly wanted** — see [Board order](#board-order-is-the-signal-and-it-can-be-wrong) |
| GitHub  | `gh` authenticated with the `read:project` scope (`gh auth refresh -s read:project`), and a Project (v2) board linked to the repo with a single-select **Status** field                                |

All calls are reads. The script writes exactly one file and never touches the tracker.

## Protocol

### Step 1 — Check what already exists

```bash
ls tracker-workflow.yaml
```

If it exists, **do not overwrite it silently.** Go to Step 2 with `--print` and show the user a diff
against what they have. A hand-authored file usually carries reasoning in its comments that is worth
more than a regeneration.

### Step 2 — Scaffold and read it

```bash
node scripts/scaffold-tracker-workflow.js --print
```

`--print` writes nothing. Read the whole output before proposing anything — it is annotated with the
evidence behind each inference.

Add `--json` when you want the summary as data rather than prose:

```bash
node scripts/scaffold-tracker-workflow.js --print --json
```

### Step 3 — Resolve what the script flagged

Four things need a human, and the script marks all four. Work through each **with the user** — do not
resolve them by picking the likeliest answer.

**Inversions — the moments are out of order.** The single most important flag. The board's column
order does not match the order the pipeline fires moments in, so a later moment resolves to a lower
rank and the backward-move guard refuses it. The run appears frozen with nothing in the log to
explain why. Ask which is wrong — the board's arrangement, or the expectation — and either reorder
the rungs or drop the moment that does not belong. Boards very often carry a column nobody uses.

**`done` — suppressed by default when the board has a merge queue.** Accepting work and merging it
are different events. A pipeline that closes a card on acceptance closes it while its pull request is
still open, and anything tracking that card as a parent goes down with it. The default is that a card
stops at the merge queue and a human closes it. Confirm the user wants that; `--enable-done` if not.

**Ambiguous columns.** A column that matched two moments — "QA Review" is both. Rule order decided
it. Confirm or override with `--set`.

**Unmapped moments.** A moment with no matching column does not fire. Sometimes correct (the board
has no QA column), sometimes just a name the patterns missed ("Ready for Sign-off" is a review
column). Ask.

Apply answers with `--set`, which is repeatable and takes `~` to disable:

```bash
node scripts/scaffold-tracker-workflow.js --print \
  --set in-qa=Testing \
  --set done=Done \
  --set blocked=~
```

### Step 4 — Write it

```bash
node scripts/scaffold-tracker-workflow.js          # writes tracker-workflow.yaml
node scripts/scaffold-tracker-workflow.js --force  # only if replacing an existing file
```

The script validates its own output through `tracker-workflow.js` — the same engine the pipelines
read the file with — and refuses to write anything that does not parse or that fails validation.

### Step 5 — Confirm against real behaviour

Emitting a file that validates is not the same as the pipeline doing what the user expects. Check a
real card, without moving it:

```bash
# Network-free. Pass --issue-type, or you get the GLOBAL ladder rather than
# the per-type overlay, and a disabled moment will read as enabled.
node .agents/skills/develop-story/references/jira-stage.js \
  --issue <KEY> --stage done --issue-type '<Type>' --print-plan --json

# GET-only; reads the card's real position, so it can show a multi-hop plan.
node .agents/skills/develop-story/references/jira-stage.js \
  --issue <KEY> --stage in-qa --dry-run --json
```

Then commit the file **with its comments intact**. They are the record of why each choice was made,
and they are the reason the file is YAML rather than JSON.

## What this skill cannot know

Say these out loud when handing over — each one has bitten a real board.

- **Validators are invisible.** A transition can carry a workflow validator ("please enter the time
  spent", "set the release where this is merged") that field introspection does not report. The
  column exists, the status exists, the ladder is right, and the move still fails. Only attempting it
  reveals this.
- **Board column order is arranged for people.** It is the best available signal for rank and it is
  frequently not the intended workflow order. That is what the inversion check is for, and it fires
  on real boards.
- **Which of a column's names should lead.** A Jira column aggregating several statuses becomes one
  rung with alternatives, in the board administrator's order. The first name is the one a moment
  targets. Reordering is a judgement about the board, not a fact on it.
- **Whether an unused column is dead — and leaving it in has a cost.** Boards accumulate columns, and
  the script maps what it finds. But order is the path, so a column sitting mid-ladder that no moment
  targets still becomes a **mandatory stop** for anything walking past it: a card moving to the merge
  queue will be dragged through the demo-readiness column on the way. That is usually harmless and
  occasionally not, and it is invisible until you trace a walk. Check with `planMove`, or just read
  the ladder and ask which of these columns work actually passes through.
- **GitHub cards do not move yet.** The GitHub execution path is not wired. The file validates, the
  ladder is correct, and authoring it now is safe and useful — but no card moves until that lands.

## Design notes

Three behaviours are deliberate and worth not "fixing".

**A side-state is lifted off the ladder.** A Blocked column is an interruption, not a position, and
boards put it anywhere — often before In Progress. Since a rung's index is its rank, laddering it
would rank a blocked card below one being worked on, making the way out a backward move; and because
order is the path, the walker would pass _through_ Blocked en route elsewhere. So it is emitted as a
moment target and omitted from `statuses:`, which is exactly the side-state shape the reference
describes.

**A moment lands at the entry of a phase, not its exit.** Given both "Ready for Testing" and
"Testing", `in-qa` targets the first. Picking the last would skip the queue the column exists to
form. The loser is reported, never silently dropped.

**An overlay is emitted only when it changes behaviour.** A per-issue-type overlay _replaces_ the
ladder rather than merging with it, so every needless one is a second copy to keep in step. A type
that merely lacks one alternative spelling within a rung gets none; a type missing a whole rung, or
unable to perform a moment, gets one.

## Reference

- [`docs/reference/tracker-workflow.md`](../../docs/reference/tracker-workflow.md) — the file format,
  the four properties of ordering, the moment vocabulary, and the precedence chain
- [`docs/examples/tracker-workflow.default.yaml`](../../docs/examples/tracker-workflow.default.yaml) —
  the hand-authored starter, for a board too small to be worth probing
- `references/tracker-workflow.js` — the engine that reads the file, and validates what this
  skill writes

## Options

| Flag                     | Effect                                                       |
| ------------------------ | ------------------------------------------------------------ |
| `--tracker jira\|github` | Override platform detection                                  |
| `--project KEY\|NUMBER`  | Jira project key, or GitHub Project (v2) number              |
| `--board ID`             | Jira board id (defaults to `$JIRA_BOARD_ID`)                 |
| `--out PATH`             | Where to write (default `<repo root>/tracker-workflow.yaml`) |
| `--print`                | Write nothing; print the YAML                                |
| `--force`                | Overwrite an existing file                                   |
| `--json`                 | Machine-readable summary                                     |
| `--enable-done`          | Map `done` even when the board has a merge queue             |
| `--no-overlays`          | Skip per-issue-type overlays (Jira only)                     |
| `--set moment=Status`    | Override an inferred moment; `~` disables. Repeatable        |

Exit codes: `0` wrote or printed · `1` refused (file exists, or validation errors) · `2` usage error ·
`3` could not read the board.

### Board order is the signal, and it can be wrong

Without `JIRA_BOARD_ID` there is no column configuration to read, and the script falls back to the
widest issue type's own workflow status order. **That is workflow order, not board order, and the two
are not the same thing.** It says so in the emitted header. Supply the board id whenever one exists —
rank is what stops a resumed run walking a card backwards, and a ladder in the wrong order gets that
wrong quietly.
