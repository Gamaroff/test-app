---
name: develop-bug-step-0-resolve-bug
description: Phase 0 (resolve-and-prepare) for the develop-bug pipeline. Covers 0a bug-file resolution across the three modes (story/task/general), 0b pipeline lock state check, 0c upfront context reading + lite-mode detection, 0d upfront Q&A (branch model, base branch, PR target), 0e implementation report creation, and 0f pre-flight summary.
---

# Develop Bug Pipeline — Phase 0: Resolve & Prepare

Loaded by `/develop-bug` before Step 1. Run these sub-steps in order. Where a generic mechanic is identical to develop-task's, this document references the shared resource rather than duplicating it.

---

## 0a. Resolve the Bug File (three modes)

Accept any of: an absolute/relative bug file path, a bug directory, or a bare bug id. Dispatch a read-only Explore subagent (medium breadth) to resolve the file and detect its **mode** from the filename/location:

| Mode | Filename pattern | Location | `related` |
|------|------------------|----------|-----------|
| **story** | `story.{epic}.{story}.bug.{n}.{name}.md` | co-located with the story file | link to parent story |
| **task** | `task.{id}.bug.{n}.{name}.md` | `docs/tasks/task.{id}.{name}/` | link to parent task |
| **general** | `bug.{N}.{name}.md` | `docs/bugs/bug.{N}.{name}/` | `None — cross-cutting` |

The subagent returns: absolute bug file path, bug directory, mode, and `{bug-prefix}` (the filename stem before `.md`, e.g. `story.8.5.3.bug.1.cache-leak`, `task.44.bug.2.perf`, `bug.7.stale-token`). Exclude any file whose name contains `.implementation.` (that is the report, not the bug).

**HALT** if no bug file resolves: `Bug file not found for "{input}". Provide a path to a story/task/general bug report, or file one first with /create-bug-report.`

Record in the Decisions Log: `Bug resolved: {path} (mode={mode}, prefix={bug-prefix})`.

---

## 0b. Pipeline Lock State Check

Check for an active pipeline lock (single-path lock, shared across develop-story/task/bug):

```bash
[ -f .claude/state/develop-pipeline.lock ] && cat .claude/state/develop-pipeline.lock
[ -f .claude/state/develop-pipeline.last-halt.json ] && cat .claude/state/develop-pipeline.last-halt.json
```

- **Active lock for THIS bug** (`task_or_story_id` matches `{bug-prefix}`) → this is a resume. Enter the Context Compression Recovery path in `SKILL.md` (Phase 0a/0b resume-detector) and continue from the recommended step. Do NOT re-run Phase 0d prompts.
- **Active lock for a DIFFERENT work item** → **HALT**: another pipeline is active; show the lock and instruct the user to finish/abort it first.
- **`last-halt.json` snapshot for this bug, no active lock** → offer "Resume from {halt_step}" or "Start fresh" (fresh deletes the snapshot). See [`references/develop-pipeline-resume-contract.md`](develop-pipeline-resume-contract.md).
- **No lock, no snapshot** → fresh run; proceed to 0c.

The lock is created at the end of Step 1 (after the branch exists), not here.

---

## 0c. Read Bug Context + Lite-Mode Detection

Read the bug file frontmatter and body. Extract and record in the implementation report:

- `status` (bug lifecycle: `new | in-progress | ready-for-qa | closed | reopened`), `severity`, `priority`, `created`, `related`, `description`
- `github_issue` / `jira_key` if present (most general/story/task bugs have none — that is expected; `TRACKER_ISSUE` = empty then)
- Reproduction Steps, Expected vs Actual behaviour, the Criteria/Scope Violation section, and any existing Developer Fix Cycle iterations

**Status guards:**

| Bug `status` | Action |
|--------------|--------|
| `new` | Proceed. Step 2 will move it to `in-progress`. |
| `reopened` | Proceed — Step 3 appends a new iteration rather than starting Iteration 1. |
| `in-progress` | Proceed — a prior run may have started; resume-aware. |
| `ready-for-qa` | Proceed directly toward Steps 5–6 verification if a fix already exists; else re-verify the fix record. |
| `closed` | **HALT** — nothing to do. Report the existing `## Resolution Summary` to the user. |

