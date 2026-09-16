---
name: sync-github-bug
description: Sync a local bug report markdown file to GitHub Issues — creates the bug issue if it has no github_issue, updates it if github_issue is already set. Handles all three bug modes (story bug, task bug, general bug), inferred from the file's own path. Links the bug as a sub-issue of its parent story or task issue when that parent has one; a general bug is anchored to the bug registry and to nothing else. Adds the issue to the project board and mirrors the priority label onto the board's Priority field. Closes/reopens the issue based on the bug's lifecycle status. Reads bug files with or without YAML frontmatter, and prepends a minimal block to those without one. Writes Status History rows — never a Change Log, which bug reports are barred from carrying — on issue creation and status transition only. GitHub-only sibling of sync-jira-bug. Use when the user says "create this bug in GitHub", "sync bug to GitHub", "push bug changes to GitHub", or "publish bug to GitHub".
---

# sync-github-bug

## Purpose

One-way sync of a local bug report to GitHub Issues. Auto-detects create vs update from `github_issue`.

| `github_issue` present? | Action |
| --- | --- |
| Absent / null | **Pre-flight dedup search by bug id**, then **Create** if no match, linking the issue as a sub-issue of its parent's issue when there is one. Writes `github_issue` back to the file. |
| Present | **Update** the existing issue (title, body, labels), reconcile open/closed state with the bug's lifecycle status. A Status History row is written only if the status transitioned. |

**Difference from `sync-github-task`:** a bug is not standalone. It hangs off a story, a task, or the bug registry, and on GitHub that relationship is a real **sub-issue link**. It also carries `## Status History` in place of `## Change Log`, and it must read files that have no frontmatter at all.

**Difference from `sync-jira-bug`:** the parent relationship is a **sub-issue**, not a sibling with an issue link. GitHub sub-issues carry no type constraint, so a bug nests under its parent directly; Jira would have to switch the Bug to a sub-task type to do the same, which differs per board and would cost the bug its own backlog placement and transitions. Same intent, different mechanism, because the platforms differ.

## When to Use

- "Create this bug in GitHub"
- "Sync / push / update this bug to GitHub"
- "Publish this bug report to GitHub"
- From `develop-bug` Step 1, via the `ensure-bug-github-issue` sub-routine.

## When NOT to Use

- The document is a story, task or epic → use the matching `/sync-github-{story,task,epic}`.
- Project tracks via Jira → use `/sync-jira-bug`.

## Prerequisites

### Required Files

A bug report in one of the three documented layouts:

```
docs/prd/<...>/story.{e}.{s}.bug.{n}.{name}.md          # story bug
docs/tasks/task.{id}.{name}/task.{id}.bug.{n}.{name}.md # task bug
docs/bugs/bug.{N}.{name}/bug.{N}.{name}.md              # general bug
```

Plus `project.yml` at the repo root with `github.owner`, `github.repo`, `github.project_board_name`, `github.project_board_number`.

### Required Tools

`gh` CLI authenticated (`gh auth status` returns OK).

## Workflow

### 1. Identify the Bug File

To find bugs that have **not yet been synced**:

```bash
grep -rL 'github_issue:' $(find docs -name '*bug*.md' -not -name '*.review.*' \
  -not -name '*.qa.*' -not -name '*.dod.*' -not -name '*.implementation.*' \
  -not -name 'bug-registry.md')
```

### 2. Source the Platform Resolver and Confirm GitHub

```bash
source references/resolve-platform.sh || exit 1
# Expect TRACKER=github. If TRACKER=jira, abort and tell the user to run /sync-jira-bug.
```

### 3. Read the Bug Document

A bug report comes in two shapes and both must be read: YAML frontmatter, or a `**Bug ID**:` header block with no frontmatter at all. Do not re-derive the rules — the Jira path and this path must not be able to disagree about which story a bug belongs to:

```bash
BUG_JSON=$(node references/bug-doc.js --file "$BUG_FILE_PATH")
```

The JSON carries `mode`, `bug_id`, `parent_doc`, `parent_github_issue`, `has_frontmatter`, `github_issue`, the merged `fields`, and any `warnings`. Surface the warnings — a `related:` value disagreeing with the path means one of the two is wrong — but do not halt on them.

