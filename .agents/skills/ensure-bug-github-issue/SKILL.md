---
name: ensure-bug-github-issue
description: Internal sub-routine called from develop-bug and review-bug. Given a bug report markdown file path, ensures the bug has a corresponding GitHub issue. Infers the bug mode (story / task / general) from the file's own path, creates the issue if missing, links it as a sub-issue of its parent story or task issue when that parent has one, adds it to the project board, mirrors the Priority field, and writes github_issue back — prepending a minimal frontmatter block first when the file has none. Returns BUG_ISSUE_NUM (integer or empty on failure). GitHub-only sibling of ensure-bug-jira-issue. Callers branch on TRACKER (set by references/resolve-platform.sh) to pick the right sub-routine.
type: internal
---

# Ensure Bug GitHub Issue — Sub-Routine

## Purpose

This is an **internal sub-routine** called by `develop-bug` and `review-bug`. Do not invoke directly.

**Inputs (set by the calling skill before invoking):**

- `BUG_FILE_PATH` — repo-relative path to the bug report

**Output (set by this sub-routine, available to the calling skill):**

- `BUG_ISSUE_NUM` — the GitHub issue number for the bug (integer string), or empty string on failure

---

## Steps

### Step B1: Read the Bug Document

A bug report comes in two shapes and **both must be read**: YAML frontmatter, or a `**Bug ID**:` / `**Related**:` / `**Status**: 🆕 New` header block with no frontmatter at all. Roughly half the bug documents in a mature repo are the second kind. Do not treat a missing frontmatter block as an error.

Do not re-derive the rules here — the Jira path and this path must not be able to disagree about which story a bug belongs to:

```bash
BUG_JSON=$(node references/bug-doc.js --file "$BUG_FILE_PATH")
```

The JSON carries everything this sub-routine needs:

| Key | Use |
| --- | --- |
| `mode` | `story` \| `task` \| `general` — drives the parent relationship |
| `bug_id` | `story.7.4.bug.4` \| `task.67.bug.3` \| `bug.12` — the title prefix |
| `parent_doc` | the parent story/task document, or the bug registry |
| `parent_github_issue` | the parent's issue number, when it has one |
| `has_frontmatter` | whether Step B7 must prepend a block first |
| `github_issue` | the bug's existing issue number, if any |
| `fields` | `status`, `severity`, `priority`, `created`, `related` — merged across both shapes |
| `warnings` | mode/`related:` disagreements — surface these, do not halt on them |

Set `BUG_RELATIVE_PATH` = the path relative to the repo root.

If `mode` is `unknown` the filename matches none of the documented patterns. Log a warning naming the three patterns, set `BUG_ISSUE_NUM=""` and return — a bug whose mode cannot be determined would be linked to the wrong parent, and a wrong parent link is worse than no issue.

### Step B2: Check if the Bug Issue Already Exists

If `github_issue` is a positive integer:

- Set `BUG_ISSUE_NUM={github_issue}`.
- **Return immediately** — nothing to do (idempotent).

Otherwise continue to Step B3.

### Step B3: Resolve the Parent Issue

- `mode: story` or `task` → `PARENT_ISSUE_NUM = parent_github_issue` from the JSON.
- `mode: general` → no parent. A cross-cutting bug is anchored to the bug registry and to nothing else; giving it a parent would be inventing one.

**Never create the parent's issue here.** If `parent_github_issue` is empty, log `ℹ️ Parent {mode} has no GitHub issue yet — creating the bug issue unlinked. Sync the parent, then re-run to add the sub-issue link.` and continue with `PARENT_ISSUE_NUM=""`. Creating an issue as a side effect of syncing a different document is how orphan issues appear.

### Step B4: Dedup Search — Look for a Pre-Existing Bug Issue

```bash
DEDUP=$(gh issue list --search "in:title \"[${BUG_ID}]\"" --state all \
  --json number,url,state,title 2>/dev/null)
```

The search term is the **bug id**, which is unique across the repo — `[story.7.4.bug.4]`, not `[Bug 4]`. A bare bug number repeats in every story and would adopt the wrong issue.

- **Search failure** → log `⚠️ GitHub dedup search failed — proceeding to create` and continue to Step B5.
- **Exactly one match** → adopt it: set `BUG_ISSUE_NUM=$N`; if state is `CLOSED` log `⚠️ Linked existing CLOSED bug issue #${N} — verify intent before continuing.`; skip to Step B6.
- **Zero matches** → continue to Step B5.
- **Multiple matches** → log `⚠️ Dedup: {N} matches for "[${BUG_ID}]": #n1, #n2, … — proceeding to create` and continue to Step B5.

