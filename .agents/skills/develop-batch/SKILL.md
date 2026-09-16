---
name: develop-batch
description: "Parallel roadmap orchestrator: selects the maximal set of unblocked, write-disjoint roadmap items (via scripts/select-next.mjs --batch), fans each into its own git worktree, runs their pipelines (/develop-story, /develop-task or /develop-bug) concurrently and fully autonomously, then merges the green PRs serially — rebasing each on the new base tip — and ticks the roadmap + Change Log per item. Develop in parallel, merge serially. Crash-safe via a batch run-state file; re-running resumes where the last run stopped. Stops at an empty frontier, manual/blocked rows, planning gaps, or any pipeline HALT. Invoke with `/develop-batch`, `/develop-batch --dry-run` (read-only batch preview), or wrap in `/loop /develop-batch` for continuous runs. Sibling of develop-next (single item); this fans out the whole conflict-free frontier."
invokes: [develop-story, develop-task, develop-bug]
---

# Develop Batch — Parallel Roadmap Fan-out Orchestrator

Extends single-item `/develop-next` across the **whole conflict-free frontier**. One
invocation = the next batch of dependency-ready, write-disjoint roadmap items taken from
"outstanding" to "merged + ticked": developed **in parallel** in separate git worktrees,
then merged **serially**. Everything per-item (branching, review, develop, QA loop,
finalise, and the merge gate / roadmap tick) is delegated unchanged to the existing
pipelines and reuses `develop-next`'s merge machinery — this skill only adds the
**fan-out** and the **serial finalize lane** on top.

The whole strategy in one line: **develop in parallel, merge serially.**

Policy baseline (inherited from `develop-next`, user-ratified): auto-merge everything
green; auto-answer routine pipeline questions with the recommended option and log them;
stop at manual items, planning gaps, and any hard HALT. The one axis `develop-next` does
not consider — **write-conflict** between concurrent items — is decided here by the
`--batch` selector's `touches:` analysis, never by eye.

## When to Use This Skill

- User says `/develop-batch` (one batch) or `/loop /develop-batch` (continuous).
- User says "action the next batch", "develop the parallel frontier", "fan out the next
  worktrees and merge them".
- `--dry-run`: report which rows the batch would contain, the soft overlaps accepted, the
  rows held back by hard conflicts, and the worktree commands — then stop. **Read-only** —
  no worktrees, no checkout/pull, no state file, no pipeline actions.

For a single item (no worktrees), or to stop at every phase boundary, use `/develop-next`
instead. This skill deliberately relaxes phase discipline to surface the real doable
frontier (see Step 1), so it is a **batch driver**, not a substitute for the strict
single-item loop.

## Configuration

Reads the consumer project's `skills-config.yaml`. The base keys are **shared with
`develop-next`** (same roadmap, base branch, merge gate, and strategy — so single-item and
batch runs never diverge), plus one batch-only key. Every key has a default:

| Key                              | Default                                          | Used in           |
| -------------------------------- | ------------------------------------------------ | ----------------- |
| `developNext.roadmapPath`        | `docs/development/project-completion-roadmap.md` | Steps 0, 1, 3     |
| `developNext.baseBranch`         | `develop`                                        | Steps 0, 2, 3     |
| `developNext.qualityGateCommand` | `npm run ci`                                     | Step 3 merge gate |
| `developNext.mergeStrategy`      | `merge` (one of `merge` / `squash` / `rebase`)   | Step 3            |
| `developBatch.maxParallel`       | `4`                                              | Step 2            |
| `developBatch.requireTouches`    | `false`                                          | Step 1            |
| `developBatch.resources`         | *(unset — one implicit resource)*                | Step 2            |
| `developBatch.worktreeSeedPaths` | `[]`                                             | Step 2            |
| `developBatch.maxResumeAttempts` | `2`                                              | Steps 0, 2        |
| `developBatch.maxRebatches`      | `3`                                              | Step 5.5          |

