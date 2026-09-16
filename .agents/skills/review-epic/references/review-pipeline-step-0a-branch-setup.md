---
name: review-pipeline-step-0a-branch-setup
description: Step 0a (branch setup) shared by review-story, review-task, review-bug, and review-epic. Resolves doc context, short-circuits in validate mode, auto-skips when already on a matching feature branch, and prompts the user to create a feature branch from the base branch (default develop). review-story / review-task / review-bug cut a story/task/bug feature branch from develop; review-epic cuts an epic-document feature branch from develop. Mirrors the methodology used by develop-pipeline Phase 0d + Step 1 so consumers stay consistent.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/review-pipeline-step-0a-branch-setup.md. Regenerate via `npm run bundle`. -->

# Review Pipeline — Step 0a: Branch Setup

## When This Document Applies

Loaded by `/review-story`, `/review-task`, `/review-bug`, and `/review-epic` as the **first executable step in the workflow**, after Step 0 (output-format / mode detection) but **before** any document mutation, frontmatter edit, tracker (Jira/GitHub) sync, or review-report write. Skill-specific variants are called out in labeled sub-sections where they differ.

Goal: ensure review artifacts (frontmatter status changes, Change Log entries, `.review.*.md` reports, Jira/GitHub syncs) land on a dedicated feature branch — not on `develop` or `main`.

This protocol intentionally mirrors the methodology used by the develop pipeline (Phase 0d + Step 1) so the user sees the same prompts and branch names regardless of entry point. Cross-references in this doc use plain prose, not file paths, to avoid bundler auto-pickup of unrelated develop-pipeline references.

## Caller pre-conditions

The calling skill MUST have already resolved:

- `DOC_FILE` — absolute path to the document being reviewed (set by Input Resolution; review-epic gets this from the new "Locate epic file" pre-workflow step).
- `MODE` — `interactive` or `validate` (review-story / review-task / review-bug only; review-epic has no validate mode).
- `SKILL_NAME` — one of `review-story`, `review-task`, `review-bug`, `review-epic` (used as the stash tag).

---

## 0a.0 Validate-mode short-circuit (review-story + review-task + review-bug only)

```bash
if [ "$MODE" = "validate" ]; then
  echo "✅ Validate mode — branch is owned by the develop pipeline, skipping 0a"
  return 0
fi
```

Rationale: validate mode is invoked from `/develop-story`, `/develop-task`, or `/develop-bug` Step 2, where Step 1 has already created and checked out the feature branch.

Review-epic has no validate mode — skip this section.

---

## 0a.1 Detect current branch

```bash
CURRENT_BRANCH=$(git branch --show-current)
```

If `CURRENT_BRANCH` is empty (detached HEAD): HALT with "Detached HEAD detected — cannot run review safely. Check out a branch first."

Detect the base-branch convention (some repos use `main`, not `develop`):

```bash
if git rev-parse --verify --quiet "refs/heads/develop" >/dev/null \
   || git ls-remote --exit-code --heads origin develop >/dev/null 2>&1; then
  BASE_DEFAULT=develop
else
  BASE_DEFAULT=main
fi
```

`BASE_DEFAULT` is used wherever this spec says "from `develop`" — substitute `${BASE_DEFAULT}`.

---

## 0a.2 Resolve doc context (extract IDs from `DOC_FILE`)

Run **before** the auto-skip check — auto-skip patterns depend on these IDs.

#### review-story

```bash
STORY_BASENAME=$(basename "$DOC_FILE" .md)           # e.g. story.8.2.configure-validation-pipe
EPIC_NUM=$(echo "$STORY_BASENAME" | awk -F. '{print $2}')
STORY_NUM=$(echo "$STORY_BASENAME" | awk -F. '{print $3}')

EPIC_REF=$(grep '^epic:' "$DOC_FILE" | awk '{print $2}')
if [ -z "$EPIC_REF" ]; then
  echo "❌ Story must have an 'epic:' frontmatter field (e.g. epic: epic.178.feature-ui)."
  exit 1
fi
```

#### review-task

```bash
TASK_BASENAME=$(basename "$DOC_FILE" .md)            # e.g. task.2.home-page-content-realignment
TASK_ID=$(echo "$TASK_BASENAME" | awk -F. '{print $2}')
```

#### review-bug

```bash
BUG_BASENAME=$(basename "$DOC_FILE" .md)             # e.g. bug.7.stale-token OR story.8.5.3.bug.1.cache-leak
BUG_PREFIX="$BUG_BASENAME"                            # the full stem; used for branch matching
```

#### review-epic

```bash
EPIC_BASENAME=$(basename "$DOC_FILE" .md)            # e.g. epic.42.payments
EPIC_NUM=$(echo "$EPIC_BASENAME" | awk -F. '{print $2}')
EPIC_SLUG=$(echo "$EPIC_BASENAME" | sed 's/epic\.[0-9]*\.//')
EPIC_BRANCH="feature/epic.${EPIC_NUM}.${EPIC_SLUG}"
```

