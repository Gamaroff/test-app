---
name: develop-task
description: 'Automates the full end-to-end task development lifecycle: create-branch → review-task → develop → create-pr → qa-task → qa-fix (iterative, up to 5 cycles) → review-pr (Step 5c, the QA loop''s exit gate) → finalise → commit-changes. Adapted from develop-story for standalone technical tasks (refactoring, infra, cleanup) in docs/tasks/. Features: Explore subagent for task resolution and pre-develop codebase mapping; context hygiene between steps; lite mode for low-risk tasks; resume with per-step artifact verification; optional task-register integration; `--base` branch pre-supplied to create-pr. Records all decisions in a co-located implementation report. Invoke with `/develop-task [task-file-path]` or "develop and QA this task end to end".'
invokes: [create-branch, review-task, develop, create-pr, qa-task, qa-fix, review-pr, finalise, commit-changes]
---

# Develop Task — Automated Lifecycle Orchestrator

This skill orchestrates the complete task development lifecycle, calling each skill in sequence and maintaining an implementation report that records every significant decision and issue encountered along the way.

## Setup — Pipeline Hooks (one-time, per project)

The pipeline runs hands-free when two Claude Code hooks (`PreCompact` for graceful pause; `Stop` for forced continuation) are registered in `.claude/settings.json`. **Strongly recommended** — without the `Stop` hook, the orchestrator relies on prose-level "never stop between steps" rules that have been observed to fail under context pressure.

**Install both with one command** (idempotent, preserves existing settings, `--dry-run` available):

```bash
bash .agents/skills/develop-task/scripts/install-hooks.sh
```

**Full reference** — every hook in this pipeline, what each does, escape valves, interaction diagram, troubleshooting, and authoring contract for new hooks: [`references/develop-pipeline-hooks.md`](references/develop-pipeline-hooks.md). For the deep PreCompact pause/resume semantics specifically: [`references/develop-pipeline-pause.md`](references/develop-pipeline-pause.md). For the lock-advance helper used by both hooks and by the orchestrator's manual fallback path: [`references/advance-pipeline-lock.sh`](references/advance-pipeline-lock.sh) (sourced from `references/advance-pipeline-lock.sh`).

Hooks noop outside pipeline runs — zero overhead when no `.claude/state/develop-pipeline.lock` is present.

## When to Use This Skill

- User says `/develop-task <path>` or passes a task file path
- User wants to run a technical task through the full automated pipeline without hand-holding each step
- User wants an audit trail of decisions made during task implementation

---

## Phase 0: Resolve & Prepare

See `references/develop-pipeline-step-0-resolve-and-prepare.md` for the full resolve-and-prepare protocol: file/issue resolution (0a), pipeline state check (0b), upfront context reading including status handling and lite-mode detection (0c), tracker signal/board update procedure (0c-reg — **defined in step-0 but invoked from Step 1** after the lock is written; see step-1 §"Signal Work Started"), upfront prompts via AskUserQuestion (0d — Q1 base + Q2 PR target with auto-derived recommended option; qa-planning silent skip, no Q3), implementation report creation with templates (0e), and pre-flight summary (0f).

> Phase 0 parallel dispatch (resolver + tracker poller + lite-mode detector) is defined in the shared resource above — do not duplicate the dispatch logic here. Modifications belong in `references/develop-pipeline-step-0-resolve-and-prepare.md`.

---

## Phase 1: Pipeline Execution

### Context Compression Recovery (CRITICAL — read this first)

If context was compressed while this pipeline was running (i.e., the conversation was summarized and you are now resuming), follow this sequence exactly — do not improvise:

**Step 0 — Re-read the full skill file before anything else:**
```bash
# The skill instructions in the system reminder are TRUNCATED after compression.
# Improvising steps from memory produces wrong artifacts and misses required invocations.
# Always read the full skill first:
cat .agents/skills/develop-task/SKILL.md
```
Output: "⚠️ Context recovery — re-reading full skill file before resuming."

**Step 0a — Dispatch stale-context detector (Phase 0a):**

Dispatch a read-only Explore subagent using `references/pipeline-resume-detector-prompt.md`. The subagent reads `.claude/state/develop-pipeline.lock`, lists `.summaries/step-*.json` in the task directory, and diffs artifact mtimes. It returns `recommended_step`, `deltas_since_pause`, and `blocking_issues`.