`maxParallel` is the **global** ceiling on concurrent pipelines across all resources.
`resources` (optional) declares named execution resources with their own per-resource
capacity, test command and optional capacity probe — see
[`references/execution-resources.md`](references/execution-resources.md). **With no
`resources` declared, behaviour is unchanged from a single-lane project**: one implicit
resource at `maxParallel` capacity, and the dispatch directive renders exactly as before.
`worktreeSeedPaths` lists gitignored files to copy from the main tree into each fresh
worktree (a fresh `git worktree add` carries none, which silently changes how a
runner behaves). `maxResumeAttempts` bounds re-dispatch of an externally-interrupted item;
`maxRebatches` bounds Step 5.5.

`requireTouches` (default off, non-breaking) hardens the write-footprint
assumption: when `true`, the selector is invoked with `--require-touches` so it defers all but
one un-annotated (`+own`-default) row per batch instead of merely warning — for teams that
want write-conflicts impossible by construction rather than caught at merge. Apply any
project-wide command conventions from the consumer
project's own `CLAUDE.md`/`AGENTS.md` when running these (e.g. a required prefix for
`gh`, or a Node version shim) — this skill writes the bare commands.

## Run state (crash safety + single-flight)

`develop-batch` records progress in `.claude/state/develop-batch.state.json` — a
**batch-shaped** array (the single-item analogue is `develop-next`'s
`develop-next.state.json`):

```json
{
  "startedAt": "<iso>",
  "schemaVersion": 2,
  "globalCap": 4,
  "resources": [{ "name": "local", "capacity": 1 }, { "name": "box", "capacity": 3 }],
  "probeCache": {},
  "rebatches": 0,
  "lastSelectorSignature": "",
  "items": [
    {
      "id": "T40",
      "source": "roadmap",
      "command": "/develop-task",
      "commandArg": "<path>",
      "dir": "../wt-t40",
      "branch": "task/t40",
      "resource": "box",
      "testCommand": "ssh build-box make test",
      "attempts": 0,
      "interrupted": false,
      "haltKind": null,
      "worktreeCreated": false,
      "dispatched": false,
      "prNumber": null,
      "pipelineDone": false,
      "merged": false,
      "ticked": false,
      "worktreeRemoved": false,
      "halted": false
    }
  ]
}
```

The booleans remain the source of truth — `resource`/`testCommand`/`attempts`/`interrupted`/
`haltKind` are additive, and a v1 state file (no `schemaVersion`, no `resource`) resumes without
migration: a missing `resource` attributes to the first configured resource, never a HALT.
**Never persist a slot counter** — in-flight is always *derived* from the item flags
(`schedule.mjs computeInflight`), which is what makes slot accounting crash-safe.

Written at batch selection, updated as each item advances, **deleted only in Step 5** once
every item is terminal (`ticked` or `halted`). This makes the parallel-develop →
serial-merge → tick sequence recoverable: a crash between any item's merge and tick can
never cause that item to be re-selected or re-dispatched. Each worktree additionally holds
its **own** `.claude/state/develop-pipeline.lock` (the pipelines write state relative to
their working directory), so concurrent pipelines never collide and each resumes
independently via its own Phase 0b machinery.

## Step 0 — Preflight

0. **Do not run this skill in plan mode.** Plan mode forbids writes, so every dispatched
   pipeline stops mid-flight quoting the plan-mode directive rather than failing its own
   gate. If plan mode is active, STOP and say so — do not dispatch. (This is observed, not
   hypothetical: it killed 4 of 5 running pipelines in a live batch.)
