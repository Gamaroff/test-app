---
name: roadmap-selection
description: Selection rules and marker vocabulary for picking the next actionable item from the project completion roadmap. Implemented by scripts/select-next.mjs; consumed by develop-next Step 1.
---

# Roadmap Selection Rules

Source document: the roadmap at `developNext.roadmapPath` (default `docs/development/project-completion-roadmap.md`). The roadmap's own "How to use this document" section is authoritative for intent; **the executable implementation of these rules is [`scripts/select-next.mjs`](../scripts/select-next.mjs)** — develop-next always runs the script rather than interpreting this document by eye. If script output and roadmap intent disagree, HALT and report the discrepancy rather than guessing; fix the roadmap (or the script) first.

**The roadmap is a living backlog.** Completed items are archived out (typically to `roadmap-history.md`), so a `deps:` entry that names no current row means _already shipped_, not _error_. Parsing is therefore deliberately **tolerant**: the only HALT is a roadmap that yields no parseable checkbox rows at all. Everything else questionable — an archived-out dep, a recap row restating a done id, an annotation checkbox with no id, dep prose the parser can't tie to an id — is a non-fatal **warning**, surfaced in `lint.warnings` but never blocking the loop. The one exception promoted to an error is _two live, unticked rows sharing an id_ (a genuine "which do I build?" ambiguity). Lint the format with `select-next.mjs --lint`; warnings are advisory, a non-zero exit means a real error. This behaviour is validated against a real 370-line roadmap (`evals/develop-next/unit/fixtures/10-real-world.md`).

## Item ids

A row's id is the first token after the checkbox, once bold/emphasis is stripped:

| Form                 | Examples                                       | Notes                                                                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Story / roadmap item | `20.4`, `5.1a`, `8.4-2`, `17.3-1`, `7.11-NFR2` | Digit-anchored, dot-separated, optional letter and `-suffix`                                                                                                                                                                                                |
| **Standalone task**  | `T22`, `T26`                                   | **`T` + digits.** Task and epic numbers can share this namespace (a Task 22 and an Epic 22 may both exist), so a bare `**22**` would be ambiguous — the prefix disambiguates. `T` must be followed by a digit, so prose like "Task 22" still reads as `22`. |
| **General bug**      | `B2`, `B17`                                    | **`B` + digits**, mirroring `T` for the same reason: task, epic and bug numbers share the namespace. Added because `/develop-bug` and `bug.{N}.{name}.md` were already supported while no id form existed for a general bug — so a correctly-written bug row was rejected as "no item id" and **silently skipped**, and the row below it was selected instead. |

`T`- and `B`-rows are **cross-cutting standalone items** (tasks and general bugs respectively), conventionally written inside their _consumer_ epic's section for readability. They are **not stories of that epic**: they are excluded from the epic's completion set, so an epic reads as complete once its own stories are accepted regardless of them. They _are_ globally indexed, so `deps: T22` resolves and blocks normally.

> A `T`-row with no `⏭️`/`manual` marker is an ordinary candidate and **will be auto-selected** when reached. If a task must only be picked up on an explicit decision (the "pick up against the first scheduled consumer" pattern), mark the row `⏭️ SKIP` and remove it at scheduling time — state the policy, don't rely on the row being unreachable.

## Marker vocabulary

