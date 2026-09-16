---
name: ensure-epic-github-issue
description: Internal sub-routine called from create-story and review-story. Given an epic markdown file path, ensures the epic has a corresponding GitHub issue. Creates the issue if missing, adds it to the project board, and writes github_issue to the epic frontmatter. Returns EPIC_ISSUE_NUM (integer or empty on failure). GitHub-only sibling of ensure-epic-jira-issue. Callers branch on TRACKER (set by references/resolve-platform.sh) to pick the right sub-routine.
type: internal
---

# Ensure Epic GitHub Issue — Sub-Routine

## Purpose

This is an **internal sub-routine** called by `create-story` and `review-story`. Do not invoke directly.

**Inputs (set by the calling skill before invoking):**
- `EPIC_FILE_PATH` — repo-relative path to the epic markdown file (e.g. `${PRD_ROOT}/service-domain/account/epics/epic.163.module-security/epic.163.module-security.md`; `${PRD_ROOT}` defaults to `docs/prd`)

**Output (set by this sub-routine, available to the calling skill):**
- `EPIC_ISSUE_NUM` — the GitHub issue number for the epic (integer string), or empty string on failure

---

## Steps

### Step E1: Read Epic Frontmatter

1. Read the file at `EPIC_FILE_PATH`.
2. Parse the YAML frontmatter block (between `---` delimiters). Extract:
   - `github_issue` — current value (may be absent or null)
   - `title` — epic title
   - `status` — epic status
   - `priority` — epic priority (use `—` if absent)
   - `prd_source` — repo-relative path to the parent PRD (may be absent, or the literal `brownfield-enhancement` for standalone epics)
3. Parse the epic number from the filename: pattern `epic.{N}.` → `EPIC_N`.
4. Strip any leading `Epic {N}: ` prefix (or an already-bracketed `[Epic {N}] ` prefix) from `title` to get the bare title for display: `EPIC_TITLE`. (Stripping both forms prevents a double prefix like `[Epic 1] Epic 1: …`.)
5. Set `EPIC_RELATIVE_PATH` = the path relative to the repo root.

### Step E2: Check if Epic Issue Already Exists

If `github_issue` is a positive integer in the frontmatter:
- Set `EPIC_ISSUE_NUM={github_issue value}`.
- **Return immediately** — nothing to do (idempotent).

If `github_issue` is absent, null, or empty:
- Continue to Step E3.

### Step E3: Create the Epic GitHub Issue

Read `project.yml` from the repo root:

```bash
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
OWNER=$(grep '^ *owner:' project.yml | head -1 | awk '{print $2}')
PROJECT_NUM=$(grep 'project_board_number:' project.yml | awk '{print $2}')
MILESTONE_TITLE="Epic ${EPIC_N} — ${EPIC_TITLE}"
# Prefer the current branch's remote-tracking branch (strip the remote prefix),
# so the link points at the branch where the work lives. Fall back to the repo's
# default branch when there is no upstream / HEAD is detached, then to `develop`.
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef -q '.defaultBranchRef.name' 2>/dev/null || echo develop)
DOC_BRANCH=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null | sed 's|^[^/]*/||')
DOC_URL="https://github.com/$REPO/blob/${DOC_BRANCH:-$DEFAULT_BRANCH}/${EPIC_RELATIVE_PATH}"

# Resolve the parent PRD link the same way (skip the placeholder/standalone sentinel).
# PRD_LINE is empty for standalone epics, so the Document section simply omits the line.
PRD_RELATIVE_PATH="${prd_source from frontmatter}"
PRD_LINE=""
if [ -n "$PRD_RELATIVE_PATH" ] && [ "$PRD_RELATIVE_PATH" != "brownfield-enhancement" ]; then
  PRD_URL="https://github.com/$REPO/blob/${DOC_BRANCH:-$DEFAULT_BRANCH}/${PRD_RELATIVE_PATH}"
  PRD_LINE=$'\n'"📋 [Parent PRD](${PRD_URL})"
fi
```

Auto-create the milestone if it doesn't exist yet:

```bash
node references/tracker-issue.js \
  --kind milestone --title "${MILESTONE_TITLE}" --quiet 2>/dev/null || true
```

The CLI is resolve-or-create: an existing title is reused and reported as
`already`, so this is safe to run on every pass. Under a deferring access mode it
records the create and prints nothing — see [`references/tracker-issue-cli.md`](./references/tracker-issue-cli.md).