1. **Run-state check.** If `.claude/state/develop-batch.state.json` exists, a prior batch
   did not finish — do **not** select a new batch. **Resume**: skip items already
   `ticked`; for each non-terminal item, resume from its recorded flags exactly as the
   per-item lane below would (`merged: true, ticked: false` → tick it; `dispatched: true,
   pipelineDone: false` → treat as **interrupted** and re-admit it via Step 2's planner —
   the pipeline's own lock/resume picks up where it stopped; `worktreeCreated: true,
   dispatched: false` → dispatch it). An interrupted item is **re-placed, not pinned** to
   its previous resource — a different resource may now be idle, which is the point.
   Rebuild in-flight counts from the item flags; never trust a persisted counter. In
   `--dry-run`: report the pending batch and stop.
2. **Dry-run short-circuit.** In `--dry-run` mode, run `git fetch origin <baseBranch>`
   (fetch only — never checkout or pull), then go straight to Step 1's selector call and
   print its JSON verbatim (batch / excluded / softOverlaps / unannotated / worktrees /
   skippedPhases), including any `lint.warnings`.
   Create no worktrees, write no state file, dispatch nothing. Stop.
3. `git status --porcelain` on the main tree — if it is dirty: **HALT**, list the dirty
   paths. Never stash or discard.
4. `git worktree list` — if any `../wt-*` (or otherwise batch-owned) worktrees from a
   previous run are dangling with no matching run-state, **HALT** and report them for the
   operator to `git worktree remove`; never `rm -rf` a worktree directory.
5. `git checkout <baseBranch> && git pull --ff-only origin <baseBranch>` — on non-ff or
   conflict: **HALT** with the git output.

## Step 1 — Select the batch

Run the deterministic selector — **never eyeball the roadmap**:

```bash
node <skillsDir>/develop-next/scripts/select-next.mjs --batch --roadmap <roadmapPath>
# append --require-touches when developBatch.requireTouches is true
```

(`--batch` is implemented by the `develop-next` selector; this skill consumes it.)
When `developBatch.requireTouches` is `true`, append `--require-touches` so the selector
defers un-annotated rows itself; the emitted `batch[]`/`excluded[]`/`worktrees[]` already
reflect the downgrade.
Selection rules, the two batching axes, and marker vocabulary:
[`develop-next/references/roadmap-selection.md`](../develop-next/references/roadmap-selection.md)
§"Parallel batch". Act on the JSON `status`:

- **`halt` with `missing: true`** (no roadmap at `roadmapPath`) → this project has no
  completion roadmap yet. **Do not fabricate one, and do not invent a second generator** —
  reuse `develop-next`'s behaviour: offer to scaffold a starter from the shared
  [`develop-next/assets/project-completion-roadmap.template.md`](../develop-next/assets/project-completion-roadmap.template.md)
  at `roadmapPath` (create parent dirs), then **STOP** for the user to populate it with
  real items. An empty roadmap has nothing to build. Note for the operator: `--batch`
  additionally needs each row to carry a `touches:` annotation — an un-annotated row is
  treated as `+own` (no shared resource) and may over-parallelize; the template's Legend
  documents the `touches:` vocabulary.
- **`batch`** with a non-empty `batch[]` → record `batch[]`, `excluded[]`,
  `softOverlaps[]`, `skippedPhases[]`, and `worktrees[]` for the run report. In
  `--dry-run`: print them and **stop here**. Otherwise write the run-state file with every
  `batch[]` item (a 1-item batch is fine — it degrades to a single worktree). Surface
  `softOverlaps[]` explicitly: these are the `~` tags whose second merger will rebase, and
  `excluded[]`: ready rows held back by a hard `!` conflict, deferred to the next batch.
  Also surface `unannotated[]` (and the matching `lint.warnings` line): rows batched with
  no `touches:` field, whose write-disjointness is **assumed, not verified**. Two or more
  together is a co-scheduling risk — report it in both `--dry-run` and live runs, and advise
  annotating those rows (or enabling `developBatch.requireTouches`). Under `requireTouches`
  the selector has already deferred the extras, so `unannotated[]` holds at most one and no
  warning fires.
- **`batch` with an empty `batch[]`** → no phase holds a dependency-ready, conflict-free
  row right now. **This is the normal state while no phase is open**: the registry fallback
  that `/develop-next` uses is **single-select only** (registry rows carry no `touches:`
  annotation, so write-disjointness cannot be established for them — see
  [`roadmap-selection.md`](../develop-next/references/roadmap-selection.md) §"Registry
  fallback frontier"), so an empty batch does **not** mean the registries are empty.
  **STOP**: report `excluded[]` + `skippedPhases[]` so the operator sees why, tell them to
  run `/develop-next` for the registry frontier (or author a phase with `touches:` tags if
  the items should run in parallel), send a push notification.
- **`halt`** (no parseable roadmap content, exit 1) → **HALT**: surface `lint.errors`
  verbatim. The selector is deliberately tolerant; a halt means the file could not be
  parsed as a roadmap at all.

The dispatched command and path for each item both come from the selector's
`worktrees[].run` / `batch[].command` — never hand-picked.

## Step 2 — Rolling admission (dispatch as slots free, never in waves)

**Placement is never hand-picked.** Ask the planner where each item goes and whether a slot
is free right now:

```bash
node <skillsDir>/develop-batch/scripts/schedule.mjs plan --state <statePath> --config <configPath>
```

It returns `{admit[], hold[], inflight, globalCap, probeCache, notes}`. Loop until every item
is terminal:

```
while (pending items remain) or (anything is still in flight):
  1. ADMIT — run `schedule.mjs plan`. For each entry in admit[]: create the worktree,
     seed it, dispatch it (below), and record resource/testCommand/attempts/dispatched.
     Re-run the planner until admit[] comes back empty.
  2. WAIT for the NEXT pipeline to report — not all of them.
  3. Classify and record that report, then go straight back to 1.
```

Invariants the planner enforces: `sum(inflight) ≤ globalCap`; `inflight[r] ≤ capacity(r)`;
and `inflight[r] ≤` a probe's effective capacity when one is configured. In-flight is
**derived** from item flags every tick, never persisted.

1. **Create the worktree** from the selector's ready-made command (`worktrees[].shell`):

   ```bash
   git worktree add <dir> -b <branch> <baseBranch>
   ```

   Mark `worktreeCreated: true`. This is an isolated checkout on its own scratch branch off
   the base — the pipeline cuts its own `feature/…` branch inside it. Then **seed it**: copy
   every `developBatch.worktreeSeedPaths` entry from the main tree into `<dir>`. A fresh
   worktree carries no gitignored files, and a missing runner config typically degrades
   *silently* rather than failing.

   **Entries are repo-relative PATHS and MUST be copied path-preservingly** — recreate each
   entry's directory inside the worktree rather than flattening it to the basename:

   ```bash
   for p in "${WORKTREE_SEED_PATHS[@]}"; do
     [ -e "$p" ] || continue
     mkdir -p "$dir/$(dirname "$p")"
     cp "$p" "$dir/$p"
   done
   # equivalently: rsync -R "${WORKTREE_SEED_PATHS[@]}" "$dir/"
   ```

   A naive `cp "$p" "$dir/"` is wrong as soon as any entry is not a repo-root basename, and
   it fails in the worst possible way — **silently**. Two entries sharing a basename (e.g. a
   repo-root `.env` and a per-workspace `apps/<svc>/.env`) both land at `<dir>/.env`, so the
   second clobbers the first *and* never reaches the nested location that needed it. The
   seeding step reports success, the worktree looks configured, and the failure surfaces
   much later as whatever the missing file was supposed to prevent. This is not
   hypothetical — it is reachable for any consumer whose per-workspace env file, rather
   than its root one, carries the credentials a test run needs.

2. **Dispatch one agent per admitted worktree.** Run the item's named command
   (`worktrees[].run`, e.g. `/develop-task <path>`; `/develop-story` and `/develop-bug` dispatch identically) **with its working directory set to
   `<dir>`**, prepending the directive below. Mark `dispatched: true`.

   **Dispatch in the background** so individual completions can be observed. This is what
   makes admission rolling rather than wave-barriered: dispatching a group and waiting on
   the group returns only when *all* of them finish, which silently reinstates waves.
   *Degraded fallback:* if individual completions genuinely cannot be observed, re-run
   `schedule.mjs plan` immediately after every returned group and never hold a freed slot
   waiting for a sibling.

   > **AUTONOMOUS RUN (develop-batch):** You are running this pipeline inside the git
   > worktree at `<dir>` — set your working directory to `<dir>` for all git and file
   > operations; do not touch the main working tree or any sibling worktree.
   > For the Phase 0d Upfront Setup questions, take the auto-derived recommended option
   > for every question without prompting (Q1 = base branch, `<baseBranch>`; Q2 = base
   > branch, `<baseBranch>`). For the Phase 0b resume prompt, choose "Resume from last
   > completed step". Record every auto-answer in the Decisions Log. Run the pipeline to
   > an open, green, `accepted` PR and report back the PR number and final QA status.
   > Do **not** merge the PR — the batch orchestrator owns merging. All existing HALT
   > conditions remain HALTs.
   >
   > **Execution resource.** This pipeline is scheduled on `<resourceName>`. Run every
   > test, QA and gate command as `<testCommand>` — do not substitute the project default
   > and do not run the suite anywhere else.
   >
   > **Verify placement — a silent fallback is not a pass.** The suite's own output must
   > confirm it ran on `<resourceName>`. If the runner falls back to a different execution
   > path for any reason, that run does **not** count as green: report it as a placement
   > failure with the runner's output verbatim and stop. Do not claim a pass you did not
   > observe on the resource you were given.
   >
   > **Gate execution.** Run gate commands in the **foreground** and hold the turn with a
   > Monitor-style wait rather than a fixed watchdog — a CPU-contended suite can
   > legitimately run long, and a fixed timeout kills healthy runs. Do **not** poll CI in a
   > loop; the orchestrator owns CI-gating and merging. Stop and report once your gate is
   > green and the PR is `accepted`.
   >
   > **Worktree seeding.** This worktree is a fresh checkout and contains no gitignored
   > files. Before the first gate run, copy `<seedPaths>` from the main working tree.

   Omit the last four paragraphs entirely when no `resources` are configured — with a
   single implicit resource the directive renders byte-identical to a single-lane project.

   Requires the linked-worktree-safe `create-branch` (it must create `feature/…` from the
   base **ref** without checking out the base branch, which is already held in the main
   tree — see `create-branch` SKILL.md §"Exception — linked worktree").

3. **On each report, classify it and free the slot.** Do not wait for siblings.

   | Report | Action | Slot |
   | ------ | ------ | ---- |
   | Green (PR number, `accepted`) | **verify before believing** (below), then record `prNumber`, `pipelineDone: true` | freed |
   | **HALT** — its own gate failed (review NO-GO, develop stall, 5 QA cycles without PASS, qa-fix with no changes, DoD gaps, rebase/merge conflict) | `halted: true` + `haltKind` + the report verbatim; the worktree is **left in place for inspection**; one item's HALT **must not sink the rest of the batch** | freed |
   | **Interrupted** — something *external* stopped it mid-flight (plan mode, permission denial, compaction, user interrupt, tool outage) | `interrupted: true`, `attempts++`; re-queue at the tail and **re-place** it | freed |
   | Interrupted past `maxResumeAttempts` | `halted: true`, `haltKind: "interrupted-exhausted"` | freed |

   **A green report is a claim, not evidence — verify it before setting `pipelineDone`.**
   Run the same assertion the pipeline runs, from the orchestrator, against the item's
   worktree:

   ```bash
   bash <skillsDir>/develop-batch/references/verify-push-state.sh \
        --base <baseBranch> --pr <PR#>      # cwd = the item's worktree
   ```

   Non-zero → treat the report as **false**, not as green: do **not** set `pipelineDone`,
   and re-queue the item as `interrupted` with the script's output recorded, so the
   pipeline resumes and finishes the work it reported.

   This is not defensive paranoia about subagents; it is a measured failure. On
   2026-08-13 a lane reported a "PR-ready branch pushed" whose branch carried **0
   commits** with every file uncommitted, and separately claimed a trunk fix was
   "isolated in its own commit" when no such commit existed. The orchestrator relayed
   both claims to two sibling lanes and planned the merge order around them. Step 3's
   head-SHA check would have refused the merge — but it runs at *merge* time, and the
   false claims had already shaped the batch by then. **Verifying at report time is what
   closes the gap**, and it costs one subsecond command per item.

   The halt-vs-interrupt call is `schedule.mjs`'s `classifyStop`, not a judgement call: a
   report is **interrupted** only when it stopped *without* emitting one of the pipeline's
   own HALT reports. Tiebreak on the worktree's `develop-pipeline.lock` — live and
   non-terminal means resumable. Ambiguous with no lock **fails safe to `halt`**: wrongly
   halting costs one manual resume, wrongly resuming can re-run a pipeline that had already
   decided to stop.

## Step 3 — Serial finalize lane (merge → tick, one item at a time)

**Precondition: development is finished.** Step 3 begins only once the pending queue is
empty and nothing is in flight. Merging is deliberately *not* interleaved with development —
the merge gate runs `<qualityGateCommand>` per item — the project's **full** CI-equivalent,
defaulting to `npm run ci` — so it is itself a heavy scheduled workload. Interleaving it either lets it contend silently for the very resources the
scheduler is protecting, or makes it take a slot and compete with development for throughput.
See [`references/execution-resources.md`](references/execution-resources.md) §"Rejected
alternative — rolling merges" before re-litigating this under time pressure.

The discipline that makes soft overlaps harmless: **merge one PR at a time.** For each item
with `pipelineDone: true` and not `halted`, in `batch[]` order, reusing `develop-next`'s
merge gate (Step 3) and acceptance record (Step 4) verbatim per item:

1. **Rebase on the current tip** (for the 2nd and later merges): in the item's worktree,
   `git fetch origin && git rebase origin/<baseBranch>` onto its `feature/…` branch. This
   trivially resolves the `softOverlaps[]` (a new Prisma model, an appended `imports:[]`
   line, another registry row) against whatever earlier items in this batch already landed.
   A non-trivial rebase conflict → mark the item `halted`, report it, and continue with the
   remaining items.
2. **Verify green** (all must hold, else HALT this item and continue):
   - Document frontmatter `accepted` **and** the QA gate is not `FAIL` **and** the gate's
     `top_issues[]` holds no entry still `open`. `accepted` is `/finalise`'s verdict and it
     has already weighed the gate token — a `CONCERNS` gate with no open finding and a
     documented `WAIVED` gate both pass; `FAIL`, an open finding, a non-`accepted` document
     or a missing/unparseable gate all HALT. The full row-by-row matrix is in `develop-next`
     Step 3 and applies here unchanged:

     | Document `status` | Gate decision          | `top_issues[]` has an `open` entry | Action                                                    |
     | :---------------- | :--------------------- | :--------------------------------- | :-------------------------------------------------------- |
     | `accepted`        | `PASS`                 | — (none)                           | merge                                                     |
     | `accepted`        | `CONCERNS`             | no                                 | merge                                                     |
     | `accepted`        | `WAIVED`               | no                                 | merge (the waiver is a recorded human decision)           |
     | `accepted`        | `CONCERNS` / `WAIVED`  | **yes**                            | **HALT** — an open finding survived finalise              |
     | `accepted`        | `FAIL`                 | any                                | **HALT**                                                  |
     | not `accepted`    | any                    | any                                | **HALT** — finalise did not accept                        |
     | `accepted`        | missing / unparseable  | —                                  | **HALT** — cannot establish the no-open-finding condition |

     An entry is open when its `status:` is absent or reads `open` — **except** under `gate: WAIVED`
     with `waiver.active: true`, where the listed entries are the waived findings (qa-gate keeps them
     with no `status:`) and count as waived, not open. Same clause as `develop-next` Step 3.
   - **Head-SHA check:** `gh pr view <PR#> --json headRefOid,state` must match
     `git rev-parse HEAD` on the item's local PR branch after the rebase (never gate one
     commit and merge another).
   - If the PR has CI checks, all must be green. `gh pr checks <PR#>` reports the state — but
     see **How to wait for CI** below before treating a pending result as a wait. Additionally
     (always, since not every project runs CI on PRs), run `<qualityGateCommand>` on the PR branch.

     **How to wait for CI — `gh pr checks` does not block.** It returns immediately and uses a
     dedicated **exit code 8** to mean "checks are still pending". Read the rollup one-shot
     instead, discriminating on `.status == "COMPLETED"` before reading `.conclusion` — a running
     CheckRun returns `conclusion: ""` (an empty string, not null), so `.conclusion // .state`
     reports a running job as green. This is the form `/finalise` already uses; take it from there
     rather than re-deriving it:

     ```bash
     gh pr view <PR#> --json statusCheckRollup \
       -q '[ .statusCheckRollup[]
             | (.status // "") as $st
             | (if   $st == ""          then (.state // "")
                elif $st == "COMPLETED" then (.conclusion // "")
                else "PENDING" end)
             | if . == "" then "PENDING" else . end ]
           | if length == 0 then "NONE"
             elif any(. == "FAILURE" or . == "TIMED_OUT" or . == "ERROR"
                      or . == "STARTUP_FAILURE" or . == "ACTION_REQUIRED") then "FAILURE"
             elif any(. == "PENDING" or . == "EXPECTED" or . == "QUEUED"
                      or . == "IN_PROGRESS" or . == "WAITING") then "PENDING"
             elif any(. == "CANCELLED") then "CANCELLED"
             else "SUCCESS" end' 2>/dev/null || echo "UNKNOWN"
     ```

     If a genuine wait is needed, **background it** — a poll loop written to a file, checked on a
     later turn. Never a foreground call that can outlive the tool timeout.

     > **`gh pr checks --watch` is forbidden in the foreground.** It blocks until CI finishes.
     > On a 23-minute serial CI lane it simply exceeds the 10-minute tool timeout, and an agent
     > that reaches for it burns one full timeout per attempt learning nothing — observed three
     > times on one PR. The flag appears nowhere in this repo for that reason.

