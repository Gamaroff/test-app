---
name: develop-pipeline-step-4-create-pr
description: Step 4 (create-PR) shared by develop-story and develop-task. Covers scope-based staging (build SCOPE from work-item dir + changed-code paths, pre-flight guard for out-of-scope untracked files, --scope flags passed to /create-pr → /commit-changes), tracker-conditional --issue flag, leak verification, restore of held files, post-PR steps (Decisions Log, lock pr_url update), Jira tracker update (PR-opened comment + In Review transition), pipeline continuation banner, and failure handling. Story vs task variants called out where they differ.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-step-4-create-pr.md. Regenerate via `npm run bundle`. -->

# Develop Pipeline — Step 4: Create PR

## When This Document Applies

Loaded by `/develop-story` and `/develop-task` during Step 4. Story/task variants are called out in labeled sub-sections where they differ.

---

## PR Target by Skill (Q2 Derivation)

The PR base branch (`--base {Q2_answer}`) is derived in Phase 0d and differs by skill:

| Skill           | Q2 source                   | Default   | Why                                                                                                                                                                                                                       |
| --------------- | --------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `develop-story` | Asked via `AskUserQuestion` | `develop` | Story branches are cut from `develop` and PR back to `develop` (standard Gitflow feature branches); user may redirect (e.g. `main` for a hotfix story). See Phase 0d in `develop-pipeline-step-0-resolve-and-prepare.md`. |
| `develop-task`  | Asked via `AskUserQuestion` | `develop` | Tasks are standalone; user picks the base (typically `develop`, sometimes `main` for hotfixes).                                                                                                                           |

`{Q2_answer}` is resolved before Step 4 runs — Step 4 just consumes the variable. If `{Q2_answer}` is empty here, that is a Phase 0d bug; HALT with `Step 4: missing Q2_answer (PR base branch)`.

---

## Build Staging Scope

Before invoking `/create-pr`, build the set of paths that should be staged in the auto-commit. Start with the work-item dir, then add the top-level dirs of any new or changed code files since the base branch:

```bash
# SCOPE_PATHS: always include the work-item dir
SCOPE_PATHS=("{work-item-dir}")

# Add top-level dirs of files changed/added since the base branch
# (the pre-develop surface map provides these; fall back to git diff)
CHANGED_DIRS=$(git diff --name-only "{Q2_answer}...HEAD" \
  | xargs -I{} dirname {} \
  | sort -u)
while IFS= read -r dir; do
  [[ -z "$dir" || "$dir" == "." ]] && continue
  # avoid adding a dir that is already under {work-item-dir}
  case "$dir" in "{work-item-dir}"*) continue;; esac
  SCOPE_PATHS+=("$dir")
done <<< "$CHANGED_DIRS"
```

Log the final `SCOPE_PATHS` array in the Decisions Log before proceeding.

---

## Pre-flight Guard

With the scope set determined, detect any untracked paths in the working tree that fall outside every scope dir. Move them to a temporary hold dir before the PR so they are not accidentally staged; restore them after.

```bash
HOLD_DIR=$(mktemp -d /tmp/pipeline-hold-XXXXXX)
HELD=()

while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  IN_SCOPE=false
  for sp in "${SCOPE_PATHS[@]}"; do
    case "$f" in "${sp}"*) IN_SCOPE=true; break;; esac
  done
  if [ "$IN_SCOPE" = false ]; then
    mkdir -p "$HOLD_DIR/$(dirname "$f")"
    mv "$f" "$HOLD_DIR/$f"
    HELD+=("$f")
  fi
done < <(git status --porcelain | grep '^??' | awk '{print $2}')

if [ ${#HELD[@]} -gt 0 ]; then
  echo "Pre-flight: ${#HELD[@]} out-of-scope file(s) held in $HOLD_DIR" | tee -a Issues Log
  printf '  - %s\n' "${HELD[@]}" | tee -a Issues Log
fi
```

> **Alternative (halt-and-ask):** Replace the `mv` block with a HALT if you prefer to prompt the user to move out-of-scope files manually before resuming, rather than holding them automatically.

---

## Invoke /create-pr

Invoke the `/create-pr` skill passing `--base {Q2_answer}`, one `--scope` flag per entry in `SCOPE_PATHS`, and conditionally `--issue`. Branch on tracker platform for the `--issue` flag:

- **GitHub** (`TRACKER=github`): also pass `--issue {TRACKER_ISSUE}` — `create-pr` will add `Closes #N` to the PR body and comment on the GitHub issue.
- **Jira** (`TRACKER=jira`): omit `--issue` — `create-pr` handles Bitbucket PR creation natively; Bitbucket Issues are not enabled for this project, so passing `--issue` would cause a failed comment attempt.

#### develop-story (Jira note)

The PR body will reference the story file which contains `jira_key`.

#### develop-task (Jira note)

The PR body will reference the task file which contains `jira_key`.

This pre-supplies the target branch via create-pr's Step 0, skipping the interactive prompt entirely. Do not wait for create-pr to ask — Q2 is already resolved.