`mode: unknown` means the filename matches none of the documented patterns. Abort with the three patterns named; a bug whose mode cannot be determined would be linked to the wrong parent.

### 4. Branch: Create vs Update

#### 4a. Create Path (`github_issue` absent or null)

Invoke the `ensure-bug-github-issue` sub-routine with `BUG_FILE_PATH={resolved path}`. The sub-routine:

- reads both file shapes and infers the mode,
- runs a dedup-by-bug-id search and adopts any single match,
- creates the issue if no match,
- links it as a sub-issue of the parent's issue when the parent has one,
- adds it to the Project board and mirrors the Priority field,
- writes `github_issue` back — prepending a minimal frontmatter block first when the file has none,
- inserts the `**GitHub**` body cross-reference,
- writes the creation row into `## Status History`.

On return, `BUG_ISSUE_NUM` is set (integer) or empty — on failure **or when the create was deferred** by a restricted `access.tracker`.

> **When `BUG_ISSUE_NUM` is empty, stop here.** Do not write a Status History row and do not continue to Step 5. The row would read `GitHub issue created (#)` and assert a create that did not happen — the same false-success this sequence exists to remove. Report the deferral instead; the handover checklist carries the action, and the second run converges once the number is in the frontmatter.

Continue to Step 5 (status reconciliation).

#### 4b. Update Path (`github_issue` present)

```bash
ISSUE_NUM={github_issue from the bug document}
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')

DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef -q '.defaultBranchRef.name' 2>/dev/null || echo develop)
DOC_BRANCH=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null | sed 's|^[^/]*/||')
DOC_URL="https://github.com/$REPO/blob/${DOC_BRANCH:-$DEFAULT_BRANCH}/${BUG_RELATIVE_PATH}"

gh issue view ${ISSUE_NUM} --json state,title,labels,body > /tmp/issue-${ISSUE_NUM}.json \
  || { echo "⚠️ GitHub issue #${ISSUE_NUM} not found — aborting update"; exit 1; }
```

Diff `title`, `body` and `labels` against current GitHub state. The body is rebuilt to the **same shape** `ensure-bug-github-issue` emits on create — Summary, Reproduction, Impact when present, Metadata, Source Documents — so create→update is diff-stable. That shape and its caps are specified once, in [`references/tracker-card-summary.md`](./references/tracker-card-summary.md); follow it there rather than restating it here. `## Evidence` is deliberately excluded on both paths.

The Source Documents links use `DOC_URL` above, so re-syncing from a feature branch refreshes them to that branch. At acceptance, `finalise` re-points them to the durable integration branch so the closed issue doesn't link to a deleted feature branch.

If anything changed:

```bash
mkdir -p .claude/state
printf '%s' "$NEW_BODY" > .claude/state/issue-body.md

node references/tracker-issue.js --kind edit --issue ${ISSUE_NUM} \
  --title "[${BUG_ID}] ${BUG_TITLE}" \
  --body-file .claude/state/issue-body.md \
  --add-label "priority:${PRIORITY}" \
  --add-label "severity:${SEVERITY}" \
  --remove-label "$OLD_PRIORITY_LABEL_IF_DIFFERENT"
```

**Always `--body-file`, never an inline `--body`** — a bug report's reproduction steps and expected/actual values are exactly the text most likely to contain backticks and `$(…)`.

Re-attempt the sub-issue link on every update, not only on create: a bug is frequently filed before its parent has an issue, and the link API is idempotent, so a re-sync is how the link eventually lands.

```bash
[ -n "${PARENT_ISSUE_NUM}" ] && node references/tracker-issue.js --kind sub-issue-link \
  --issue "${ISSUE_NUM}" --parent "${PARENT_ISSUE_NUM}" || true
```

If the priority label changed, re-mirror the board's Priority field:

```bash
bash references/set-github-project-priority.sh "${ISSUE_NUM}" "${PRIORITY}" || true
```

Skip-when-no-diff: if title, body and labels are all identical to the remote state, skip `--kind edit`, write no Status History row, and proceed to Step 5.

### 5. Status Reconciliation (open vs closed)

The bug lifecycle is **not** the document lifecycle. Map it directly:

| Bug status | GitHub state |
| --- | --- |
| `new`, `in-progress`, `ready-for-qa`, `reopened` | `open` |
| `closed` | `closed` |

```bash
DESIRED=open  # or closed, per the map above
CURRENT=$(gh issue view ${BUG_ISSUE_NUM} --json state -q '.state' | tr '[:upper:]' '[:lower:]')

if [ "$CURRENT" != "$DESIRED" ]; then
  if [ "$DESIRED" = "closed" ]; then
    node references/tracker-issue.js --kind close --issue ${BUG_ISSUE_NUM} --reason completed
  else
    node references/tracker-issue.js --kind reopen --issue ${BUG_ISSUE_NUM}
  fi
fi
```

A `reopened` bug reopening a closed issue is the expected direction of travel here, not an anomaly.

### 6. Report to User

- ✅ Bug mode and id (e.g. `story bug — story.7.4.bug.4`)
- ✅ GitHub issue number and URL
- ✅ Parent document, and parent issue if the sub-issue link landed
- ✅ Added to project board + Priority field mirrored
- ✅ State reconciled (`open` / `closed`)
- ✅ Status History row appended (or `no-diff, skipped`)
- ✅ Whether frontmatter was adopted

## Status History

**Bug reports carry no Change Log.** `## Status History` is the bug-type equivalent and is richer — it has a `Status` column, which is what a bug's history is actually about. The exclusion is stated in [`references/document-change-log.md`](./references/document-change-log.md) §Exclusions and in `docs/standards/bug-documents.md`. Do not reach for `change-log.js` with `docType: "bug"`: it has no `bug` anchor and would silently append the one table the standard forbids. The engine is [`references/status-history.js`](./references/status-history.js).

**A row is written for exactly two events:**

| Event | Row |
| --- | --- |
| Issue created | `\| 2026-09-07 \| new \| sync-github-bug \| GitHub issue created (#204) \|` |
| Status transition driven from the bug's lifecycle | `\| 2026-09-07 \| closed \| sync-github-bug \| GitHub issue closed \|` |

The `Status` cell is the bug's **current lifecycle status**, not a board column name — the two are separate vocabularies.

**A title, body or label update writes no row.** GitHub keeps its own issue history with actor and timestamp, and the document records *why* the body changed through its own review and fix-cycle sections. A sync that changes nothing writes nothing at all.

## Frontmatter Fields Written

```yaml
github_issue: 42
```

The full URL is reconstructable from `project.yml` (`owner` + `repo`) and the issue number, so no `github_url` field is persisted.

A file that has no frontmatter gets a minimal block prepended first, seeded from its `**Bug ID**:` header block, with the body left verbatim below it. Without that there is nowhere for `github_issue` to live: an in-place frontmatter write on such a file is a silent no-op, so the issue would be created and the number never persisted — and the next run would create a duplicate unless the dedup search rescued it. `review-bug` flags a bold-line header with no YAML block as **Critical**, so adoption clears an existing finding.

## Error Handling

| Error | Resolution |
| --- | --- |
| `TRACKER != github` | Abort with `Run /sync-jira-bug instead.` |
| `gh auth status` fails | Abort with instruction to run `gh auth login` |
| `project.yml` missing or malformed | Abort with diagnostic |
| Filename matches no bug pattern | Abort, naming the three patterns |
| `related:` disagrees with the path | Warn; the path wins. Fix whichever is wrong. |
| Parent document not found | Warn; the issue is created unlinked |
| Parent has no `github_issue` | Info; created unlinked, link lands on a re-sync |
| Issue referenced by `github_issue` no longer exists | Abort update; reconcile manually |
| Sub-issue link fails | Warn and continue |
| Project board add / Priority mirror fails | Warn and continue |

## Notes

- GitHub Issues is a **read-only mirror** — edit the bug file and re-sync; do not edit the issue directly. This skill does not detect or guard against concurrent remote edits.
- Status reconciliation is **lossy** going GitHub → markdown: `closed` does not say whether the bug was fixed or abandoned. The document is authoritative.
- A general bug is anchored to the bug registry and to nothing else — that is what "cross-cutting, no single owner" means. Giving it a parent would be inventing one.
- For bulk re-sync: iterate over the find in Step 1 and invoke once per file.
