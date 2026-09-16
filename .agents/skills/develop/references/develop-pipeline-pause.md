---
name: develop-pipeline-pause
description: Graceful pause contract shared by develop-story and develop-task orchestrators. Covers the pipeline lock-file format, the PreCompact hook contract, the pause-signal handshake, and half-done step recovery guarantees on resume.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-pause.md. Regenerate via `npm run bundle`. -->

# Develop Pipeline — Graceful Pause on Imminent Context Compaction

Reference doc for the `/develop-task` and `/develop-story` orchestrator skills. Describes the lock-file format, the `PreCompact` hook contract, and the half-done step recovery guarantees.

Audience: maintainers of the `develop-task`/`develop-story` skills, authors of sub-skills they invoke, and operators wiring the hook into a project.

> **Looking for the full hook catalogue?** This document is the deep dive on the `PreCompact` hook only. For the complete list of pipeline hooks (PreCompact + Stop), the install script, the interaction diagram, troubleshooting, and the contract for adding new hooks, see [`develop-pipeline-hooks.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/develop-pipeline-hooks.md).

---

## Problem

`/develop-task` and `/develop-story` are 8-step pipelines (create-branch → review → develop → create-pr → qa-loop → finalise → commit). They run hands-free for many minutes and frequently consume enough context to trigger Claude Code's auto-compaction.

When compaction fires mid-pipeline:

- In-memory orchestrator state is summarised. The agent forgets where it was, why it made decisions, and what the QA cycle counter is.
- The implementation report on disk is the only durable state, and it is only fully committed at terminal halt boundaries — not between steps.
- The user gets no signal that the run paused. They notice it later when nothing has happened.

The agent has no token-count introspection, so the orchestrator cannot detect "compaction is about to fire" from inside its own turn. The only reliable signal is the Claude Code **`PreCompact` hook**, which executes a shell script before the harness summarises the conversation.

The pause flow is therefore: a shell hook (independent execution budget, runs even when the agent is out of room) does the durable work — appends a pause entry to the report, commits and pushes, posts the PR and tracker-issue comments through the comment contract — and then injects a system-reminder back to the agent telling it to halt cleanly.

## Architecture overview

```
┌──────────────────────────────────────────────────────────────────┐
│ Pipeline running (Step 2–8)                                      │
│   └─ writes/updates `.claude/state/develop-pipeline.lock`        │
│      at end of Step 1 + every step banner + after PR creation    │
└──────────────────────────────────────────────────────────────────┘
                  │
                  ▼  context approaches limit
┌──────────────────────────────────────────────────────────────────┐
│ Claude Code triggers PreCompact hook                             │
│   └─ runs `.agents/skills/<skill>/scripts/on-precompact.sh`      │
└──────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────────┐
│ Hook reads lock file:                                            │
│   1. Append "Paused — Context Compaction" to implementation report│
│   2. git commit + git push (best-effort)                         │
│   3. PR comment via tracker_write (lead + --body-file)           │
│   4. Issue comment via tracker-comment.js (lead, marker, gate)   │
│   5. rm lock file                                                │
│   6. Emit additionalContext: 🛑 PIPELINE-PAUSE-SIGNAL            │
└──────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────────┐
│ Agent sees signal in next turn → outputs pause banner + summary  │
│ → HALTs. Compaction proceeds on a clean state.                   │
└──────────────────────────────────────────────────────────────────┘
                  │
                  ▼  user re-invokes /develop-task <path>
┌──────────────────────────────────────────────────────────────────┐
│ Phase 0b detects existing branch/PR/report → "Resume from last   │
│ completed step" → existing artifact verification skips ✅ steps  │
│ → re-runs the ⏸️ Paused step from scratch (sub-skills are        │
│ re-run-safe by pipeline design).                                 │
└──────────────────────────────────────────────────────────────────┘
```

## Lock file

**Path**: `.claude/state/develop-pipeline.lock` (relative to repo root).

**Lifecycle**:
- **Created**: at the *end of Step 1*, after the feature branch exists. Not earlier — between Phase 0 and end-of-Step-1, the implementation report is either uncommitted on the base branch (`develop`/`main`) or sitting in a `git stash`. A hook firing during that window has no safe place to commit, so the lock-absent path (hook = noop) is intentional.
- **Updated**: at every step banner from Step 2 onward (`current_step` field) and after PR creation (`pr_url` field).
- **Removed**: at the end of Step 8 (clean completion); at every terminal HALT (Error Recovery rule); by the hook itself when it fires.

**Format**:

```json
{
  "skill": "develop-task",
  "report_path": "docs/tasks/task.42.foo/task.42.implementation.1.foo-initial-run.md",
  "task_or_story_id": "42",
  "task_or_story_directory": "docs/tasks/task.42.foo",
  "branch": "feature/task.42.foo",
  "pr_url": "https://github.com/org/repo/pull/108",
  "tracker": "github",
  "tracker_issue": "297",
  "current_step": 5,
  "started_at": "2026-04-30T14:22:00Z"
}
```

| Field | Meaning |
|-------|---------|
| `skill` | `develop-task` or `develop-story` — selects the resume command and report style |
| `report_path` | Path to the implementation report. Hook appends pause entry here. |
| `task_or_story_id` | `42` for tasks; `{epic}.{story}` for stories. Used in commit messages. |
| `task_or_story_directory` | Directory holding the task/story file + co-located artifacts |
| `branch` | Feature branch name (used in pause summary) |
| `pr_url` | Empty until Step 4 succeeds, then the PR URL |
| `tracker` | `github` or `jira` — controls whether the hook posts a tracker-issue comment |
| `tracker_issue` | GitHub issue number or Jira key — passed to `tracker-comment.js` with `--tracker <tracker>`, so it is used for both trackers |
| `current_step` | 1–8. Set to 1 at end of Step 1, updated at every banner thereafter. |
| `started_at` | UTC ISO-8601 timestamp |

**Concurrency note**: only one pipeline can run per repo at a time (the lock file is a single shared path). This matches the existing assumption that `develop-task`/`develop-story` operate against the current working tree.

## Hook contract

**Path**: `.agents/skills/develop-task/scripts/on-precompact.sh` (and the duplicate at `.agents/skills/develop-story/scripts/on-precompact.sh`). Both copies are byte-identical — the lock file's `skill` field tells the hook which orchestrator is paused.

**Shell**: `bash`, `set -uo pipefail` (deliberately *not* `-e` — the hook is best-effort throughout).

**Inputs**: none. Reads `.claude/state/develop-pipeline.lock` from CWD.

**Outputs**: a single JSON object on stdout:

```json
{"hookSpecificOutput": {"hookEventName": "PreCompact", "additionalContext": "..."}}
```

If no lock file exists, `additionalContext` is `""` (empty). If a lock exists, `additionalContext` carries the `🛑 PIPELINE-PAUSE-SIGNAL` block plus the user-facing summary template.

**Side effects** (all best-effort, all wrapped in `... || true`):

0. **Snapshot-before-removal (resume guarantee).** As soon as the lock is confirmed present — *before* the `trap 'rm -f "$LOCK"' EXIT` is armed and before any explicit `rm` — write `develop-pipeline.last-halt.json` (co-located with the lock). It is a **superset of the lock** with `paused_at`, `pause_reason: "precompact"`, and `halt_step` (= the lock's `current_step`). When `jq` is unavailable this degrades to a verbatim `cp` of the lock (still preserving `current_step`). This single guarantee is what makes a *killed* hook recoverable: every exit path — clean finish OR harness SIGTERM/timeout mid-flow — leaves the snapshot on disk, so the pipeline can never end up both unlocked **and** un-resumable. Phase 0b's resume detector consumes this snapshot when no active lock is present.
1. Append a "Pipeline Paused — {timestamp}" block to `report_path` with skill, branch, last step boundary, PR URL, tracker info, and resume instructions.
2. `git add <report> && git commit -m "docs(<skill>): pipeline paused at step <N> — context compaction imminent" && git push origin HEAD`.
3. `tracker_write gh pr comment <pr_url> --body-file .claude/state/precompact-pr-comment.step-<N>.md` if `pr_url` is non-empty and both `gh` and `node` are on PATH. The body opens with the `pipeline-paused` lead (rendered by `stakeholder-summary-cli.js`), then `---`, then the paused notice. `tracker_write` comes from sourcing `resolve-platform.sh` beside the hook, so a declared `access.tracker` restriction is honoured — the comment is recorded in the deferred-mutation journal instead of posted. If the resolver or the lead cannot be loaded the arm fails closed: nothing is posted and the signal says so.
4. `tracker-comment.js --issue <tracker_issue> --stage pipeline-paused-<step> --body-file .claude/state/precompact-issue-comment.step-<N>.md` if `tracker_issue` is set and `node` is on PATH. One call: the engine resolves the tracker, renders the lead, adds the idempotency marker (scoped by step — a second pause at a later step posts again; a repeat at the same step reports `already`) and applies the access gate. Its `reason` is surfaced in the signal.
5. `rm -f .claude/state/develop-pipeline.lock`.

> The snapshot is a **superset** of the lock — it differs from the orchestrator's terminal-HALT snapshot (SKILL.md) only in the reason fields: PreCompact writes `pause_reason: "precompact"` + `paused_at`, the terminal path writes `halt_reason` + `halted_at`. Both write `halt_step`, so the resume detector locates the resume point identically. The `LOCK` path is `PIPELINE_LOCK`-overridable (default `.claude/state/develop-pipeline.lock`) so the hook can be sandboxed in regression tests; the snapshot path is derived from it.

**Exit code**: always `0`. Failures log to stderr but never block compaction.

**Dependencies**: `jq` (required for safe JSON parsing — degrades to noop if missing); `git` and `gh` (used best-effort).

**Jira**: the issue comment reaches Jira over REST when `JIRA_URL` / `JIRA_API_TOKEN` / `JIRA_USER_EMAIL` are in the hook's environment (or a `.env` the engine reads); otherwise `tracker-comment.js` reports `no-credentials` and the Jira side stays silent. The signal names the outcome and the agent repeats it in the user-facing summary. There is no MCP path from a shell hook.

## Setup (per project)

Each project that uses `/develop-task` or `/develop-story` registers the hook in its `.claude/settings.json`. Use the path for whichever skill(s) you have installed:

**If using `/develop-story`:**
```json
{
  "hooks": {
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PROJECT_DIR}/.agents/skills/develop-story/scripts/on-precompact.sh\""
          }
        ]
      }
    ]
  }
}
```

**If using `/develop-task` (or both skills):**
```json
{
  "hooks": {
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PROJECT_DIR}/.agents/skills/develop-task/scripts/on-precompact.sh\""
          }
        ]
      }
    ]
  }
}
```

Notes:
- Both scripts are byte-identical and both consult the lock file's `skill` field to determine which orchestrator is paused. Either path covers both pipelines — use the one for the skill you have installed.
- If both skills are installed, a single entry is sufficient; use either path.
- The hook is project-scoped on purpose. Different projects may register different report locations or tracker integrations; per-project settings keep them isolated.
- The hook is keyed off the lock file. With no active pipeline, it's a noop — safe to leave registered permanently.

## Half-done step recovery

The hook fires regardless of pipeline position. The lock's `current_step` records the orchestrator's last *step boundary*; actual sub-skill work inside that step may be 0–99% done. Resume relies on the existing Phase 0b artifact verification table to determine which steps to re-run.

### Window A — Phase 0a through end of Step 1 (no lock yet)

- **State**: Report may exist (Phase 0e ran), but no feature branch yet, or branch creation in progress / report stashed.
- **Hook**: lock absent → noop. No pause comment posted.
- **Resume**: user re-invokes the skill. Phase 0b detects existing report or partial branch, asks "Resume or restart?". `/create-branch` is idempotent (it checks if the branch already exists). Worst case: report is on `develop` uncommitted → small dirty-tree warning, user proceeds.
- **Fallback**: if context compacts before resume happens, the existing post-compaction recovery section in SKILL.md kicks in (re-read skill, find report on disk, resume from Phase 0b).

### Window B — Step 2–7, between sub-skill invocations

- **State**: sub-skill returned, orchestrator updating Pipeline Progress / writing decisions / about to invoke next sub-skill.
- **Hook**: lock present, `current_step` = step that just finished or about to start. Hook commits report, posts the PR and issue comments through the contract, signals agent.
- **Resume**: agent halts cleanly. Phase 0b reads report → artifact verification → ✅ steps skipped, in-progress step re-run from start. Idempotent.
- **Common case**: most compactions fire on the orchestrator's turn, not deep inside a sub-skill.

### Window C — Step 3 (`/develop`) mid-run, partial code

- **State**: `/develop` is mid-execution. Some commits may already exist on the branch; some changes may sit uncommitted in the working tree. Task/story `[x]` checkboxes reflect already-completed phases/tasks.
- **Hook**: commits *the report only* — does not touch code changes (those belong to `/develop`).
- **Resume**: the orchestrator's bounded Step 3 loop re-runs. It re-reads task/story `Status:` from disk, sees `In Progress`, and re-invokes `/develop`. The Decisions Log preserves the "Pre-develop surface map:" entry, so Explore + plan-file discovery are skipped on resume. `/develop` itself reads task/story checkboxes and continues from the next unchecked phase/task. The loop is bounded by `MAX_ITER=5` and a no-progress stall check (halts only when the `[x]` count is unchanged at any indent **and** the branch HEAD has not advanced between iterations — either signal counts as progress), so a stuck `/develop` halts cleanly rather than spinning.
- **Worst case**: `/develop` re-does the in-flight phase whose work was uncommitted at compaction time. No worse than the user manually re-running it after a crash. Acceptable.

### Window D — Step 5–6 (QA loop), partial `qa.N.md` / `gate.N.yml` / fix commits

- **State**: `/qa-task` may have written `qa.N.md` but not `gate.N.yml` (or vice versa); or `/qa-fix` may have made edits without committing.
- **Hook**: same as Window B/C — commits report, comments PR, signals.
- **Resume**: artifact verification *requires both* `qa.N.md` AND `gate.N.yml` for cycle N to count as completed. A partial gate file is rejected → cycle N re-runs. The QA cycle counter is reconstructed from the report's `### QA Cycle` entries.
- **Edge**: if `/qa-task` increments `N` on each invocation, a partial `qa.N.md` becomes an orphan. Harmless — delete manually if desired. (If `/qa-task` reuses `N`, even cleaner — partial gets overwritten.)