#### develop-story invocation

```
/create-pr --base {Q2_answer} --issue {TRACKER_ISSUE} --scope {work-item-dir} --scope {code-dir-1} ...
```

#### develop-task invocation

```
/create-pr --base {Q2_answer} --issue {TRACKER_ISSUE} --scope {work-item-dir} --scope {code-dir-1} ...
```

(Omit `--issue` when `TRACKER=jira` per the rule above. Omit extra `--scope` entries when no changed-code dirs were identified — `--scope {work-item-dir}` alone is always the minimum.)

After create-pr completes, verify no out-of-scope path leaked into the commit:

```bash
git log -1 --name-only HEAD | tail -n +3 | while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  IN_SCOPE=false
  for sp in "${SCOPE_PATHS[@]}"; do
    case "$f" in "${sp}"*) IN_SCOPE=true; break;; esac
  done
  [ "$IN_SCOPE" = false ] && echo "LEAK: $f"
done | grep -q 'LEAK' && echo "LEAK DETECTED" || echo "OK"
```

If the verification prints any LEAK lines, note them in the Issues Log (does not warrant a halt — investigate before the next pipeline run).

### The implementation report IS committed here — and only here does its first commit belong

Stage the report in this commit. Steps 5–6 then exclude its **updates** from each `fix(...)` commit,
and Step 8 commits its final state. That ordering is deliberate, and the two halves are different
things: this step commits **the file**, Steps 5–6 defer **changes to a file that already exists**.

Withholding the file itself until Step 8 was the previous behaviour and it had two costs, one of
which is close to invisible:

- **A reviewer cannot read the audit trail while the PR is under review.** The report is the record
  of what the pipeline decided and why. Between Step 4 and Step 8 — which spans the entire QA loop,
  the part of the run most worth reviewing — it did not exist in the branch at all.
- **Any document that links to the report acquires a dangling relative link, and it fails only in
  CI.** Consumers reasonably cross-reference the report from the work item; the file is present in
  the working tree (untracked), so a link checker run locally resolves it, while CI checks out only
  tracked files and does not. The result is a red build that cannot be reproduced by running the same
  command in the same directory, which is the most expensive shape a defect can take.

> **If you are diagnosing a link failure that reproduces in CI and not locally, check the tracked
> tree, not the working tree:** `git worktree add --detach /tmp/probe HEAD` and run the gate there.
> A dirty working tree hides exactly this class of failure.

Its final state is captured in the dedicated Step 8 commit.

---

## Restore Held Files

After PR creation (and the leak check above), restore any files the pre-flight guard moved aside:

```bash
if [ -d "$HOLD_DIR" ] && [ -n "$(ls -A "$HOLD_DIR" 2>/dev/null)" ]; then
  cp -r "$HOLD_DIR"/. .
  rm -rf "$HOLD_DIR"
  echo "Restored held files from $HOLD_DIR" | tee -a Issues Log
fi
```

---

## Post-PR Steps (shared)

After the PR is created:

- Record the PR URL in the Decisions Log and in the **PR** field of the Completion section
- Update Pipeline Progress Notes: `PR #{N}: {url}` — e.g. `PR #42: https://github.com/org/repo/pull/42`
- Update Pipeline Progress: ✅ create-pr
- **Update the lock file with the PR URL** so the PreCompact hook can post pause comments:
  ```bash
  jq --arg url "{PR_URL}" '.pr_url = $url' .claude/state/develop-pipeline.lock \
    > .claude/state/develop-pipeline.lock.tmp && mv .claude/state/develop-pipeline.lock.tmp .claude/state/develop-pipeline.lock
  ```

### Post-PR State Verification (shared — uses tracker state poller)

Invoke the tracker state poller (see `references/tracker-state-poller-subagent.md`) via an Explore subagent with `PR_NUMBER={PR_NUMBER}` and `ISSUE_KEY=` (empty). Verify:

- `result.pr.state == "OPEN"` → proceed normally
- `result.pr.state == "MERGED"` or `"CLOSED"` → log warning in Issues Log: "PR #{PR_NUMBER} unexpectedly {state} after creation — possible auto-merge or branch policy"; proceed (non-blocking)
- `result.errors | length > 0` → log each error in Issues Log; proceed (non-blocking)

Log in Decisions Log: "Post-PR state check: PR #{PR_NUMBER} state = {state}. errors = {error_count}."

---

## GitHub Board Update (when `TRACKER=github` and `TRACKER_ISSUE` is set)

> **MUST execute — pipeline action, not optional sync.** This is the GitHub Projects counterpart to the Jira "In Review" transition below. `create-pr` already posts the PR-opened `gh issue comment`; this step additionally moves the issue's board column.

After the PR URL is confirmed, **signal the `in-review` stage** — run the deterministic CLI:

```bash
node .agents/skills/{develop-story|develop-task|develop-bug}/references/gh-stage.js \
  --issue {TRACKER_ISSUE} --stage in-review --json
```