3. **Merge** with the configured strategy:

   ```bash
   gh pr merge <PR#> --<mergeStrategy> --delete-branch
   ```

   On merge failure (conflict, protection): mark the item `halted`, report, continue. Mark
   `merged: true`. Story/task PRs target `<baseBranch>` directly — no epic integration
   branch.
4. **Signal the `pr-merged` stage for _this_ item**, after its merge succeeds and before its
   tick. Read the issue key from **this item's** document frontmatter — never from a
   batch-level variable:

   ```bash
   # Inside the per-item loop body — NOT once per batch.
   # TRACKER=github
   node .agents/skills/develop-batch/references/gh-stage.js \
     --issue "$ITEM_TRACKER_ISSUE" --stage pr-merged --json
   # TRACKER=jira
   node .agents/skills/develop-batch/references/jira-stage.js \
     --issue "$ITEM_TRACKER_ISSUE" --stage pr-merged --json
   ```

   > **This is the one place in the batch lane where a scoping slip moves the wrong card.**
   > The lane merges many PRs in sequence; firing `pr-merged` once for the batch would move
   > whichever item's issue happened to be in scope at the time — on a shared board, someone
   > else's card — or move a single card once per merge. Both are silent: the CLI reports
   > success either way, because it was asked about a real issue. Key the call on the item
   > being merged, inside the loop body, and never hoist it.

   Off by default and non-blocking, exactly as in `develop-next` — `stage-disabled`,
   `no-option` and `no-transition` all exit 0 and the tick proceeds. See
   `develop-next` Step 3 for the `done` / `pr-merged` ordering note.
