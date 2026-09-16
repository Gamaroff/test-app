---
name: create-branch
description: Create git branches following Gitflow conventions. This skill should be used when starting work on a new feature, hotfix, or release. Accepts story files, task documents, or descriptions to generate properly-named branches from the correct base branch (develop or main).
---

# Create Branch

This skill creates git branches following the Gitflow branching model.

## When to Use This Skill

Use this skill when:

- Starting work on a new feature from a story or task document
- Creating a hotfix branch for an urgent production fix
- Creating a release branch to prepare a new version
- Need to ensure branch naming follows Gitflow conventions

## Input Handling

**Flexible Invocation:**

Invoke this skill with any of:

- **A story file path**: `story.178.8.example-feature.md`
- **A story directory**: `stories/story.178.8.example-feature/`
- **An epic file path**: `epic.178.feature-ui.md` → creates `feature/epic.178.feature-ui` from `develop`
- **A task document**: `docs/prd/.../task.123.some-task.md`
- **A raw description**: `"implement user authentication"`
- **Explicit type flag**: `--hotfix`, `--release`, `--feature`

## Branch Type Detection

### Automatic Detection

| Context                             | Branch Type | Base Branch                   |
| ----------------------------------- | ----------- | ----------------------------- |
| Story file (`story.*`)              | `feature`   | User choice (see below)       |
| Epic file (`epic.*`)                | `feature`   | `develop` (fixed — no prompt) |
| Task file (`task.*`)                | `feature`   | User choice (see below)       |
| `--hotfix` flag or "hotfix" keyword | `hotfix`    | `main`                        |
| `--release` flag or version pattern | `release`   | `develop`                     |
| Default (raw description)           | `feature`   | User choice (see below)       |

### Base Branch Selection for Features

**CRITICAL**: Before creating a feature branch, always check the current branch and ask the user to choose the base branch.

**Detection Logic:**

1. Check current branch: `git branch --show-current`
2. If currently on a feature branch (starts with `feature/`):
   - Detect if the new branch is a sub-story (e.g., creating `story.309.2.3A` while on `feature/story.309.2.3`)
   - Present user with options for base branch
3. If currently on `develop` or `main`:
   - Default to `develop` but still ask for confirmation

**User Prompt Pattern:**

Use `AskUserQuestion` to present options:

```
Question: "Which branch should be the base for feature/story.309.2.3A.core-notification-ui?"

Options:
1. feature/story.309.2.3.mobile-notification-center (current branch - recommended for sub-stories)
   - Use when this is a sub-story or related work
   - Changes will be grouped together for review

2. develop (standard Gitflow)
   - Use when this is independent work
   - Follows standard Gitflow conventions
```

**Sub-story Detection:**

A branch is likely a sub-story if:

- Current branch: `feature/story.X.Y.name`
- New branch: `feature/story.X.Y.Z.name` (where Z extends X.Y)

Example: Creating `story.309.2.3A` while on `feature/story.309.2.3` → likely a sub-story

### Naming Conventions

| Branch Type         | Pattern                               | Example                                             |
| ------------------- | ------------------------------------- | --------------------------------------------------- |
| **Feature (epic)**  | `feature/epic.<n>.<name>`             | `feature/epic.178.feature-ui`                       |
| **Feature (story)** | `feature/story.<epic>.<story>.<name>` | `feature/story.180.3.quick-re-search-functionality` |
| **Feature (task)**  | `feature/task.<id>.<name>`            | `feature/task.123.api-validation`                   |
| **Feature (desc)**  | `feature/<kebab-case-description>`    | `feature/user-authentication`                       |
| **Hotfix**          | `hotfix/v<version>`                   | `hotfix/v1.2.1`                                     |
| **Release**         | `release/v<version>`                  | `release/v1.3.0`                                    |

## Workflow

### Step 1: Parse Input

Determine the input type and extract relevant information:

```
Input: epic.178.feature-ui.md
 → Type: feature (from epic)
 → Branch Name: feature/epic.178.feature-ui
 → Base: develop (fixed — no user prompt for epic-DOCUMENT branches)

Input: story.178.8.example-feature.md
 → Type: feature (from story)
 → Branch Name: feature/story.178.8.example-feature
 → Base: TBD (will ask user)
```

> **`feature/epic.*` and `epic/*` are different things.** `feature/epic.{n}.{name}` is an ordinary
> short-lived branch for editing the epic **document** (what `/review-epic` creates). `epic/{n}.{name}`
> is an **integration branch** that a whole epic's stories merge into — see Step 2b. Never use one name
> for the other.

### Step 2: Check Current Branch Context

**CRITICAL**: Before proceeding, check the current branch to determine base branch options:

```bash
git branch --show-current
```

**Analysis:**

- If on `feature/*` branch: Offer current branch + `develop`
- If on `develop`: Offer `develop` (recommended) + current branch
- If on `main`: Only offer `develop` (block branching from main for features)
- If detached HEAD: Only offer `develop`

### Step 2b: Epic Integration Branch (story input only)

**Skip this step entirely for task and epic-document inputs** — it applies only when the input is a
story file.

Most epics have no branch of their own: their stories are cut from `develop` and merge back into
`develop`. That is the default and stays the default. Some epics must instead arrive **whole** — every
story merges into one integration branch, which reaches `develop` once, at the end, as a single reviewed
unit. This step decides which applies, and creates the integration branch if one is wanted and does not
yet exist.

**1. Resolve the parent epic document.** Read the story's frontmatter for `epic_source:` (a path) or
`epic:` (an epic slug to locate under the configured PRD root). If neither resolves to a readable file,
skip to Step 3 with no epic option — do not guess and do not block.