---

## 0a.3 Auto-skip check (pipeline re-entry safety)

If `CURRENT_BRANCH` already matches the doc's expected feature-branch pattern, set `BRANCH_NAME="$CURRENT_BRANCH"`, set `AUTO_SKIPPED=true`, **and fall through to 0a.9 for logging** (skip 0a.4–0a.8).

#### review-story

```bash
case "$CURRENT_BRANCH" in
  feature/story.${EPIC_NUM}.${STORY_NUM}.*)
    BRANCH_NAME="$CURRENT_BRANCH"; AUTO_SKIPPED=true ;;
esac
```

#### review-task

```bash
case "$CURRENT_BRANCH" in
  feature/task.${TASK_ID}.*) BRANCH_NAME="$CURRENT_BRANCH"; AUTO_SKIPPED=true ;;
esac
```

#### review-bug

Generous match so pipeline re-entry (already on the `develop-bug` branch, whatever `/create-branch` named it — `feature/*`, `bugfix/*`, or a `hotfix/*`) always short-circuits:

```bash
case "$CURRENT_BRANCH" in
  feature/*"${BUG_PREFIX}"*|bugfix/*"${BUG_PREFIX}"*|feature/*bug*|hotfix/*)
    BRANCH_NAME="$CURRENT_BRANCH"; AUTO_SKIPPED=true ;;
esac
```

#### review-epic

```bash
case "$CURRENT_BRANCH" in
  feature/epic.${EPIC_NUM}.*) BRANCH_NAME="$CURRENT_BRANCH"; AUTO_SKIPPED=true ;;
esac
```

If `AUTO_SKIPPED=true`: log `"✅ Already on matching branch: $CURRENT_BRANCH — skipping branch prompt"` and jump to 0a.9.

---

## 0a.4 Prompt the user (AskUserQuestion)

Use the `AskUserQuestion` tool. The recommended option is always **first** (one-keypress accept). Users override via "Other".

#### review-story

Story branches are cut from `${BASE_DEFAULT}` (standard Gitflow feature branches). Detect current branch family for the recommended option:

- On `${BASE_DEFAULT}` or `main`: options `${BASE_DEFAULT}` (Recommended) / `main` / `Other`
- On any `feature/*` branch: options `${BASE_DEFAULT}` (Recommended) / `feature/{current}` / `Other`

**Header:** `Story branch` — **Question:** "Which branch should `feature/story.${EPIC_NUM}.${STORY_NUM}.*` be based on?"

#### review-task

Detect current branch family for the recommended option:

- On `${BASE_DEFAULT}` or `main`: options `${BASE_DEFAULT}` (Recommended) / `main` / `Other`
- On any `feature/*` branch: options `feature/{current}` (Recommended) / `${BASE_DEFAULT}` / `Other`

**Header:** `Task branch` — **Question:** "Which branch should `feature/task.${TASK_ID}.*` be based on?"

#### review-bug

Bug review edits land on a bug feature branch cut from `${BASE_DEFAULT}` (same convention `develop-bug` uses). Detect current branch family for the recommended option:

- On `${BASE_DEFAULT}` or `main`: options `${BASE_DEFAULT}` (Recommended) / `main` / `Other`
- On any `feature/*`/`bugfix/*` branch: options `feature/{current}` (Recommended) / `${BASE_DEFAULT}` / `Other`

**Header:** `Bug branch` — **Question:** "Which branch should the review of `${BUG_PREFIX}` be based on?"

#### review-epic

**Header:** `Epic branch` — **Question:** "Create epic branch `{EPIC_BRANCH}` from `${BASE_DEFAULT}` for this review?"

- "Create from ${BASE_DEFAULT}" (Recommended)
- "Other (specify branch)"
- "Abort review"

> "Stay on current branch" is intentionally **not** an option for review-epic. Users on `develop`/`main` who want to skip branch creation should abort, switch manually, and re-run.

### Handling "Other" answers

When a user picks "Other", follow up with a plain-text prompt: "Enter the branch name to use as base." Validate that the named branch exists locally or on `origin`; reject and re-prompt if not. Store the validated branch as `BASE_BRANCH`.

### Handling "Abort review"

