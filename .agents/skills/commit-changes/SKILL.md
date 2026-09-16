---
name: commit-changes
description: 'Create high-quality git commits: review/stage intended changes, split into logical commits, and write clear commit messages (including Conventional Commits). Use when the user asks to commit, craft a commit message, stage changes, or split work into multiple commits.'
---

# Commit work

## Goal

Make commits that are easy to review and safe to ship:

- only intended changes are included
- commits are logically scoped (split when needed)
- commit messages describe what changed and why

## Inputs to ask for (if missing)

- Single commit or multiple commits? (If unsure: default to multiple small commits when there are unrelated changes.)
- Commit style: Conventional Commits are required.
- Any rules: max subject length, required scopes.

## Flags

| Flag | Description | Example |
|------|-------------|---------|
| `--exclude <path>` | Exclude a file from staging (repeatable). Switches from patch staging to full-tree staging with explicit pathspec exclusion. | `--exclude docs/task.14.impl.md` |
| `--scope <path>` | Allowlist paths for staging (repeatable). Switches to `git add -u` plus explicit `git add -- <paths>`; `git add -A` is never called in scope mode. | `--scope docs/tasks/task.5/` |

### `--exclude` mode

When one or more `--exclude <path>` flags are passed (and no `--scope`), collect all values into an array and use full-tree staging in step 3 instead of patch staging:

```bash
git add -A -- '.' ':(exclude)path/one' ':(exclude)path/two'
```

The `:(exclude)` magic is the documented pathspec form (gitglossary(7)). The bare `:!path` short-form is avoided because it requires an accompanying positive pathspec to behave correctly. Multiple `--exclude` flags each expand to one `':(exclude)<p>'` argument.

This is the **enforced form** of the advisory rule in step 3a — the flag converts documentation into a flag-driven guarantee. The advisory rule remains for standalone invocations without the flag.

**Smoke test** (verify the excluded file is absent from staged set):
```bash
git add -A -- '.' ':(exclude)path/to/file.md' && git diff --cached --name-only | grep -c 'file.md' | grep -q '^0$' && echo "OK" || echo "LEAK"
```

### `--scope` mode

When one or more `--scope <path>` flags are passed, collect all values into an array and use allowlist-mode staging in step 3 instead of patch staging:

```bash
git add -u                              # tracked modifications (any path) — safe
git add -- "scope/one" "scope/two" ... # explicit new artifacts / work-item dirs
# git add -A is NEVER called in scope mode
```

`git add -u` picks up tracked modifications across the whole tree. The explicit `git add -- <path>` calls add any new untracked files inside the named dirs. New untracked files outside the named scope dirs are NOT staged — the caller must list them explicitly via additional `--scope` flags.

**Precedence with `--exclude`** — the two flags coexist. Stage the scope set first, then remove any `--exclude` path from within it ("exclude wins inside scope"):

```bash
git restore --staged -- "<exclude-path>" 2>/dev/null || true
```

If a path appears in both `--scope` and `--exclude`, it is staged by the scope pass then immediately removed by the exclude pass; the net result is unstaged.

**With neither `--scope` nor `--exclude`**: behaviour unchanged (patch staging / existing advisory rule).

**Smoke test** (an unrelated sibling must NOT be staged under `--scope`):
```bash
git add -u && git add -- docs/tasks/task.X/
git diff --cached --name-only | grep -q 'task.Y' && echo "LEAK" || echo "OK"
```

## Workflow (checklist)

0. Analyze recent commits to match repository style
   - `git log -5 --pretty=format:"%h - %s%n%b"`
   - Note: subject length, body structure, level of detail
   - This repo uses detailed bullet-point bodies listing specific changes
1. Inspect the working tree before staging
   - `git status`
   - `git diff` (unstaged)
   - If many changes: `git diff --stat`
2. Decide commit boundaries (split if needed)
   - Split by: feature vs refactor, backend vs frontend, formatting vs logic, tests vs prod code, dependency bumps vs behavior changes.
   - If changes are mixed in one file, plan to use patch staging.
3. Stage only what belongs in the next commit
   - Prefer patch staging for mixed changes: `git add -p`
   - To unstage a hunk/file: `git restore --staged -p` or `git restore --staged <path>`
3a. **Check for files that must NOT be committed yet**

Before finalising staging, check for any files that should be excluded from this commit:
- **Implementation report *updates*** (`*.implementation.*.md`) — once the report is tracked, keep its
  churn out of unrelated commits: `git restore --staged path/to/story.*.implementation.*.md`. When
  called by the pipeline orchestrator with `--exclude <path>`, the flag enforces this automatically
  via pathspec magic (see Flags section above) — no manual unstage needed.

  **This defers updates to a file that already exists. It is not a licence to withhold the file's
  first commit.** An untracked file that a *tracked* document links to is a dangling relative link,
  and it fails asymmetrically: the file is present in the working tree, so a link checker run locally
  resolves it and passes, while CI checks out only tracked files and goes red. That produces a red
  build which cannot be reproduced by running the same command in the same directory — the most
  expensive shape a defect can take, and one that survives every local gate. If a document you are
  committing links to a file, commit the file with it.

  > Diagnosing a link failure that reproduces in CI and not locally: check the **tracked** tree.
  > `git worktree add --detach /tmp/probe HEAD` and run the gate there. A dirty working tree hides
  > exactly this class of failure.
