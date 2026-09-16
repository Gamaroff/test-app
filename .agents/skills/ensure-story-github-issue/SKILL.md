---
name: ensure-story-github-issue
description: Internal sub-routine called from create-story and review-story. Given a story markdown file path and (optionally) a parent epic GitHub issue number, ensures the story has a corresponding GitHub issue. Creates the issue if missing, adds it to the project board, links it as a sub-issue of the parent epic, sets the board Priority field, and writes github_issue to the story frontmatter. Returns STORY_ISSUE_NUM (integer or empty on failure). GitHub-only sibling of sync-jira-story (which handles the Jira path). Callers branch on TRACKER (set by references/resolve-platform.sh) to pick the right sub-routine.
type: internal
---

# Ensure Story GitHub Issue — Sub-Routine

## Purpose

This is an **internal sub-routine** called by `create-story` and `review-story`. Do not invoke directly.

**Inputs (set by the calling skill before invoking):**
- `STORY_FILE_PATH` — repo-relative path to the story markdown file (e.g. `${PRD_ROOT}/onboarding/epics/epic.1.first-task-in-10-minutes/stories/story.1.1.first-task-in-10-minutes/story.1.1.first-task-in-10-minutes.md`; `${PRD_ROOT}` defaults to `docs/prd`)
- `EPIC_ISSUE_NUM` — parent epic GitHub issue number (integer string, or empty if no parent epic issue exists)

**Output (set by this sub-routine, available to the calling skill):**
- `STORY_ISSUE_NUM` — the GitHub issue number for the story (integer string), or empty string on failure

---

## Steps

### Step S1: Read Story Frontmatter

1. Read the file at `STORY_FILE_PATH`.
2. Parse the YAML frontmatter block (between `---` delimiters). Extract:
   - `github_issue` — current value (may be absent or null)
   - `title` — story title
   - `status` — story status
   - `priority` — story priority (lowercase; default `medium` if absent)
   - `estimated_effort_hours` — story effort estimate in hours (number; absent/empty if not set)
3. Parse the epic and story numbers from the filename: pattern `story.{E}.{S}.` → `STORY_E`, `STORY_S`.
4. Strip any leading `Story {E}.{S}: ` prefix (or an already-bracketed `[Story {E}.{S}] ` prefix) from `title` to get the bare title for display: `STORY_TITLE`. Stripping both forms prevents a double prefix like `[Story 1.3] Story 1.3: …` — local story titles are now authored in bracket form, so the bracket case is the common one.
5. Set `STORY_RELATIVE_PATH` = the path relative to the repo root.
6. Derive the parent epic title from the grandparent directory. `EPIC_DIR=$(dirname "$(dirname "$(dirname "$STORY_FILE_PATH")")")`. Read `${EPIC_DIR}/$(basename "$EPIC_DIR").md` and pull `title` from its frontmatter. Strip any leading `Epic {E}: ` prefix (or an already-bracketed `[Epic {E}] ` prefix) → `EPIC_TITLE`. On failure, set `EPIC_TITLE=""`.

### Step S2: Check if Story Issue Already Exists

If `github_issue` is a positive integer in the frontmatter:
- Set `STORY_ISSUE_NUM={github_issue value}`.
- **Return immediately** — nothing to do (idempotent).

If `github_issue` is absent, null, or empty:
- Continue to Step S3.

### Step S3: Dedup Search — Look for Pre-Existing Story Issue

Before creating, search for an issue with a matching title:

```bash
DEDUP=$(gh issue list --search "in:title \"[Story ${STORY_E}.${STORY_S}]\"" --state all \
  --json number,url,state,title 2>/dev/null)
```

Behaviour:
- **Search failure** (non-zero exit) → log `⚠️ GitHub dedup search failed — proceeding to create` and continue to Step S4.
- **Exactly one match** → adopt it:
  - Extract `N` (issue number) and `url`.
  - Set `STORY_ISSUE_NUM=$N`.
  - If state is `CLOSED`: log `⚠️ Linked existing CLOSED story issue #${N} — verify intent before continuing.`
  - Log `Linked existing story issue #${N} (skipped create)`.
  - Skip to Step S6 (write frontmatter + body link). Do **not** re-link as sub-issue (existing issue is assumed already linked to its parent epic).
