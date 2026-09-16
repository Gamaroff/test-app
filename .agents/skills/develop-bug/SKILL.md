---
name: develop-bug
description: 'Automates the full end-to-end bug-fix lifecycle: takes an existing bug report and runs it from open to closed — create-branch → review-bug → investigate & fix → create-pr → verify & fix loop (up to 5 cycles) → finalise → commit-changes. Gates on a review-bug fix-readiness check (halts on a duplicate, already-fixed, or under-specified bug), then researches the root cause, reproduces, implements the fix plus a regression test, and writes the fix record (Investigation, Fix Implementation, QA Verification, Resolution Summary) back into the bug report file, closing the bug. Handles all three bug modes (story / task / general) and both branch models — a regular bugfix (off `develop`) or a production hotfix (off `main`). Crash-safe with resume; lite mode for low-severity bugs. Invoke with `/develop-bug [bug-file-path]` or "research and fix this bug end to end".'
invokes: [create-branch, review-bug, ensure-bug-jira-issue, ensure-bug-github-issue, develop, create-pr, qa-fix, finalise, commit-changes]
---

# Develop Bug — Automated Bug-Fix Lifecycle Orchestrator

This skill orchestrates the complete bug-fix lifecycle, calling each skill in sequence and maintaining an implementation report that records every significant decision and issue encountered along the way. It is the bug-anchored sibling of `develop-story` / `develop-task`: the **bug report file** is the primary input and the primary audit surface (in addition to the co-located implementation report).

The distinguishing gap this skill fills: no existing skill takes an open bug report all the way to a **closed, verified, documented** fix. `create-bug-report` creates the file; `qa-fix` writes an interim fix record but is PR-gated and stops at `ready-for-qa`. `develop-bug` runs the whole lifecycle and writes the `## Resolution Summary` that closes the bug.

## Setup — Pipeline Hooks (one-time, per project)

The pipeline runs hands-free when two Claude Code hooks (`PreCompact` for graceful pause; `Stop` for forced continuation) are registered in `.claude/settings.json`. **Strongly recommended** — without the `Stop` hook, the orchestrator relies on prose-level "never stop between steps" rules that have been observed to fail under context pressure.

**Install both with one command** (idempotent, preserves existing settings, `--dry-run` available):

```bash
bash .agents/skills/develop-bug/scripts/install-hooks.sh
```

The hooks are shared with `develop-story` / `develop-task` and are keyed off the pipeline lock's `skill` field — installing them once covers all three pipelines. **Full reference** — every hook, escape valves, interaction diagram, troubleshooting: [`references/develop-pipeline-hooks.md`](references/develop-pipeline-hooks.md). Deep PreCompact pause/resume semantics: [`references/develop-pipeline-pause.md`](references/develop-pipeline-pause.md). Lock-advance helper: [`references/advance-pipeline-lock.sh`](references/advance-pipeline-lock.sh).

Hooks noop outside pipeline runs — zero overhead when no `.claude/state/develop-pipeline.lock` is present.

## When to Use This Skill

- User says `/develop-bug <path>` or passes a bug report file path (`story.*.bug.*.md`, `task.*.bug.*.md`, or `docs/bugs/bug.*/bug.*.md`)
- User wants to research and fix a bug through the full automated pipeline without hand-holding each step
- User wants an audit trail of decisions made during bug investigation and the fix record written back into the bug file

**Do NOT use this skill to _file_ a bug** — that is `/create-bug-report`. `develop-bug` consumes a bug that already exists.

---

## Phase 0: Resolve & Prepare

See [`references/develop-bug-step-0-resolve-bug.md`](references/develop-bug-step-0-resolve-bug.md) for the full resolve-and-prepare protocol: bug-file resolution across the three modes (0a), pipeline lock state check (0b), upfront context reading — severity/priority/status/related/reproduction, plus lite-mode detection (0c), upfront prompts via AskUserQuestion (0d — **Q1 branch model** bugfix-vs-hotfix, **Q2 base branch**, **Q3 PR target**, each with an auto-derived recommended option), implementation report creation (0e), and pre-flight summary (0f).

> The bug's **severity/priority** drives lite-mode detection and fix urgency; the bug's **mode** (story/task/general) drives where the fix record and parent linkage are written. Both are resolved here, once.