Surface the detector output to the user and wait for confirmation. If `blocking_issues` is non-empty: **HALT** — require manual resolution before resuming. Use `recommended_step` to narrow Step 1 verification scope.

See `references/develop-pipeline-resume-contract.md` — Phase 0a for the full dispatch, output validation, and blocking-issues protocol.

**Step 1 — Recover pipeline state from the implementation report:**
```bash
ls {task-directory}/task.{id}.implementation.*.md 2>/dev/null | sort | tail -1
```

1. Read the implementation report. Find the last ✅ step in the Pipeline Progress table.
2. **Verify each ✅ step's artifact exists up to `recommended_step - 1`** (see `references/develop-pipeline-resume-contract.md` — Phase 0b for the full contract). Steps at or after `recommended_step` are treated as ⏳ Pending. If Phase 0a failed validation, fall back to verifying all steps using `current_step` from the lock as the upper bound.
3. Output: "⚠️ Context recovery — last verified step: Step {recommended_step - 1}. Resuming from recommended step {recommended_step}."
4. Continue from `recommended_step` — do NOT re-run steps already verified, do NOT skip any pending steps.

**This recovery is mandatory even if the user did not explicitly re-invoke `/develop-task`.** If you are in a conversation where `develop-task` was previously running and context was then compressed, you are still the develop-task orchestrator and must complete all remaining steps. A context summary saying "next step: create-pr" does NOT mean the pipeline ends after create-pr — it means Step 4 is next, and Steps 5–8 still follow.

### Graceful Pause on Imminent Compaction (CRITICAL — read this second)

This complements the post-compaction recovery above. **Pre**-compaction graceful pause requires the `PreCompact` hook to be installed (see Setup section at the top of this file). When the hook fires:

1. The hook itself appends a "Pipeline Paused" entry to the implementation report, commits, pushes, and posts a PR/issue comment — all best-effort, all done before compaction proceeds.
2. The hook emits `🛑 PIPELINE-PAUSE-SIGNAL` as `additionalContext` to you, which appears as a `<system-reminder>` in your next turn.
3. The hook removes the lock file.

**When you observe `🛑 PIPELINE-PAUSE-SIGNAL` in a system reminder:**

1. **Stop everything.** Do not invoke any sub-skill. Do not edit the implementation report (the hook already did). Do not run any tools beyond what's needed for the user-facing summary.
2. **Output the pause banner**:
   ```
   ═══ DEVELOP-TASK PIPELINE: PAUSED — CONTEXT COMPACTION IMMINENT ═══
   ```
3. **Output the user-facing summary** using the template provided in the signal's `additionalContext`. Repeat the two comment outcomes the signal reports (`PR comment:` / `Tracker issue comment:`) verbatim — `deferred` means the consumer's `access.tracker` held, `no-credentials` on a Jira issue means the Jira side was not commented on.
4. **HALT.** Do not proceed to any further step. The lock file has been removed by the hook; on next user invocation of `/develop-task <path>`, Phase 0b will detect the existing run, read the report, and resume cleanly.

**No additional report edits, no additional commits, no additional comments** — the hook already did all of that, and you have very little budget left before compaction proceeds. Spending it on duplicate work risks losing the user-facing summary entirely.

For the full lock-file format, hook contract, and half-done step recovery semantics, see `references/develop-pipeline-pause.md`.

### Context Management Rule (CRITICAL)

After EVERY step completes, before moving to the next step:
1. Retain only: step outcome (pass/fail), key decisions made, file paths of artifacts produced
2. Release all intermediate file contents from active consideration — do not re-read files that were already processed unless specifically needed
3. Summarize the step result in ≤5 bullet points in the implementation report, then treat step as closed

When a step dispatches subagents, persist their summaries per the convention in `references/subagent-summary-artifact.md` and update the implementation report's `Subagent summary ref` column in the same write. The on-disk JSON lets you safely release the subagent's verbose output from active context — resume reads the summary from disk if needed.

This prevents context accumulation across the 8-step pipeline.

**Never stop between steps.** This pipeline runs hands-free from Step 1 to Step 8. Never output a "done" or "complete" message and stop unless a step explicitly results in HALT or the pipeline has reached Step 8. Completing Step 4 (create-pr) is NOT a terminal state — Step 5 must follow immediately.

**Step Transition Protocol (mandatory — prevents orchestrator stalls).**

> Visual mnemonic:
> ```
> SUB-SKILL RETURNS → [Bash advance] → [Edit ✅] → [Status + Banner] → [Skill]
>                          ↑
>                FIRST. ALWAYS. NO PROSE BEFORE.
> ```