5. **Record the acceptance immediately**, on `<baseBranch>` in the **main tree** (`git pull`
   first — the merge just advanced the remote). **Branch on the item's `source`** exactly as
   `develop-next` Step 4 does — `--batch` selects from the roadmap only today, so every batch
   item is `roadmap`-sourced — recorded as `source` on each `batch[]` item at selection, which is
   what a resume into this lane reads — but the arm is named so a registry-aware batch cannot fall
   into the roadmap arm by default:
   - **`source: roadmap`** — tick the item `[x]` and rewrite its row in the roadmap's
     accepted-row convention (copy an existing ✅ row's format; if none exists yet, use
     `✅ **accepted + merged** ([PR #N](url), QA PASS S/100)`); add a Change Log row (next
     version, same table format, author `Claude`); if an epic completed, update the
     roadmap's status-snapshot table and the epic's section header the way prior completed
     epics are recorded. Commit and push:
     ```bash
     git add <roadmapPath>
     git commit -m "docs(roadmap): tick <id> [x] — <short summary>"
     git push origin <baseBranch>
     ```
   - **`source: task-registry`** — no roadmap row, no roadmap Change Log row; Status is
     already `accepted` (finalise wrote it via `registry-tick.js`). Record the merge with
     `node .agents/skills/develop-batch/references/registry-tick.js --annotate --file <doc>
     --pr <PR#> [--issue "<[#N](url)>"] --json` — additive (notes cell + `Issue` cell), never a
     second Status writer. `annotated` → commit `docs(registry): record <id> — PR #<n> merged`
     and push; `already` → `git diff --quiet HEAD -- docs/tasks/task-registry.md` first and commit
     when dirty (a crash between the write and its commit leaves the row edited; the resume path
     skips the dirty-tree check), then `git push origin <baseBranch>` once, regardless (a crash
     between commit and push leaves the record local-only; the push is idempotent), then
     `ticked: true`; every other exit-0 reason (`no-row`,
     `no-registry`, `no-cell`, `not-accepted`, `not-a-task`, `engine-unavailable`) → log, no commit.
   - **`source: bug-registry`** — the bug registry has no Issue or notes cell and
     `develop-bug` already closed the row: log `bug-registry: nothing to write`, no commit.

     On non-ff rejection: `git pull --rebase origin <baseBranch>` once and retry; still
     rejected → **HALT** (the run state preserves `merged: true, ticked: false` for
     recovery). Mark `ticked: true` on every arm.

