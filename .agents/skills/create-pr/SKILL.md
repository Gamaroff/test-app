---
name: create-pr
description: Create pull requests following project conventions. This skill should be used when ready to submit code for review. Automatically commits any uncommitted changes using /commit-changes before creating the PR. Prompts for target branch (typically develop), pushes the current branch, generates a PR description, and opens a PR using the GitHub CLI (GitHub) or Bitbucket REST API (Bitbucket). Platform is auto-detected from the git remote URL.
invokes: [commit-changes]
---

# Create Pull Request

This skill creates pull requests following project conventions.

## When to Use This Skill

Use this skill when:

- Code is ready for review after implementing a feature or fix
- Need to open a PR with a properly formatted description
- Want to interactively select the correct target branch (typically `develop`)
- Have uncommitted changes that should be committed before creating the PR (this skill will automatically commit them using `/commit-changes`)

## Prerequisites

**GitHub:**

- **GitHub CLI (`gh`)** must be installed and authenticated (`gh auth status`)

**Bitbucket:**

- A Bitbucket REST credential must be set — **either** `BITBUCKET_ACCESS_TOKEN` (a repository,
  project or workspace access token, sent as Bearer) **or** `BITBUCKET_USERNAME` plus
  `BITBUCKET_API_TOKEN` (sent as Basic; `BITBUCKET_APP_PASSWORD` is still honoured as a fallback —
  see the note below). `references/bitbucket-auth.sh` picks between them by variable name.
- `curl` and `jq` must be available

**Both:**

- Current branch must have commits to push (or uncommitted changes that can be committed)

## Target Branch Selection

**CRITICAL**: Always ask the user which branch to merge into rather than auto-detecting.

Common Gitflow patterns:

| Current Branch | Typical Target | Notes                                         |
| -------------- | -------------- | --------------------------------------------- |
| `feature/*`    | `develop`      | Feature branches merge to develop             |
| `fix/*`        | `develop`      | Bug fixes merge to develop                    |
| `hotfix/*`     | `main`         | Hotfixes merge to main (and later to develop) |
| `release/*`    | `main`         | Releases merge to main (and later to develop) |
| Other          | `develop`      | Default recommendation                        |

> [!IMPORTANT]
> For `hotfix/*` and `release/*` branches, after merging to `main`, a second PR should be created to merge back into `develop`.

## Workflow

**IMPORTANT**: This skill performs a complete workflow from uncommitted changes to PR creation:

1. **Asks user for target branch** — ALWAYS the very first action, no exceptions
2. Commits any uncommitted changes (if present)
3. Pushes branch to remote
4. Generates PR title and description
5. Creates the actual PR using `gh pr create`
6. Returns the PR URL to the user

**Do not skip Step 1 unless `--base` was pre-supplied via Step 0** — if no pre-supplied branch, the base branch question must be answered before any other work begins.

### Step 0: Check for Pre-Supplied Parameters

Before asking the user, check whether parameters were supplied:

**`--base <branch>`**:

- The caller may pass `--base <branch>` (e.g., `/create-pr --base develop`)
- When invoked by the `develop-story` or `develop-task` orchestrator, the base branch is passed programmatically
- If provided: store as `BASE_BRANCH`, skip Step 1, log: "Base branch pre-supplied: {branch} — skipping interactive prompt", proceed to Step 2
- If not provided: proceed to Step 1 as normal

**`--issue <N>`**:

- The caller may pass `--issue <N>` (e.g., `/create-pr --issue 42`)
- When invoked by the `develop-story` or `develop-task` orchestrator, the issue number is passed if `GITHUB_ISSUE` is set
- If provided: store as `GITHUB_ISSUE`, use in Step 5 PR description
- If not provided: attempt auto-detection in Step 5 (see GitHub Issue Detection below)

**`--exclude <path>`** (repeatable):

- The caller may pass one or more `--exclude <path>` flags (e.g., `/create-pr --exclude path/to/report.md`)
- Orchestrators use it for files that must stay out of *this* commit. Note that the develop pipelines
  do **not** pass the implementation report here — Step 4 is where the report's first commit belongs,
  so that reviewers can read the audit trail during QA and so that any document linking to it does not
  acquire a dangling relative link. Steps 5–6 exclude the report's *updates* from each `fix(...)`
  commit, which is a different thing: by then the file is tracked