---

## Phase 1: Pipeline Execution

### Context Compression Recovery (CRITICAL — read this first)

If context was compressed while this pipeline was running (i.e., the conversation was summarized and you are now resuming), follow this sequence exactly — do not improvise:

**Step 0 — Re-read the full skill file before anything else:**

```bash
# The skill instructions in the system reminder are TRUNCATED after compression.
# Improvising steps from memory produces wrong artifacts and misses required invocations.
cat .agents/skills/develop-bug/SKILL.md
```

Output: "⚠️ Context recovery — re-reading full skill file before resuming."

**Step 0a — Dispatch stale-context detector:**

Dispatch a read-only Explore subagent using [`references/pipeline-resume-detector-prompt.md`](references/pipeline-resume-detector-prompt.md). The subagent reads `.claude/state/develop-pipeline.lock`, lists `.summaries/step-*.json` in the bug directory, and diffs artifact mtimes. It returns `recommended_step`, `deltas_since_pause`, and `blocking_issues`. Surface its output and wait for confirmation. If `blocking_issues` is non-empty: **HALT**. See [`references/develop-pipeline-resume-contract.md`](references/develop-pipeline-resume-contract.md) — Phase 0a.

**Step 1 — Recover pipeline state from the implementation report:**

```bash
ls {bug-directory}/{bug-prefix}.implementation.*.md 2>/dev/null | sort | tail -1
```

1. Read the implementation report. Find the last ✅ step in the Pipeline Progress table.
2. **Verify each ✅ step's artifact exists up to `recommended_step - 1`** (see [`references/develop-pipeline-resume-contract.md`](references/develop-pipeline-resume-contract.md) — Phase 0b). Steps at or after `recommended_step` are treated as ⏳ Pending.
3. Output: "⚠️ Context recovery — last verified step: Step {recommended_step - 1}. Resuming from recommended step {recommended_step}."
4. Continue from `recommended_step` — do NOT re-run verified steps, do NOT skip pending steps.

**This recovery is mandatory even if the user did not explicitly re-invoke `/develop-bug`.** If you are in a conversation where `develop-bug` was previously running and context was then compressed, you are still the develop-bug orchestrator and must complete all remaining steps. A summary saying "next step: create-pr" means Step 4 is next, and Steps 5–8 still follow.

### Graceful Pause on Imminent Compaction (CRITICAL — read this second)

This complements the recovery above. **Pre**-compaction graceful pause requires the `PreCompact` hook (see Setup). When the hook fires it appends a "Pipeline Paused" entry to the report, commits, pushes, posts a PR/issue comment (all best-effort), removes the lock, and emits `🛑 PIPELINE-PAUSE-SIGNAL` as a `<system-reminder>`.

**When you observe `🛑 PIPELINE-PAUSE-SIGNAL`:**

1. **Stop everything.** Do not invoke any sub-skill. Do not edit the report (the hook already did).
2. **Output the pause banner**: `═══ DEVELOP-BUG PIPELINE: PAUSED — CONTEXT COMPACTION IMMINENT ═══`
3. **Output the user-facing summary** using the template in the signal's `additionalContext`. Repeat the two comment outcomes the signal reports (`PR comment:` / `Tracker issue comment:`) verbatim — `deferred` means the consumer's `access.tracker` held, `no-credentials` on a Jira issue means the Jira side was not commented on.
4. **HALT.** On next `/develop-bug <path>`, Phase 0b detects the existing run and resumes cleanly.

For the full lock-file format, hook contract, and half-done step recovery semantics, see [`references/develop-pipeline-pause.md`](references/develop-pipeline-pause.md).

### Context Management Rule (CRITICAL)

After EVERY step completes, before moving to the next step:

1. Retain only: step outcome (pass/fail), key decisions made, file paths of artifacts produced
2. Release all intermediate file contents from active consideration
3. Summarize the step result in ≤5 bullet points in the implementation report, then treat the step as closed

When a step dispatches subagents, persist their summaries per [`references/subagent-summary-artifact.md`](references/subagent-summary-artifact.md) and update the report's `Subagent summary ref` column in the same write.

**Never stop between steps.** This pipeline runs hands-free from Step 1 to Step 8. Never output a "done" message and stop unless a step explicitly results in HALT or the pipeline has reached Step 8. Completing Step 4 (create-pr) is NOT a terminal state — Step 5 must follow immediately.