| Marker                             | Meaning                                     | Selection effect                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` / `[x]`                      | outstanding / accepted                      | Only `[ ]` rows are candidates; `[x]` satisfies deps                                                                                                                                                                                                                                                                                                                                                                                                 |
| `deps:`                            | blocking prerequisites                      | Blocks only when a dep is an outstanding `[ ]` row (or an epic with outstanding rows). Deps that are ticked, marked _(shipped)_, or absent from the backlog (archived) count as satisfied. Accepts comma- and slash-separated lists (`8.3/8.4-1 *(shipped)*`) and bare epic refs (`Epic 8`).                                                                                                                                                         |
| _(shipped)_                        | dep already delivered                       | Counts as satisfied (with or without an item id)                                                                                                                                                                                                                                                                                                                                                                                                     |
| `⏭️` / `SKIP`                      | deferred, **non-blocking**                  | Row is skipped like `manual`, **but does not stop or block the loop** — the phase is stepped past and later work proceeds. Overrides `manual`/`🚧` on the same row. **Note:** a SKIP'd id also counts as _done_ for `deps:` purposes, so a dependent can build while the SKIP'd row is unbuilt. That is intended (a deferred block must not stall the loop), but it is surfaced as a lint warning — `X dep Y is ⏭️ SKIP — dep treated as satisfied`. |
| `gate:`                            | **ship/launch** gate                        | Does **not** block building — the gated feature may be developed and merged, it just must not be publicly exposed before the gate lands. Never blocks selection.                                                                                                                                                                                                                                                                                     |
| `flag:`                            | feature-flagged soft dep                    | Never blocks selection                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `touches:`                         | write-footprint (conflict axis)             | **Never affects single-item selection.** Read only by `--batch`: comma-separated resource tags, each `!` (hard/exclusive) or `~`/unmarked (soft/additive); `+own`/`-` = no shared resource. Two rows conflict when they share a tag either marks `!`. Terminated by ` · ` like `deps:`/`gate:`/`flag:`.                                                                                                                                                  |
| `‖`                                | parallelizable sibling (dependency axis)    | Take siblings in listed order for single-item selection. Dependency-independence only — **not** conflict-freedom; `--batch` + `touches:` decide worktree parallelism.                                                                                                                                                                                                                                                                                 |
| `→`                                | sequential chain (epic header `Flow:` line) | Later chain members are ineligible until earlier ones are accepted, even if their `deps:` line looks satisfied                                                                                                                                                                                                                                                                                                                                       |
| `manual`                           | operator action                             | **STOP** at the frontier — never auto-select, never scan past                                                                                                                                                                                                                                                                                                                                                                                        |
| `⛔ BLOCKED until X accepted`      | explicit block annotation                   | Skip until the named items are `[x]`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `🚧`                               | legal/ops-gated                             | **STOP** at the frontier, same as `manual`                                                                                                                                                                                                                                                                                                                                                                                                           |
| `/develop-story` / `/develop-task` / `/develop-bug` | the command to dispatch           | Runnable                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/create-story` / `/create-epic`   | planning gap                                | **STOP** — authoring is interactive and its output needs human review; it is never run unattended                                                                                                                                                                                                                                                                                                                                                    |

