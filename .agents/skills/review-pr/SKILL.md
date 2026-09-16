---
name: review-pr
description: 'Reviews a pull request as a claim — does this change deliver what its story or task promised, and is the evidence behind it real? Resolves the PR back to its work item (branch stem, pr_number, gate URL, tracker issue), collects the co-located pipeline artifacts (implementation report, review report, QA reports, gate, DoD, sprint-review, bugs, handover), pulls the linked GitHub issue or Jira card, then runs two read-only lenses over the PR diff: the shared adversarial code reviewer and a conformance reviewer checking coverage, scope, trail and consistency. Works on GitHub and Bitbucket. Advisory — writes a co-located report and optionally posts one summary PR comment; never approves, never writes a gate, never edits code. Triggers: review this PR, review pull request 123, does this PR match the task, /review-pr.'
---

> **Platform detection**: see [`references/platform-detection.md`](references/platform-detection.md) and [`references/resolve-platform.sh`](references/resolve-platform.sh)

# Review PR

## Overview

`/review-pr` reviews a pull request **as a claim**: *this PR says it implements task 65 — does it, and is the evidence there?*

It is the missing third member of a family. `/review-task` and `/review-story` review a document **before** implementation. `/review-code` reviews a **diff** in isolation. Neither asks whether the change on the branch actually delivers what the work item promised, or whether the paper trail the pipeline left behind it is complete and honest.

Two read-only lenses run over the same scoped diff:

- **Code** — [`references/code-review-prompt.md`](references/code-review-prompt.md), passed verbatim. The same reviewer `/review-code`, `/qa-story` and `/qa-task` dispatch.
- **Conformance** — [`references/pr-conformance-prompt.md`](references/pr-conformance-prompt.md). New here: coverage, scope, trail, consistency.

A PR can be flawless code that implements the wrong thing, or correct work whose gate never reached `PASS`. Neither lens sees the other's failures, which is why both run.

**The skill is advisory.** It writes a co-located report and optionally posts one summary PR comment. It never submits a formal approve/request-changes review, never writes a gate `.yml` (only `qa-*` skills do that), and never edits code.

## When to Use This Skill

- "Review this PR" / "review pull request 123" / "review PR 281"
- "Does this PR actually match the task?" / "is the evidence there for this PR?"
- Reviewing someone else's pipeline-produced PR before merging it
- Auditing a merged PR after the fact — the trail is still on disk

Do **not** use this for a pure diff review with no work item — use `/review-code`. Do **not** use it *as* a QA gate — it writes no gate file; `/qa-story` and `/qa-task` do. (The develop pipelines run it at **Step 5c**, inside their QA loop, and act on its verdict themselves — that is consultation, not gating. See *Relationship to the develop pipelines*.)

## Arguments

Invoke as `/review-pr [target] [--effort LEVEL] [--comment] [--inline] [--no-code] [--no-docs]`.

| Arg | Values | Default | Meaning |
| --- | --- | --- | --- |
| `target` | _(none)_ \| `<PR-number>` \| `<PR-URL>` \| `<branch>` | open PR for the current branch | Which PR to review |
| `--effort` | `low` \| `medium` \| `high` \| `max` | `medium` | Breadth vs. precision, for **both** lenses |
| `--comment` | flag | off | Post one summary comment to the PR |
| `--inline` | flag | off | Additionally post each finding as an inline comment on its own line. Implies `--comment` |
| `--no-code` | flag | off | Skip the code lens |
| `--no-docs` | flag | off | Skip the conformance lens |

**Effort** scales coverage, never the output contract — the YAML shape is identical at every level:

- `low` / `medium` — few, high-confidence findings (favour precision).
- `high` / `max` — broader coverage; may surface `confidence: low` candidates, clearly labelled.

Posting is outward-facing: **ask before posting** unless `--comment` was passed explicitly.

## Workflow

### Step 0 — Resolve platform and access