**Step Transition Protocol (mandatory — prevents orchestrator stalls).**

> ```
> SUB-SKILL RETURNS → [Bash advance] → [Edit ✅] → [Status + Banner] → [Skill]
>                          ↑
>                FIRST. ALWAYS. NO PROSE BEFORE.
> ```

Every step ends with the same four actions, executed _in order, with no text output between them_:

1. **Bash tool call** advancing the lock to the next step: `bash .agents/skills/develop-bug/references/advance-pipeline-lock.sh {N+1}`. **This must be the first call** — it anchors the orchestrator into "still working" mode and signals the `Stop` hook that the pipeline advanced. If the just-completed step was Step 8, use `--complete` instead (removes the lock). Idempotent — a sub-skill normally self-advances the lock, so this re-advance noops.
2. **Edit the implementation report** Pipeline Progress row for the just-completed step (`✅ Done`).
3. **Emit the Remaining Work Status block, then the Step {N+1} banner** (or the Phase 2 Completion banner if N=8) — one contiguous output, nothing between them:

   ```
   ═══ REMAINING WORK STATUS ═══
   Pipeline position:  Step {N}/8 — {STEP-NAME} ✅ complete

   Pipeline steps still ahead:
     - Step {N+1}: {name}
     - ...
     - Step 8: commit-changes + push

   ═══ DEVELOP-BUG PIPELINE: STEP {N+1}/8 — {STEP-NAME} ═══
   ```

   The status block is **required at every transition**, not optional garnish — it is what makes pipeline position legible after compaction and to a user reading the log later. Canonical format, the other firing points (each continuing develop-loop iteration, each QA/verify cycle, every HALT) and the "Remaining fix phases" middle block that shows while Step 3 is open: [`references/develop-pipeline-remaining-work-banner.md`](references/develop-pipeline-remaining-work-banner.md).
4. **Invoke the next sub-skill** via the Skill tool in the same assistant turn. Do NOT pause for user acknowledgement, do NOT summarise progress, do NOT print "Returning to orchestrator".

Two structural defences back this up: each pipeline sub-skill self-advances the lock as its last inline action; and the `Stop` hook re-prompts the orchestrator if it tries to stop mid-pipeline.

**Step banners (required).** Before starting each step, output: `═══ DEVELOP-BUG PIPELINE: STEP {N}/8 — {STEP-NAME} ═══`

**Lock file `current_step` update (required, Steps 2–8).** Per the Step Transition Protocol, this is **action #1** — the first tool call after a sub-skill returns:

```bash
bash .agents/skills/develop-bug/references/advance-pipeline-lock.sh {N+1}
```

For Step 8 → completion: `... advance-pipeline-lock.sh --complete`. Skip this for Step 1 (the lock is created at the _end_ of Step 1, after the branch exists).

After each step: update the Pipeline Progress table (✅ Done / ❌ Failed / ⚠️ Needs Attention / ⏸️ Paused) and log decisions before moving on.

### The 8 Steps

| Step | Name                                    | Reference                                                                                              |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1    | **Create Branch**                       | shared step-1 (see §"Step 1" below) + branch-model deltas                                              |
| 2    | **Review Bug**                          | [`references/develop-bug-step-2-review.md`](references/develop-bug-step-2-review.md)                   |
| 3    | **Investigate & Fix** (reproduce + fix) | [`references/develop-bug-step-3-investigate-fix.md`](references/develop-bug-step-3-investigate-fix.md) |
| 4    | **Create PR**                           | shared step-4 (see §"Step 4" below) + branch-model deltas                                              |
| 5–6  | **Verify & Fix Loop**                   | [`references/develop-bug-step-5-6-verify-loop.md`](references/develop-bug-step-5-6-verify-loop.md)     |
| 7    | **Finalise & Close Bug**                | [`references/develop-bug-step-7-close-bug.md`](references/develop-bug-step-7-close-bug.md)             |
| 8    | **Commit Changes**                      | shared step-8 (see §"Step 8" below)                                                                    |

### Step 1: Create Branch

