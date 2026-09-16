---
name: develop-pipeline-resume-contract
description: Resume verification contract shared by develop-story and develop-task. Covers per-step artifact verification, plan freshness check, MAX_ITER=5 stall semantics, QA cycle count reconstruction, and branch/PR cross-check. File naming patterns differ between story and task — both listed. Step 8 push command is a normal-flow concern (not a resume concern); it lives inline in each SKILL.md under the `### Step 8: Commit Changes` section.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-resume-contract.md. Regenerate via `npm run bundle`. -->

# Develop Pipeline — Resume Verification Contract

## When This Contract Applies

This contract is invoked during Phase 0 of `/develop-story` or `/develop-task` when resuming a previous pipeline run. Phase 0a (stale-context detector) runs first; Phase 0b (artifact verification) uses its output to narrow the verification scope.

---

## Phase 0a — Stale-Context Detector Dispatch

Dispatch a **read-only Explore subagent** using the prompt in `references/pipeline-resume-detector-prompt.md`. The subagent reads the lock file, lists step summaries, and diffs artifact mtimes — returning `recommended_step`, `deltas_since_pause`, and `blocking_issues`. The orchestrator never re-reads raw artifacts itself; the subagent does the reading.

### Dispatch

```
Dispatch Explore subagent with the full content of references/pipeline-resume-detector-prompt.md as its prompt.
Pass task_or_story_directory from the lock file as context.
```

### Consume Output

Parse the JSON result:

```bash
# Validate schema
jq -e '.schema_version == 1 and (.recommended_step | type == "number") and (.blocking_issues | type == "array")' <output>
```

If validation fails (parse error or missing required fields): log `"⚠️ Detector output invalid — falling back to full Phase 0b verification"` and proceed to Phase 0b using `current_step` from the lock as the upper bound (treat all steps as unverified).

### Surface Results to User

Always surface the detector output before proceeding, in this format:

```
⚙️ Resume detector result
  Recommended step:   {recommended_step}
  Lock step:          {current_step_in_lock}
  Summaries seen:     {summaries_seen | join(", ") or "none"}
  Deltas since pause: {N} — {paths or "none"}
  Blocking issues:    {blocking_issues | join("; ") or "none"}
```

Wait for user confirmation before proceeding to Phase 0b. If the user disputes `recommended_step`, accept their correction and record it in the Decisions Log.

### Handle Blocking Issues

If `blocking_issues` is non-empty: **HALT** — display each issue to the user and require manual resolution before resuming. Do not proceed to Phase 0b.

### Narrow Phase 0b Scope

Pass `recommended_step` to Phase 0b. Phase 0b only verifies artifacts for steps **up to `recommended_step - 1`** (i.e., steps the detector considers completed). Steps at or after `recommended_step` are treated as ⏳ Pending.

---

## Phase 0b — Resume Artifact Verification (CRITICAL)

**Scope**: Verify only steps **up to `recommended_step - 1`** (as determined by Phase 0a). Steps at or after `recommended_step` are ⏳ Pending — do not verify. If Phase 0a failed validation, fall back to verifying all steps using `current_step` from the lock as the upper bound.

For each step marked ✅ in the implementation report (within the Phase 0a scope), verify the expected artifact exists. If verification fails, **do not skip the step** — re-run it and log: "Resume verification failed for Step {N} — artifact missing, re-running."

A step marked `⏸️ Paused` (set by the PreCompact hook on graceful pause) is treated identically to `⏳ Pending`: re-run from the start of that step. Earlier `✅` steps still skip per their artifact verification. Log: "Resuming after graceful pause — re-running Step {N}."

Steps 2 and 8 do not require artifact verification beyond reading the implementation report.

### Subagent Summary Replay

For ✅ steps whose `Subagent summary ref` column points to a `.summaries/step-<N>-*.json` file, prefer reading the JSON summary over re-running the subagent or re-reading the source artifacts the subagent consumed. This is the resume-side counterpart to the on-disk persistence convention in `references/subagent-summary-artifact.md`. If the JSON file is absent (in-flight pipeline started before the convention existed) or fails `jq -e '.schema_version == 1'`, fall back to the implementation report's textual notes for that step. Do NOT re-dispatch the subagent on resume just to repopulate the summary — the step is already ✅ and re-running is wasted work.