```bash
source references/resolve-platform.sh || exit 1
# TRACKER = jira | github ; VCS = github | bitbucket
PLATFORM="$VCS"

REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ "$PLATFORM" = "bitbucket" ]; then
  BB_PATH=$(echo "$REMOTE_URL" | sed -E 's|.*bitbucket\.org[:/]||; s|\.git$||')
  BB_WORKSPACE=$(echo "$BB_PATH" | cut -d'/' -f1)
  BB_REPO=$(echo "$BB_PATH" | cut -d'/' -f2)
  BB_API="https://api.bitbucket.org/2.0"
  source references/bitbucket-auth.sh || exit 1

  AUTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "${BB_CURL_AUTH[@]}" \
    "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}")
  [ "$AUTH_CHECK" != "200" ] && \
    echo "Error: Bitbucket auth failed (HTTP $AUTH_CHECK — 404 means the credential was not accepted)" && exit 1
fi
```

The `|| exit 1` on both `source` lines is load-bearing: a bare `source` prints the validation error and then continues with an unvalidated value.

**Branch on `$VCS` for everything PR-shaped, on `$TRACKER` for everything issue-shaped.** They are separate axes — a repo can host code on Bitbucket and track work in Jira, or on Bitbucket with GitHub issues.

Verify Bitbucket auth **by status code**, never by the length of a returned list: Bitbucket answers an unauthenticated request to a private repo with **404, not 401**, so a bad credential reads exactly like an empty repository.

### Step 0b — Parse `target`

Bind the variables Step 1 uses. Without this, `$PR` and `$BRANCH` are undefined and every form of
`target` except "no argument" has no path into the commands below.

```bash
BRANCH=$(git branch --show-current)
PR=""
case "${TARGET:-}" in
  "")                      ;;                                   # no arg → PR for $BRANCH
  # GitHub /pull/N, Bitbucket web /pull-requests/N, Bitbucket API /pullrequests/N.
  # The web form is the one a human pastes; omitting it sent Bitbucket URLs to the
  # branch arm below.
  *://*/pull/*|*://*/pull-requests/*|*://*/pullrequests/*) PR="${TARGET##*/}" ;;
  *[!0-9]*)                BRANCH="$TARGET" ;;                  # anything non-numeric → a branch
  *)                       PR="$TARGET" ;;                      # all digits → a PR number
esac
```

### Step 1 — Resolve the PR

**GitHub** (`VCS=github`):

```bash
# "${PR:-$BRANCH}", never "${PR:-}". An EMPTY argument makes `gh pr view` resolve the
# CURRENT branch's PR, so `/review-pr some-other-branch` would silently review the wrong
# PR instead of erroring. Verified: `gh pr view "" --json number` returns the current
# branch's PR number.
gh pr view "${PR:-$BRANCH}" --json number,url,title,body,state,isDraft,headRefName,baseRefName,\
author,additions,deletions,changedFiles,files,reviewDecision,statusCheckRollup,headRepositoryOwner
```

**Bitbucket** (`VCS=bitbucket`) — by id, or by source branch:

```bash
curl -sf "${BB_CURL_AUTH[@]}" "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests/${PR}"

ENCODED_BRANCH=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$BRANCH")
curl -sf "${BB_CURL_AUTH[@]}" \
  "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests?q=source.branch.name%3D%22${ENCODED_BRANCH}%22+AND+state%3D%22OPEN%22"
```

Bind `PR_NUMBER`, `PR_URL`, `PR_TITLE`, `PR_BODY`, `HEAD_BRANCH`, `BASE_BRANCH`, `PR_STATE`.

No PR resolves → **HALT**: `"No pull request found for {target}. Open one with /create-pr, or pass a PR number."`

### Step 2 — Resolve the work item

A first-hit-wins cascade. Record which rung matched as `resolved_via` and print it in the report — provenance is what lets a human catch a wrong anchor.