The next item's rebase (step 1) then picks up this item's code **and** its tick. Merge +
tick is serial by nature — the roadmap/Change Log edit is a guaranteed conflict point.
**Never parallelize this lane.**

## Step 4 — Clean up worktrees

For each `merged: true, ticked: true` item: remove its worktree (never `rm -rf` — worktrees
share one `.git`):

```bash
git worktree remove <dir>
```

Mark `worktreeRemoved: true`. Then `git worktree prune` and `git worktree list` as a sanity
check. **Leave the worktrees of `halted` items in place** for the operator to inspect and
finish or discard.

## Step 5.5 — Immediate re-batch (admit rows the merges just unblocked)

Once every item is terminal and **at least one roadmap row was ticked**, re-run the selector
*inside this invocation*. If it returns a non-empty `batch[]`, loop back to Step 1.

Rows previously in `excluded[]` are now safe to take: they were held back because they
hard-conflict on a `touches:` tag with a batched row, and that row's work is now on
`<baseBranch>`. **Do not attempt this mid-Step-2.** While a conflicting PR is open but
unmerged, a newly-admitted item branches from a base that lacks it and is guaranteed to
collide at merge — `excluded[]` exists precisely to prevent that. Rows held back only by
*capacity* need no re-selection at all; the rolling queue already admits them as slots free.