- **Zero matches** → continue to Step S4.
- **Multiple matches** → log `⚠️ Dedup: {N} matches found for "[Story ${STORY_E}.${STORY_S}]": #n1, #n2, … — proceeding to create` and continue to Step S4.

### Step S4: Create the Story GitHub Issue

Read `project.yml` from the repo root:

```bash
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
OWNER=$(grep '^ *owner:' project.yml | head -1 | awk '{print $2}')
PROJECT_NUM=$(grep 'project_board_number:' project.yml | awk '{print $2}')
PROJECT_NAME=$(grep 'project_board_name:' project.yml | sed -E 's/.*: *"?([^"]+)"?/\1/')
MILESTONE_TITLE="Epic ${STORY_E} — ${EPIC_TITLE}"
# Prefer the current branch's remote-tracking branch (strip the remote prefix),
# so the link points at the branch where the work lives. Fall back to the repo's
# default branch when there is no upstream / HEAD is detached, then to `develop`.
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef -q '.defaultBranchRef.name' 2>/dev/null || echo develop)
DOC_BRANCH=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null | sed 's|^[^/]*/||')
DOC_URL="https://github.com/$REPO/blob/${DOC_BRANCH:-$DEFAULT_BRANCH}/${STORY_RELATIVE_PATH}"
```

Auto-create the milestone if it doesn't exist yet:

```bash
node references/tracker-issue.js \
  --kind milestone --title "${MILESTONE_TITLE}" --quiet 2>/dev/null || true
```

The CLI is resolve-or-create: an existing title is reused and reported as
`already`, so this is safe to run on every pass. Under a deferring access mode it
records the create and prints nothing — see [`references/tracker-issue-cli.md`](./references/tracker-issue-cli.md).

Create the story issue.

The body is a **summary**, not a copy of the story file — the caps below are the
contract in [`references/tracker-card-summary.md`](./references/tracker-card-summary.md),
which is also what the Jira path enforces in code. Read it before changing this
template. Anything trimmed must be announced with an accurate count; a reader who
is not told they are seeing part of something believes they saw all of it.

Write the body to a file first. **Always `--body-file`, never an inline `--body`**:
the body carries backticks, `$(…)` and newlines, and an inline `--body` is a
shell injection waiting for the first story whose acceptance criteria contain one.
The file is also what carries the body into the deferred record's `command.stdin`.

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

