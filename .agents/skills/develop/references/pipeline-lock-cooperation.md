---
name: pipeline-lock-cooperation
description: Snippet shared by all develop-{story,task} pipeline sub-skills. Each sub-skill, on successful completion, advances the develop-pipeline lock so the orchestrator's next turn doesn't have to rely on model discipline. Defence-in-depth alongside the Stop hook.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/pipeline-lock-cooperation.md. Regenerate via `npm run bundle`. -->

# Pipeline Lock Cooperation (sub-skill responsibility)

Add this block as the **last action** before this skill returns control to its caller, after all primary work is committed/persisted but before the final user-facing summary.

## What to do

If `.claude/state/develop-pipeline.lock` exists, invoke the lock-advance helper with this skill's own name:

```bash
if [ -f .claude/state/develop-pipeline.lock ]; then
  bash .agents/skills/develop-{story,task}/references/advance-pipeline-lock.sh --skill <this-skill-name> 2>/dev/null || true
fi
```

Replace `<this-skill-name>` with the unprefixed skill name (e.g. `create-pr`, `review-story`, `develop`, `finalise`, `commit-changes`, `create-branch`).

The helper's `--skill` mode looks up the next step in its built-in mapping. Iterative loop skills (`qa-story`, `qa-task`, `qa-fix`) are intentionally noops in `--skill` mode — the orchestrator manages the QA loop and must advance the lock manually when it transitions out of the loop.

`commit-changes` is special: it is invoked at multiple steps in one run (Step 4 by `create-pr`, Steps 5–6 by each `qa-fix` cycle, and the terminal Step 8 commit). Its `--skill` branch self-guards on the lock's `current_step` — it removes the lock **only** when `current_step >= 8` (the terminal commit) and otherwise preserves it. So callers can run `commit-changes`' lock cooperation unconditionally at every step; the nested invocations leave the lock intact for the PreCompact/Stop hooks.

## Why this exists

When this sub-skill is invoked by `/develop-story` or `/develop-task`, the orchestrator's "Step Transition Protocol" requires a Bash lock-advance call as its first action when control returns. Under context pressure (long sub-skill output, deeply nested chains) the model may skip that Bash call and yield. Self-advancing here makes the lock advance regardless of orchestrator discipline.

The action is harmless when:
- the lock doesn't exist (this skill was invoked standalone, not via the pipeline) — the helper exits 0 silently
- the lock is already advanced past this step (idempotent) — the helper exits 0 silently
- the helper script is missing (older install) — `|| true` swallows the error

## Helper resolution

The helper lives in `references/advance-pipeline-lock.sh` of the develop-story / develop-task skill. Path is well-known and stable. If both pipelines are installed, either path works — the helper script is byte-identical.

## Cooperation order

The lock is advanced by **whichever defence runs first**:

1. The sub-skill itself (this snippet) — most reliable, runs inline as the skill's last action.
2. The orchestrator's manual Bash call — the Step Transition Protocol's action #1; idempotent with #1.
3. The `Stop` hook (`on-stop.sh`) — reactive backstop with re-prompt instructions if both of the above missed.

Idempotency at every layer means double-advance is safe: the helper noops when target step ≤ current step.