### Window E — Step 7 (`/finalise`), partial DoD

- **State**: `/finalise` may have written part of `dod.N.md` or partially updated task/story `Status:`.
- **Hook**: same as above — report committed, signal sent.
- **Resume**: artifact verification requires `dod.N.md` to exist *and* status to read `accepted` (canonical lowercase per finalise schema) *and* PR acceptance comment posted — all three. Anything less → Step 7 re-runs. `/finalise` overwrites cleanly.

### Summary

| Pipeline state at compaction | Hook action | Resume cleanliness |
|------------------------------|-------------|--------------------|
| Phase 0–Step 1 | Noop (no lock) | Manual via post-compaction recovery |
| Between sub-skills | Full pause sequence | ✅ In-progress step re-runs |
| Mid-`/develop` | Commits report; code untouched | ✅ Resumes from current task/story state |
| Mid-`/qa-task` or `/qa-fix` | Commits report | ✅ Partial gate fails verification, cycle re-runs |
| Mid-`/finalise` | Commits report | ✅ Partial DoD fails verification, Step 7 re-runs |

## Re-run-safety contract for sub-skills

Pipeline guarantees rest on the implementation report + lock file `current_step` together describing pipeline state precisely enough that resume always succeeds. Sub-skill *internal* partial state is ignored — sub-skills must be re-run-safe.