- Collect all values into an `EXCLUDE_PATHS` array
- When invoking `/commit-changes` in Step 2 (uncommitted changes present): forward all values as repeated flags — `/commit-changes --exclude path1 --exclude path2 ...`
- When there are NO uncommitted changes (commit-changes is not invoked): silently ignore all `--exclude` values and log `"--exclude received but no commit needed — ignored"`

**`--scope <path>`** (repeatable):

- The caller may pass one or more `--scope <path>` flags (e.g., `/create-pr --scope docs/tasks/task.5/`)
- When invoked by the `develop-story` or `develop-task` orchestrator, the work-item dir and changed code paths are passed so only in-scope files are staged in the auto-commit
- Collect all values into a `SCOPE_PATHS` array
- When invoking `/commit-changes` in Step 2 (uncommitted changes present): forward all values as repeated flags — `/commit-changes --scope p1 --scope p2 ...` (alongside any `--exclude` flags)
- When there are NO uncommitted changes (commit-changes is not invoked): silently ignore all `--scope` values and log `"--scope received but no commit needed — ignored"`

### Step 0.5: Detect Platform

Before interacting with any remote hosting service, detect the platform using the canonical resolver. See `references/platform-detection.md` for the full resolver spec.

```bash
source references/resolve-platform.sh || exit 1
# VCS = github | bitbucket; TRACKER = jira | github
PLATFORM="$VCS"   # PLATFORM keeps backward compat with downstream branches

REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ "$PLATFORM" = "bitbucket" ]; then
  BB_PATH=$(echo "$REMOTE_URL" \
    | sed -E 's|.*bitbucket\.org[:/]||; s|\.git$||')
  BB_WORKSPACE=$(echo "$BB_PATH" | cut -d'/' -f1)
  BB_REPO=$(echo "$BB_PATH" | cut -d'/' -f2)
  BB_API="https://api.bitbucket.org/2.0"
  # Resolve the REST credential once. Sets BB_CURL_AUTH (curl args) and
  # BB_AUTH_SCHEME (bearer|basic); non-zero when neither credential is set.
  source references/bitbucket-auth.sh || exit 1
elif [ "$PLATFORM" = "github" ]; then
  REPO_SLUG=$(echo "$REMOTE_URL" \
    | sed -E 's|.*github\.com[:/]||; s|\.git$||')
fi
```

Store `PLATFORM` — every platform-specific step below branches on this value.

### Step 1: Ask User for Target Branch

**MANDATORY (unless skipped by Step 0)** — if `--base` was not pre-supplied, do this before anything else, even before checking git status.

Use AskUserQuestion to ask which branch this PR should merge into. Never assume or auto-detect — always wait for an explicit answer.

```
Question: Which branch should this PR merge into?

Current branch: <git branch --show-current>

Options:
- develop (Default for features and bug fixes)
- main (Hotfixes and releases only)
- other (specify)
```

Store the answer as `BASE_BRANCH`. Every subsequent step that references a target branch must use this value.

### Step 2: Verify Prerequisites and Commit Changes

Check that the environment is ready:

```bash
# Check for uncommitted changes
git status --porcelain
```

**Platform-specific auth verification:**

_GitHub:_

```bash
gh auth status
```

_Bitbucket:_

```bash
# BB_CURL_AUTH was resolved in the platform-detection step above; re-source here
# if this block is run standalone. Either credential type is acceptable —
# Bearer (BITBUCKET_ACCESS_TOKEN) or Basic (BITBUCKET_USERNAME + token).
source references/bitbucket-auth.sh || exit 1
# Verify credentials against the REPOSITORY, not ${BB_API}/user.
#
# GET /2.0/user needs the read:user scope, which tokens scoped for PR work
# routinely lack — it answers 403 while every PR and repository call succeeds.
# Probing it here would abort create-pr for a perfectly good credential.
# (develop-next documents the same hazard; this used to contradict it.)
AUTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
  "${BB_CURL_AUTH[@]}" \
  "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}")
# 404 here means unauthenticated, not missing: Bitbucket hides private repos
# from anonymous callers rather than returning 401.
[ "$AUTH_CHECK" != "200" ] && echo "Error: Bitbucket auth failed (HTTP $AUTH_CHECK — 404 means the credential was not accepted)" && exit 1
```

