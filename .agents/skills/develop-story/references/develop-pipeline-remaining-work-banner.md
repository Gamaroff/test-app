---
name: develop-pipeline-remaining-work-banner
description: Canonical Remaining Work Status banner for the develop-story / develop-task / develop-bug pipelines — format, firing points (every step transition, every continuing loop iteration, every QA/verify cycle, and every HALT), and the per-pipeline variants. Referenced by each orchestrator's Step Transition Protocol.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-remaining-work-banner.md. Regenerate via `npm run bundle`. -->

# Remaining Work Status Banner

A two-line-plus-list block that answers "where am I, and what is left?" without
the reader scrolling back through the transcript. It is the pipeline's only
routine user-facing progress output — everything else the orchestrator emits is
a step banner or a HALT.

**This is a default, not an option.** Every `develop-*` pipeline emits it at
every firing point below. A step that ends without one is a protocol violation
in the same way a missing step banner is.

---

## When it fires (mandatory)

| Moment                                                                 | Position line reads                                              |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Every step transition, Steps 1–8 — emitted as part of action 3 of the Step Transition Protocol, immediately **before** the `═══ … STEP {N+1}/8 … ═══` banner, in the same contiguous output | `Step {N}/8 — {STEP-NAME} ✅ complete`                            |
| Each develop-loop iteration that continues (Step 3, before re-invoking `/develop`) | `Step 3/8 — DEVELOP ⏳ in progress, iter {ITER}/{MAX_ITER}`       |
| Each QA/verify cycle that continues (Steps 5–6, before re-invoking the QA skill) | `Steps 5–6/8 — QA LOOP ⏳ in progress, cycle {CYCLE}/5`            |
| Step 5c, before invoking `/review-pr` on a gate that exited 5a clean † | `Steps 5–6/8 — QA LOOP ⏳ PR conformance review, cycle {CYCLE}/5` |
| Step 5c returning REQUEST CHANGES (before re-entering 5b) †            | `Steps 5–6/8 — QA LOOP ⏳ review requested changes, cycle {CYCLE}/5` |
| Every HALT — emitted immediately **before** the halt banner, so the user sees what did not run | `Step {N}/8 — {STEP-NAME} ❌ halted`                              |
| Pipeline completion (after Step 8)                                      | `Step 8/8 — COMMIT CHANGES ✅ complete`                            |

† **The two Step 5c rows are `develop-story` / `develop-task` only.** `develop-bug`'s
Steps 5–6 verify-and-fix loop has no 5c, so neither moment ever arrives on that pipeline and
its absence is not a protocol violation. Both rows are **instructed in §5c** of
[`develop-pipeline-step-5-6-qa-loop.md`](develop-pipeline-step-5-6-qa-loop.md) — that section
owns them, and a firing point declared mandatory here with nothing instructing it there is a
defect in this table, not a licence to improvise.

**The Steps 5–6 exit block carries the PR review verdict.** Its parenthetical is
`({N} cycles, {gate}, PR review {verdict})` — the gate alone is not the loop's outcome any more,
because a clean gate no longer exits the loop. §5c states the same line; this file is the format
authority for it, so an example here that omits the verdict is the authority contradicting itself.

Emit **one** block per moment — not one per sub-step, not one per tool call.

**One exemption:** the graceful pause (PreCompact) path. Its hook-supplied summary
template already carries the position and the resume instruction, and that path is
budget-starved by definition — do not add a second block there.

**Never let it displace the transition.** The block is output, not a tool call.
The Step Transition Protocol's action 1 (the `advance-pipeline-lock.sh` Bash
call) still comes first, with no prose before it. The status block and the step
banner are printed together after the lock advance and the report row edit, and
the next sub-skill is invoked in the same assistant turn.

## Format

```
═══ REMAINING WORK STATUS ═══
Pipeline position:  {position line} {optional short parenthetical: "(1 cycle, PASS 100/100, PR review APPROVE)"}

Remaining {work-item units} ({X} of {M} complete):
  ✅ {n}: {name}
  ⬜ {n+1}: {name}
  ...

Pipeline steps still ahead:
  - Step {N+1}: {name}
  - ...
  - Step 8: commit-changes + push
```

Rules:

- **Middle block only while Step 3 is open.** Omit "Remaining {units}" once Step 3
  is ✅ complete — from Step 4 onward the work item's own checklist is fully
  ticked and repeating it is noise.
- **Steps still ahead lists every remaining step**, one per line, ending at
  Step 8. After Step 8, replace the list with `  — none, pipeline complete`.
- **Cheap to produce.** Derive the position and the steps-ahead list from the
  lock file's `current_step`; derive the unit counts from the work-item file you
  already have open in the loop. Never re-read files solely to render the block.
- **No prose around it.** No "here's where we are" preamble, no summary after.

## Per-pipeline variants

Only the units and the step names change.

#### develop-story

Units: unchecked `[ ]` task names from the story's Tasks section →
`Remaining story tasks ({X} of {M} tasks complete)`.

Steps: 1 create-branch · 2 review-story · 3 develop · 4 create-pr · 5 qa-story ·
6 qa-fix (if needed) · 7 finalise · 8 commit-changes + push.

#### develop-task

Units: unchecked `[ ]` phase names from the task's Implementation Plan →
`Remaining task phases ({X} of {M} phases complete)`.

Steps: 1 create-branch · 2 review-task · 3 develop · 4 create-pr · 5 qa-task ·
6 qa-fix (if needed) · 7 finalise · 8 commit-changes + push.

#### develop-bug

Units: unchecked `[ ]` items from the bug report's fix checklist (Investigation /
Fix Implementation phases) → `Remaining fix phases ({X} of {M} phases complete)`.

Steps: 1 create-branch · 2 review-bug · 3 investigate & fix · 4 create-pr ·
5–6 verify & fix loop · 7 finalise & close bug · 8 commit-changes + push.

## Worked example (Step 7 transition, develop-story)

```
═══ REMAINING WORK STATUS ═══
Pipeline position:  Steps 5–6/8 — QA LOOP ✅ complete (1 cycle, PASS 100/100, PR review APPROVE)

Pipeline steps still ahead:
  - Step 7: finalise
  - Step 8: commit-changes + push

═══ DEVELOP-STORY PIPELINE: STEP 7/8 — FINALISE ═══
```