**Lite-mode detection** (see [`references/develop-pipeline-lite-mode.md`](develop-pipeline-lite-mode.md) for the shared heuristic). For bugs, lite mode is allowed **only** when severity is `Minor`/`Trivial` AND priority is `Low`/`Medium`. `Blocker`/`Critical`/`Major` bugs always run full QA in Steps 5–6. Record the decision: `Lite mode: {on/off} — severity={severity}, priority={priority}`.

`TRACKER`/`VCS` are resolved via [`references/resolve-platform.sh`](resolve-platform.sh) (source it before any tracker branch).

---

## 0d. Upfront Prompts (AskUserQuestion)

Ask all branch decisions upfront, once, so Steps 1 and 4 run without further prompts. Each question carries an auto-derived **recommended** default (first option, labelled "(Recommended)").

**Q1 — Branch model.** Recommended default derived from the bug: **hotfix** only if the bug is explicitly a production regression (frontmatter/description says "production", "regression", "hotfix", or severity `Blocker` on a released area); otherwise **bugfix**.

- **Regular bugfix (Recommended, default)** → branch off `develop`, PR back to `develop`.
- **Production hotfix** → branch off `main`; PR merges to `main` (+ merge-back to `develop`); version tag on merge.

**Q2 — Base branch.** Auto-set from Q1: `develop` for bugfix, `main` for hotfix. Only surface as a question if the repo's default integration branch is non-standard; otherwise apply the Q1-derived value and log it.

**Q3 — PR target.** Auto-set from Q1: `develop` for bugfix, `main` for hotfix. This becomes `--base` in Step 4.

Store the answers as `BRANCH_MODEL`, `BASE_BRANCH`, `PR_TARGET`. Log all three in the Decisions Log. If the run is fully autonomous (invoked from a batch/loop), apply the recommended defaults and record `auto-answered` per row.

---

## 0e. Create the Implementation Report

Create a co-located implementation report `{bug-directory}/{bug-prefix}.implementation.{N}.{descriptive-name}.md` (N = next available; scan the bug dir). Seed it with:

```markdown
---
type: implementation-report
status: in-progress
bug: '{bug-prefix}'
mode: '{story|task|general}'
started: '{YYYY-MM-DDTHH:MM:SSZ}'
---

# Implementation Report — {bug-prefix}

**Started:** {timestamp}
**Finished:** —
**Final Status:** In Progress
**Branch model:** {BRANCH_MODEL} (base: {BASE_BRANCH}, PR target: {PR_TARGET})
**Severity / Priority:** {severity} / {priority}
**Lite mode:** {on|off}
**Fix Iterations:** 0

## Pipeline Progress

| Step | Skill | Status | Notes | Subagent summary ref |
|------|-------|--------|-------|----------------------|
| 1 | create-branch | ⏳ Pending | | |
| 2 | review-bug | ⏳ Pending | | |
| 3 | investigate-fix | ⏳ Pending | | |
| 4 | create-pr | ⏳ Pending | | |
| 5–6 | verify-fix loop | ⏳ Pending | | |
| 7 | finalise-close | ⏳ Pending | | |
| 8 | commit-changes | ⏳ Pending | | |

## Decisions Log

- {timestamp} — Bug resolved: {path} (mode={mode})

## Issues Log

## Completion

**Branch:** —
**PR:** —
**DoD Summary:** —
```

The report is stashed around branch creation in Step 1 (see shared step-1) and committed in Step 8.

---

## 0f. Pre-flight Summary

Output a compact pre-flight banner and proceed straight into Step 1 (do NOT wait for user acknowledgement on a fresh run — the Phase 0d answers are the only interactive gate):

```
═══ DEVELOP-BUG PIPELINE: STEP 1/8 — CREATE BRANCH ═══
Bug:      {bug-prefix} ({mode}) — {severity}/{priority}
Model:    {BRANCH_MODEL} → base {BASE_BRANCH}, PR to {PR_TARGET}
Lite:     {on|off}
Report:   {report path}
```
