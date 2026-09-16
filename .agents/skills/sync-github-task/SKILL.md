---
name: sync-github-task
description: Sync a local technical task markdown file to GitHub Issues — creates the task issue if it has no github_issue, updates it if github_issue is already set. Standalone task — NOT linked to a parent epic issue (milestone carries the relationship if any). Adds the issue to the project board and mirrors the priority label onto the board's Priority field. Closes/reopens the issue based on frontmatter status. Writes a Change Log row on issue creation and on status transition only (not on body updates). GitHub-only sibling of sync-jira-task. Use when the user says "create this task in GitHub", "sync task to GitHub", "push task changes to GitHub", or "publish task to GitHub".
---

# sync-github-task

## Purpose

One-way sync of a local technical task markdown file to GitHub Issues. Auto-detects create vs update from `github_issue` in frontmatter.

| `github_issue` present? | Action |
|---|---|
| Absent / null | **Pre-flight dedup search by title**, then **Create** (no parent linkage; milestone resolved from frontmatter / epic-registry / standalone default) if no match. Writes `github_issue` back to file. |
| Present | **Update** existing GitHub issue (title, body, labels, milestone), reconcile open/closed state with frontmatter `status`. A Change Log row is written only if the status transitioned. |

**Difference from `sync-github-story`:** tasks are **standalone** — no parent epic issue lookup, no sub-issue linking. Milestone is the only relationship to a higher-level work item, mirroring `sync-jira-task`'s "no jira_epic" stance.

## When to Use

- "Create this task in GitHub"
- "Sync / push / update this task to GitHub"
- "I've edited the task, push changes to GitHub"
- "Publish this task file to GitHub"

## When NOT to Use

- Task is actually a user-facing story → use `/sync-github-story` instead.
- Project tracks via Jira → use `/sync-jira-task`.

## Prerequisites

### Required Files

- A task markdown file at `docs/tasks/task.<N>.<slug>/task.<N>.<slug>.md`.
- `project.yml` at the repo root with `github.owner`, `github.repo`, `github.project_board_name`, `github.project_board_number`.

### Required Tools

- `gh` CLI authenticated (`gh auth status` returns OK).

## Workflow

### 1. Identify the Task File

```
docs/tasks/task.<N>.<slug>/task.<N>.<slug>.md
```

To find tasks that have **not yet been synced** (no `github_issue`):

```bash
grep -L 'github_issue:' $(find docs/tasks -name 'task.*.md' \
  -not -name '*.plan.*' -not -name '*.qa.*' -not -name '*.bug.*' -not -name '*.implementation.*')
```

### 2. Source the Platform Resolver and Confirm GitHub

```bash
source references/resolve-platform.sh || exit 1
# Expect TRACKER=github. If TRACKER=jira, abort and tell the user to run /sync-jira-task.
```

### 3. Read Task Frontmatter

Extract from frontmatter: `title`, `status`, `priority`, `github_issue` (if present), `milestone`, `epic`, `category`, `estimated_effort_hours`, `depends_on`, `labels`.

Parse the task id from the filename: `task.{N}.` → `TASK_N`.

Strip any leading `Task {N}: ` prefix (or an already-bracketed `[Task {N}] ` prefix) from `title` to get the bare display title: `TASK_TITLE`. The update path (Step 4b) wraps this once as `[Task {N}] ${TASK_TITLE}`; stripping first prevents a double prefix like `[Task 5] Task 5: …`.

### 4. Branch: Create vs Update

#### 4a. Create Path (`github_issue` absent or null)

Invoke the `ensure-task-github-issue` sub-routine with `TASK_FILE_PATH={resolved task file path}`. The sub-routine:

- runs a dedup-by-title search and adopts any single match,
- resolves the milestone (frontmatter `milestone:` → epic-registry lookup → `"Technical Tasks (standalone)"`),
- creates the issue if no match,
- adds it to the Project board, mirrors the Priority field,
- writes `github_issue: {N}` into the task frontmatter,
- inserts/repairs the body cross-reference link.

On return, `TASK_ISSUE_NUM` is set (integer) or empty — on failure **or when the create was
deferred** by a restricted `access.tracker`.

> **When `TASK_ISSUE_NUM` is empty, stop here.** Do not append the Change Log row below and
> do not continue to Step 5. The row would read `Initial GitHub issue created (#)`
> and assert a create that did not happen — the same false-success this sequence
> exists to remove. Report the deferral instead; the handover checklist carries the
> action, and the second run converges once the key is in the frontmatter.

Otherwise append a Change Log row to the task markdown:

```markdown
| YYYY-MM-DD HH:MM | Initial GitHub issue created (#{TASK_ISSUE_NUM}) |
```

Continue to Step 5 (status reconciliation).

#### 4b. Update Path (`github_issue` present)

```bash
ISSUE_NUM={github_issue from frontmatter}
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')

# Resolve the Document-link branch the same way as on create: current branch's
# remote-tracking branch, falling back to the repo default branch, then `develop`.
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef -q '.defaultBranchRef.name' 2>/dev/null || echo develop)
DOC_BRANCH=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null | sed 's|^[^/]*/||')
DOC_URL="https://github.com/$REPO/blob/${DOC_BRANCH:-$DEFAULT_BRANCH}/${TASK_RELATIVE_PATH}"

# Verify the issue still exists
gh issue view ${ISSUE_NUM} --json state,title,labels,body,milestone > /tmp/issue-${ISSUE_NUM}.json \
  || { echo "⚠️ GitHub issue #${ISSUE_NUM} not found — aborting update"; exit 1; }
```