If there are uncommitted changes:

1. **Automatically invoke the `/commit-changes` skill** to commit all changes, forwarding any `--scope` and `--exclude` flags — e.g. `/commit-changes --scope p1 --scope p2 --exclude e1`
2. **After commits are complete, IMMEDIATELY CONTINUE with Step 3** - Do not stop after committing

**CRITICAL**: The commit step is just preparation. After `/commit-changes` completes successfully, you MUST continue with Steps 3-7 to actually create the PR. Do not stop after committing - that's only the first part of this skill's job.

### Step 3: Push Branch to Remote

Ensure the branch is pushed with tracking:

```bash
git push -u origin $(git branch --show-current)
```

**CRITICAL / BLOCKING**: Verify `git push` exited with code 0. If it fails (e.g. remote rejected, no upstream), report the error to the user and halt. Do NOT proceed to Step 4 with an unpushed branch — `gh pr create` will fail or create a PR against the wrong commit.

### Step 4: Generate PR Title

Extract a meaningful title from the branch name or commits:

**From branch name:**

```
feature/story.180.3.quick-re-search-functionality
 → feat(story.180.3): quick re-search functionality
```

**From latest commit:**

```bash
git log -1 --pretty=format:"%s"
```

Prefer using the conventional commit format: `type(scope): description`

### Step 5: Generate PR Description

**Diff capture (Phase 1):**

Before composing the PR body, capture the diff to a temp file so the Explore subagent can read it without loading bytes into main context:

```bash
mkdir -p .agents/state
DIFF_FILE=".agents/state/pr-diff-$(date +%s).patch"

# Build pathspec excludes for git diff (mirrors EXCLUDE_PATHS from --exclude flags)
GIT_DIFF_EXCLUDES=""
for p in "${EXCLUDE_PATHS[@]:-}"; do
  GIT_DIFF_EXCLUDES="$GIT_DIFF_EXCLUDES ':(exclude)$p'"
done

eval git diff "$BASE_BRANCH...HEAD" $GIT_DIFF_EXCLUDES > "$DIFF_FILE"
```

Use the project's PR template:

```markdown
## Summary

Brief description of changes and motivation.

## Changes

- List of specific changes made
- Another change item

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Breaking Changes

List any breaking changes (if applicable)

## Related Issues

Closes #123
```

**Auto-generate body from diff (Explore subagent):**

Load the prompt from `references/pr-body-summariser-prompt.md`. Substitute `<DIFF_FILE>` with the value of `$DIFF_FILE`. Dispatch:

```
Agent(subagent_type="Explore", prompt=<loaded-prompt-with-substitution>)
```

Store the returned markdown string as `$PR_BODY`.

If the subagent returns an empty response, returns `<!-- diff unavailable -->`, or errors, fall back to the commit-subject body and log the reason:

```bash
PR_BODY=$(git log origin/$BASE_BRANCH..HEAD --pretty=format:"- %s")
```

### GitHub Issue Detection

Determine the issue number using this priority:

1. **`--issue` flag**: If provided via Step 0, use `GITHUB_ISSUE` directly
2. **Auto-detection**: If no flag, attempt to find the issue from the source document:
   a. Parse the current branch name for a story/task identifier (e.g. `feature/story.37.1.*` or `feature/task.40.*`)
   b. Find the corresponding story/task document in the working directory
   c. Read `github_issue` from its YAML frontmatter
   d. If found, store as `GITHUB_ISSUE`
3. **No issue**: If neither method yields a number, omit the Related Issues section entirely

If `GITHUB_ISSUE` is set, add to the PR body:

```markdown
## Related Issues

Closes #{GITHUB_ISSUE}
```

If no issue number is available, do NOT add the Related Issues section.

### Step 6: Create the Pull Request

Branch on `PLATFORM`:

**GitHub:**

```bash
PR_URL=$(gh pr create \
  --base "$BASE_BRANCH" \
  --title "$PR_TITLE" \
  --body "$PR_BODY")
PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')
rm -f "$DIFF_FILE"
```