### develop-story artifact table

| Step | Artifact to verify | Verification command |
| ---- | ------------------ | -------------------- |
| 1. create-branch | Branch exists in git | `git branch --list "feature/story.{epic}.{story}.*"` returns the branch |
| 3. develop | All tasks complete | Story file `Status:` field reads `Ready for Review` |
| 4. create-pr | PR exists | `gh pr view {PR-number} --json state` returns open or merged |
| 5–6. qa loop | **Both** `story.{epic}.{story}.qa.{N}.*.md` **and** `story.{epic}.{story}.gate.{N}.*.yml` exist **and** PR comment posted. **Conditional — the 5c check reads the implementation report, not the filesystem**: when the latest gate reads `PASS`/`WAIVED`, the highest `### QA Cycle {N}` entry's `**PR Review**` row must hold a **terminal verdict** — `APPROVE` or `CONCERNS`. Any other value (`pending — 5c not yet run`, `REQUEST CHANGES`, `review failed`, `not reached`, blank, or a missing row) means 5c did not clear, and Step 5–6 is **not** complete. A mid-loop resume on a `CONCERNS`/`FAIL` gate legitimately has no terminal verdict. | `ls {story-directory}/story.*.qa.*.md` AND `ls {story-directory}/story.*.gate.*.yml` AND `gh pr view {PR} --comments --json comments \| grep -i "QA"` — gate alone is insufficient. Then the 5c check, which is a **read of the implementation report** performed by the resume detector, not a shell command: take the last `### QA Cycle` entry and read its `**PR Review**` row. |
| 7. finalise | **All three**: `story.{epic}.{story}.dod.{N}.*.md` exists **and** story `status:` reads `accepted` **and** finalise acceptance comment posted to PR | `ls {story-directory}/story.*.dod.*.md` AND `grep -iE "^status:\s*accepted" {story-file}` AND `gh pr view {PR} --comments --json comments \| grep -i "accepted"` |

### develop-task artifact table

| Step | Artifact to verify | Verification command |
|------|-------------------|---------------------|
| 1. create-branch | Branch exists in git | `git branch --list "feature/task.{id}.*"` returns the branch |
| 3. develop | All phases complete | Task file `Status:` field reads `Ready for Review` |
| 4. create-pr | PR exists | `gh pr view {PR-number} --json state` returns open or merged |
| 5–6. qa loop | **Both** `task.{id}.qa.{N}.*.md` **and** `task.{id}.gate.{N}.*.yml` exist **and** PR comment posted. **Conditional — the 5c check reads the implementation report, not the filesystem**: when the latest gate reads `PASS`/`WAIVED`, the highest `### QA Cycle {N}` entry's `**PR Review**` row must hold a **terminal verdict** — `APPROVE` or `CONCERNS`. Any other value (`pending — 5c not yet run`, `REQUEST CHANGES`, `review failed`, `not reached`, blank, or a missing row) means 5c did not clear, and Step 5–6 is **not** complete. A mid-loop resume on a `CONCERNS`/`FAIL` gate legitimately has no terminal verdict. | `ls {task-directory}/task.*.qa.*.md` AND `ls {task-directory}/task.*.gate.*.yml` AND `gh pr view {PR} --comments --json comments \| grep -i "QA"` — gate alone is insufficient. Then the 5c check, which is a **read of the implementation report** performed by the resume detector, not a shell command: take the last `### QA Cycle` entry and read its `**PR Review**` row. |
| 7. finalise | **All three**: `task.{id}.dod.{N}.*.md` exists **and** task `status:` reads `accepted` **and** finalise acceptance comment posted to PR | `ls {task-directory}/task.{id}.dod.*.md` AND `grep -iE "^status:\s*accepted" {task-file}` AND `gh pr view {PR} --comments --json comments \| grep -i "accepted"` |

## Plan Freshness (Step 3 Prerequisite)

If the Decisions Log records a plan file from a prior session and Step 3 is being resumed, verify the plan file is at least as fresh as the story/task file:

```bash
# develop-story (macOS/Linux portable):
_mtime() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1"; }
plan=$(ls {story-directory}/story.{epic}.{story}.plan.*.md 2>/dev/null | head -1)
[ -n "$plan" ] && [ "$(_mtime "$plan")" -ge "$(_mtime {story-file})" ]

# develop-task (macOS/Linux portable):
plan=$(ls {task-directory}/task.{id}.plan.*.md 2>/dev/null | head -1)
[ -n "$plan" ] && [ "$(_mtime "$plan")" -ge "$(_mtime {task-file})" ]
```

If the plan is stale (older than the story/task file), do **not** reuse it — drop the cached "Pre-develop surface map:" entry from the in-memory resume context, re-run the Explore subagent, and re-discover the plan file. Log: "Plan file stale on resume (mtime < story/task mtime) — re-running pre-develop discovery." Cap re-discovery at **1 retry per resume** to prevent loops; if the plan is still stale after the retry, proceed with the latest plan and log a warning. If no plan file exists in the directory, the freshness check is a no-op.

## Gate File Conflation Warning (CRITICAL)

A `gate.yml` written manually (without running the QA skill) does NOT satisfy Step 5–6. The required artifacts are the `qa.N.md` report file (created by `/qa-story` or `/qa-task`) AND the `gate.N.yml`. Similarly, updating DoD checkboxes in the story/task doc does NOT satisfy Step 7 — `/finalise` must write a separate `dod.N.md` file AND post an acceptance comment to the PR.

## QA Cycle Count Reconstruction (if resuming at Step 5–6)

> **Resume inside 5c re-enters at 5c, not 5a.** The `### QA Cycle {N}` heading is written at 5a as
> soon as the gate is read, so a run killed *inside* 5c already has N headings and naive
> reconstruction would set `NEXT_CYCLE=N+1` and re-run the whole QA review against an unchanged tree
> — burning a cycle to re-derive the gate that just passed. Detect the 5c sub-state instead: read the
> highest `### QA Cycle {N}` entry's `**PR Review**` row.
>
> | `**PR Review**` reads | Resume action |
> | --- | --- |
> | `APPROVE` or `CONCERNS` | 5c cleared — Step 5–6 is complete, go to Step 7 |
> | `REQUEST CHANGES` | 5c ran and routed back — set the counter to `N`, re-enter at **5b** |
> | `review failed` | 5c could not run (usually the PR state). Set the counter to `N` and re-enter at **5c** — **once**. Its usual cause is not self-healing, so an unattended driver would otherwise re-run `/review-pr`, HALT, and repeat forever. On a **second consecutive** `review failed` for the same cycle `N`, do not re-enter: escalate to Loop Escalation with the review's own error text. |
> | `pending — 5c not yet run` | 5a wrote its placeholder on a clean gate and the run died before 5c overwrote it. **Same action as `not reached`**: if gate `{N}` reads `PASS`/`WAIVED`, re-enter at **5c**; otherwise at **5a**. This is the narrowest window in the loop — it opens when 5a writes the `### QA Cycle {N}` entry and closes when 5c records its verdict — and it is the value the artifact tables above will actually be reading on a run killed inside it |
> | `not reached`, blank, or no row | The gate did not exit the loop, or the run died before 5c. If gate `{N}` reads `PASS`/`WAIVED`, re-enter at **5c**; otherwise at **5a** |
>
> **Why this reads the report rather than the filesystem.** An earlier version of this check compared
> `gate.{N}` against `pr-review.{n}` on disk. That was wrong twice over — the two indices count
> different things (`gate` per QA cycle, `pr-review` per 5c *invocation*, and 5c runs only on a clean
> gate), and the shell predicate implementing it returned a **false PASS under zsh** when its glob
> matched nothing, verifying a run with no artifacts at all as complete. Three consecutive QA cycles
> failed to state that predicate correctly, which is this repo's signal to replace the mechanism
> rather than correct it again. The `**PR Review**` row is written every cycle by contract, it is
> already the row this section reads for cycle reconstruction, and it carries the verdict directly —
> so no index arithmetic, no globs, and no shell portability surface.

If the last completed step was within the QA loop, count the number of `### QA Cycle` entries in the QA Iteration History section of the implementation report:

```bash
COMPLETED=$(grep -c "^### QA Cycle" {implementation-report-path})
NEXT_CYCLE=$((COMPLETED + 1))
```

Set the cycle counter to `NEXT_CYCLE` (= completed + 1) before re-entering the loop. This is the cycle **about to be attempted**.

Examples:
- 0 entries → `NEXT_CYCLE=1` (fresh start, equivalent to non-resume)
- 2 entries → `NEXT_CYCLE=3` (cycles 1 + 2 complete, attempting 3 next)
- 5 entries → `NEXT_CYCLE=6` → exceeds limit → trigger **Loop Escalation** (loop-limit trigger) immediately

This convention ensures the 5-cycle limit is respected across resumes. **The convergence check
also survives a resume**: it reads the per-cycle HIGH counts back out of the `### QA Cycle` entries
in the implementation report (`**HIGH findings**: {n}`), so a resumed run at cycle 3 or later
evaluates the same sequence a continuous run would. If an earlier cycle's entry has no HIGH count
recorded (a run that predates the check), treat that cycle's count as unknown and do not trip the
guard on it — the check needs three real readings. Mid-cycle resume (entry written but qa-fix not yet committed) is handled by re-running 5a — `/qa-story` / `/qa-task` is idempotent and will overwrite the same `qa.N.md` / `gate.N.yml` for the in-flight cycle.

## Branch and PR Cross-Check

Cross-check the recorded pipeline state against current reality before resuming:

```bash
# Verify branch still exists
git branch --list "$(grep 'Branch:' {implementation-report} | awk '{print $2}')"
# Verify PR still exists
gh pr view "$(grep 'PR:' {implementation-report} | awk '{print $2}')" --json state 2>/dev/null
```

If the branch or PR no longer matches, warn the user before proceeding: "Pipeline state has diverged — recorded branch/PR may differ from current state. Proceeding anyway."

## Develop Loop — Stall Semantics and MAX_ITER Bound

Before iteration 1: dispatch an Explore subagent (read-only) to capture initial loop state, using the **shared loop-audit prompt** (`references/loop-audit-prompt.md`).

Substitute: `<DOC_TYPE>` = `story` or `task` (per orchestrator); `<DOC_PATH>` = absolute story/task file path; `<TASKS_SECTION>` = `## Tasks` (story) or `## Implementation Plan` (task). Pass the resulting prompt verbatim.

Failure semantics: this is the **initial audit** row in the shared prompt's "Caller Failure Semantics" table — JSON parse failure → retry once → inline shell fallback (`grep -cE '\[x\]'` + `grep -cE '\[[ x]\]'` + `git rev-parse HEAD`) and log `"Initial audit JSON failed — used inline fallback."`. Persistence: write `step-3-iteration-audit-0.json` per the shared prompt's "Persistence" table.

Record: `INITIAL_COMPLETED = audit.completed` (or fallback), `M = audit.total` (or fallback), `LAST_COMMIT_HASH = audit.last_commit_hash` (or fallback). Set `ITER=1`, `MAX_ITER=5`, `LAST_COMPLETED=INITIAL_COMPLETED`.

**Progress is made if EITHER `CURRENT_COMPLETED > LAST_COMPLETED` OR `CURRENT_COMMIT_HASH != LAST_COMMIT_HASH`** (a new commit on the branch counts as progress even if no checkbox ticked, e.g. when only subtask work or test fixes were committed).

- **No progress** (both equal): HALT. Log: "Step 3 stall: /develop returned `In Progress` without ticking a checkbox or producing a new commit (iteration {ITER}, {CURRENT_COMPLETED}/{M})". Set report status to `Escalated` and HALT.
- **`ITER >= MAX_ITER`**: iteration cap reached — HALT. Log: "Step 3 hit MAX_ITER={MAX_ITER} without reaching `Ready for Review` ({CURRENT_COMPLETED}/{M} ticks). Manual intervention required."
- **Otherwise**: log "Step 3 iteration {ITER}: {CURRENT_COMPLETED}/{M} ticks complete (commit-progress: {yes/no}). Re-invoking /develop." Set `LAST_COMPLETED=CURRENT_COMPLETED`, `LAST_COMMIT_HASH=CURRENT_COMMIT_HASH`, increment `ITER`.