| # | Rung | Mechanism |
| --- | --- | --- |
| 1 | **branch stem** | strip `feature/` \| `bugfix/` \| `hotfix/` → `STEM` → `find docs -type f -path "*/${STEM}/${STEM}.md"`, else `find docs -type f -name "${STEM}.md"` |
| 2 | `pr_number` | `grep -rlE "^pr_number:[[:space:]]*${PR_NUMBER}[[:space:]]*$" docs/` |
| 3 | gate `pr:` | `grep -rl --include='*.gate.*.yml' -- "$PR_URL" docs/` → its sibling work item |
| 4 | tracker issue | PR body `#{N}` **or** `[A-Z]+-[0-9]+` → `github_issue:` / `jira_key:` frontmatter grep |
| 5 | Explore | bounded read-only subagent fallback |
| 6 | none | degrade to a **code-only** review, stated loudly |

> **Two shell traps this table deliberately avoids.** `docs/**/…` needs `shopt -s globstar`, which is
> off by default — without it bash expands `**` as a single level and the gate glob matches **nothing**,
> silently. And an unanchored `pr_number: ${PR_NUMBER}` is a prefix match: reviewing PR 28 would resolve
> to a document whose frontmatter reads `pr_number: 281`, anchoring the entire review on the wrong work
> item. Both fail quietly, which is the worst shape for a resolver whose job is to be right about
> *which document this is*.

Rung 1 handles `task.{N}.*`, `story.{E}.{S}.*`, `epic.{N}.*` and `bug.{N}.*`. Rungs 4–5 reuse the cascade already documented in [`references/develop-pipeline-step-0-resolve-and-prepare.md`](references/develop-pipeline-step-0-resolve-and-prepare.md) § 0a — do not reinvent it.

**Rung 4 must match both shapes.** A Bitbucket PR description carries `PROJ-123`, never `#{N}`; matching only the GitHub shape makes this rung dead on exactly the Bitbucket + Jira combination the skill exists to support.

**Exclusion filter** — find the work item, not its artifacts. Exclude any filename containing:

```
.qa.  .gate.  .bug.  .implementation.  .review.  .dod.  .plan.  .handover.  .pr-review.
```

Story documents are **not** in `docs/stories/`. They nest under `${PRD_ROOT}/{domain}/{feature}/epics/epic.{N}.{name}/stories/story.{E}.{S}.{name}/`. Glob across `docs/`; never assume one root.

### Step 3 — Collect the paper trail

```bash
D=$(dirname "$DOC_FILE")

# `find`, NOT a multi-glob `ls`. Under zsh — the macOS default shell — a glob that
# matches nothing aborts the ENTIRE command ("no matches found"), so one absent
# artifact kind silently suppresses every kind that IS present. Verified: a task
# directory with no *.bug.*.md returned 0 files under zsh and 7 under bash.
# A trail check that reports a complete trail as absent is the worst failure this
# skill can have, and it fails on the default shell.
for pat in '*.implementation.*.md' '*.qa.*.md' '*.gate.*.yml' '*.dod.*.md' \
           '*sprint-review-summary.md' '*.bug.*.md' '*.handover.*.md'; do
  find "$D" -maxdepth 1 -name "$pat" 2>/dev/null
done

# Review reports, EXCLUDING this skill's own prior output.
# `*.review.*.md` also matches `*.pr-review.*.md` — without the filter a
# re-review collects its own previous report as the pre-implementation review.
find "$D" -maxdepth 1 -name '*.review.*.md' 2>/dev/null | grep -v '\.pr-review\.'

# This skill's own prior reports, for the {n} increment in Step 7.
find "$D" -maxdepth 1 -name '*.pr-review.*.md' 2>/dev/null
```

> **Every shell snippet in this skill must behave identically under bash and zsh.** macOS defaults to
> zsh; a snippet that only works under bash fails for most users, and unmatched globs fail *silently*
> in the direction of "nothing is there".

**Glob on the artifact segment; never reconstruct an exact filename.** The trailing slug is free descriptive text — `task.53.implementation.1.jira-rest-interception-initial-run.md` does not repeat the work-item slug. The sprint-review file is unprefixed in task directories and prefixed in some story directories, so glob `*sprint-review-summary.md`.