- **DoD running summaries** (`*.dod.*.md`) — only commit these when finalise has completed
- **Partial QA artifacts** — gate files and QA reports are owned by QA; dev should not commit them unless explicitly part of the current work

If unsure whether a generated file should be included, err on the side of exclusion and note it in the commit message as "not yet included".
4. Review what will actually be committed
   - `git diff --cached`
   - Sanity checks:
     - no secrets or tokens
     - no accidental debug logging
     - no unrelated formatting churn
5. Describe the staged change in 1-2 sentences (before writing the message)
   - "What changed?" + "Why?"
   - If you cannot describe it cleanly, the commit is probably too big or mixed; go back to step 2.
6. Write the commit message
   - Use Conventional Commits (required):
     - `type(scope): short summary`
     - blank line
     - body with **detailed bullet points**:
       - Specific files/components affected
       - Features added/updated
       - Related changes (tests, docs, config, migrations)
   - Prefer an editor for multi-line messages: `git commit -v`

   ### Tracker Issue Reference

   If a `GITHUB_ISSUE` number is available (passed from the pipeline orchestrator — works for both GitHub and Bitbucket issue numbers):
   - Append ` (#{N})` to the commit subject line
   - Example: `feat(story.37.1): account recovery transparency (#42)`

   If no issue number is available (standalone invocation or document lacks `github_issue`):
   - Commit message format is unchanged
   - Do NOT prompt the user for an issue number

   The issue reference is purely additive — it must never change the commit type, scope, or description.

7. Run the smallest relevant verification
   - Run the repo's fastest meaningful check (unit tests, lint, or build) before moving on.
8. Repeat for the next commit until the working tree is clean

## Commit Message Format Examples

Good commit message structure for this repository:

```
type(scope): concise subject describing what changed

- Add specific component/file changes
- Implement feature details with file paths
- Update related documentation
- Add/update tests for new functionality
- Configure build/deployment changes if applicable
```

Example from this repo:

```
feat(contacts): implement user discovery UI components

- Add SearchBar with debounced search input
- Create UserCard component for displaying @handles
- Implement ActionButton with loading/disabled states
- Update ContactsScreen to integrate search functionality
- Add unit tests for new components (95% coverage)
```

## Deliverable

Provide:

- commands used to analyze recent commits (`git log`)
- the final commit message(s) with detailed bullet-point bodies
- a short summary per commit (what/why)
- the commands used to stage/review (at minimum: `git diff --cached`, plus any tests run)

## Commit Report (always required)

After all commits are made, display a summary table in this exact format:

```
  ┌─────┬─────────┬──────────────────────────────────────────────────────────────────────────────────────────────────┐
  │  #  │ Commit  │                                               What                                               │
  ├─────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1   │ <hash>  │ <type(scope)> — <short description>                                                              │
  ├─────┼─────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 2   │ <hash>  │ <type(scope)> — <short description>                                                              │
  └─────┴─────────┴──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Rules for the table:
- Show one row per commit made in this session (oldest → newest)
- `#` is sequential starting at 1
- `Commit` is the 7-character short hash (from `git rev-parse --short HEAD` or `git log`)
- `What` is the commit subject line: `type(scope) — concise description` (dash `—` em-dash separator, no colon after scope)
- If only one commit was made, show a single-row table
- Always display this table — never skip it

---

## Pipeline Lock Cooperation (when invoked by `/develop-story` or `/develop-task`)

When this skill is invoked as a step in a develop pipeline, advance the pipeline lock as the **last action** before returning, so the orchestrator's next turn does not depend on model discipline:

```bash
if [ -f .claude/state/develop-pipeline.lock ]; then
  bash .agents/skills/commit-changes/references/advance-pipeline-lock.sh --skill commit-changes 2>/dev/null || true
fi
```

Idempotent in every degraded path: noops when the lock is missing (skill invoked standalone), already advanced past this step, or the helper script is not installed. It also noops (preserves the lock) when invoked as a **nested helper before the terminal commit** — `commit-changes` runs at Step 4 (via `create-pr`) and Steps 5–6 (via each `qa-fix` cycle), and the helper removes the lock only at the terminal Step 8 commit (`current_step >= 8`). So callers run this cooperation block unconditionally at every step; the nested invocations leave the lock intact for the `PreCompact`/`Stop` hooks. Full rationale and cooperation order with the `Stop` hook: see [`references/pipeline-lock-cooperation.md`](references/pipeline-lock-cooperation.md).