### Step B5: Create the Bug GitHub Issue

```bash
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
OWNER=$(grep '^ *owner:' project.yml | head -1 | awk '{print $2}')
REPO_NAME=$(gh repo view --json name -q '.name')
PROJECT_NUM=$(grep 'project_board_number:' project.yml | awk '{print $2}')
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef -q '.defaultBranchRef.name' 2>/dev/null || echo develop)
DOC_BRANCH=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null | sed 's|^[^/]*/||')
BASE="https://github.com/$REPO/blob/${DOC_BRANCH:-$DEFAULT_BRANCH}"
DOC_URL="${BASE}/${BUG_RELATIVE_PATH}"
PARENT_DOC_URL="${BASE}/${PARENT_RELATIVE_PATH}"   # from parent_doc, when present
```

The body is a **summary**, not a copy of the bug file — the caps are the contract in [`references/tracker-card-summary.md`](./references/tracker-card-summary.md), which is also what the Jira path enforces in code. Read it before changing this template. Anything trimmed must be announced with an accurate count.

`## Evidence` is deliberately **not** carried onto the issue: screenshots, log dumps and stack traces are the largest part of a bug report and the fastest to go stale, and the issue is a pointer at the document.

Write the body to a file first. **Always `--body-file`, never an inline `--body`**: a bug report's reproduction steps and expected/actual values are exactly the text most likely to contain backticks, `$(…)` and newlines, and an inline `--body` is a shell injection waiting for the first one.

> **The heredoc below is unquoted, and that is a real residual risk — not a solved problem.** `<<EOF` still performs command substitution, so a `$(…)` or a backticked span in the document's own text is executed while the body is being written. `--body-file` removes the *argv* injection surface, which is the larger one; it does not remove this. A bug report quoting a failing shell command is a realistic instance, so where the source text is untrusted, write the file with the editor tool instead of a heredoc. `<<'EOF'` is not the fix — it would also stop the `${…}` values below from being substituted.

```bash
mkdir -p .claude/state
cat > .claude/state/issue-body.md <<EOF
## Summary

{First paragraph of the bug's Bug Description section — up to 4 sentences}

## Reproduction

{The first 5 reproduction steps as an ordered list. If more remain, add a final
line: '+N more in the [bug report](${DOC_URL})' with N the exact number omitted.}

## Impact

{The first 5 items from whichever of '## Scope & Impact' (general),
'## Acceptance Criteria Violation' (story) or '## Success Criteria Violation'
(task) the document carries. OMIT THIS HEADING ENTIRELY when none is present.}

## Metadata

| Field | Value |
|-------|-------|
| Severity | ${SEVERITY} |
| Priority | ${PRIORITY} |
| Status | ${BUG_STATUS} |
| Created | ${CREATED} |
| Related | ${RELATED} |

## Source Documents

📄 [Bug report](${DOC_URL})
{story/task modes: 📄 [Parent \${MODE} document](\${PARENT_DOC_URL})}
{when PARENT_ISSUE_NUM is set: 🎫 Parent issue #\${PARENT_ISSUE_NUM}}
{general mode: 📄 [Bug registry](\${BASE}/docs/bugs/bug-registry.md)}
📁 \`${BUG_RELATIVE_PATH}\`
EOF

BUG_ISSUE_NUM=$(node references/tracker-issue.js \
  --kind create \
  --title "[${BUG_ID}] ${BUG_TITLE}" \
  --body-file .claude/state/issue-body.md \
  --label "bug" \
  --label "priority:${PRIORITY}" \
  --label "severity:${SEVERITY}")
```

The CLI prints the issue **number**.

**On an empty `BUG_ISSUE_NUM`** — whether the create failed or was **deferred**:

- Log: `⚠️ No GitHub issue number for bug — proceeding without bug issue linkage`
- Leave `BUG_ISSUE_NUM=""`
- **Do not write a placeholder into frontmatter.** Not `0`, not `<pending>`. Step B7 simply does not run. A wrong value is worse than no value: it defeats the idempotent dedup search in Step B4 that stops the *next* run creating a duplicate issue, so a placeholder converts a recoverable state into a permanent one.
- **Return to the calling skill** — do NOT halt it.

Under a deferring access mode this is the **two-run convergence**: the run records the create as `blocking`, the checklist opens with a banner saying so, and the operator creates the issue, writes the number into the bug's frontmatter, and re-runs.

### Step B6: Link as a Sub-Issue, Add to the Board, Mirror Priority