The column this lands in comes from `pipeline.in-review` in `tracker-workflow.yaml`. Run `gh-stage.js --probe-board` to see your board's real options and which moment each resolves to. Engine source: `references/gh-stage.js` (bundled into each skill as `references/gh-stage.js`).

Read `reason` from the JSON. The CLI has already resolved the target column, mutated it and re-read the result; it exits 0 for `already`, `stage-disabled`, `no-option`, `not-on-board` and `would-regress` alike, all of which are correct outcomes on some boards. Log its line and move on.

Log in Decisions Log: "GitHub board: in-review → {landed / already / no-option / would-regress}."

---

## Jira Tracker Update (when `TRACKER=jira` and `TRACKER_ISSUE` is set)

> **MUST execute — pipeline action, not optional sync.** Do not skip on the basis of any user memory that says "Jira sync is manual" (e.g. `feedback_jira_sync_manual_only.md`). That rule applies only to `/create-epic`, `/create-story`, `/create-task` — never to develop-pipeline steps. This is the symmetric Jira counterpart to the GitHub `gh issue comment` posted by `create-pr` in the `TRACKER=github` path.

After extracting the PR URL from `create-pr`'s output:

1. **Post PR-opened comment** — one call, both trackers:

   ```bash
   mkdir -p .claude/state
   # Terminator at COLUMN 0 — an indented terminator does not close an
   # unquoted heredoc; bash swallows everything after it into the body,
   # so the call below would never run. Body lines are unindented for
   # the same reason: leading spaces are written verbatim.
   cat > .claude/state/comment-body.md <<EOF
PR opened — {PR_URL}
EOF

   node .agents/skills/{develop-story|develop-task|develop-bug}/references/tracker-comment.js \
     --issue {TRACKER_ISSUE} --body-file .claude/state/comment-body.md \
     --stage in-review \
     --slot pr="{PR_URL}" \
     --json
   ```

   > **`pr` is the only slot `in-review` reads.** Pass the full PR **URL**, not the number: the lead
   > renders it parenthetically ("submitted for review (…)") for a reader who is not going to look up
   > `#412` in a repository they may not have open. `PR_URL` is bound by `/create-pr` immediately above
   > this call, which is the earliest point at which it exists.

> Engine source: `references/tracker-comment.js` (bundled into each skill as `references/tracker-comment.js`). Contract: `references/tracker-comment-contract.md`.


   Read `reason` and act per the table in [`references/tracker-comment-contract.md`](tracker-comment-contract.md) — `posted`/`already`/`deferred` need nothing, `unverifiable` is logged and never posted over, and `no-credentials` is the one case that may fall back to MCP.

2. **Signal the `in-review` stage** — run the deterministic CLI:

   ```bash
   node .agents/skills/{develop-story|develop-task|develop-bug}/references/jira-stage.js \
     --issue {TRACKER_ISSUE} --stage in-review --json
   ```

   On `reason: "no-credentials"`, **fall back** to `references/jira-transition-protocol.md` with `candidates = ["In Review", "Code Review", "Ready for Review", "Waiting for Review", "Peer Review", "Review"]` and `terminal = false`. The protocol's MUST-NOT clauses are binding: if no transition matches, log the skip and return without calling `transitionJiraIssue`. Do NOT fall back to `To Do`, `In Progress`, or any other transition — the issue must remain `In Progress` through QA when no review state exists in the workflow.

   > **On a board whose review transition demands time logged.** Some workflows put a validator on the review transition ("Please enter the time spent…"). Validators are invisible to the transitions API, so this cannot be predicted — it surfaces as a 400 on the attempt. The CLI retries once with a worklog **only** when the project has opted in via `jira.worklogTimeSpent` in `skills-config.yaml`, and it never invents a duration. If the log shows that 400 and no retry, that setting is missing. The MCP fallback path cannot satisfy such a validator at all; move the card by hand.

Log in Decisions Log: "Jira {TRACKER_ISSUE} — PR comment posted; status: {landed status, or the skip reason}."

---

## On Failure

#### develop-story

Log in Issues Log. Invoke the `/commit-changes` skill to commit the report (suggested message: `docs(story.{epic}.{story}): implementation report — create-pr failure`), push, then HALT.

#### develop-task

Log in Issues Log. Invoke the `/commit-changes` skill to commit the report (suggested message: `docs(task.{id}): implementation report — create-pr failure`), push, then HALT.

---

## Pipeline Continuation (CRITICAL — PIPELINE DOES NOT END HERE)

Steps 5–8 are mandatory. Do NOT emit a "Step 4 COMPLETE" banner here — that competes with the Step Transition Protocol banner in SKILL.md and creates ambiguity at the boundary. The only output at this transition is the Step Transition Protocol's own action 3 — the Remaining Work Status block followed by the Step 5 banner (`═══ DEVELOP-{STORY,TASK} PIPELINE: STEP 5/8 — QA REVIEW ═══`), both emitted by the orchestrator _after_ the lock-advance Bash call.

Record `PR created: {PR URL}` in the implementation report's Decisions Log only — not as a user-facing banner.