Create the epic issue.

The body is a **summary**, not a copy of the epic file — the contract is
[`references/tracker-card-summary.md`](./references/tracker-card-summary.md),
which is also what the Jira path enforces in code. Read it before changing this
template.

Write the body to a file first. **Always `--body-file`, never an inline `--body`**:
the body carries backticks, `$(…)` and newlines, and an inline `--body` is a
shell injection waiting for the first epic whose description contains one. The
file is also what carries the body into the deferred record's `command.stdin`.

> **The heredoc below is unquoted, and that is a real residual risk — not a
> solved problem.** `<<EOF` still performs command substitution, so a `$(…)` or a
> backticked span in the document's own text is executed while the body is being
> written. `--body-file` removes the *argv* injection surface, which is the larger
> one; it does not remove this. Where the source text is untrusted, write the file
> with the editor tool instead of a heredoc. `<<'EOF'` is not the fix here — it
> would also stop the `${…}` values below from being substituted, which the body
> needs.

```bash
mkdir -p .claude/state
cat > .claude/state/issue-body.md <<EOF
## Summary

{First paragraph of the epic's Epic Goal — or its Epic Description if it has no goal — capped at 4 sentences}

## Metadata

| Field | Value |
|-------|-------|
| Status | ${EPIC_STATUS} |
| Priority | ${EPIC_PRIORITY} |

## Document

📄 [Epic Document](${DOC_URL})
📁 \`${EPIC_RELATIVE_PATH}\`${PRD_LINE}
EOF

EPIC_ISSUE_NUM=$(node references/tracker-issue.js \
  --kind create \
  --title "[Epic ${EPIC_N}] ${EPIC_TITLE}" \
  --body-file .claude/state/issue-body.md \
  --label "epic" \
  --milestone "${MILESTONE_TITLE}")
```

The CLI prints the issue **number** — the old `grep -oE '[0-9]+$'` on the URL is
gone, because the CLI does it once for every call site.

**On an empty `EPIC_ISSUE_NUM`** — whether the create failed or was **deferred**:
- Log: `⚠️ No GitHub issue number for epic — proceeding without epic issue linkage`
- Leave `EPIC_ISSUE_NUM=""`
- **Do not write a placeholder into frontmatter.** Not `0`, not `<pending>`. The
  frontmatter write in Step E4 simply does not run. A wrong key is worse than no
  key: it defeats the idempotent lookup that stops the *next* run creating a
  duplicate issue, so a placeholder converts a recoverable state into a permanent
  one — and because stories link to their epic by this number, a wrong one
  mis-parents every story in the epic.
- **Return to the calling skill** — do NOT halt the calling skill.

Under a deferring access mode this is the **two-run convergence**: the run records
the create as `blocking`, the checklist opens with a banner saying so, and the
operator creates the issue, writes the number into the epic's frontmatter, and
re-runs. The second run finds `github_issue` present and takes the update path.

### Step E4: Add to Project Board and Update Epic Frontmatter

Add the epic issue to the GitHub Project board:

```bash
source references/resolve-platform.sh || exit 1
tracker_write gh project item-add ${PROJECT_NUM} --owner ${OWNER} \
  --url "https://github.com/${OWNER}/$(gh repo view --json name -q '.name')/issues/${EPIC_ISSUE_NUM}" 2>/dev/null || true
```

`tracker_write` infers `github.board.item-add` from the argv, so a restricted run
records the board add rather than performing it.

Failure here is non-blocking — log a warning and continue.

> **Skip the frontmatter write below when `EPIC_ISSUE_NUM` is empty**, and skip
> the board add above too — there is no issue to add or to record. Writing a
> placeholder is specifically forbidden; see the create step.

Write `github_issue: {EPIC_ISSUE_NUM}` to the epic file's YAML frontmatter:
- Locate the closing `---` of the frontmatter block.
- Append `github_issue: {EPIC_ISSUE_NUM}` as the last field before the closing `---`.
- Do not modify anything outside the frontmatter block.

On frontmatter write failure: log `⚠️ Could not persist github_issue to epic frontmatter — epic issue #{EPIC_ISSUE_NUM} was created but not written back` and continue.

### Step E5: Return to Calling Skill

`EPIC_ISSUE_NUM` is now set and available to the calling skill.
