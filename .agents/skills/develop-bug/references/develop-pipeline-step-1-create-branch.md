---
name: develop-pipeline-step-1-create-branch
description: Step 1 (create-branch) shared by develop-story and develop-task. Covers pipeline lock collision check, pre-flight board/Jira verification, implementation report stash/restore, /create-branch invocation, post-branch steps, pipeline lock file creation, and failure handling. Story vs task variants are called out where they differ.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-step-1-create-branch.md. Regenerate via `npm run bundle`. -->

# Develop Pipeline — Step 1: Create Branch

## When This Document Applies

Loaded by `/develop-story` and `/develop-task` during Step 1. Story/task variants are called out in labeled sub-sections where they differ.

---

## Pipeline Lock Collision Check (mandatory — refuse to start if another pipeline active)

Only one `/develop-story` or `/develop-task` pipeline may run per repo at a time (single-path lock). Run this _before_ any branch-creation work — collision after `/create-branch` would orphan a branch.

```bash
if [ -f .claude/state/develop-pipeline.lock ]; then
  echo "❌ Pipeline lock collision: another /develop-story or /develop-task pipeline is already active in this repo:"
  cat .claude/state/develop-pipeline.lock
  echo "Resolve by completing or aborting the other run (and removing the lock) before continuing."
fi
```

If the lock file exists: **HALT immediately** — show the lock contents to the user and instruct them to resolve by completing or aborting the other pipeline run, then removing `.claude/state/develop-pipeline.lock`. Do NOT proceed to branch creation.

If the lock exists but its `branch` field does not match any existing local branch (`git branch --list`), it is stale — log a warning and remove it: `rm -f .claude/state/develop-pipeline.lock`. Then proceed.

---

> **Note (relocated):** the previous "Pre-flight Board Check" section has been removed. Tracker signalling no longer runs in Phase 0 — it now runs **after** branch + lock creation in this step (see "Signal Work Started" below). This avoids leaving the tracker stuck in `In Progress` if branch creation fails.

---

## Step 1: Stash, Create Story Branch, and Restore

Before invoking `/create-branch`, stash the implementation report to ensure a clean working directory:

#### develop-story

```bash
git stash push --include-untracked -m "develop-story: implementation report pre-branch" -- {implementation-report-path}
```

#### develop-task

```bash
git stash push --include-untracked -m "develop-task: implementation report pre-branch" -- {implementation-report-path}
```

### Invoke /create-branch

#### develop-story

Invoke the `/create-branch` skill with the story file path.

#### develop-task

Invoke the `/create-branch` skill with the task file path.

When `create-branch` asks which base branch to use, select the Q1 answer from Upfront Setup — do not prompt the user again.

- **develop-story**: Q1 answer is the branch chosen in Phase 0d (default `develop`)
- **develop-task**: Q1 answer is the branch chosen in Phase 0d

#### When the Q1 answer is an epic integration branch (develop-story only)

The Q1 answer may name a branch that **does not exist yet** — Phase 0d is deliberately side-effect-free,
so an epic integration branch chosen there has not been created. `/create-branch` Step 2b.5 creates it
from `develop` and pushes it before checking out a base; nothing extra is needed here.

Two consequences to verify after `/create-branch` returns:

```bash
git rev-parse --abbrev-ref HEAD                      # the STORY branch, not the epic branch
git rev-parse --abbrev-ref --symbolic-full-name @{u} # story branch tracks origin
```

If HEAD is the epic branch rather than the story branch, `/create-branch` stopped after creating the
integration branch — **HALT** and report it. Continuing would commit story work directly onto the epic
branch, which no PR would then isolate.

The integration branch must also exist on `origin` at this point. `/develop-batch` dispatches stories
into linked worktrees that cut from `origin/<base>`; a local-only integration branch makes every
subsequent story in the epic fail to branch, with an error that names the story rather than the real
cause. Verify once, cheaply:

```bash
git ls-remote --exit-code --heads origin "<epic-branch>" >/dev/null || echo "❌ integration branch not pushed"
```

### Restore the Stash (shared)

After `/create-branch` completes and the feature branch is checked out:

```bash
git stash pop
```