Read the **highest-numbered** gate for `gate:`, `quality_score`, `top_issues`, `waiver`; the DoD header block; and the implementation report's Pipeline Progress table. The same verification predicates the pipeline uses to confirm a completed run apply here: a gate
that reads `PASS` or `WAIVED`, a DoD file present once the document says `accepted`. (In this
repo they are written up in `docs/reference/pipeline-artifacts.md`; that is a repo document, not
a bundled skill reference, so it is named rather than linked.)

### Step 3b — Tracker context (read-only, non-blocking)

| `TRACKER` | Call |
| --- | --- |
| `github` | `gh issue view "$N" --json title,state,labels,milestone` |
| `jira` | `GET ${JIRA_URL}/rest/api/2/issue/{jira_key}?fields=summary,status,issuetype,priority`, Basic auth (`JIRA_USER_EMAIL`:`JIRA_API_TOKEN`, base64) |

Only `status`/`state` and the title are consumed — enough to check the tracker agrees with the document and the PR. The Atlassian MCP `getJiraIssue` is the fallback when no credential resolves. Any failure here is logged and non-blocking; the review continues without tracker context.

### Step 4 — Build the diff

Git is the common denominator, so **one path serves both platforms** — no host API needed:

```bash
DIFF_FILE="$(mktemp -t review-pr.XXXXXX.patch)"   # scratch, never the repo
if git fetch -q origin "$BASE_BRANCH" "$HEAD_BRANCH" 2>/dev/null \
   && git diff "origin/$BASE_BRANCH...origin/$HEAD_BRANCH" > "$DIFF_FILE" \
   && [ -s "$DIFF_FILE" ]; then
  : # git path succeeded
else
  USE_API_DIFF=1                                   # fall through to the API fallback below
fi
```

**Check the exit status.** A merged PR normally has its head branch deleted, so `git fetch` fails and
the diff comes back empty — which an unchecked path reports as "no changes to review". That silently
breaks the *"audit a merged PR after the fact"* case this skill explicitly supports.

**Cross-fork PRs**: `origin/$HEAD_BRANCH` also does not exist when the head is a fork branch. Detect that up front (`headRepositoryOwner` ≠ the base repo owner) and set `USE_API_DIFF=1` without attempting the fetch at all. Either route — cross-fork, or any fetch/diff failure above — lands here:

```bash
gh pr diff "$PR_NUMBER" > "$DIFF_FILE"                                          # GitHub

# -L is required: the Bitbucket /diff endpoint REDIRECTS to the rendered diff, and
# `curl -sf` without it exits 0 having written an empty file — on exactly the merged
# and cross-fork paths this fallback exists to serve.
curl -sfL "${BB_CURL_AUTH[@]}" \
  "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests/${PR_NUMBER}/diff" > "$DIFF_FILE"   # Bitbucket

[ -s "$DIFF_FILE" ] || { echo "Diff fallback produced an empty patch — cannot review."; exit 1; }
```

**Exclude auto-generated files before dispatching.** A skill change carries its bundled
`references/` copies — byte-identical to `shared/resources/` and headed `AUTO-GENERATED — DO NOT
EDIT`. On this repo's own PR they were 30 of 55 files and ~23,000 of 24,253 lines. Reviewing them is
pure noise and crowds out real findings:

```bash
git diff "origin/$BASE_BRANCH...origin/$HEAD_BRANCH" -- . ':(exclude)*/references/*' > "$DIFF_FILE"
```

Widen the exclusion to whatever the repo generates (lockfiles, `dist/`, snapshots). State in the
report which paths were excluded, so the review's scope is auditable.

Empty diff → say so and stop.

### Step 5 — Dispatch both lenses in parallel

One message, two `Agent` calls, both `subagent_type="Explore"`, both read-only. Never read the raw diff into main context.

**Lens A — code** (skip under `--no-code`): pass the **Prompt Template** from [`references/code-review-prompt.md`](references/code-review-prompt.md) verbatim, substituting `<DIFF_FILE>` and `<WORKING_DIR>`. Do not paraphrase it inline — it is shared with `/qa-story` and `/qa-task`, and paraphrasing forks it. Returns `code_review:`.