HALT cleanly. No edits made, no stash created (we haven't reached 0a.5 yet).

### Storing answers

- `BASE_BRANCH` ← branch answer (review-story / review-task) or "Other" plain-text input.
- `CREATE_EPIC_BRANCH=true|false` ← review-epic answer (review-epic only).

---

## 0a.5 Stash work before branch operations

Stash any in-progress edits so subsequent branch operations operate on a clean working tree. Use `git stash create` + `git stash store` to avoid grep-based detection of placeholder strings:

```bash
STASH_HASH=$(git stash create)
if [ -n "$STASH_HASH" ]; then
  git stash store -m "${SKILL_NAME}: pre-branch-setup" "$STASH_HASH"
  git reset --hard HEAD
  STASH_PUSHED=true
else
  STASH_PUSHED=false
fi
```

- `git stash create` returns an empty string when the tree is clean — no spurious stash entry.
- The hash is stored explicitly so the pop step can target it regardless of stash-stack position.

Save the stash ref for 0a.8:

```bash
[ "$STASH_PUSHED" = "true" ] && STASH_REF="$STASH_HASH"
```

---

## 0a.6 Create the epic-document branch (review-epic only, when `CREATE_EPIC_BRANCH=true`)

> **Idempotence**: re-check immediately before each mutation — the branch may have appeared on remote between detection and creation.
>
> This creates an ordinary epic-**document** feature branch (`feature/epic.{n}.{name}`) from `${BASE_DEFAULT}` for reviewing/editing the epic doc — it is **not** a long-lived integration branch. review-story and review-task never reach this section; they branch a story/task feature branch from `${BASE_DEFAULT}` in 0a.7.

```bash
git fetch origin
git checkout "${BASE_DEFAULT}"
git pull origin "${BASE_DEFAULT}"

if git rev-parse --verify --quiet "refs/heads/${EPIC_BRANCH}" >/dev/null; then
  git checkout "${EPIC_BRANCH}"
else
  git checkout -b "${EPIC_BRANCH}"
fi

if git ls-remote --exit-code --heads origin "${EPIC_BRANCH}" >/dev/null 2>&1; then
  git branch --set-upstream-to=origin/"${EPIC_BRANCH}" "${EPIC_BRANCH}"
else
  git push -u origin "${EPIC_BRANCH}"
fi
```

Log: `"✅ Epic branch ready: ${EPIC_BRANCH}"`.

For **review-epic**: this is the final branch. Set `BRANCH_NAME="${EPIC_BRANCH}"` and skip to 0a.8.

---

## 0a.7 Invoke /create-branch (review-story + review-task + review-bug)

Invoke the `/create-branch` skill with `DOC_FILE`. When `create-branch` asks for the base branch, supply the resolved `BASE_BRANCH` — **do not let the user be re-prompted**.

After `/create-branch` returns:

```bash
BRANCH_NAME=$(git branch --show-current)
```

Verify `BRANCH_NAME` is non-empty and matches the expected pattern (`feature/story.*`, `feature/task.*`, or — for review-bug — any `feature/*`/`bugfix/*` branch carrying the bug stem); HALT if not.

---

## 0a.8 Restore the stash

```bash
if [ "$STASH_PUSHED" = "true" ]; then
  if ! git stash pop; then
    echo "❌ Stash pop failed (likely conflict). Stash preserved as: $STASH_REF"
    echo "   Recover with: git checkout $STASH_REF -- ."
    exit 1
  fi
fi
```

HALT on conflict — do not mutate documents on a broken tree.

---

## 0a.9 Post-conditions & logging

Variables exported to subsequent steps:

- `BRANCH_NAME` — branch the review runs on
- `BASE_BRANCH` — base used (empty when `AUTO_SKIPPED=true`)
- `EPIC_BRANCH` — set for review-epic (its epic-document branch); empty for review-story + review-task
- `AUTO_SKIPPED` — `true` when 0a.3 short-circuited

### Logging destination

| Output mode                        | Destination                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| Comprehensive report               | Decisions Log section in the review report (add before saving the report file) |
| Inline action plan / Validate mode | One-line preamble before the action plan / verdict                             |

Decisions Log entry format:

```
Branch setup:
  - Started on: ${CURRENT_BRANCH}
  - Now on:     ${BRANCH_NAME}
  - Base:       ${BASE_BRANCH:-<auto-skipped>}
  - Epic branch:${EPIC_BRANCH:-N/A}
  - Auto-skip:  ${AUTO_SKIPPED:-false}
```

Inline preamble (one line):

```
> Branch: `${BRANCH_NAME}` (base: `${BASE_BRANCH:-<auto-skipped>}`)
```

---

## On Failure

Any `git` or `/create-branch` error in 0a.5–0a.8:

1. Attempt to restore the stash via `git stash pop` (when `STASH_PUSHED=true`); if pop also fails, surface `STASH_REF` to the user for manual recovery.
2. HALT with the exact error.
3. Do **not** proceed to any document mutation — the review can be re-run cleanly once branch state is fixed.

No pipeline lock file is written; the develop-pipeline lock (`.claude/state/develop-pipeline.lock`) is owned exclusively by `/develop-story` and `/develop-task`.