If stash pop fails, recover the report with:

```bash
git stash show -p stash@{0} | grep -A 9999 "^+++ b/{report-filename}" | tail -n +2 > {implementation-report-path}
git stash drop stash@{0}
```

If that also fails, run `git stash list` to find the stash index and `git stash show -p stash@{N}` to inspect it, then manually recreate the report file from the output. Log this in Decisions Log: "Implementation report stashed before branch creation, restored after (or manually recovered)."

---

## Post-Branch Steps (shared)

After the story branch is created:

- Record the branch name in the Decisions Log and in the **Branch** field of the Completion section
- Run `git log --oneline -1` to capture the initial commit hash; record it in the Pipeline Progress Notes: e.g. `Branch created at \`{hash}\``
- Update Pipeline Progress: ✅ 1. create-story-branch

---

## Write the Pipeline Lock File

Enables the PreCompact graceful-pause hook from this point onward. Collision was already checked above; the lock should not exist here.

#### develop-story

```bash
mkdir -p .claude/state
cat > .claude/state/develop-pipeline.lock <<EOF
{
  "skill": "develop-story",
  "report_path": "{implementation-report-path}",
  "task_or_story_id": "{epic}.{story}",
  "task_or_story_directory": "{story-directory}",
  "branch": "{branch-name}",
  "pr_url": "",
  "tracker": "{TRACKER}",
  "tracker_issue": "{TRACKER_ISSUE}",
  "current_step": 2,
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
```

The lock file is read by `.agents/skills/develop-story/scripts/on-precompact.sh` if compaction fires.

> ⚠️ **`current_step` is created at `2`, not `1`, and that is deliberate.** The field names the
> step that is **PENDING** — Step 1 has just finished by the time this lock is written, so the
> pending step is 2. This matches the Step Transition Protocol, which writes `{N+1}` after step N
> completes, and it is what `on-stop.sh` reads to decide which step to re-prompt. Creating it at
> `1` made the value mean "last completed step" here and "next pending step" everywhere else — one
> field, two conventions — and the Stop hook, having only one reader, skipped a step whenever it
> fired mid-step. Observed four times on one story before it was found.

#### develop-task

```bash
mkdir -p .claude/state
cat > .claude/state/develop-pipeline.lock <<EOF
{
  "skill": "develop-task",
  "report_path": "{implementation-report-path}",
  "task_or_story_id": "{task_id}",
  "task_or_story_directory": "{task-directory}",
  "branch": "{branch-name}",
  "pr_url": "",
  "tracker": "{TRACKER}",
  "tracker_issue": "{TRACKER_ISSUE}",
  "current_step": 2,
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
```

The lock file is read by `.agents/skills/develop-task/scripts/on-precompact.sh` if compaction fires.

### Shared note

From Step 2 onward, the per-step banner directive updates `current_step`. Step 4 also writes `pr_url` after the PR is created.

---

## Signal Work Started (mandatory — runs after lock written)

Now that the branch and lock both exist, signal the tracker. Execute the **0c-reg procedure** defined in `references/develop-pipeline-step-0-resolve-and-prepare.md` §"0c-reg. Signal Work Started" — both Jira and GitHub paths. The procedure body is unchanged; only the timing has moved here.

Rationale for the move:

- If branch creation fails, the tracker is **not** left stuck `In Progress` (previous behaviour leaked state on early HALT).
- The branch name passed in the comment body (`Pipeline started — branch: {branch-name}`) is now guaranteed to exist on the remote after Step 1.
- Failure semantics unchanged — every action remains non-blocking; warnings go to the Issues Log.

Run the procedure exactly once per pipeline. On resume, the resume-detector subagent's `summaries_seen` includes the post-condition log line; if absent and Step 1 is otherwise ✅, re-run the signal (idempotent — comment is benign duplicate, transition is no-op when already in target state).

---

## On Failure

Update Pipeline Progress ❌, log in Issues Log. **Do not commit the report** — no feature branch exists yet and committing on the base branch would pollute it. Save the report file to disk and tell the user its path so they can recover manually. Do **not** write the lock file (no branch = hook can't safely commit). Then HALT with the error details.