**Lens B — conformance** (skip under `--no-docs`): pass the **Prompt Template** from [`references/pr-conformance-prompt.md`](references/pr-conformance-prompt.md) verbatim, substituting `<DOC_FILE>`, `<ARTIFACTS>`, `<DIFF_FILE>`, `<TRACKER_SNAPSHOT>`, `<PR_STATE>` and `<WORKING_DIR>`. Returns `pr_conformance:`.

Fold the resolved `--effort` into both dispatches. Parse both blocks; do not invent or augment findings.

The caller resolves the work item and artifact list **before** dispatching and passes them in. Lens B never runs the cascade itself — a subagent that chose its own anchor could silently review against the wrong document, with no provenance to catch it.

### Step 6 — Render findings and compute the verdict

The two schemas are deliberately parallel (`id` / `category` / `severity` / `confidence` / `finding` / `suggested_action`), so one rendering path serves both:

```
[PC-1] coverage · high · confidence: high — AC-3
  what is wrong
  → suggested action

[CR-1] bug · high · confidence: high — src/x/y.ts:42
  what is wrong
  → suggested action
```

Conformance findings first (they judge whether the change is the right change), then code findings. Within each, sort by severity. If `truncated_count > 0`, note the omitted count.

**The location field is the one place the two schemas are *not* parallel, and it must be normalised.**
The list above omits it, which is exactly how the discrepancy stays invisible: `pr_conformance` emits
**`ref:`** (a criterion id, artifact path, frontmatter field, or `path:line`), while `code_review`
emits **`file_line:`** (always `path:line`). Both render into the same trailing `— {ref}` position
above, and both are written as **`ref`** in the structured block Step 7 emits — a `CR-*` entry's `ref`
is its subagent `file_line` verbatim.

Carrying `file_line` through for code findings would re-create, one layer down, the very
parse-by-position problem the structured block exists to remove: a consumer would again have to test
which key is present before it could read a location.

**Deterministic verdict — advisory only:**

| Condition | Verdict |
| --- | --- |
| any finding with `severity: high` **and** `confidence: high` | 🚨 **REQUEST CHANGES** |
| any remaining finding with `severity: high` **or** `severity: medium` (at any confidence) | ⚠️ **CONCERNS** |
| otherwise (only `severity: low` findings, or none) | ✅ **APPROVE** |

**Name the field in every row.** An earlier draft's middle row read only "any `medium`", which left a
`severity: high` + `confidence: medium` bug matching no row at all — and falling through to APPROVE.
A verdict table that silently approves a high-severity finding is worse than no table.

**This table is normative.** `pr-conformance-prompt.md` points here rather than restating it — two
copies of a decision table drift, and a verdict rule that differs between two files in the same change
means "follows the deterministic table exactly" has no single table to follow.

Never call `gh pr review --approve`. Never write a gate `.yml`.

### Step 7 — Write the review report

Co-located with the work item, using the `.pr-review.{n}.` artifact kind:

```
docs/tasks/task.65.registry-aware-selection/task.65.pr-review.1.registry-aware-selection.md
{story-dir}/story.2.1.pr-review.1.capture-prd-as-worked-example.md
```

`{n}` starts at 1 and increments on re-review — the convention `finalise` uses for `.dod.{n}.`.

**No work item resolved → write no file.** Render the code findings to the terminal and say plainly that the review is unanchored. Report artifacts are co-located with the work item that led to the PR; with nothing to co-locate against there is no sanctioned location, and inventing one would add a directory no standard names.

ALWAYS use this exact template structure:

````markdown
# PR Review Report: PR #{number} — {title}