**CRITICAL / BLOCKING**: Verify `gh pr create` exited with code 0 and returned a PR URL before proceeding to Step 6b.

---

**Bitbucket:**

```bash
CURRENT_BRANCH=$(git branch --show-current)
PR_BODY_FILE=$(mktemp)
printf '%s' "$PR_BODY" > "$PR_BODY_FILE"

PR_RESPONSE=$(curl -s -X POST \
  "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests" \
  -H "Content-Type: application/json" \
  "${BB_CURL_AUTH[@]}" \
  -d "$(jq -n \
    --arg title "$PR_TITLE" \
    --arg desc "$(cat "$PR_BODY_FILE")" \
    --arg src "$CURRENT_BRANCH" \
    --arg dst "$BASE_BRANCH" \
    '{
      "title": $title,
      "description": $desc,
      "source": {"branch": {"name": $src}},
      "destination": {"branch": {"name": $dst}},
      "close_source_branch": false
    }'
  )")
rm -f "$PR_BODY_FILE"
rm -f "$DIFF_FILE"

PR_URL=$(echo "$PR_RESPONSE" | jq -r '.links.html.href // empty')
PR_ID=$(echo "$PR_RESPONSE"  | jq -r '.id // empty')
```

**CRITICAL / BLOCKING**: If `PR_URL` is empty, inspect `PR_RESPONSE` for an error message, report it to the user, and halt.

---

### Step 6b: Comment on Linked Issue (graceful — non-blocking)

Branch on `PLATFORM` and tracker detection:

**GitHub path** (when `PLATFORM=github`):

If `GITHUB_ISSUE` is set (from Step 0), post a comment linking the PR:

```bash
if [ -n "$GITHUB_ISSUE" ]; then
  mkdir -p .claude/state
  cat > .claude/state/comment-body.md <<EOF
PR opened — #${PR_NUMBER}: ${PR_URL}
EOF
  node references/tracker-comment.js --issue "$GITHUB_ISSUE" \
    --body-file .claude/state/comment-body.md --stage in-review \
    --slot pr="$PR_URL" \
    --json \
    || echo "⚠️  Issue comment failed — continuing"
fi
```

Read `reason` and act per [`references/tracker-comment-contract.md`](references/tracker-comment-contract.md).
The `--stage` marker is what makes this idempotent across a resume — a bare
`gh issue comment` posts an unmarked duplicate every time the pipeline re-enters
Step 4.

> **`pr` is the only slot `in-review` reads**, and it takes the **URL**, not the number. The lead
> renders it parenthetically for a reader who will not look up `#412` in a repository they may not
> have open. Both arms above pass the same slot, because the lead is a property of the moment, not of
> the tracker.

If `GITHUB_ISSUE` is not set, skip silently.

---

**Bitbucket + Jira path** (when `PLATFORM=bitbucket` and `TRACKER=jira`):

Bitbucket Issues are disabled for this project — do NOT use the Bitbucket Issues API. Instead, post the PR link as a comment on the linked Jira issue:

1. Determine the Jira issue key from the source document:
   - Parse the current branch name for a story/task identifier (e.g. `feature/story.37.1.*` or `feature/task.40.*`)
   - Find the corresponding story/task document in the working directory
   - Read `jira_key` from its YAML frontmatter (e.g. `PROJ-12`)
2. If `jira_key` is found, post the comment through the CLI:

   ```bash
   mkdir -p .claude/state
   # Terminator at COLUMN 0 — an indented terminator does not close an
   # unquoted heredoc; bash swallows everything after it into the body,
   # so the call below would never run. Body lines are unindented for
   # the same reason: leading spaces are written verbatim.
   cat > .claude/state/comment-body.md <<EOF
PR opened — [PR #{PR_ID}]({PR_URL})
EOF

   node .agents/skills/create-pr/references/tracker-comment.js \
     --issue {jira_key} --body-file .claude/state/comment-body.md \
     --stage in-review \
     --slot pr="{PR_URL}" \
     --json
   ```

> Engine source: `references/tracker-comment.js` (bundled into each skill as `references/tracker-comment.js`). Contract: `references/tracker-comment-contract.md`.


   Read `reason` and act per [`references/tracker-comment-contract.md`](references/tracker-comment-contract.md) — only `no-credentials` may fall back to the Atlassian MCP tool.