Follow the generic mechanics in [`references/develop-pipeline-step-1-create-branch.md`](references/develop-pipeline-step-1-create-branch.md) (use the **develop-task variant** for stash/restore, lock-collision, post-branch, and lock-file creation), with these **bug substitutions**:

- **work item** = the bug file; **work-item dir** = the bug directory; **id** = the bug prefix (`story.{e}.{s}.bug.{n}` / `task.{id}.bug.{n}` / `bug.{N}`).
- **Branch base and type** come from Phase 0d:
  - **Bugfix** (default) → invoke `/create-branch` with the bug file; select `develop` as the base when asked (Q2 answer).
  - **Hotfix** (Q1 = production hotfix) → invoke `/create-branch --hotfix v{X.Y.Z}` (branch off `main`). The version is the Q-derived next patch; if unknown, ask once during Step 1.
- **Ensure a tracker issue** (runs *before* the lock is written, so the lock records a real issue rather than an empty field it then contradicts). Branch on `TRACKER`:
  - `TRACKER=jira` → invoke `ensure-bug-jira-issue` with `BUG_FILE_PATH={bug file}`. On return `BUG_JIRA_KEY` is a key or empty.
  - `TRACKER=github` → invoke `ensure-bug-github-issue` with `BUG_FILE_PATH={bug file}`. On return `BUG_ISSUE_NUM` is a number or empty.

  Set `TRACKER_ISSUE` to whichever came back. **Non-blocking**: an empty return is a degraded run, not a halt — the create may have failed, or been *deferred* by a restricted `access.tracker`, in which case the handover checklist carries the action and the next run converges. Never invent a placeholder key or number: a wrong one defeats the dedup search that stops the next run creating a duplicate.

  This used to read *"most general/story/task bugs will not [have a tracker issue] — skip silently when empty"*. That described the gap rather than a design choice: there was no bug equivalent of `sync-jira-*`/`sync-github-*`, so bug cards were only ever created by hand through the generic `/create-issue` path — with no link embedding and no parent linkage. The sub-routines above close it.
- **Lock file**: write `"skill": "develop-bug"`, `"task_or_story_id": "{bug-prefix}"`, `"task_or_story_directory": "{bug-directory}"`, `"tracker_issue": "{TRACKER_ISSUE}"`. The lock is read by `.agents/skills/develop-bug/scripts/on-precompact.sh`.
- **Signal Work Started**: runs when `TRACKER_ISSUE` is non-empty, which is now the normal case rather than the exception. Skip silently when empty.

### Step 2: Review Bug

See [`references/develop-bug-step-2-review.md`](references/develop-bug-step-2-review.md): invoke `/review-bug` in **validate-and-apply** mode against the bug file. review-bug checks fix-readiness — template/frontmatter compliance, reproducibility _from the report_, severity/priority correctness, mode/linkage — and runs two read-only pre-pass scans (duplicate; already-fixed/stale). Gate on its recommendation: **READY TO FIX** → proceed; **NEEDS DETAIL** (after auto-applied fixes), **DUPLICATE**, or **STALE (already fixed)** → **HALT** and surface. This is the bug analogue of `develop-task` Step 2 (review-task) and mirrors its NEEDS-REVISION halt.

### Step 3: Investigate & Fix (reproduce + fix)

> **Bug reports use `## Status History`, not a Change Log.** They are the one document type
> deliberately excluded from the canonical Change Log — the per-iteration record this step already
> writes is richer than a log row, and adding a second history would mean maintaining two. Nothing
> in this pipeline appends a Change Log row to a bug file. See
> [document-change-log.md](references/document-change-log.md) §Exclusions.

See [`references/develop-bug-step-3-investigate-fix.md`](references/develop-bug-step-3-investigate-fix.md): set bug status `new → in-progress` and open `### Iteration 1`; **reproduce** the failure (run the failing test / repro, establishing the fails-without property) and **locate the root cause** via Explore; implement the fix + a **regression test that fails without the fix** → write **Investigation** and **Fix Implementation** into the bug's Developer Fix Cycle → add a Status History row → set bug status `ready-for-qa`. Bounded loop + test-failure triage as in [`references/develop-pipeline-step-3-develop-loop.md`](references/develop-pipeline-step-3-develop-loop.md). If the bug proves **not reproducible** here (despite review-bug passing), HALT — do not fabricate a fix.

### Step 4: Create PR