Authors of sub-skills invoked by `/develop-task` or `/develop-story` should ensure their skill:

1. **Detects prior partial work** before doing anything destructive. Read the current task/story `Status:` and existing artifacts in the task/story directory.
2. **Skips or overwrites cleanly** when invoked twice with the same inputs. No "double-applied" side effects.
3. **Writes artifacts atomically when possible** — partial writes are tolerable only if the artifact-verification table in `develop-{task,story}` SKILL.md rejects the partial state and forces a re-run.
4. **Does not depend on transient orchestrator memory.** Anything it needs to know on the second run must be persisted to disk (the report, the task/story file, or its own artifact files).

If a new sub-skill is added to the pipeline, verify it against this contract before merging — otherwise resume after a pause may corrupt or duplicate work.

## Verification checklist (when changing the hook or lock format)

End-to-end test on a real task or story:

1. Start `/develop-task <path>` on a small task. Confirm `.claude/state/develop-pipeline.lock` appears at end of Step 1.
2. Mid-pipeline, manually invoke `/compact`. Confirm:
   - Report has a new "Paused — Context Compaction" entry.
   - `git log -1` shows the pause commit; remote reflects it.
   - PR has a "⏸️ Pipeline paused" comment.
   - GitHub issue (or Jira via MCP after agent processes signal) has matching comment.
   - Agent outputs the pause banner + summary and halts.
3. Re-invoke `/develop-task <same-path>`. Choose "Resume from last completed step". Confirm:
   - Lock file is recreated.
   - Resume artifact verification skips completed steps.
   - The `⏸️ Paused` step re-runs.
   - Pipeline completes through Step 8 normally.

Hook unit-test (no agent involved):
- Create a fake lock file in a scratch repo, run the hook directly. Confirm: report appended, commit made, JSON emitted to stdout.
- Delete lock file, run the hook. Confirm: empty `additionalContext`, no side effects, exit 0.