{First 2-4 sentences from the story's User Story / Story / Story Statement — or its Description if it has none}

## Acceptance Criteria

{The first 5 acceptance criteria as a GitHub checkbox list. If more remain, add a
final line: '+N more in the [story document](${DOC_URL})' with N the exact number
omitted. If 5 or fewer, list them all and add no such line.}

## Metadata

| Field | Value |
|-------|-------|
| Priority | ${priority} |
| Effort | ${estimated_effort_hours:-—}h |

## Document

📄 [Story Document](${DOC_URL})
📁 \`${STORY_RELATIVE_PATH}\`
EOF

STORY_ISSUE_NUM=$(node references/tracker-issue.js \
  --kind create \
  --title "[Story ${STORY_E}.${STORY_S}] ${STORY_TITLE}" \
  --body-file .claude/state/issue-body.md \
  --label "story" \
  --label "priority:${priority}" \
  --milestone "${MILESTONE_TITLE}")
```

The CLI prints the issue **number** — the old `grep -oE '[0-9]+$'` on the URL is
gone from this and five other blocks, because the CLI does it once.

**On an empty `STORY_ISSUE_NUM`** — whether the create failed or was **deferred**:

- Log: `⚠️ No GitHub issue number for story — proceeding without story issue linkage`
- Leave `STORY_ISSUE_NUM=""`
- **Do not write a placeholder into frontmatter.** Not `0`, not `<pending>`. Step
  S6 below simply does not run. A wrong key is worse than no key: it defeats the
  idempotent search that stops the *next* run creating a duplicate issue, so a
  placeholder converts a recoverable state into a permanent one.
- **Return to the calling skill** — do NOT halt the calling skill.

Under a deferring access mode this is the **two-run convergence**: the run records
the create as `blocking`, the checklist opens with a banner saying so, and the
operator creates the issue, writes the number into the story's frontmatter, and
re-runs. The second run finds `github_issue` present and takes the update path.
That path already exists — see Step S2, which skips to S6 when the field is set.

### Step S5: Add to Project Board, Set Priority, Link as Sub-Issue

**Add to GitHub Project board:**

```bash
source references/resolve-platform.sh || exit 1
tracker_write gh project item-add ${PROJECT_NUM} --owner ${OWNER} \
  --url "https://github.com/${OWNER}/$(gh repo view --json name -q '.name')/issues/${STORY_ISSUE_NUM}" 2>/dev/null || true
```

`tracker_write` infers `github.board.item-add` from the argv, so a restricted run
records the board add rather than performing it.

**Mirror the priority label onto the board's Priority single-select field:**

```bash
bash references/set-github-project-priority.sh "${STORY_ISSUE_NUM}" "${priority}" || true
```

**Mirror the estimate onto the board's Estimate number field** (no-op if frontmatter has no estimate):

```bash
bash references/set-github-project-estimate.sh "${STORY_ISSUE_NUM}" "${estimated_effort_hours}" || true
```

**Link story as sub-issue of parent epic** (only if `EPIC_ISSUE_NUM` is non-empty):

The GitHub sub-issues API needs the child's **internal database id**, which a
preceding `gh api` call must fetch — a fetch-then-mutate pair. The CLI performs
both, and under a deferring mode records them as **one** composite record:

```bash
if [ -n "${EPIC_ISSUE_NUM}" ] && [ -n "${STORY_ISSUE_NUM}" ]; then
  node references/tracker-issue.js \
    --kind sub-issue-link \
    --issue "${STORY_ISSUE_NUM}" \
    --parent "${EPIC_ISSUE_NUM}" \
    && echo "✅ Story #${STORY_ISSUE_NUM} linked as sub-issue of Epic #${EPIC_ISSUE_NUM}." \
    || echo "⚠️ Sub-issue linking failed — story issue created but not hierarchically linked."
fi
```

**One record, not two, and that is deliberate.** Emitting the fetch and the mutate
separately would produce two checklist items neither of which a human can perform
alone: the fetch changes nothing, and the mutate has no id to send. The record's
`manual` path routes around the internal id entirely, because the GitHub UI takes
the visible issue number.

The `[ -n "${STORY_ISSUE_NUM}" ]` guard is what makes this safe after a deferred
create — with no issue number there is nothing to link, and the link is recorded
on the second run alongside everything else.

All three operations are non-blocking — log warnings on failure, continue.

### Step S6: Write `github_issue` to Story Frontmatter and Insert Body Link

> **Skip this entire step when `STORY_ISSUE_NUM` is empty.** That is the state
> after a failed *or deferred* create, and there is nothing to write. Writing a
> placeholder instead — `0`, `<pending>`, an empty value — is specifically
> forbidden: the next run's idempotent lookup keys off this field, so a wrong
> value makes it create a **second** issue rather than finding the first. No
> value at all is what lets the second run converge.

Write `github_issue: {STORY_ISSUE_NUM}` to the story file's YAML frontmatter:
- Locate the closing `---` of the frontmatter block.
- Append `github_issue: {STORY_ISSUE_NUM}` as the last field before the closing `---`.
- Do not modify anything outside the frontmatter block.

Add or repair the body cross-reference link in the Story Information table (or under the first heading if no such table exists):

```markdown
| GitHub Issue | [#{STORY_ISSUE_NUM}](https://github.com/{OWNER}/{REPO_NAME}/issues/{STORY_ISSUE_NUM}) |
```

On frontmatter write failure: log `⚠️ Could not persist github_issue to story frontmatter — story issue #{STORY_ISSUE_NUM} was created but not written back` and continue.

### Step S7: Return to Calling Skill

`STORY_ISSUE_NUM` is now set and available to the calling skill.