3. If `jira_key` is not found or the comment fails, log warning and continue — do NOT halt.

---

Failure to post any tracker comment does NOT halt the skill.

### Step 7: Output Result

Provide the user with the PR URL and summary:

```
✅ Pull Request Created!

   Title: feat(story.180.3): quick re-search functionality
   URL: https://github.com/org/repo/pull/123
   Base: develop ← feature/story.180.3.quick-re-search-functionality
   Issue: #42 commented (or "not linked" if GITHUB_ISSUE unset)

Next steps:
- Review the PR description on GitHub
- Request reviewers
- Monitor CI checks
```

## Interactive Mode

**REQUIRED**: Always ask for target branch first (Step 2).

If additional information is missing, prompt the user:

1. **Target branch (REQUIRED):**

   ```
   Which branch should this PR target?
   - develop (Recommended) - For features, fixes, and regular development
   - main - For hotfixes and releases only
   ```

2. **No meaningful title detected:**

   ```
   Could not extract a PR title from the branch name.
   Please provide a title (conventional commit format preferred):
   ```

3. **Missing summary:**

   ```
   Please provide a brief summary of the changes for the PR description:
   ```

4. **Related issues:**
   ```
   Are there any related GitHub issues to link? (e.g., #123, or press Enter to skip):
   ```

## PR Templates by Branch Type

### Feature PR

```markdown
## Summary

Implements [feature name] as part of [Epic/Story reference].

## Changes

- Specific change 1
- Specific change 2
- Tests for new functionality

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Breaking Changes

None

## Related Issues

Part of Epic XXX / Story XXX
```

### Hotfix PR

```markdown
## Summary

🚨 **HOTFIX**: [Brief description of the critical fix]

## Problem

Describe the production issue being fixed.

## Solution

Describe the fix implemented.

## Changes

- Specific change 1
- Specific change 2

## Testing

- [ ] Verified fix resolves the issue
- [ ] Regression tests pass
- [ ] Tested in staging environment

## Deployment Notes

Any special deployment considerations.

## Related Issues

Fixes #XXX
```

### Release PR

```markdown
## Summary

🚀 **Release v1.X.X**

## Included Features

- Feature 1 (Story XXX)
- Feature 2 (Story XXX)

## Bug Fixes

- Fix 1 (#XXX)
- Fix 2 (#XXX)

## Breaking Changes

List any breaking changes.

## Deployment Checklist

- [ ] Version numbers updated
- [ ] CHANGELOG.md updated
- [ ] All CI checks pass
- [ ] Release notes prepared

## Post-Merge Actions

- [ ] Tag the release on main
- [ ] Merge back to develop
- [ ] Notify stakeholders
```

## Error Handling

### Not Authenticated

**GitHub:**

```
Error: gh CLI is not authenticated.

To authenticate, run:
  gh auth login

Then retry /create-pr
```

**Bitbucket:**

```
Error: Bitbucket credentials not set or invalid.

Set EITHER an access token (Bearer):
  export BITBUCKET_ACCESS_TOKEN=your-repository-or-workspace-access-token

Created from Bitbucket → Repository/Project/Workspace settings →
Access tokens. It carries its own scopes and has no username.

OR an Atlassian API token (Basic):
  export BITBUCKET_USERNAME=your-atlassian-account-email
  export BITBUCKET_API_TOKEN=your-atlassian-api-token

The value is an Atlassian API token (ATATT...), created at:
  https://id.atlassian.com/manage-profile/security/api-tokens

Tick the Bitbucket scopes when creating it — a scopeless token
authenticates against Jira and fails against Bitbucket.

App passwords were REMOVED by Atlassian on 2026-07-28. The older
variable name BITBUCKET_APP_PASSWORD is still read as a fallback,
but it too must now hold an API token.

BITBUCKET_ACCESS_TOKEN wins if both are set — it replaces the
username/token pair rather than supplementing it.

Then retry /create-pr
```

### No Commits to Push

```
Error: Current branch has no commits ahead of the target branch.

Make some changes and commit them first using /commit-changes.
```