**Reviewed:** {YYYY-MM-DD}
**PR:** [#{number}]({url}) — `{head}` → `{base}` ({state})
**Work item:** [`{doc filename}`]({relative path}) — resolved via `{resolved_via}`
**Tracker:** [{issue ref}]({issue url}) — {state}
**Verdict:** {✅ APPROVE | ⚠️ CONCERNS | 🚨 REQUEST CHANGES}

---

## Artifact Trail

| Artifact | Status | Detail |
|---|---|---|
| Implementation report | ✅ / ❌ | {filename} |
| Review report | ✅ / ❌ | {filename} |
| QA reports | {n} | {filenames} |
| Gate | {PASS/CONCERNS/FAIL/WAIVED} | {filename} ({score}) |
| DoD | ✅ / ❌ | {filename} |
| Sprint review | ✅ / ❌ | {filename} |
| Open bugs | {n} | {filenames} |
| Handover | ✅ / ❌ | {outstanding count} |

## Acceptance Criteria Traceability

| Criterion | Evidence in diff | Status |
|---|---|---|
| {AC-1 text} | `{path:line}` / test name | ✅ met / ⚠️ partial / ❌ unmet |

## Conformance Findings

{rendered PC-* findings, or "None."}

## Code Review Findings

{rendered CR-* findings, or "None."}

## Machine-Readable Findings

```yaml
findings:
  # one entry per rendered finding, conformance first then code
  - id: {PC-n or CR-n, matching the rendered finding}
    category: {coverage|scope|trail|consistency for PC-*, bug|cleanup for CR-*}
    severity: {low|medium|high}
    confidence: {low|medium|high}
    ref: {the same ref rendered after the em-dash, quoted}
    finding: {one sentence: what is wrong}
    suggested_action: {one sentence: the fix approach}
truncated_count: {integer — the two lenses' counts summed}
```

## Recommended Actions

1. {highest-priority action}
````

**About the machine-readable block.** It is what `/qa-fix`'s findings ingester reads; the rendered
sections above it are for humans. Four rules, each of which has a way of going wrong:

- **One block, both lenses**, conformance entries first then code entries — the same order as the
  rendered sections, so a human diffing the two sees them line up. One block means the ingester has
  exactly one anchor to find.
- **Tag the fence `yaml`.** The rendered findings sit in untagged ``` fences; an untagged block here
  would be indistinguishable from them.
- **`ref` for both lenses**, per the normalisation rule in Step 6. A `CR-*` entry's `ref` is its
  subagent `file_line` verbatim.
- **Always emit the section, even with nothing to report** — as `findings: []` with
  `truncated_count: 0`. If a findings-free report omitted it, an absent section would mean both
  "report written before this existed" and "no findings", and the ingester's legacy fallback would
  fire on a report that had a block. A bug in emitting the block would then be indistinguishable from
  a legacy report.

`truncated_count` is the **sum** of the two lenses' counts. The rendered omitted-count note in Step 6
stays as it is — this field is the machine-readable half of the same fact, not a replacement for it.

### Step 8 — `--comment` (optional)

**One** summary comment, idempotent via the marker `<!-- agent-skills-pr-review -->`, using the find-by-marker → edit-by-id → else-create recipe from `finalise` — the only dual-platform idempotent PR comment in this repo.

First build the body file — every command below reads it, and none of them creates it:

```bash
# The lead goes BELOW the marker — see the warning under this block. `in-review`
# is the same stage the tracker comment for this moment uses; one vocabulary.
LEAD=$(node references/stakeholder-summary-cli.js --stage in-review) || exit 1

BODY_FILE="$(mktemp -t review-pr-comment.XXXXXX.md)"
{
  printf '%s\n\n' '<!-- agent-skills-pr-review -->'
  printf '%s\n\n---\n\n' "$LEAD"
  cat "$REPORT_FILE"            # or the rendered summary when no report was written
} > "$BODY_FILE"
```

> **The marker stays on the first line, and that is what keeps this comment idempotent.** Both arms
> below find an existing comment with `startswith("<!-- agent-skills-pr-review -->")` and then edit
> it by id. A lead inserted *above* the marker makes that search miss, so a re-run posts a **new**
> comment instead of updating the old one — visible as duplicate comments, which reads as a
> formatting problem rather than a bug, and never fails. `$BODY_FILE` is built once here and read by
> the GitHub PATCH path, the GitHub POST path and both Bitbucket paths, so the lead reaches the
> **update** path as well as the create path. That is the half that is easy to miss.

**GitHub:**

```bash
EXISTING_COMMENT_ID=$(gh pr view "$PR_URL" --json comments \
  -q '.comments[] | select(.body | startswith("<!-- agent-skills-pr-review -->")) | .url' \
  2>/dev/null | head -1 | grep -oE '[0-9]+$')

if [ -n "$EXISTING_COMMENT_ID" ]; then
  OWNER=$(gh repo view --json owner -q '.owner.login')
  REPO_NAME=$(gh repo view --json name -q '.name')
  tracker_call_with_retry gh api -X PATCH \
    "/repos/${OWNER}/${REPO_NAME}/issues/comments/${EXISTING_COMMENT_ID}" \
    -F "body=@${BODY_FILE}" >/dev/null \
    && echo "✅ PR review comment updated" || echo "⚠️ PR comment edit failed — non-blocking"
else
  tracker_call_with_retry gh pr comment "$PR_URL" --body-file "$BODY_FILE" \
    && echo "✅ PR review comment posted" || echo "⚠️ PR comment failed — non-blocking"
fi
```

**Bitbucket:**

```bash
# pagelen=100 — Bitbucket pages comments, and scanning only the first page means a busy
# PR never finds the marker and posts a duplicate, defeating the idempotency this exists for.
EXISTING_COMMENT_ID=$(curl -sf "${BB_CURL_AUTH[@]}" \
  "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests/${PR_NUMBER}/comments?pagelen=100" \
  | jq -r '.values[] | select(.content.raw | startswith("<!-- agent-skills-pr-review -->")) | .id' | head -1)

BB_PAYLOAD=$(jq -n --arg raw "$(cat "$BODY_FILE")" '{content: {raw: $raw}}')
if [ -n "$EXISTING_COMMENT_ID" ]; then
  curl -sf -X PUT "${BB_CURL_AUTH[@]}" -H "Content-Type: application/json" \
    "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests/${PR_NUMBER}/comments/${EXISTING_COMMENT_ID}" \
    -d "$BB_PAYLOAD" >/dev/null
else
  curl -sf -X POST "${BB_CURL_AUTH[@]}" -H "Content-Type: application/json" \
    "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests/${PR_NUMBER}/comments" \
    -d "$BB_PAYLOAD" >/dev/null
fi
```

Always `--body-file` / a file-sourced payload, never an inline body: bodies carry backticks, `$(…)` and newlines.

The GitHub path goes through `tracker_call_with_retry`, inheriting 3× exponential backoff **and** the `ACCESS_TRACKER` deferral gate for free. The Bitbucket path is single-shot — the missing Bitbucket retry helper is a known gap `qa-fix` already documents.

Commenting never gates. Never post over an `unverifiable` reason.

#### `--inline` — findings beside the lines they are about

The summary comment above stays the default and is always posted. `--inline` adds a second delivery:
each finding that carries a `file_line` is also posted as an inline comment anchored to that line, via
the shared primitive. It resolves `$VCS` itself, so this step does not branch:

```bash
# Findings from both lenses, reshaped into the CLI's input contract.
# `.code_review.findings[]`, NOT `.code_review[]` — the latter iterates the
# WRAPPER's values (`reviewed`, the findings array, `truncated_count`), so
# `select(.file_line != null)` indexes a string and jq aborts outright.
# `.finding` is the schema's key; there is no `.summary`.
# Two lenses, two different anchor keys. `code_review` findings carry
# `file_line`; `pr_conformance` findings carry `ref`, which is a criterion id, a
# frontmatter field, an artifact path OR a `path:line` — only the last form can
# be anchored. Both are normalised and then filtered by SHAPE, so a `ref` of
# "AC-3" is excluded rather than aborting the program. jq is all-or-nothing
# inside `[ … ]`: one malformed entry would otherwise empty the file and drop
# every finding. Conformance findings that cannot anchor stay in the summary
# comment, which is posted regardless.
jq '[ (.code_review.findings[]? | . + {anchor: .file_line}),
      (.pr_conformance.findings[]? | . + {anchor: .ref})
      | select((.anchor? // "") | test("^.+:[0-9]+$"))
      | {path: (.anchor | split(":")[0]),
         line: (.anchor | split(":")[1] | tonumber),
         body: (.finding
                + (if .suggested_action then "\n\n→ " + .suggested_action else "" end))} ]' \
   "$FINDINGS_JSON" > "$INLINE_FILE" || {
  echo "findings JSON did not match the schema — not posting inline"; exit 1; }

node .agents/skills/review-pr/references/pr-inline-comment.js \
  --pr "$PR_NUMBER" --findings-file "$INLINE_FILE" \
  --summary-file "$BODY_FILE" --json
```

**Anchoring failure degrades; it never drops a finding.** A line outside the diff hunk is rejected —
routinely, since a finding about an unchanged function whose caller moved has no line to attach to —
and that finding is appended to the summary comment instead, reporting `anchor-failed` rather than
`posted`. Read the per-finding `reason`s, not just the top-level one: a run reporting `partial` has
delivered everything, just not all of it inline.

Full contract, the `reason` vocabulary and the marker-plus-update-in-place re-run rule:
[`references/pr-inline-comment-contract.md`](references/pr-inline-comment-contract.md).

### Step 9 — Cleanup

```bash
rm -f "$DIFF_FILE" "$BODY_FILE"
```

## Customization

Both lenses are shared prompts. Customise them at their **source** under the repo's `shared/resources/` directory — **not** the bundled `references/` copies beside this skill, which carry an `AUTO-GENERATED — DO NOT EDIT` header and are overwritten by the bundler:

- `code-review-prompt.md` — shared with `/review-code`, `/qa-story`, `/qa-task`. An edit here changes all four skills.
- `pr-conformance-prompt.md` — used only by this skill today.

After editing, run `npm run bundle`.

## Relationship to Other Skills

- **`/review-code`** — reviews a diff with no work item and can `--fix`. Use it when there is nothing to conform to.
- **`/review-task`, `/review-story`** — review the document *before* implementation. `/review-pr` reviews the change *after*.
- **`/qa-task`, `/qa-story`** — the gating QA pass over a tracked work item. `/review-pr` is advisory and writes no gate.
- **`/finalise`** — verifies the DoD and marks work accepted. `/review-pr` reads the DoD it produced; it never writes one.

## Relationship to the develop pipelines

`/develop-story` and `/develop-task` **do** call `/review-pr`, as **Step 5c** — the exit gate of
their Steps 5–6 QA loop. It runs once a QA gate reads `PASS` or `WAIVED`, and nothing leaves that
loop without passing through it. The full routing lives in the pipelines' Steps 5–6 QA loop step
file, §5c — deliberately not linked by path, because the bundler follows such a reference and would
copy that file and its transitive dependencies into this skill, which does not need them to run.
(`/develop-bug` does not call this skill — it runs its own verify loop.)

**Only the conformance lens is new value there.** Those pipelines' QA step already runs the code
reviewer every cycle with `code_review_blocking=true`, so 5c's code lens is duplication. Its
conformance lens is not duplicated anywhere: whether the diff *covers* what the work item promised,
whether it drifted outside that *scope*, whether the artifact *trail* is complete and honest, and
whether the work item is *consistent* with what shipped. That gap is why the wiring exists.

**Being consulted by a pipeline is not the same as gating one, and this skill still does not gate.**
The distinction is the whole reason the wiring is legitimate:

- `/review-pr` **reports** a verdict. It writes no gate `.yml`, never submits a formal GitHub
  review, and never edits code — exactly as before.
- The **orchestrator** acts on that verdict: `REQUEST CHANGES` sends the run back to `/qa-fix` on
  the shared 5-cycle budget; `CONCERNS` records findings without blocking; `APPROVE` exits to
  Step 7.

Gate files remain the exclusive output of `/qa-story` and `/qa-task`.

Invoking it by hand is unchanged and still worthwhile — someone opening a finished PR and asking
whether to merge it is the same question, asked outside a pipeline run.