Sections that are never candidates: any heading matching **Deferred**/**human-gated**, **Housekeeping**, or **Change Log** (rows there are ignored entirely, including for lint), and any `[x]` row.

## Algorithm

1. **Phase scope.** Phases are headings containing `PHASE`; a document with no phase headings is one implicit phase. Find the earliest phase containing at least one outstanding `[ ]` candidate row. Phases are hard boundaries — never select from a later phase while an earlier one has _actionable_ items.
2. **Scan top-to-bottom** within the phase:
   - `manual` or `🚧` row → **STOP** (`human-gated`). A human gate is never scanned past — rows below it wait, even if eligible.
   - `/create-*` row → **STOP** (`planning-gap`).
   - `⏭️`/`SKIP` row → skip silently (non-blocking; never stops the loop).
   - `⛔`-blocked, flow-blocked, or dep-blocked row → skip, recording the reason.
   - Otherwise → **selected**. The command comes from the `/develop-story`/`/develop-task`/`/develop-bug` token; the work-item path is taken from an inline path after the command _or_ the row's `[story](…)`/`[task](…)`/`[bug](…)` link. **Prefer the inline form, and write it repo-root-relative** — that is what every existing row does and what the dispatched command receives verbatim. A markdown link is resolved relative to the roadmap file, so it renders correctly in the document but is not necessarily dispatchable from the repo root; the inline path avoids the question. (The inline matcher excludes `[`, so a link-form row falls through to link resolution instead of capturing the link *syntax* as a path.) A link resolves when its filename stem starts `story.`, `task.` or `bug.` — which covers all three bug forms: general (`bug.7.x.md`), story (`story.2.3.bug.1.x.md`) and task (`task.44.bug.1.x.md`). An eligible row that names no runnable command, or no resolvable path, is a **manual-checkpoint** stop (the loop pauses for the operator — e.g. a "run `/review-prd`" checkpoint), not a HALT.
3. **Phase progression.** If the scan exhausts a phase with outstanding rows but no selection or stop, every outstanding row is dep/flow/⛔-blocked. Advance to the next phase **only if every blocking item lives in a later phase** (a forward dep can never resolve before that later phase runs — e.g. a planning row that gates only a later item's _ship_). If any blocker is in the same or an earlier phase → **STOP** (`phase-blocked`); the operator decides.
4. **Epic order.** Within an execution phase, the section order encodes the ratified epic sequence — top-to-bottom scanning honours it automatically; do not re-derive or re-optimize the order.
5. **Record the rationale**: the script emits the selected item, its deps and their states, and every earlier `[ ]` row skipped with a one-line reason. Include all of it in the run report.

## Registry fallback frontier

The roadmap is a hand-maintained index of work that **already has two other indexes**. Filing a general bug appends a row to `docs/bugs/bug-registry.md`; creating a task appends a row to `docs/tasks/task-registry.md`. Both carry a path, a status and a priority — everything selection needs. Asking a human to transcribe a subset of that into a third place is one manual step between "work exists" and "the loop can see it", and it is a step nobody notices skipping, because **the failure mode is silence**: the loop reports `roadmap-complete` and stops, which is indistinguishable from there genuinely being nothing to do.

So when — and **only** when — the scan reaches the terminal `roadmap-complete` return, the selector falls through to the two registries.

**Precedence is absolute: an authored phase always wins.** The registries are a floor, not a re-ranking of deliberate human sequencing.

### Which stop the fallback pre-empts

`roadmap-complete`, and nothing else. The other four stops — `human-gated`, `planning-gap`, `manual-checkpoint`, `phase-blocked` — are deliberate operator decisions and still stop the loop. A human gate is never scanned past. This is the sharpest edge in the feature: a fallback reachable from any other stop would look like it was working while quietly stepping over someone's decision. One unit test per stop reason pins it, and each asserts the strong form — not "no registry item was selected" but **"the registry loader was never called"**.

### Eligibility — the floor equals what the dispatcher accepts

There is no marker to write and none to remember, and — since task.71 — **no opt-out either**. An item is opted **in** by existing; it leaves the frontier by being finished or cancelled. The two ladders are deliberately different because bugs and tasks do not share a lifecycle ([`bug-documents.md`](../../../docs/standards/bug-documents.md)):

| Kind        | Lifecycle                                                                       | Eligible                                                     | Relation to dispatcher |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------- |
| General bug | `new → in-progress → ready-for-qa → closed \| reopened`                          | `new`, `reopened`                                            | **pinned exactly** — diverges by `in-progress`, `ready-for-qa`; both are resume affordances, not available work (see below) |
| Task        | `draft → planned → ready-for-development → in-progress → ready-for-review → accepted \| cancelled` | `draft`, `planned`, `ready-for-development`, `in-progress`    | `===` — exact equality |

**The task floor equals the set of statuses the dispatching pipeline accepts.** The frontier names a command, so a status that command refuses yields a selection nothing can act on: `develop-task` Phase 0c HALTs on `Ready for Review`, `accepted` and `Cancelled`, and because `/develop-next` leaves its run-state file in place across a pipeline HALT, an unattended loop would stop at such an item and resume at the same one next invocation — unable to self-recover. Those three are therefore **excluded**, even though `ready-for-review` is unambiguously "outstanding" in document terms. Pinned by `evals/develop-next/unit/select-next.test.mjs` §"eligibility floor vs dispatcher", which parses the dispatcher's own status table rather than restating it, so the rule re-checks itself if the pipeline changes.

The relation was a one-directional `⊆` until task.71, and equality is the stricter claim in a way that matters: `⊆` can only catch a floor status the dispatcher refuses. It is blind to the opposite gap — a status the dispatcher accepts that the floor withholds — and that is exactly where `planned` sat. `/create-task` emits `status: planned`, so **every task ever filed entered the world outside the frontier** and stayed there until a human remembered to run `/review-task`, which is the manual tracking this fallback exists to remove. Equality also fails on over-widening, which `⊆` never could.

**There is no park value, by decision.** An earlier version of this section argued that the floor *was* the opt-out — that a `draft` task was speculative and out of the frontier by construction, which is stronger than a marker because there is nothing to remember. That argument is overturned, not merely edited around ([task.71](../../../docs/tasks/task.71.selection-floor-matches-dispatcher/task.71.selection-floor-matches-dispatcher.md) §2). The opt-out was never free: it parked speculative filings at no cost to their author and charged every real filing a manual promotion step. And the review gate it stood in for did not disappear — it moved to where it belongs, `develop-task` Step 2, which reviews a `draft` before any code is written and HALTs on NEEDS REVISION or REQUIRES REWORK. A speculative task now costs one visible, recoverable cycle; under the old floor a real task cost indefinite silence. A filing that should not be worked is `cancelled`, or is not filed; adding `deferred` to the lifecycle would re-import the "something new to remember" cost the old argument correctly warned about.

**The bug axis diverges, and task.72 pinned the gap exactly.** `develop-bug` proceeds on `new`, `reopened`, `in-progress` and `ready-for-qa`, while the bug floor is `new`, `reopened` — a real two-status gap, asserted as that exact set rather than as a subset. `⊆` held for every possible widening of the dispatcher, so it was silent about precisely the drift it existed to catch; the exact assertion fails in both directions, and closing the gap now requires a deliberate edit rather than happening as a side effect.

**Why the task axis's equality rule does not transfer.** It is not a universal law the bug axis has failed to obey. `develop-task`'s pre-work statuses mean *"this is unstarted work and the pipeline will start it"* — nominating such a task is exactly right, which is why task.71 made that floor equal the dispatcher's set. `develop-bug`'s two extra statuses mean something else: `in-progress` is *"a prior run may have started; resume-aware"* and `ready-for-qa` is *"proceed toward verification if a fix already exists"*. Those are **resume affordances**, written so a re-invoked pipeline does not HALT on its own half-finished work — not claims that work is waiting to be picked up. Selecting on them would hand an unattended loop a bug a human may be actively holding, or one whose fix is written and only awaiting verification. The gap may still be closed deliberately; the assertion failing is how that decision gets recorded.

**This changes eligibility, not precedence.** The registries remain a fallback consulted only at the terminal `roadmap-complete` return, so a wider floor changes nothing at all while any phase still holds an actionable row.

### Frontmatter decides; the registry row only nominates

A registry is an index, and indexes drift from what they index. Three rows of this repo's own task registry read `draft` while their documents read `accepted` — that is the current state of the file, not a hypothetical. So a row is a candidate only when **the document it points at** puts it inside its kind's eligible set, whatever the row says. This holds in both directions: a stale-**open** row with a terminal document is not selected, and a stale-**closed** row with an open document **is**. A document that is missing or carries no readable `status:` is not a candidate.

### Ordering

Bugs before tasks, unconditionally — a registered bug is known-broken behaviour, a filed task is intended work, and broken outranks intended. Within bugs: `severity`, then `priority`, then ascending number. Within tasks: `priority`, then ascending number. The trailing number tie-break is what makes the order **total**, so the frontier is stable under input reordering. An unrecognised severity or priority sorts last within its tier rather than throwing — a typo in a hand-maintained cell must not decide whether work is visible at all.

### Dependencies — the `Depends on` column gates selection

Ordering consults **nothing** about dependencies, so ranking alone will nominate a row whose prerequisite is unbuilt. A dependent row is therefore checked against its own `Depends on` cell after the eligibility floor and before the ranked-lower branch, so a blocked row is reported as blocked rather than as merely outranked.

A dependency is satisfied when **the document it points at** reads `accepted` — the same "frontmatter decides, the row only nominates" rule the frontier already applies to the candidate itself. References resolve across **both** registries, so a task may depend on a bug and vice versa. The cell accepts the spellings a hand-maintained table carries: `task.83`, `T83`, `bug.4`, `B4`, `#83`, and a bare `83` read as the declaring row's own kind. An em-dash, `none`, `n/a` or `tbd` places no constraint. Story references and anything with a dotted number (`story.2.3`) are dropped — they name nothing a registry can resolve.

**Three cases are treated as satisfied-with-a-warning rather than as blockers**: a `cancelled` dependency (waiting on work that will not happen waits forever — the roadmap path's `⏭️ SKIP` handling), a reference naming no row in either registry, and a reference whose document is missing or unreadable. The direction follows the same reasoning task.71 settled the eligibility floor on: selecting an item early costs **one visible cycle**, because `develop-*` Step 2 reviews before any code is written and HALTs on findings, while an unresolvable blocker costs **indefinite silence**. A wasted cycle beats an invisible row. All three still emit a `--lint` warning, so the condition is never mute.

**The check is one level deep, by design.** It asks only whether each named dependency is accepted, never what that dependency in turn depends on. A transitive walk would need cycle detection over a hand-maintained table that nothing validates; the shallow check needs none, and the deeper ordering falls out anyway — a dependency cannot itself be selected until *its* dependencies are accepted, so a chain drains one accepted item at a time.

Before this existed, the ascending-number tie-break hid the gap whenever a dependency happened to carry the lower number, which is the common case. Raise a dependent row's priority above its prerequisite's and the frontier nominated work that could not be built.

### Columns

When the table has a header, columns are read **by name** (`#`/`No`/`Id`, `Title`/`Name`, `Status`, `Severity`, `Priority`, `Deps`/`Depends on`/`Blocked by`), falling back to the documented positions only when no header is recognisable. A consumer who orders their registry differently is read correctly rather than silently mis-ranked; a header that names no `Status` or `Priority` column falls back to the documented position and says so in `--lint` warnings.

Column mapping is scoped to **one table**: it is resolved from that table's header and discarded when the table ends, so a `## Notes` key/value table or a second registry section is parsed on its own terms rather than as more registry rows.

A row whose id cell is not a number is a **malformed row**, not a header — the header is identified positionally, as the line above the `| --- |` separator. A row written `| T65 | … |` (the prefixed form the roadmap uses) is therefore reported rather than silently skipped.

### Tolerance

A consumer repo may have neither registry. An absent, empty, header-only or table-less registry yields zero rows and **never throws** — it degrades to today's behaviour. A single malformed row (no `[title](path.md)` link, an empty status cell, too few columns) is recorded and stepped over; it never suppresses the well-formed rows around it. A pipe table inside a fenced code block is an example, not the registry.

### Visibility — out of the frontier, never invisible

`select-next.mjs --lint` emits a `registryFrontier` section listing **every** registry row the fallback considered, with the reason each was passed over (`document status draft — outside the task eligibility floor …`, `… is not a member of the bug lifecycle …`, `blocked on unaccepted dependency: task.83 (planned)`, `document missing or unreadable: …`, `malformed row — …`, `eligible, but T3 ranked higher`). An item may be out of the frontier, but it must never be invisible — invisibility is the exact failure this mechanism exists to remove, and an escape hatch that reintroduced it silently would be the same bug wearing different clothes. Selection short-circuits at the first eligible row (so it reads at most one document per candidate up to the hit); `--lint` evaluates every row.

**A status outside the lifecycle is reported as a filing error, not as a finished item** (bug.8). The eligibility floor answers "should this be nominated now?"; the lifecycle answers "is this a status at all?". They are different sets on purpose, and until both were consulted, `closed` (valid, terminal) and `open` (a typo) produced the identical passed-over sentence — so a misfiled bug hid among the ~98 correctly-terminal rows this repo's own corpus produces. A row whose document status is not a member of `BUG_LIFECYCLE_STATUSES` / `TASK_LIFECYCLE_STATUSES` now gets:

- its own `reason`, naming the lifecycle so the typo is fixable from the message alone, plus `offLifecycle: true` on the passed-over entry;
- a `registryFrontier.warnings[]` entry — and those warnings are returned on the **normal selection path**, not only under `--lint`. They previously existed only in `--lint` output, which meant the one caller that most needed them (an unattended loop reporting `roadmap-complete`) was the one caller that could not see them;
- a named mention in the `roadmap-complete` `detail` line, because `passedOver[]` is not what a human scanning a loop log reads.

The floor is **not** widened to admit the bad value — that would treat the symptom, admit a status the lifecycle does not define, and leave the next unrecognised value just as silent. Upstream of all of this, `evals/shared/tests/document-status-lifecycle-corpus.test.mjs` fails the build when any bug/task document or registry row in the repo carries an off-lifecycle status, so the common case never reaches the selector at all.

### `item.source`

Every selection carries `item.source` — `roadmap`, `bug-registry` or `task-registry` — **including roadmap ones**. A field present only sometimes is an implicit contract: a consumer would have to infer "absent means roadmap". Uniform shape, one code path, and the run report can always state provenance. `--dry-run` inherits it for free, because it prints the item.

### Not in the batch

`--batch` is registry-free and unchanged. Registry rows carry no `touches:` annotation, so write-disjointness cannot be established for them and they must never enter a parallel batch.

### Paths and overrides

Registry hrefs are resolved **relative to the registry file**, so `bug.2.x/bug.2.x.md` in `docs/bugs/bug-registry.md` becomes the repo-root-relative `docs/bugs/bug.2.x/bug.2.x.md` that the dispatched command receives verbatim. Defaults are `docs/bugs/bug-registry.md` and `docs/tasks/task-registry.md`; override with `--bug-registry <path>` / `--task-registry <path>`.

## Parallel batch (`--batch`) — worktree fan-out

`select-next.mjs --batch` is a **planning aid**, orthogonal to selection: it returns a maximal set of rows that can be developed concurrently in separate git worktrees. Selection answers "what's next"; batch answers "what can N agents safely do at once". It runs nothing — output is advisory JSON.

Two axes must both hold for a row to enter the batch:

1. **Dependency-ready** — the exact predicate selection uses (deps/`⛔`/flow all satisfied, directly `/develop-*` runnable). `‖` covers this axis.
2. **Conflict-free** — no two batched rows share a `touches:` tag that either side marks `!` (hard). Shared `~` (soft) tags are allowed and surfaced as `softOverlaps` — the "second-merger-rebases" points the operator accepts.

Behaviour:

- **Greedy pack in document order**, so the batch always leads with the row selection would have picked. A ready row that hard-conflicts with an already-picked one is moved to `excluded[]` with the clashing tag and rival id.
- **Phase discipline, relaxed for planning.** The batch is drawn from the first phase with a non-empty ready frontier. Unlike selection (which STOPs at `phase-blocked`), batch *advances past* an earlier phase whose ready set is empty — only blocked/gated rows remain — recording it in `skippedPhases[]`. This surfaces the real doable frontier (e.g. Phase-2 work while a Phase-1 legal gate is pending) without touching the autonomous loop's stricter stop.
- **Output**: `batch[]` (ids + touches), `excluded[]`, `softOverlaps[]`, `skippedPhases[]`, and `worktrees[]` (`git worktree add … -b <kind>/<slug> develop` commands, `<kind>` ∈ `story`/`task`/`bug`). The base is always `develop`, so a `/develop-bug` row batches as a **bugfix**; a production hotfix (off `main`) is not expressible in a batch and must be run through `/develop-bug` directly. Exit 0 unless the roadmap HALTs.

The `touches:` tag vocabulary (the conflict-footprint registry) lives in the roadmap's Legend, not here — it is project-specific (hot files change), whereas these rules are not.

**Finalize lane.** Develop in parallel, but **merge to `develop` serially** — the merge-and-tick step edits the roadmap + registries + Change Log (a guaranteed conflict), and each merger rebases on the new tip. Batch parallelism is about *development*, not *merges*.

## Worked examples

Each rule above is pinned by an executable fixture in `evals/develop-next/unit/fixtures/` (same numbering as the tests in `evals/develop-next/unit/select-next.test.mjs`):

- **01** — shipped deps satisfy; first eligible row wins; a `manual` row at the frontier stops the run even when a later phase has eligible items.
- **02** — unsatisfied `deps:` skip a row; `gate:`/`flag:` never block.
- **03** — `Flow:` chains block later members; `‖` siblings go in listed order.
- **04** — `⛔ BLOCKED until X accepted` skips until X is ticked.
- **05** — a same-phase deadlock stops the run; the next phase is not raided.
- **06** — rows blocked only by later-phase items don't gate that later phase (forward-dep advance).
- **07** — Deferred/Housekeeping/Change Log rows are invisible to selection.
- **09** — `/create-*` rows stop the loop before any authoring happens.
- **10** — a real-world-shaped roadmap: `⏭️ SKIP` non-blocking defer, archived deps assumed shipped, epic-level deps, strikethrough recaps, `-NFR` suffixed ids, path-from-`[story]`-link, `🚧`-gated rows. Selects `12.1`; lints clean.
- **15** — the registry fallback frontier (no fixture file; the registries are built inline in the test): one test per stop reason proving the four deliberate stops are never scanned past *and the loader is never called*; roadmap precedence asserted as a deep-equal modulo `source`; drift asserted in both directions; the eligibility floor swept over every status in both lifecycles (`draft` and `planned` on the SELECTABLE side since task.71) plus a synthetic draft/planned registry proving priority still decides between them, and a guard that the widened floor leaves roadmap precedence untouched; ordering proved stable under input reordering; absent/empty/malformed/fenced registries all degrading rather than halting; and (bug.8) an off-lifecycle status producing its own reason, its own warning on both output paths, and a named mention in the stop `detail`, each asserted against a terminal-status counterexample so the distinction cannot pass vacuously.
- **11** — `T`-prefixed standalone-task ids: a T-row parses as an id and is selectable; `deps: T22` blocks its dependent until ticked; a T-row never counts toward its host epic's completion; a `⏭️ SKIP`'d T-row is stepped past but warns any dependent that its dep is satisfied only by the SKIP; `deps: —` reads as no-deps. Selects `T22` before `28.2`.