### Branch Not Pushed

If push fails:

1. Check for upstream issues
2. Suggest force-push if branch exists but diverged (with caution)

### PR Already Exists

**GitHub:**

```
A pull request already exists for this branch.

Existing PR: https://github.com/org/repo/pull/123

Options:
- View existing PR
- Update PR description
- Close existing and create new
```

**Bitbucket:**

Check for an existing PR before creating:

```bash
EXISTING=$(curl -s \
  "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests?q=source.branch.name%3D%22${CURRENT_BRANCH}%22%20AND%20state%3D%22OPEN%22" \
  "${BB_CURL_AUTH[@]}" \
  | jq -r '.values[0].links.html.href // empty')
```

If non-empty, report to the user and offer the same options.

## Options

| Flag         | Description                                                                          | Example                                  |
| ------------ | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| `--base`     | Pre-supply target branch (skip prompt)                                               | `/create-pr --base develop`              |
| `--issue`    | Pre-supply GitHub issue number (skip auto-detection)                                 | `/create-pr --issue 42`                  |
| `--exclude`  | Exclude path from auto-commit staging (repeatable; forwarded to `/commit-changes`)   | `/create-pr --exclude path/to/report.md` |
| `--scope`    | Allowlist paths for auto-commit staging (repeatable; forwarded to `/commit-changes`) | `/create-pr --scope docs/tasks/task.5/`  |
| `--draft`    | Create as draft PR                                                                   | `/create-pr --draft`                     |
| `--title`    | Override PR title                                                                    | `/create-pr --title "custom title"`      |
| `--body`     | Override PR body                                                                     | `/create-pr --body "custom body"`        |
| `--reviewer` | Add reviewers                                                                        | `/create-pr --reviewer @username`        |
| `--label`    | Add labels                                                                           | `/create-pr --label "feature"`           |

## Examples

### Basic Feature PR

```
Input: /create-pr

(If uncommitted changes detected, automatically invokes /commit-changes first)

Prompt: Which branch should this PR target?
        - develop (Recommended)
        - main

User selects: develop

Output:
  ✅ Pull Request Created!

     Title: feat(story.180.3): quick re-search functionality
     URL: https://github.com/your-org/your-repo/pull/456
     Base: develop ← feature/story.180.3.quick-re-search-functionality
```

### Draft Hotfix PR

```
Input: /create-pr --draft

Output:
  ✅ Draft Pull Request Created!

     Title: fix(payment): resolve timeout in transaction processing
     URL: https://github.com/your-org/your-repo/pull/457
     Base: main ← hotfix/v1.2.1
     Status: Draft (not ready for review)
```

### PR with Reviewers

```
Input: /create-pr --reviewer @alice --reviewer @bob

Output:
  ✅ Pull Request Created!

     Title: feat(auth): implement OAuth2 integration
     URL: https://github.com/your-org/your-repo/pull/458
     Reviewers: @alice, @bob
```

## Related Skills

- `/create-branch` - Create a properly named branch before starting work
- `/commit-changes` - Automatically invoked by this skill if there are uncommitted changes
- `/develop` - Full story implementation workflow

## References

- [GitHub CLI Documentation](https://cli.github.com/manual/gh_pr_create) - `gh pr create` options
- [Bitbucket REST API — Pull Requests](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/) - Bitbucket PR creation
- [Bitbucket App Passwords](https://support.atlassian.com/bitbucket-cloud/docs/app-passwords/) - Authentication for Bitbucket API

---

## Pipeline Lock Cooperation (when invoked by `/develop-story` or `/develop-task`)

When this skill is invoked as a step in a develop pipeline, advance the pipeline lock as the **last action** before returning, so the orchestrator's next turn does not depend on model discipline:

```bash
if [ -f .claude/state/develop-pipeline.lock ]; then
  bash .agents/skills/create-pr/references/advance-pipeline-lock.sh --skill create-pr 2>/dev/null || true
fi
```

Idempotent in every degraded path: noops when the lock is missing (skill invoked standalone), already advanced past this step, or the helper script is not installed. Full rationale and cooperation order with the `Stop` hook: see [`references/pipeline-lock-cooperation.md`](references/pipeline-lock-cooperation.md).