Follow the generic mechanics in [`references/develop-pipeline-step-4-create-pr.md`](references/develop-pipeline-step-4-create-pr.md) (**develop-task variant**: scope staging, pre-flight guard, leak check), with these **bug substitutions**:

- `--base {Q3_answer}`: `develop` for a bugfix; `main` for a hotfix.
- `--issue`: pass `${TRACKER_ISSUE}` when it is non-empty and `TRACKER=github`; omit otherwise. Step 1 ensures the issue, so a bug normally has one — an empty value means the create failed or was deferred, not that bugs do not get issues.
- **Hotfix note**: a hotfix PR targets `main`. After merge, the fix must also land on `develop` — record this in the implementation report's Issues Log as a follow-up (`hotfix: merge-back to develop required`) so it is not lost. The version tag is created by the human/release process on merge to `main`.

### Step 5–6: Verify & Fix Loop

See [`references/develop-bug-step-5-6-verify-loop.md`](references/develop-bug-step-5-6-verify-loop.md): QA verifies the **bug scenario is gone** and no regressions were introduced. On PASS → write the **QA Verification (✅ Fixed)** subsection into the current iteration and mark the bug for close. On FAIL → **reopen**: append `### Iteration N+1`, set status `reopened`, invoke `/qa-fix` (a PR now exists, so qa-fix's bug-update machinery applies cleanly), commit/push per cycle. Bounded `MAX_ITER=5`.

### Step 7: Finalise & Close Bug

See [`references/develop-bug-step-7-close-bug.md`](references/develop-bug-step-7-close-bug.md): invoke `/finalise` against the bug file for the DoD checks, then run the **bug-close routine** — write `## Resolution Summary` (Final Status, Total Iterations, Time to Resolution, Final Fix Details, Lessons Learned), set bug frontmatter `status: closed` + body `**Status:** ✅ Closed`, add the final Status History row, and update parent linkage per mode:

- **Story bug** → move the bug to **Closed Bugs** in the parent story's `## Bug Reports`; if it was the parent's only open bug, restore the parent story status from `Reopened`.
- **Task bug** → mark the bug ✅ Closed in the parent task's Bug Reports list.
- **General bug** → flip the `docs/bugs/bug-registry.md` row status to `closed` (commit the registry bump atomically with the bug file).

**Lite mode applies to Step 5 only.** Step 7 (finalise + Resolution Summary + parent/registry update + any tracker close) runs in full in every mode.

### Step 8: Commit Changes

Follow [`references/develop-pipeline-step-8-commit.md`](references/develop-pipeline-step-8-commit.md) with **work-item dir = bug directory**: final implementation-report update (Finished, Final Status, QA/fix iterations, Completion Summary), `/commit-changes --scope {bug-directory}`, final push, Pipeline Progress ✅, lock removal, and the Step 8 completion checklist.

---

## Phase 2: Completion

Output the final status:

```
✅ Bug Fix Complete

Bug:                   {bug filename}
Mode:                  {story | task | general}
Branch:                {branch name}  ({bugfix → develop | hotfix → main})
PR:                    {PR URL}
Fix Iterations:        {N}
Bug Status:            closed
Implementation Report: {report file path}

All pipeline steps completed. The bug is fixed, verified, and closed, with the fix record written into the bug report.
```

For any other halt:

```
⚠️ Bug Fix Paused — Human Input Required

Bug:                   {bug filename}
Paused at:             Step {N} — {step name}
Reason:                {concise reason}
Implementation Report: {report file path}

The implementation report has a full account of what was completed and what needs attention.
```

---

## Autonomous Decision Defaults

Every default applied must be recorded in the Decisions Log. See [`references/develop-pipeline-autonomous-defaults.md`](references/develop-pipeline-autonomous-defaults.md) for the shared autonomous-mode default-behavior table.

### Skill-specific defaults (develop-bug only)

| Situation                                                                        | Default                                                                                                                                                    |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| review-bug (Step 2) returns **READY TO FIX**                                     | Proceed to Step 3 autonomously.                                                                                                                            |
| review-bug returns **NEEDS DETAIL** after auto-applying critical+important fixes | **HALT** — the report lacks reproducibility detail only a human can supply.                                                                                |
| review-bug returns **DUPLICATE**                                                 | **HALT** — surface the duplicate; do not fix.                                                                                                              |
| review-bug returns **STALE (already fixed)**                                     | **HALT** — recommend closing the bug; do not fabricate a fix.                                                                                              |
| Bug proves not reproducible in Step 3                                            | **HALT** — do not fabricate a fix for a bug you cannot reproduce. Surface the reproduction attempt to the user.                                            |
| Bug severity `Blocker`/`Critical`                                                | Never run in lite mode — full QA verification in Steps 5–6 regardless of size.                                                                             |
| Branch model ambiguous (Phase 0d Q1)                                             | Default **bugfix off `develop`**. Choose hotfix only when the bug is explicitly a production regression (frontmatter/desc says so) or the user selects it. |
| Bug already `closed` at Phase 0                                                  | HALT — nothing to do; report the existing Resolution Summary to the user.                                                                                  |
| qa-fix reopens the bug ≥5 times (MAX_ITER)                                       | HALT — escalate; the fix approach is not converging.                                                                                                       |

If a situation arises that is not in this table or the shared defaults table and the stakes are non-trivial, **HALT and ask the user**. Log the question and the answer in the Decisions Log.

---

## Error Recovery Principles

- **Never silently continue past a failed step.** Every failure is logged and surfaced.
- **Always use `/commit-changes` to commit** — never raw `git commit`.
- **Commit the report before any halt.**
- **Push after every commit during the fix loop.** The PR must stay current.
- **The implementation report is the primary recovery tool.** Always include its path in halt messages.
- **Snapshot then remove the lock file before every terminal HALT** (same protocol as develop-task):

  ```bash
  if [ -f .claude/state/develop-pipeline.lock ]; then
    jq --arg reason "{halt_reason}" --arg step "{halt_step}" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
       '. + {halted_at: $ts, halt_reason: $reason, halt_step: $step}' \
       .claude/state/develop-pipeline.lock > .claude/state/develop-pipeline.last-halt.json
  fi
  rm -f .claude/state/develop-pipeline.lock .claude/state/test-output-*.log
  ```

- **Signal `blocked` on a terminal HALT** (when `TRACKER=jira` and `TRACKER_ISSUE` is set). After the snapshot above, before surfacing the HALT:

  ```bash
  node .agents/skills/develop-bug/references/jira-stage.js \
    --issue {TRACKER_ISSUE} --stage blocked --json
  ```

  **Only for a real blockage** — a fix-readiness gate that failed, five QA cycles without a clean gate, a merge conflict, a root cause that cannot be reproduced. Do **not** fire it when the halt is an _interruption_: plan mode, a denied permission, a compaction pause, or the user stopping the run. Those are pauses in the operator's attention, not states of the work, and a card parked in Blocked misreports the second as the first to everyone reading the board.

  `blocked` is **off by default** and opted into per issue type in the workflow record. Expect `reason: "stage-disabled"` until a project turns it on, and `skip (no-transition)` on boards that have the status but do not offer it from where the card currently sits — many workflows only allow Blocked from a testing column. Both are correct outcomes; the CLI exits 0 and the HALT proceeds either way.

- If a sub-skill cannot be found, log the error and tell the user to verify it is installed in `.agents/skills/`.

---

## File References

- Story bug: `{story-dir}/story.{epic}.{story}.bug.{n}.{name}.md` (co-located with the story)
- Task bug: `docs/tasks/task.{id}.{name}/task.{id}.bug.{n}.{name}.md`
- General bug: `docs/bugs/bug.{N}.{name}/bug.{N}.{name}.md` (+ `docs/bugs/bug-registry.md`)
- Implementation report: `{bug-directory}/{bug-prefix}.implementation.{N}.{descriptive-name}.md`
- Bug template (section shapes the fix record fills): `assets/bug-report-template.md` in `create-bug-report`

## Related Skills

- `/create-bug-report` — files the bug (upstream; produces the file this skill consumes)
- `/create-branch` — Step 1
- `/review-bug` — Step 2 (fix-readiness gate; also runnable standalone before this pipeline)
- `/qa-fix` — Step 6 (fix engine within the verify loop; also updates the bug file)
- `/finalise` — Step 7
- `/commit-changes` — Step 8
- `/develop-task`, `/develop-story` — sibling orchestrators for tasks and stories