Every step ends with the same four actions, executed *in order, with no text output between them*:

1. **Bash tool call** advancing the lock to the next step (use the helper: `bash .agents/skills/develop-task/references/advance-pipeline-lock.sh {N+1}`). **This must be the first call** — it is the binding side-effect that anchors the orchestrator into "still working" mode and signals to the `Stop` hook that the pipeline has advanced. If the just-completed step was Step 8, use `--complete` instead, which removes the lock. (This call is idempotent: a sub-skill normally self-advances the lock as its own last action, so this re-advance noops — but issuing it unconditionally is the deterministic, single-instruction behaviour.)
2. **Edit the implementation report** Pipeline Progress row for the just-completed step (`✅ Done`).
3. **Emit the Remaining Work Status block, then the Step {N+1} banner** (or the Phase 2 Completion banner if N=8) — one contiguous output, nothing between them:

   ```
   ═══ REMAINING WORK STATUS ═══
   Pipeline position:  Step {N}/8 — {STEP-NAME} ✅ complete

   Pipeline steps still ahead:
     - Step {N+1}: {name}
     - ...
     - Step 8: commit-changes + push

   ═══ DEVELOP-TASK PIPELINE: STEP {N+1}/8 — {STEP-NAME} ═══
   ```

   The status block is **required at every transition**, not optional garnish — it is what makes pipeline position legible after compaction and to a user reading the log later. Canonical format, the other firing points (each continuing develop-loop iteration, each QA/verify cycle, every HALT) and the "Remaining task phases" middle block that shows while Step 3 is open: [`references/develop-pipeline-remaining-work-banner.md`](references/develop-pipeline-remaining-work-banner.md).
4. **Invoke the next sub-skill** via the Skill tool in the same assistant turn. Do NOT pause for user acknowledgement, do NOT summarise progress to the user, do NOT print "Returning to pipeline orchestrator" or any equivalent.

Failure mode this defends against: a sub-skill returns control with a "complete" message and the orchestrator emits a natural-language summary before issuing the lock-update Bash call. Under context pressure the model may then yield to the user. **The lock-update Bash call must come FIRST** — emit it the moment the sub-skill returns, before any prose. The lock-update Bash call is the binding signal that the next step has started; without it the pipeline is considered stalled.

Two structural defences back this up (in order of which fires first):

1. **Sub-skill self-advance** — each pipeline sub-skill calls `advance-pipeline-lock.sh --skill <own-name>` as the last inline action of its body, so the lock advances the moment the sub-skill's work completes — before control returns to the orchestrator.
2. **`Stop` hook (`on-stop.sh`)** — reactive backstop: if the orchestrator nonetheless tries to stop mid-pipeline, the hook reads the lock and returns a `decision: "block"` reason that re-prompts the orchestrator to run actions 1–4 above.

**Step banners (required).** Before starting each step, output a visible banner:
```
═══ DEVELOP-TASK PIPELINE: STEP {N}/8 — {STEP-NAME} ═══
```
This creates persistent checkpoints that survive context compression and make the pipeline position unambiguous.

**Lock file `current_step` update (required, Steps 2–8).** Per the Step Transition Protocol above, this is **action #1** — the first tool call after a sub-skill returns, before the row update or banner. Both the `PreCompact` and `Stop` hooks read this field to know where the pipeline is. Use the helper script (idempotent, atomic, single source of truth):
```bash
bash .agents/skills/develop-task/references/advance-pipeline-lock.sh {N+1}
```
For Step 8 → completion: `... advance-pipeline-lock.sh --complete` (removes the lock).

Skip this for Step 1 (the lock is created at the *end* of Step 1, after the feature branch exists — see Step 1 below).

After each step: update the Pipeline Progress table (✅ Done / ❌ Failed / ⚠️ Needs Attention / ⏸️ Paused — see Graceful Pause section) and log any decisions or issues before moving on.

### Step 1: Create Branch

See `references/develop-pipeline-step-1-create-branch.md` for the full Step 1 protocol: lock collision check, pre-flight board/Jira verification, implementation report stash/restore, `/create-branch` invocation, post-branch steps, and pipeline lock file creation.

### Step 2: Review Task

See `references/develop-pipeline-step-2-review.md` for the full Step 2 protocol: gate check (skip conditions), `/review-task` invocation, output format autonomous decision, outcome detection, and blocking/non-blocking findings handling.

