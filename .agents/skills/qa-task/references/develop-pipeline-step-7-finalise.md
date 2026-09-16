---
name: develop-pipeline-step-7-finalise
description: Step 7 (finalise + tracker close) shared by develop-story and develop-task. Covers /finalise invocation, completion detection, DoD gaps halt, tracker issue update (GitHub close + board Done, Jira Done transition), DoD summary file location, and Pipeline Progress update. Story vs task variants called out where they differ (file path, commit message format, completion log phrase, completion comment text).
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-step-7-finalise.md. Regenerate via `npm run bundle`. -->

# Develop Pipeline — Step 7: Finalise

## When This Document Applies

Loaded by `/develop-story` and `/develop-task` during Step 7. Story/task variants are called out in labeled sub-sections where they differ.

---

## DO NOT Inline This Step (CRITICAL)

The orchestrator MUST invoke the `/finalise` skill via the Skill tool. It MUST NOT:

- Write the `dod.N.md` file directly with `Write` (the finalise skill produces it)
- Set `status: accepted` without first running `/finalise` (status is part of finalise's output, not a precondition)
- Skip /finalise in lite mode (lite mode only affects Step 5 QA — see `references/develop-pipeline-lite-mode.md`)

If you find yourself reaching for `Write` to author a DoD file, STOP and invoke `/finalise` instead. Inlining the step bypasses the DoD checks and produces an audit trail that doesn't match what the spec says happened.

---

## Invoke /finalise

#### develop-story

Invoke the `/finalise` skill with the story file path.

#### develop-task

Invoke the `/finalise` skill with the task file path.

---

## Detecting Completion

#### develop-story

After finalise returns, read the story file and check the `status:` frontmatter field:

- `accepted` → success, continue
- Any other status, or if finalise listed DoD gaps → halt

#### develop-task

After finalise returns, read the task file and check the `status:` frontmatter field:

- `accepted` → success, continue
- Any other status, or if finalise listed DoD gaps → halt

---

## If DoD Gaps Are Found

Log each gap with specific detail in Issues Log. Invoke the `/commit-changes` skill to commit the implementation report before halting so the audit trail is in git:

#### develop-story

Suggested commit message: `docs(story.{epic}.{story}): implementation report — finalise gaps identified`

#### develop-task

Suggested commit message: `docs(task.{id}): implementation report — finalise gaps identified`

Then push:

```bash
git push origin HEAD
```

Then HALT:

```
⚠️ Finalise identified Definition of Done gaps.
Review the implementation report at {path} and address the gaps before re-running /finalise.
```

---

## On Success

#### develop-story

Log "Story accepted" in Decisions Log.

#### develop-task

Log "Task completed" in Decisions Log.

### Change Log (shared)

`/finalise` appends the acceptance row **in the same edit** that sets `status: accepted`,
`completed_date` and `pr_number` — acceptance is the single most important event in a document's
life, and splitting the two writes is how one lands without the other. This step document states
the contract; `/finalise` performs the write. Canonical format:
[document-change-log.md](document-change-log.md).

| 2026-05-15 | 1.2 | DoD passed — accepted (PR #204) | finalise |

**`/finalise` is the only pipeline writer that bumps `Version`**, and it bumps the minor. Every
other pipeline row — `develop`, `qa-story`/`qa-task`, `qa-fix`, and the tracker syncs — leaves the
cell blank. Bumping per step would make `Version` a step counter instead of a document revision.

On the gaps path (`## If DoD Gaps Are Found` above) the row is written too, but the status is
deliberately unchanged, so **no Version bump**:

| 2026-05-15 |  | DoD incomplete — 3 gaps identified | finalise |

> **Two rows at acceptance is correct, not a duplicate.** Step 7 also re-runs
> `sync-jira-{story,task}`, and under the narrowed sync rules that sync writes a row only when it
> transitions the status — which at acceptance it does. So an accepted document ends with
> `DoD passed — accepted (PR #204)` from `finalise` and `Status → done` from the sync. They record
> two different events: the local acceptance decision, and the tracker reaching its terminal
> column.

> **Keep the Description clear of the literal `Definition of Done ... PASSED`.** The prior-run
> idempotence guard greps `^## Definition of Done.*(PASSED|✅)` to decide whether finalise has
> already run. A Change Log row echoing that phrasing at the start of a line would be counted by
> that check.

---

## The publish boundary — what `/finalise` has already done before it returns

`/finalise` Step 7 actions 6a–6c (task.115) commit the acceptance artefacts — the document with
`status: accepted`, the `*.dod.{N}.*.md` summary, `sprint-review-summary.md` and (tasks) the ticked
registry — **push them, assert each is tracked and on `origin/<branch>`, and take a second CI
reading on that pushed head**, all *before* its own PR comment, tracker comment, issue close and
board move. Every side-effect in this document therefore runs against a pushed, CI-green acceptance
commit. Two consequences for the orchestrator:

- **Step 8 no longer carries the acceptance artefacts.** It commits the implementation report (and
  nothing else new), so `git status` after `/finalise` returns should show only the report modified —
  **plus, on a Jira project, a frontmatter-only change to the document.** Step 7 action 8's
  Document-link re-point runs `sync-jira-{story,task} --doc-branch --no-transition` *after* the 6a
  commit, and that script rewrites `jira_last_synced_at` / `jira_last_body_hash` /
  `jira_last_meta_hash` on every run; that residue is expected and rides in Step 8's commit. Anything
  else still dirty — a DoD file, a sprint review, the document's `status:` or body — means 6a did not
  run: **HALT**, do not paper over it with Step 8's sweep. Tell the two apart mechanically rather than
  by eye:

  ```bash
  # Dirty paths other than the implementation report.
  OTHER=$(git status --porcelain | awk '{print $2}' | grep -v '\.implementation\.' || true)
  for f in $OTHER; do
    # The document is allowed ONLY a jira_last_* frontmatter residue. Every other changed
    # line — status:, body, a DoD or sprint-review file — is a boundary that was not crossed.
    if [ "$f" = "{document-path}" ]; then
      # `git diff HEAD`, not `git diff`: a document 6a staged but never committed shows `M ` in
      # porcelain and an EMPTY unstaged diff — the exact case this check targets. And filter only
      # the two header lines (`+++ `/`--- `): `^[+-][^+-]` also drops every changed bullet
      # (`+- item`, `-- item`), exempting bullet-only body edits (5c pass 2, CR-2/CR-3).
      git diff HEAD -- "$f" | grep -E '^[+-]' | grep -vE '^(\+\+\+|---) ' \
        | grep -vE '^[+-]jira_last_(synced_at|body_hash|meta_hash):' \
        | grep -q . && { echo "HALT: $f carries changes beyond the Jira sync residue — 6a did not run"; exit 1; }
    else
      echo "HALT: $f is dirty after /finalise returned — the publish boundary was not crossed"; exit 1
    fi
  done
  ```
- **The second CI reading is recorded here, not in the DoD file.** `/finalise` cannot write it into
  the summary without a further commit, so it hands back `CI reading 1: … @ …` and `CI reading 2:
  … @ …`; write both into the Decisions Log verbatim, and confirm the PR canonical comment carries
  them. A `/finalise` that returns with `status: accepted` but no reading 2 HALTed at 6c
  (`ci-not-green-on-acceptance-head`) — treat that as the gaps path below, not as success.

## Post DoD Body to PR (REQUIRED — lite and standard modes alike)

After the DoD file is written, post its **full content** as a PR comment so reviewers see the acceptance evidence on the PR itself (not only in the repo tree). A one-line "task/story accepted" comment is insufficient.

```bash
DOD_FILE=$(ls {story-or-task-directory}/{story-or-task-prefix}.dod.*.md 2>/dev/null | sort | tail -1)

# Tracked AND on the remote — not merely present. `ls` found a file in the working tree; the
# reader of this comment sees the PR's branch. If these disagree the comment lies (obs #48).
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git ls-files --error-unmatch "$DOD_FILE" >/dev/null || { echo "HALT: $DOD_FILE is not tracked"; exit 1; }
git show "origin/${BRANCH}:${DOD_FILE}" 2>/dev/null | grep -q . || { echo "HALT: $DOD_FILE is not on origin/${BRANCH}"; exit 1; }

DOD_BODY=$(cat "$DOD_FILE")

# The plain-language lead, obtained ONCE, above the arm split. Anyone following
# the link from the tracker comment lands here, on a five-row table of AC / PR
# Review / Security / Compliance / Documentation — the exact experience the lead
# exists to spare them. `done` is the same stage the tracker comment uses; there
# is one vocabulary, not a second one for pull requests.
LEAD=$(node references/stakeholder-summary-cli.js --stage done) || exit 1
PR_COMMENT_BODY=$(printf '## ✅ Definition of Done\n\n%s\n\n---\n\n%s' "$LEAD" "$DOD_BODY")

# Wrap in tracker_call_with_retry for transient GitHub/API failures (3× exponential backoff).
# Source the helper from references/resolve-platform.sh first.
tracker_call_with_retry gh pr comment {PR_NUMBER} --body "$PR_COMMENT_BODY"
```

For Bitbucket, attach `$PR_COMMENT_BODY` to the PR via the equivalent Bitbucket PR-comment API. This is a **PR** comment, which is a VCS concern — `tracker-comment.js` covers issue comments only, and the DoD also reaches the Jira issue through the tracker comment below.

> **One insertion point, above the arm split — and that is the design constraint, not a style note.**
> Eleven sites × two arms is twenty-two places a lead could be added, and the arms are separately
> maintained prose. Building `$PR_COMMENT_BODY` once and handing the same bytes to both arms makes the
> arms structurally unable to drift; reviewing for that is easier than reviewing twenty-two additions
> for equality. The `|| exit 1` is required: `stakeholder-summary-cli.js` exits 2 on an unknown stage,
> and an unguarded `$(…)` would leave `LEAD` empty and post a comment opening with a bare horizontal
> rule — which reads as a formatting slip rather than as a missing paragraph.

> Engine source: `references/stakeholder-summary-cli.js` (bundled into each skill as `references/stakeholder-summary-cli.js`). Standard: `references/stakeholder-summary.md`.

> Engine source: `references/tracker-comment.js` (bundled into each skill as `references/tracker-comment.js`). Contract: `references/tracker-comment-contract.md`.


Log in Decisions Log: "DoD body posted to PR — comment URL: {url}."

This step runs in **both lite and standard modes**. Lite mode skips QA agents (Steps 5–6); it does NOT skip the DoD-on-PR comment, the issue close/comment, or the board transition below.

---

## Tracker Issue Update

> **Note — Document-link re-point (owned by `/finalise`).** As part of acceptance, the `/finalise` skill re-points the tracker issue's `## Document` link to the durable branch (`$DURABLE_BRANCH`) **before** closing/transitioning the issue, so the link survives the feature branch being deleted after merge (GitHub: surgical body rewrite; Jira: re-sync with `--doc-branch --no-transition`, the flag making the re-sync link-only so it cannot overrule the status the ladder already set — bug.11). The close/comment/board-move actions below are the orchestrator-visible effects layered on top — they do not replace the re-point. (`review-story` performs the same re-point on sync; see `finalise/SKILL.md`.)

Branch on `TRACKER`:

### GitHub (`TRACKER=github`) — shared structure, story/task text differs

If `TRACKER_ISSUE` is set, explicitly close the issue and move the project board to Done:

**Comment first, close second — and the comment goes through `tracker-comment.js`, never `gh`.**

Both actions used to be bare `gh` calls, and the close carried its own `--comment`. Three things were
wrong with that. The comment carried no idempotency marker, so a resumed run posted it again. It was
`gh`-only, so a Jira consumer silently got nothing from it. And after task.104 it would have been one
of the last tracker comments in the pipeline with no plain-language lead — worse than the uniform
state it started from.

**Ordering is a rule, not an accident.** A failed close leaves an open issue that carries its own
explanation; a failed comment after a close leaves a closed issue with none. The recoverable failure
is the first one, so the comment goes first and its `reason` is read before the close runs.

**One comment, not two.** The completion note and the closing note were near-duplicate texts, and both
would carry `--stage done` — the second of which returns `already` and never posts. They are merged
into a single `done` comment carrying the PR, the status, the DoD verdict and the report path. The
close then carries no `--comment` at all: a `--comment` on the close is an *unmarked* second comment
the marker cannot see, so it recurs on every resume. This is the same shape as `skills/finalise/SKILL.md`,
which is the worked example.

> **What this trades away: the 3× exponential backoff.** These calls used to be wrapped in
> `tracker_call_with_retry`, and the engine does **not** replace it — `tracker-comment.js` owns the
> `ACCESS_TRACKER` deferral gate (via `defer-mutation.js`) but contains no retry of any kind. Wrapping
> the engine call would double-defer, so the retry is genuinely given up rather than relocated.
> **After this conversion nothing owns the retry**, and the graceful-continue below is what stands in
> its place — matching `review-task` SKILL.md, the reference implementation for a converted site.
> `tracker-issue.js` keeps its own wrapper, because it is still a `gh` mutation.

#### develop-story

```bash
# 1. Post the completion comment — marked, idempotent, and rendered with a lead
#    on both trackers. Always --body-file: the body carries backticks and newlines.
#
#    The heredoc terminator sits at COLUMN 0. Bash does not accept an indented
#    terminator for an unquoted heredoc — it swallows everything after it into
#    the body, so the close below would never run and the issue would be neither
#    commented nor closed, silently.
mkdir -p .claude/state
cat > .claude/state/comment-body.md <<EOF
Story development complete. PR: {PR_URL}. Story status: accepted. All DoD criteria verified.
Implementation report: {report-path}
EOF

node .agents/skills/develop-story/references/tracker-comment.js \
  --issue {TRACKER_ISSUE} --body-file .claude/state/comment-body.md \
  --stage done \
  --slot pr="{PR_URL}" \
  --json \
  || echo "⚠️  Tracker issue comment failed — continuing"

# 2. Close the issue — no --comment; step 1 owns the comment.
#    Read step 1's `reason` first: on `unverifiable`, do not post again, and do
#    not close — an unreadable comment list means the state is unknown.
tracker_call_with_retry node .agents/skills/develop-story/references/tracker-issue.js \
  --kind close --issue {TRACKER_ISSUE} --reason completed --json
```

#### develop-task

```bash
mkdir -p .claude/state
cat > .claude/state/comment-body.md <<EOF
Task development complete. PR: {PR_URL}. Task status: accepted. All DoD criteria verified.
Implementation report: {report-path}
EOF

node .agents/skills/develop-task/references/tracker-comment.js \
  --issue {TRACKER_ISSUE} --body-file .claude/state/comment-body.md \
  --stage done \
  --slot pr="{PR_URL}" \
  --json \
  || echo "⚠️  Tracker issue comment failed — continuing"

tracker_call_with_retry node .agents/skills/develop-task/references/tracker-issue.js \
  --kind close --issue {TRACKER_ISSUE} --reason completed --json
```

Engine sources: `references/tracker-comment.js` and `references/tracker-issue.js` (each bundled into every skill as `references/<name>`). Contracts: `references/tracker-comment-contract.md` and `references/tracker-issue-cli.md`.

Read each `reason` and act per the table in [`references/tracker-comment-contract.md`](tracker-comment-contract.md) — `posted`/`already`/`deferred` need nothing, `unverifiable` is logged and **never** posted over, and `no-credentials` is the one case that may fall back to MCP.

#### Shared (both orchestrators)

After closing, verify the issue is actually closed using the tracker state poller (see `references/tracker-state-poller-subagent.md`). Invoke via Explore subagent with `PR_NUMBER=` (empty) and `ISSUE_KEY={TRACKER_ISSUE}`:

- `result.issue.state == "CLOSED"` → log "✅ GitHub Issue #{TRACKER_ISSUE} confirmed closed"
- Any other state → log "⚠️ GitHub Issue #{TRACKER_ISSUE} still {state}" — `tracker_call_with_retry` already retried 3× during close; if still not CLOSED, post PR comment warning
- `result.errors | length > 0` → log each error in Issues Log; proceed (non-blocking)

On any close failure: the `tracker_call_with_retry` wrapper around `tracker-issue.js --kind close` retries 3× (1s, 2s, 4s) automatically. If all retries fail, log the error in the Decisions Log and Issues Log and post a PR comment: "⚠️ Issue #{TRACKER_ISSUE} could not be closed automatically — please close manually."

Log in Decisions Log: "Post-close state check (poller): issue #{TRACKER_ISSUE} state = {state}. errors = {error_count}."
Log in Decisions Log: "GitHub Issue #{TRACKER_ISSUE} — close: {CLOSED ✅ / OPEN ⚠️ (manual action required)}."

Then **signal the `done` stage** — run the deterministic CLI:

```bash
node .agents/skills/{develop-story|develop-task|develop-bug}/references/gh-stage.js \
  --issue {TRACKER_ISSUE} --stage done --json
```

Engine source: `references/gh-stage.js` (bundled into each skill as `references/gh-stage.js`).

The column this lands in comes from `pipeline.done` in `tracker-workflow.yaml`. A consumer who omitted `done:` from `pipeline:` — because a human moves the final card themselves — gets `reason: "stage-disabled"`, and that is a **success, not a warning**. Do not log it as a failure. Likewise `already` (the card is on the final column) and `would-regress` (a human moved it somewhere beyond Done) are correct outcomes.

Log in Decisions Log: "GitHub Issue #{TRACKER_ISSUE} — board: done → {landed / already / stage-disabled / not-on-board / would-regress}."

### Jira (`TRACKER=jira`) — shared structure, story/task text differs

> **MUST execute — pipeline action, not optional sync.** Do not skip on the basis of any user memory that says "Jira sync is manual" (e.g. `feedback_jira_sync_manual_only.md`). That rule applies only to `/create-epic`, `/create-story`, `/create-task` — never to develop-pipeline steps. This is the symmetric Jira counterpart to the GitHub close + board-move block above.

If `TRACKER_ISSUE` is set, post the completion comment and confirm the Done transition.

1. **Post completion comment.** Locate the DoD summary and gate files, then make the one call:

   ```bash
   DOD_PATH=$(ls {story-or-task-directory}/*.dod.*.md 2>/dev/null | sort | tail -1)
   FINAL_GATE=$(ls {story-or-task-directory}/*.gate.*.yml 2>/dev/null | sort | tail -1 \
     | xargs -I{} grep '^gate:' {} 2>/dev/null | awk '{print $2}' || echo "N/A")

   mkdir -p .claude/state
   # Terminator at COLUMN 0 — an indented terminator does not close an
   # unquoted heredoc; bash swallows everything after it into the body,
   # so the call below would never run. Body lines are unindented for
   # the same reason: leading spaces are written verbatim.
   cat > .claude/state/comment-body.md <<EOF
## ✅ Story Accepted — Definition of Done Verified

**PR**: {PR_URL}
**QA Gate**: ${FINAL_GATE}
**Accepted**: {YYYY-MM-DD}
**DoD Summary**: \`${DOD_PATH}\`

All Definition of Done criteria verified. Story accepted and transitioning to Done.
EOF

   node .agents/skills/{develop-story|develop-task|develop-bug}/references/tracker-comment.js \
     --issue {TRACKER_ISSUE} --body-file .claude/state/comment-body.md \
     --stage done \
     --slot pr="{PR_URL}" \
     --json
   ```

   Story variant shown; substitute "Task" for develop-task. If `DOD_PATH` is empty (finalise was not run via develop-story — rare), omit the DoD Summary line.

   Read `reason` and act per the table in [`references/tracker-comment-contract.md`](tracker-comment-contract.md) — `posted`/`already`/`deferred` need nothing, `unverifiable` is logged and never posted over, and `no-credentials` is the one case that may fall back to MCP.

2. **Confirm the `done` stage** — `/finalise` (invoked at the top of this step) already drives the Done transition, via `sync-jira-{story,task}.js` when credentials exist and the MCP protocol otherwise. Do **not** transition again here as a matter of course: a second call is redundant, and re-deriving the candidates in a second place is how the two paths drift apart.

   Run the stage CLI only as a **repair** — when `/finalise` reported its Jira step as failed or skipped:

   ```bash
   node .agents/skills/{develop-story|develop-task|develop-bug}/references/jira-stage.js \
     --issue {TRACKER_ISSUE} --stage done --json
   ```

   It is idempotent (`reason: "already"` when `/finalise` succeeded), so running it after an ambiguous report costs one API call and cannot double-close anything. On `reason: "no-credentials"`, fall back to `references/jira-transition-protocol.md` with `candidates = ["Done", "Closed", "Resolved", "Complete", "Completed"]` and `terminal = true` — that unlocks the protocol's narrow single-done-transition fallback and fills a required `resolution` from the transition's own `allowedValues`. Its MUST-NOT clauses are binding: if no transition matches, log the skip and do not call `transitionJiraIssue`. Never fall back to another transition (e.g. `To Do`) — leaving the issue where it is, is the correct behaviour when the workflow has no done state.

3. **Post-transition state verification** — invoke the tracker state poller (see `references/tracker-state-poller-subagent.md`) with `PR_NUMBER=` (empty) and `ISSUE_KEY={TRACKER_ISSUE}`:
   - `result.issue.state` is in the done **status category**, or matches "Done", "Closed", "Resolved", "Complete" or "Completed" (case-insensitive) → log "✅ Jira issue {TRACKER_ISSUE} confirmed Done via poller"
   - Any other state → log "⚠️ Jira issue {TRACKER_ISSUE} still showing {state} — transition may not have taken effect"
   - `result.errors | length > 0` → log each error in Issues Log; proceed (non-blocking)

Log in Decisions Log: "Jira issue {TRACKER_ISSUE} — comment: {posted ✅ / ⚠️ failed}."
Log in Decisions Log: "Jira issue {TRACKER_ISSUE} — Done: {✅ by /finalise / ✅ repaired via jira-stage / ⚠️ no matching transition found / ⚠️ failed}."
Log in Decisions Log: "Post-close state check (poller): issue {TRACKER_ISSUE} state = {state}. errors = {error_count}."

---

## The Accept Gap — Made Loud (restricted runs and failed tracker calls)

`/finalise` writes `status: accepted` and moves on, **by design** — including under a restricted
`access.tracker` mode. Local acceptance records that the *work* meets its DoD; the tracker catching
up is a separate event that a restricted run cannot perform. The gap between the two is the
**accept gap**, and this section is what stops it being silent. Deferring with a loud, committed,
reviewable record is **not** the "skipped Step 7 side-effects" anti-pattern — the anti-pattern's
stated harm is *silent* drift, and everything below exists to make the drift visible
(see `docs/reference/anti-patterns.md` §"Never skip Step 7 (`finalise`) side-effects").

After the Tracker Issue Update above, check the journal (`.claude/state/tracker-actions.jsonl`,
or `$TRACKER_ACTIONS_JOURNAL`). **When it is empty, skip this entire section** — no artifacts, no
debt line, no comment. When it is non-empty:

1. **Render and commit the handover artifacts — formats from the access mode, verification
   in-process.** The format selection is `renderersForMode` in the render engine (`manual` → md;
   `command` → sh; `read-only` → json; `approve` → md+sh on a tty, sh without one; every mode
   also gets the inline summary — the file formats below are the mode's selection minus
   `summary`). Artifact names follow the established grammar, co-located with the work item:
   `{prefix}.handover.{n}.{name}.{md,sh,json}`.

   > Engine sources: `references/handover-render.js` and
   > `references/handover-verify.js` (bundled into each skill as
   > `references/handover-render.js` / `references/handover-verify.js`).

   ```bash
   # Formats per renderersForMode — never hardcode all three: committing a
   # runnable .sh for a `manual` or `read-only` handover widens that mode's
   # renderer selection, which is exactly what the mode table forbids.
   case "$ACCESS_TRACKER" in
     manual)    FORMAT_FLAGS="--format md" ;;
     command)   FORMAT_FLAGS="--format sh" ;;
     read-only) FORMAT_FLAGS="--format json" ;;
     approve)   if [ -t 1 ]; then FORMAT_FLAGS="--format md --format sh"; else FORMAT_FLAGS="--format sh"; fi ;;
     full|"")   FORMAT_FLAGS="" ;;              # full selects no FILE format — its journal
                                                # entries are retry_of failures, reported by
                                                # the inline summary (step 2 below) only
     *)         FORMAT_FLAGS="--format md" ;;   # unknown mode — fail safe to a checklist
   esac

   # --verify runs the read-only verification pass IN-PROCESS so its
   # annotations (ticks, baselines) reach the artifacts — pass it only for the
   # credential-holding modes; under manual/command there is nothing to read
   # with, and every record would just render "cannot verify".
   VERIFY_FLAG=""
   case "$ACCESS_TRACKER" in read-only|approve) VERIFY_FLAG="--verify" ;; esac

   # `full` (and an unset mode) commits no artifact — skip the render call
   # entirely rather than widening the mode's renderer selection. The renderer
   # substitutes the .md extension per selected format, so a single-format
   # `command` render lands on .sh and `read-only` on .json — never sh/json
   # content inside a .md filename.
   if [ -n "$FORMAT_FLAGS" ]; then
     node .agents/skills/{develop-story|develop-task|develop-bug}/references/handover-render.js \
       $VERIFY_FLAG $FORMAT_FLAGS \
       --out {work-item-dir}/{prefix}.handover.{n}.{name}.md \
       --run "{branch}" --access "$ACCESS_TRACKER" --work-item {work-item-dir}
   fi
   ```

2. **Populate the implementation report's `## Tracker Actions Required` section** with the
   `--format summary` output (replacing the placeholder italics). This is the section the report
   template reserves for exactly this moment.

3. **Add the `**Tracker debt:**` line to the report's Completion block**, immediately after
   **DoD Summary**:

   ```
   **Tracker debt**: {N} action(s) outstanding — see ## Tracker Actions Required and
   the committed {prefix}.handover.{n}.{name}.* artifacts. Reconcile later with /tracker-reconcile.
   ```

   Name the artifacts by the `.*` glob, not a hardcoded `.md` — which file extensions exist
   depends on the access mode (`command` commits only the `.sh`, `read-only` only the `.json`),
   and under `full` no artifact exists at all, so its debt line points at the
   `## Tracker Actions Required` summary only.

   When the journal is empty, write `**Tracker debt**: none`. The line is not optional on a
   restricted run: a Completion block that reads "Completed" with no debt line is how the accept
   gap goes silent.

4. **Post the checklist to the PR** via the existing `not-on-board` escalation path (the
   `gh pr comment` block in `finalise/SKILL.md` §Tracker Issue Update) — the comment names the
   committed `*.handover.*` files (whichever extensions the mode rendered) and says the board
   has **not** caught up with the accepted status. Reviewers see the debt where they review,
   not only in the repo tree. Under `full` — where records exist only as `retry_of` failures
   and no artifact is committed — the comment carries the inline summary itself instead of
   file names.

### The `approve` model at handover

`approve` means *credentials are present; a human confirms before writes*. At this point — and
only at this point — the orchestrator asks **one batched confirmation** via `AskUserQuestion`:
list the outstanding actions (id, headline, consequence) and offer "Apply all N actions" /
"Apply reversible only (skip irreversible)" / "Defer all — keep the checklist". Approved records
execute via the committed script (`bash {prefix}.handover.{n}.{name}.sh --apply`); the run then
re-renders so executed actions show ticked.

**Non-interactive runs degrade to `command`**: no tty (or an autonomous pipeline run) means no
prompt, no execution, and the operator gets the script — consent is **never** assumed. This is
`renderersForMode("approve", {tty:false})`, and it is pinned by test.

### Reconciling later

`/tracker-reconcile {work-item-dir}` re-reads the committed handover against the live tracker —
days later, on any branch — ticks what someone already did, flags `divergent` moves, and refuses
`--apply` under every non-`full` mode. The checklist is a ledger, not a receipt.

---

## Step 7 Completion Checklist (MUST verify before marking ✅)

Before updating the Pipeline Progress row to ✅ Done, the orchestrator MUST verify every item below. If any item is missing, the row stays ⏳ and the orchestrator goes back and completes the missing action — do NOT mark ✅ with caveats in the Notes column.

- [ ] `/finalise` skill was invoked (not inlined with `Write`)
- [ ] `*.dod.{N}.*.md` file is **tracked and on `origin/<branch>`** (`git ls-files --error-unmatch` + `git show origin/<branch>:<path>`), not merely present in the story/task directory
- [ ] **Publish boundary crossed inside `/finalise`**: acceptance commit + push made at its 6a (the document, DoD summary, sprint review and — tasks — registry are clean in `git status`; only the implementation report is dirty); CI reading 2 read `SUCCESS` on that pushed head; both readings with their heads written to the Decisions Log and present on the PR canonical comment
- [ ] DoD summary carries **one** status line — `**Final Status:**` in `## Verification Complete` — and no `**Status:** IN PROGRESS` header
- [ ] Story/task `status:` (frontmatter) AND `Status:` (body) both read `accepted` / `Accepted`
- [ ] Change Log carries the acceptance row with a bumped minor `Version`, written in the same edit as the frontmatter change
- [ ] Full DoD body posted as PR comment (verify URL captured in Decisions Log)
- [ ] Tracker issue `## Document` link re-pointed to the durable branch by `/finalise` (before close/transition)
- [ ] Tracker issue commented via `tracker-comment.js` (`reason` was `posted`, `already` or `deferred`)
- [ ] Tracker issue closed (GitHub: `tracker-issue.js --kind close` confirmed CLOSED) — N/A for Jira (handled by transition)
- [ ] Project board / Jira board moved to Done (verify via tracker state poller — `result.issue.state` or `result.issue.column`; see `references/tracker-state-poller-subagent.md`)
- [ ] All six Decisions Log lines written: "DoD summary", "CI reading 1 … / CI reading 2 …", "DoD body posted to PR", "issue close" (GitHub), "board transition", and the success log entry ("Story accepted" / "Task completed")
- [ ] **Accept gap**: journal checked; if non-empty — the mode's handover artifacts committed (`full` commits none, by selection — its summary-only path satisfies this item), `## Tracker Actions Required` populated, `**Tracker debt:**` line written in the Completion block, PR comment posted. If empty — `**Tracker debt**: none` written. `status: accepted` was written **either way** — the debt record and the local acceptance are both-or-red, never one without the other

This checklist applies in **both lite and standard modes**. Lite mode skips Steps 5–6; it never skips any item in this list.

---

## Pipeline Progress and DoD Summary

Update Pipeline Progress: ✅ finalise.

Locate the DoD summary file created by finalise:

#### develop-story

```bash
ls {story-directory}/story.{epic}.{story}.dod.*.md 2>/dev/null | sort | tail -1
```

#### develop-task

```bash
ls {task-directory}/task.{id}.dod.*.md 2>/dev/null | sort | tail -1
```

Record its path in the Decisions Log: "DoD summary: {path}". Add it to the Completion section of the implementation report as **DoD Summary**: {path}.