Gate the decision on `schedule.mjs`'s `shouldRebatch`:

| Guard | Stop when |
| ----- | --------- |
| Progress | the previous batch ticked **zero** roadmap rows (the real anti-spin guard — progress must be monotonic against the roadmap) |
| Signature | the new `batch[]` id set equals `lastSelectorSignature` — the roadmap did not move |
| Cap | `rebatches` has reached `developBatch.maxRebatches` |

Record `rebatches` and `lastSelectorSignature` in the run state.

## Step 5 — Report + continue/stop

Delete the run-state file **iff** every item is terminal (`ticked` or `halted`); otherwise
retain it for resume. Then end every run with a report:

- Batch composition (the `batch[]` ids + the `phase` it was drawn from, and any
  `skippedPhases[]`).
- Per-item outcome: merged + ticked (PR #, QA score, quality-gate result) or **halted**
  (with the pipeline/gate HALT report verbatim, and its worktree left for inspection).
- The `softOverlaps[]` that were rebased, and the `excluded[]` rows deferred to the next
  batch (with the clashing hard tag + rival id).
- The Decisions Log of auto-answers across all pipelines.
- The next batch preview — re-run the selector with `--batch` (selection only, no side
  effects).

**Stop the loop** (and send a push notification) when any of these hold; otherwise end with
`next batch: <ids> — loop may continue`:

| Stop condition                                     | Why                                                 |
| -------------------------------------------------- | --------------------------------------------------- |
| Selector returned an empty `batch[]`               | No dependency-ready, conflict-free rows right now   |
| Any item `halted` (pipeline / gate / rebase HALT)  | Fail loudly; leave its worktree for the operator    |
| Selector returned `halt` (roadmap parse/lint)      | Don't guess on sequencing                           |
| A tick push failed after rebase-retry              | Roadmap could not be advanced — operator decides    |
| An item hit `haltKind: "interrupted-exhausted"`    | It kept being externally interrupted — a human should see why |
| Step 5.5 declined to re-batch (no progress / same signature / cap) | The frontier is not moving; looping again cannot help |

## Continuous mode

`/loop /develop-batch` (no interval — self-paced). Each iteration runs one batch; when a
batch finishes clean, the next iteration re-selects the now-unblocked frontier (items that
were `excluded` by a hard conflict, or unblocked by this batch's merges, become eligible).
End the loop when a stop condition fires. One-time setup for unattended runs — permission
allowlist (including `gh pr merge`), pipeline hooks, worktree hygiene — is in
[`README.md`](README.md).