### Step 3: Develop

See `references/develop-pipeline-step-3-develop-loop.md` for the full Step 3 protocol: pre-develop codebase mapping (Explore subagent), plan file discovery, internal gate handling (draft/planned, high-risk, alignment), bounded develop loop with stall detection, Remaining Work Status banner, halt protocol, and **test-failure triage** (capture test output to `.claude/state/test-output-${ITER}-*.log`, dispatch Explore with `references/test-failure-triage-prompt.md`, main consumes summary only).

### Step 4: Create PR

See `references/develop-pipeline-step-4-create-pr.md` for the full Step 4 protocol: `/create-pr` invocation with `--base` and tracker-conditional `--issue`, implementation report exclusion, post-PR steps, Jira tracker update (PR-opened comment + In Review transition), failure handling, and the mandatory pipeline continuation banner.

### Step 5–6: QA Task / Fix Loop

See `references/develop-pipeline-step-5-6-qa-loop.md` for the full Steps 5–6 protocol: QA cycle counter setup, gate file location, QA skill invocation (with lite mode directive), PASS/CONCERNS/FAIL branching, no-code-change HALT, qa-fix invocation, commit/push per cycle, escalation entry, and loop limit HALT message.

**The loop's exit gate is Step 5c — `/review-pr`, not the QA gate.** A gate that reads `PASS` or
`WAIVED` hands to 5c, which runs `/review-pr --effort {medium|low} --comment` over the open PR.
`REQUEST CHANGES` routes back to 5b `/qa-fix` and consumes a cycle from the **shared** 5-cycle
budget; `CONCERNS` records findings without blocking; `APPROVE` exits to Step 7. The
`ready-for-merge` stage fires there, after the review clears — not on the QA gate. `/review-pr`
stays advisory throughout: it writes no gate file and never edits code, and this orchestrator is
what acts on its verdict. Lite mode degrades it to `--effort low` and never skips it. It leaves
`task.{id}.pr-review.{n}.{name}.md` beside the work item.

### Step 7: Finalise

See `references/develop-pipeline-step-7-finalise.md` for the full Step 7 protocol: `/finalise` invocation, completion detection, DoD gaps halt (with commit + push), DoD-body-to-PR comment, tracker issue update (GitHub close + board Done, Jira Done transition), DoD summary file location, Step 7 Completion Checklist, and Pipeline Progress update.

**Lite mode applies to Step 5 only** (and degrades Step 5c to `--effort low` without skipping it). Step 7 (finalise + PR DoD comment + issue close + board Done) runs in full in every mode. Do NOT inline `/finalise` by writing the DoD file directly — invoke the skill. See the Step 7 Completion Checklist before marking the row ✅.

### Step 8: Commit Changes

See `references/develop-pipeline-step-8-commit.md` for the full Step 8 protocol: final implementation report update (Finished timestamp, Final Status, QA Iterations, Completion Summary), `/commit-changes` invocation, final push, Pipeline Progress update, and pipeline lock file removal.

---


## Phase 2: Completion

Output the final status:

```
✅ Task Development Complete

Task:                  {task filename}
Branch:                {branch name}
PR:                    {PR URL}
QA Cycles:             {N}
Implementation Report: {report file path}

All pipeline steps completed successfully. The task is completed and all changes committed.
```

For any other halt:

```
⚠️ Task Development Paused — Human Input Required

Task:                  {task filename}
Paused at:             Step {N} — {step name}
Reason:                {concise reason}
Implementation Report: {report file path}

The implementation report has a full account of what was completed and what needs attention.
```

---

## Autonomous Decision Defaults

Every default applied must be recorded in the Decisions Log.

See `references/develop-pipeline-autonomous-defaults.md` for the full shared autonomous-mode default-behavior table (covers all rows common to both `develop-story` and `develop-task`).

### Skill-specific defaults (develop-task only)

| Situation | Default |
|-----------|---------|
| review-task Step 8.5 (implement fixes?) | Auto-answer "Yes, apply all critical + important fixes" — pipeline needs the task fully corrected before Step 3 runs `/develop` |
| review-task Step 9 (update status?) when outcome is READY TO IMPLEMENT | Auto-answer "Yes, fixes complete" — the pipeline wants `Ready for Development` before Step 3. **But promotion is not the only route past Step 2**: a task left at `Planned` with a *current* review report proceeds on the report, per the Step 2 tables. Two supported configs withhold promotion even on a READY outcome — `sign-off.enforcement: blocking` and `change-log.enforcement: blocking` — so a `Planned` status here is not by itself a failed review |
| review-task Step 9 (update status?) when outcome is NEEDS REVISION or REQUIRES REWORK | HALT — task is not ready; surface review findings to user before proceeding |