**2. Read the epic's declaration.** Look for these keys in the epic document's frontmatter. Key names are
configurable (see [Configuration](#configuration) below); the defaults are:

```yaml
branch_model: epic-integration
integration_branch: "epic/178.feature-ui"
```

**3. Derive the recommendation:**

| Epic declares                                                | Recommended base     | Integration option offered as |
| ------------------------------------------------------------ | -------------------- | ----------------------------- |
| `branch_model: epic-integration` **+** `integration_branch:` | the declared branch  | Recommended                   |
| `branch_model: epic-integration`, no `integration_branch:`   | derived name (see 4) | Recommended                   |
| nothing, or `branch_model: develop-direct`                   | `develop`            | offered, not recommended      |

**Absence means `develop`.** An epic that declares nothing behaves exactly as it always has — this step
adds an option, never a default change.

**4. Derive the branch name** when the epic wants an integration branch but does not name one. Default
pattern (configurable):

```
epic/{epic_number}.{epic-slug}      e.g.  epic/178.feature-ui
```

Use the declared `integration_branch` **verbatim** whenever it is present, even if it does not match this
pattern — the epic document is the authority on its own branch name, not this skill.

**5. Create it if absent.** Only after the user selects the integration branch in Step 3, and before
Step 5 checks out a base:

```bash
EPIC_BRANCH="epic/178.feature-ui"
git fetch origin
if git show-ref --verify --quiet "refs/heads/${EPIC_BRANCH}"; then
  :                                                    # already local — use it
elif git ls-remote --exit-code --heads origin "${EPIC_BRANCH}" >/dev/null 2>&1; then
  git branch --track "${EPIC_BRANCH}" "origin/${EPIC_BRANCH}"   # exists on remote
else
  git branch "${EPIC_BRANCH}" "origin/${BASE_DEFAULT}"          # create from develop
  git push -u origin "${EPIC_BRANCH}"
fi
```

> **The push is not optional.** Parallel orchestrators (`/develop-batch`) run in linked git worktrees and
> cut branches from `origin/<base>`, never from a local ref. An integration branch that exists only
> locally makes every worktree-dispatched story in that epic fail to branch.

Note this uses `git branch`, not `git checkout -b` — the integration branch must **not** become the
active branch here. Step 5 checks out the base; Step 6 cuts the story branch from it.

### Step 3: Ask User for Base Branch

Use `AskUserQuestion` with context-aware options:

**Scenario A: Creating sub-story from feature branch**

```
Current: feature/story.309.2.3.mobile-notification-center
New: feature/story.309.2.3A.core-notification-ui

Question: "Which branch should be the base for feature/story.309.2.3A.core-notification-ui?"

Options:
1. feature/story.309.2.3.mobile-notification-center (Recommended)
   Description: "Use current branch - groups related sub-story work together"

2. develop
   Description: "Standard Gitflow - treats as independent feature"
```

**Scenario B: Creating unrelated feature from feature branch**

```
Current: feature/story.309.2.3.mobile-notification-center
New: feature/story.310.1.new-unrelated-feature

Question: "Which branch should be the base for feature/story.310.1.new-unrelated-feature?"

Options:
1. develop (Recommended)
   Description: "Standard Gitflow - for independent features"

2. feature/story.309.2.3.mobile-notification-center
   Description: "Use current branch - only if this depends on uncommitted work"
```

**Scenario C: Creating feature from develop**

```
Current: develop
New: feature/story.309.2.3.mobile-notification-center

Question: "Which branch should be the base for feature/story.309.2.3.mobile-notification-center?"

Options:
1. develop (Recommended)
   Description: "Standard Gitflow - start from develop"
```

**Scenario D: Story whose epic uses an integration branch** (Step 2b resolved one)

The integration option is added to whichever of Scenarios A–C applies; it does not replace them. It is
listed **first and Recommended** when the epic declares `branch_model: epic-integration`, and listed last
without a recommendation when the epic declares nothing.

```
Current: develop
New: feature/story.178.8.example-feature
Epic 178 declares: branch_model: epic-integration → epic/178.feature-ui

Question: "Which branch should be the base for feature/story.178.8.example-feature?"

Options:
1. epic/178.feature-ui (Recommended)
   Description: "Epic integration branch - epic 178 delivers as one unit; created from develop if absent"

2. develop
   Description: "Standard Gitflow - lands this story on develop independently of its epic"
```

And where the epic declares nothing, the same option appears without the recommendation:

```
Options:
1. develop (Recommended)
   Description: "Standard Gitflow - start from develop"

2. epic/178.feature-ui — create epic integration branch
   Description: "Only if epic 178 must arrive whole. Creates the branch from develop, then bases this
                 story on it. Every later story in the epic must use it too."
```

> Selecting the integration option when the branch does not exist **creates it** (Step 2b.5) before
> Step 5 runs. Selecting it does not update the epic document — if the epic is going to deliver this
> way, record `branch_model:` / `integration_branch:` in its frontmatter so later stories get the
> recommendation instead of relying on whoever runs them next remembering.

### Step 4: Ensure Clean Working Directory

Before creating a branch, check for uncommitted changes:

```bash
git status --porcelain
```

If there are uncommitted changes:

1. **HALT** and inform the user
2. Suggest using `/commit-changes` skill first
3. Or offer to stash changes: `git stash push -m "WIP before creating branch"`

**Exception — Orchestrator-managed files**: When invoked by the `develop-story` orchestrator, a single uncommitted implementation report file (`*.implementation.*.md`) may be present — this is expected pipeline state. If the **only** uncommitted file(s) match the pattern `*.implementation.*.md`, proceed without halting. The orchestrator stashes and restores this file around branch creation automatically.

### Step 5: Fetch Latest and Checkout Base

```bash
# Fetch latest from remote
git fetch origin

# Checkout the user-selected base branch
git checkout <selected-base-branch>  # e.g., develop or feature/story.309.2.3

# Pull latest changes
git pull origin <selected-base-branch>
```

**Exception — linked worktree**: When this skill runs inside a **linked git worktree**
(e.g. dispatched by a parallel batch orchestrator), the base branch is already checked out
in the main worktree, so `git checkout <base>` fails with
`fatal: '<base>' is already checked out at …`. Detect this case —

```bash
[ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ]  # true ⇒ linked worktree
```

— and instead **create the feature branch directly from the freshly-fetched base ref,
never making the base the active branch** (this replaces both Step 5's checkout/pull and
Step 6):

```bash
git fetch origin
git checkout -b feature/story.178.8.example-feature "origin/<selected-base-branch>"
```

The normal single-tree path (Step 5 checkout/pull + Step 6 below) is unchanged.

### Step 6: Create and Switch to New Branch

```bash
git checkout -b feature/story.178.8.example-feature
```

### Step 6: Push Branch (Optional)

Optionally push the branch to set up tracking:

```bash
git push -u origin feature/story.178.8.example-feature
```

### Step 7: Confirm Success

Output a summary with context:

```
✅ Created branch: feature/story.178.8.example-feature
   Base: develop (user selected)
   Tracking: origin/feature/story.178.8.example-feature

Ready to start development!
```

Or for sub-stories:

```
✅ Created branch: feature/story.309.2.3A.core-notification-ui
   Base: feature/story.309.2.3.mobile-notification-center (sub-story)
   Tracking: origin/feature/story.309.2.3A.core-notification-ui

Ready to start development on sub-story!
```

## Configuration

Every key below is **optional**. With no configuration at all, Step 2b reads the default frontmatter keys
and offers the integration option; an epic that declares nothing gets exactly the pre-existing behaviour.
Configure only if your repository already spells these conventions differently.

```yaml
# skills-config.yaml
branching:
  epicIntegration:
    epicFrontmatterKey: branch_model # epic frontmatter key holding the model
    epicFrontmatterValue: epic-integration # the value that means "use an integration branch"
    branchKey: integration_branch # epic frontmatter key holding the branch name
    branchPattern: "epic/{n}.{slug}" # used ONLY when the epic wants one but names none
    offerWhenUndeclared: true # false ⇒ never offer the option unless an epic declares it
```

`offerWhenUndeclared: false` is the setting for a team that wants integration branches to exist only
where an epic has explicitly opted in — the prompt then never shows the option to anyone else.

`branchPattern` is a fallback, not an enforced shape. A declared `integration_branch` is always used
verbatim.

## Quick Reference: Gitflow Rules

| Branch Type                     | Created From | Merges Into              | Purpose                                                                           |
| ------------------------------- | ------------ | ------------------------ | --------------------------------------------------------------------------------- |
| **Feature (epic)**              | `develop`    | `develop`                | Epic-**document** work (not an integration branch)                                |
| **Feature (story)**             | `develop`    | `develop` (via PR)       | Story implementation                                                              |
| **Feature (task)**              | user choice  | user choice (via PR)     | Technical task implementation                                                     |
| **Epic integration** (`epic/*`) | `develop`    | `develop` (via PR, once) | Opt-in: a whole epic's stories merge here, then it lands on `develop` as one unit |
| **Release**                     | `develop`    | `main` & `develop`       | Release prep & bug fixes                                                          |
| **Hotfix**                      | `main`       | `main` & `develop`       | Emergency prod fixes                                                              |

> [!IMPORTANT]
>
> - Feature branches **never** interact directly with `main`
> - Story branches are created from `develop` and PR back to `develop` (short-lived feature branches — standard Gitflow). **By default an epic is an organisational construct (Jira/docs), not a git branch.**
> - **Exception, opt-in per epic:** an epic may declare `branch_model: epic-integration`, giving it an integration branch (`epic/{n}.{name}`) that its stories are cut from and merge into. The integration branch reaches `develop` once, at the end. See Step 2b. An epic that declares nothing behaves exactly as before.
> - `feature/epic.*` branches exist only for epic-**document** work and are ordinary feature branches: created from `develop`, PR back to `develop`. They are **not** integration branches and must not be confused with `epic/*`.
> - Never mix bases within one epic — if the epic has an integration branch, every story in it uses that branch.
> - Hotfix branches **must** be merged back to both `main` AND `develop`
> - Every merge to `main` triggers a version tag

## Error Handling

### Branch Already Exists

If the target branch already exists:

1. Check if it exists locally: `git branch --list <branch-name>`
2. Check if it exists remotely: `git ls-remote --heads origin <branch-name>`
3. **HALT** and ask the user:
   - Switch to existing branch?
   - Delete and recreate?
   - Use a different name?

### Uncommitted Changes

If working directory is not clean:

1. Show the user what's uncommitted: `git status`
2. Offer options:
   - Commit first (suggest `/commit-changes`)
   - Stash changes
   - Abort

### Network Issues

If fetch fails:

1. Retry once with verbose output
2. If still failing, **HALT** and suggest offline branch creation with warning

## Examples

### Create Feature Branch from Story (Standard)

```
Input: /create-branch story.180.3.quick-re-search-functionality.md
Current Branch: develop

User Prompt:
  Question: "Which branch should be the base for feature/story.180.3.quick-re-search-functionality?"

  Options:
  1. develop (Recommended)
     Description: "Standard Gitflow - start from integration branch"

User selects: develop

Output:
  ✅ Created branch: feature/story.180.3.quick-re-search-functionality
     Base: develop (user selected)
     Tracking: origin/feature/story.180.3.quick-re-search-functionality
```

### Create Sub-story Branch from Feature Branch

```
Input: /create-branch story.309.2.3A.core-notification-ui.md
Current Branch: feature/story.309.2.3.mobile-notification-center

User Prompt:
  Question: "Which branch should be the base for feature/story.309.2.3A.core-notification-ui?"

  Options:
  1. feature/story.309.2.3.mobile-notification-center (Recommended)
     Description: "Use current branch - groups related sub-story work together"

  2. develop
     Description: "Standard Gitflow - treats as independent feature"

User selects: feature/story.309.2.3.mobile-notification-center

Output:
  ✅ Created branch: feature/story.309.2.3A.core-notification-ui
     Base: feature/story.309.2.3.mobile-notification-center (sub-story)
     Tracking: origin/feature/story.309.2.3A.core-notification-ui
```

### Create Hotfix Branch

```
Input: /create-branch --hotfix v1.2.1 "fix payment timeout"

Output:
  ✅ Created branch: hotfix/v1.2.1
     Base: main
     Tracking: origin/hotfix/v1.2.1
```

### Create Release Branch

```
Input: /create-branch --release v1.3.0

Output:
  ✅ Created branch: release/v1.3.0
     Base: develop
     Tracking: origin/release/v1.3.0
```

## Related Skills

- `/commit-changes` - Stage and commit changes with conventional commit messages
- `/create-pr` - Create a pull request for the current branch
- `/develop` - Full story implementation workflow

---

## Pipeline Lock Cooperation (when invoked by `/develop-story` or `/develop-task`)

When this skill is invoked as a step in a develop pipeline, advance the pipeline lock as the **last action** before returning, so the orchestrator's next turn does not depend on model discipline:

```bash
if [ -f .claude/state/develop-pipeline.lock ]; then
  bash .agents/skills/create-branch/references/advance-pipeline-lock.sh --skill create-branch 2>/dev/null || true
fi
```

Idempotent in every degraded path: noops when the lock is missing (skill invoked standalone), already advanced past this step, or the helper script is not installed. Full rationale and cooperation order with the `Stop` hook: see [`references/pipeline-lock-cooperation.md`](references/pipeline-lock-cooperation.md).