Diff `title`, `body`, `labels`, `milestone` against current GitHub state. The body is rebuilt to the **same shape** `ensure-task-github-issue` emits on create — Summary, Success Criteria (capped at 5), Breaking Changes when present, Metadata, Document — so create→update is diff-stable. That shape and its caps are specified once, in [`references/tracker-card-summary.md`](./references/tracker-card-summary.md); follow it there rather than restating it here. The `## Document` link uses `DOC_URL` above, so re-syncing from a feature branch refreshes the link to that branch. At acceptance, `finalise` re-points the link to the durable integration branch so the closed issue doesn't link to a deleted feature branch.

If anything changed, run:

```bash
mkdir -p .claude/state
printf '%s' "$NEW_BODY" > .claude/state/issue-body.md

node references/tracker-issue.js --kind edit --issue ${ISSUE_NUM} \
  --title "[Task ${TASK_N}] ${TASK_TITLE}" \
  --body-file .claude/state/issue-body.md \
  --milestone "${MILESTONE_TITLE}" \
  --add-label "priority:${priority}" \
  --remove-label "$OLD_PRIORITY_LABEL_IF_DIFFERENT"
```

If the priority label changed, also re-mirror the board's Priority field:

```bash
bash references/set-github-project-priority.sh "${ISSUE_NUM}" "${priority}" || true
```

Always re-mirror the board's Estimate field from frontmatter (no-op if `estimated_effort_hours` is empty):

```bash
bash references/set-github-project-estimate.sh "${ISSUE_NUM}" "${estimated_effort_hours}" || true
```

Append a Change Log row describing what changed:

```markdown
| YYYY-MM-DD HH:MM | Updated: title, body, milestone, priority |
```

Skip-when-no-diff: if title, body, labels, and milestone are all identical to the remote state, skip `gh issue edit`, write no Change Log row, and proceed to Step 5.

### 5. Status Reconciliation (open vs closed)

Map frontmatter `status` to GitHub state:

| Frontmatter status | GitHub state |
|---|---|
| `draft`, `planned`, `ready-for-development`, `in-progress`, `ready-for-review` | `open` |
| `accepted`, `done`, `complete`, `completed`, `cancelled` | `closed` |

```bash
DESIRED=open  # or closed, per the map above
CURRENT=$(gh issue view ${TASK_ISSUE_NUM} --json state -q '.state' | tr '[:upper:]' '[:lower:]')

if [ "$CURRENT" != "$DESIRED" ]; then
  if [ "$DESIRED" = "closed" ]; then
    REASON=completed
    [ "$STATUS" = "cancelled" ] && REASON=not_planned
    node references/tracker-issue.js --kind close --issue ${TASK_ISSUE_NUM} --reason ${REASON}
  else
    node references/tracker-issue.js --kind reopen --issue ${TASK_ISSUE_NUM}
  fi
fi
```

### 6. Report to User

- ✅ GitHub issue number (e.g. `#42`)
- ✅ Issue URL
- ✅ Standalone (no parent epic issue)
- ✅ Milestone (e.g. `Technical Tasks (standalone)` or `Epic 5 — Cache Refactor`)
- ✅ Added to project board + Priority field mirrored
- ✅ State reconciled (`open` / `closed`)
- ✅ Change log entry appended (or `no-diff, skipped`)
- ✅ Task frontmatter updated (on create only)

## Change Log

The format is not restated here — it is defined once in
[document-change-log.md](references/document-change-log.md). Markers are
`<!-- change-log-start -->` / `<!-- change-log-end -->`; a document still carrying
the superseded `<!-- github-sync-changelog-* -->` pair is migrated in place on the
first sync that writes for another reason. A document synced to both trackers had
grown two blocks under two marker pairs; they collapse into one, rows preserved in
date order.

**A row is written for exactly two events:**

| Event | Row |
| --- | --- |
| Issue created | `\| 2026-08-12 \|  \| GitHub issue created (#204) \| sync-github-task \|` |
| Status transition driven from frontmatter | `\| 2026-08-12 \|  \| Status → in-progress \| sync-github-task \|` |

**A title, body, label or milestone update writes no row.** GitHub keeps its own
issue history with actor and timestamp, and the document records *why* the body
changed through its own review, develop and QA rows.

A sync that changes nothing writes nothing at all — no row, and no marker
migration. Migration rides along with a row write and must never be performed as a
standalone edit, or every sync rewrites every document.

## Frontmatter Fields Written

After sync the skill writes (in-place, preserving order):

```yaml
github_issue: 42
```

The full URL is reconstructable from `project.yml` (`owner` + `repo`) and the issue number, so no `github_url` field is persisted.

## Error Handling

| Error | Resolution |
|---|---|
| `TRACKER != github` | Abort with `Run /sync-jira-task instead.` |
| `gh auth status` fails | Abort with instruction to run `gh auth login` |
| `project.yml` missing or malformed | Abort with diagnostic |
| Issue referenced by `github_issue` no longer exists | Abort update; user must reconcile manually |
| Milestone lookup fails (e.g. `epic:` field set but no matching epic-registry row) | Falls through to `"Technical Tasks (standalone)"` and logs a warning |
| Project board add fails | Warn and continue |
| Priority field mirror fails | Warn and continue |

## Notes

- Tasks are deliberately **standalone** in this skill, matching `sync-jira-task`. If you need parent linkage, the milestone carries the relationship.
- GitHub Issues is treated as a **read-only mirror** — edit the task file and re-sync; do not edit the issue directly. The skill does not detect or guard against concurrent remote edits.
- Status reconciliation is **lossy** going GitHub → markdown: `closed` only tells us the issue is done, not which terminal status (`accepted` vs `cancelled`) the task is in. Frontmatter is authoritative.
- For bulk re-sync: iterate over `find docs/tasks -name 'task.*.md'` (filtered as in Step 1) and invoke the skill once per file.