If a situation arises that is not in this table or the shared defaults table and the stakes are non-trivial, **HALT and ask the user**. Log the question and the user's answer in the Decisions Log.

---

## Error Recovery Principles

- **Never silently continue past a failed step.** Every failure is logged and surfaced to the user.
- **Always use `/commit-changes` to commit** — never raw `git commit`. This ensures consistent commit quality, conventional messages, and proper staging.
- **Commit the report before any halt.** Invoke `/commit-changes` for the report before surfacing any HALT so the audit trail is in git even when the pipeline doesn't complete.
- **Push after every commit during the QA loop.** The PR must stay current with the local branch (`git push origin HEAD`).
- **The implementation report is the primary recovery tool.** Always include its path in halt messages.
- **Snapshot then remove the lock file before every terminal HALT.** After committing the report (per the rule above), copy the active lock to a halt snapshot and then remove the active lock + transient logs:

  ```bash
  if [ -f .claude/state/develop-pipeline.lock ]; then
    jq --arg reason "{halt_reason}" --arg step "{halt_step}" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
       '. + {halted_at: $ts, halt_reason: $reason, halt_step: $step}' \
       .claude/state/develop-pipeline.lock > .claude/state/develop-pipeline.last-halt.json
  fi
  rm -f .claude/state/develop-pipeline.lock .claude/state/test-output-*.log
  ```

  Removing the active lock prevents a future PreCompact firing in this same session from re-running the pause flow, and stops accumulation of transient Step 3 test logs. The **halt snapshot** (`develop-pipeline.last-halt.json`) preserves resume context so the next `/develop-task` invocation can re-enter Phase 0b artifact verification: the resume detector subagent reads the snapshot when no active lock is present, surfaces it to the user, and offers "Resume from {halt_step}" or "Start fresh" (latter deletes the snapshot). The graceful-pause hook also removes the active lock itself if it runs — this rule covers the non-hook halt paths.
- **Signal `blocked` on a terminal HALT** (when `TRACKER=jira` and `TRACKER_ISSUE` is set). After the snapshot above, before surfacing the HALT:

  ```bash
  node .agents/skills/develop-task/references/jira-stage.js \
    --issue {TRACKER_ISSUE} --stage blocked --json
  ```

  **Only for a real blockage** — a review gate that failed, five QA cycles without a clean gate, a merge conflict, a DoD the work does not meet. Do **not** fire it when the halt is an *interruption*: plan mode, a denied permission, a compaction pause, or the user stopping the run. Those are pauses in the operator's attention, not states of the work, and a card parked in Blocked misreports the second as the first to everyone reading the board.

  `blocked` is **off by default** and opted into per issue type in the workflow record. Expect `reason: "stage-disabled"` until a project turns it on, and `skip (no-transition)` on boards that have the status but do not offer it from where the card currently sits — many workflows only allow Blocked from a testing column. Both are correct outcomes; the CLI exits 0 and the HALT proceeds either way.

- If a sub-skill cannot be found, log the error and tell the user to verify the skill is installed in `.agents/skills/`.

---

## File References

- Tasks: `docs/tasks/task.{id}.{name}/`
- Task file: `task.{id}.{name}.md`
- Implementation report: `task.{id}.implementation.{N}.{descriptive-name}.md`
- Review report: `task.{id}.review.{N}.{name}.md` (generated by Step 2 `/review-task`)
- QA gate: `task.{id}.gate.{N}.{name}.yml` (co-located in task directory; `docs/qa/gates/tasks/` path is legacy and removed)
- QA report: `task.{id}.qa.{N}.{name}.md` (co-located in task directory)
- DoD summary: `task.{id}.dod.{N}.{name}.md`

## Related Skills

- `/create-branch` — Step 1
- `/review-task` — Step 2
- `/develop` — Step 3
- `/create-pr` — Step 4
- `/qa-task` — Step 5
- `/qa-fix` — Step 6
- `/review-pr` — Step 5c (the QA loop's exit gate; advisory — the orchestrator acts on its verdict)
- `/finalise` — Step 7
- `/commit-changes` — Step 8