**GitHub takes the stronger relationship its API actually supports.** A GitHub sub-issue has no type constraint — an issue may be a sub-issue of any other issue — so a bug nests under its parent story or task directly. This is deliberately *not* what the Jira path does: Jira would have to switch the Bug to a sub-task type to achieve the same nesting, which differs per board and would cost the bug its own backlog placement and transitions, so the Jira card stays a sibling carrying an issue link. Same intent, different mechanism, because the platforms differ.

```bash
source references/resolve-platform.sh || exit 1

# Sub-issue link — story and task modes only, and only when the parent has an issue.
if [ -n "${PARENT_ISSUE_NUM}" ]; then
  node references/tracker-issue.js --kind sub-issue-link \
    --issue "${BUG_ISSUE_NUM}" --parent "${PARENT_ISSUE_NUM}" || true
fi

tracker_write gh project item-add ${PROJECT_NUM} --owner ${OWNER} \
  --url "https://github.com/${OWNER}/${REPO_NAME}/issues/${BUG_ISSUE_NUM}" 2>/dev/null || true
bash references/set-github-project-priority.sh "${BUG_ISSUE_NUM}" "${PRIORITY}" || true
```

`tracker_write` infers `github.board.item-add` from the argv, so a restricted run records the board add rather than performing it. Skip this step entirely when `BUG_ISSUE_NUM` is empty — there is no issue to add. All three operations are non-blocking: log warnings on failure, continue.

### Step B7: Write `github_issue` Back and Insert the Body Link

> **Skip this entire step when `BUG_ISSUE_NUM` is empty.** That is the state after a failed *or deferred* create, and there is nothing to write. Writing a placeholder instead — `0`, `<pending>`, an empty value — is specifically forbidden: Step B4's dedup search keys off this field, so a wrong value makes the next run create a **second** issue rather than finding the first.

**If `has_frontmatter` is false, prepend a minimal frontmatter block first.** Without it there is nowhere for `github_issue` to live: an in-place frontmatter write on a file that does not open with `---` is a silent no-op, so the issue would be created and the number never persisted — and the next run would create a duplicate unless the dedup search rescued it.

Seed the block from the header block's own values, and leave the body verbatim below it:

```yaml
---
type: bug
status: {fields.status}
severity: {fields.severity}
priority: {fields.priority}
created: {fields.created}
related: {fields.related}
---
```

`review-bug` flags a bold-line header with no YAML block as **Critical**, so this clears an existing finding rather than creating one.

Then write `github_issue: {BUG_ISSUE_NUM}` as the last field before the closing `---`. Do not modify anything outside the frontmatter block.

Add or repair the body cross-reference line in the header block:

```markdown
**GitHub**: [#{BUG_ISSUE_NUM}](https://github.com/{OWNER}/{REPO_NAME}/issues/{BUG_ISSUE_NUM})
```

On frontmatter write failure: log `⚠️ Could not persist github_issue to bug frontmatter — issue #{BUG_ISSUE_NUM} was created but not written back` and continue.

### Step B8: Record the Moment in Status History

**Bug reports carry no Change Log.** `## Status History` is the bug-type equivalent and is richer — it has a `Status` column, which is what a bug's history is actually about. The exclusion is stated in [`references/document-change-log.md`](./references/document-change-log.md) §Exclusions. Do not reach for `change-log.js` with `docType: "bug"`: it has no `bug` anchor and would silently append the one table the standard forbids.

Write the creation row through the engine, on **create only** — an adopted or already-present issue is not a new event:

```bash
node references/status-history.js --file "$BUG_FILE_PATH" \
  --date "$(date +%F)" \
  --status "${BUG_STATUS}" \
  --changed-by "ensure-bug-github-issue" \
  --notes "GitHub issue created (#${BUG_ISSUE_NUM})"
```

The `Status` cell is the bug's **current lifecycle status**, not a board column name. The two are separate vocabularies and conflating them is the mistake this column invites.

### Step B9: Return to Calling Skill

`BUG_ISSUE_NUM` is now set and available to the calling skill.

---

## Failure Handling Summary

All failures are **non-blocking**.

| Scenario | Log level | BUG_ISSUE_NUM returned |
| --- | --- | --- |
| Bug file not found | Warning | `""` |
| Filename matches no bug pattern | Warning | `""` |
| `github_issue` already present | — | `{github_issue}` |
| Dedup found exactly one match | Info | the adopted number |
| Parent has no issue yet | Info | the new number — unlinked, link lands on re-run |
| Create failed or deferred | Warning / Info | `""` — never a placeholder |
| Sub-issue link failed | Warning | the new number |
| Board add / Priority mirror failed | Warning | the new number |
