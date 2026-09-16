---
name: develop-pipeline-step-0-resolve-and-prepare
description: Phase 0 (resolve-and-prepare) shared by develop-story and develop-task. Covers Steps 0a–0f: file/issue resolution, pipeline state check, upfront context reading, tracker signal, upfront Q&A, implementation report creation, and pre-flight summary. Story vs task variants are called out in each sub-section where they differ.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-step-0-resolve-and-prepare.md. Regenerate via `npm run bundle`. -->

# Develop Pipeline — Phase 0: Resolve & Prepare

## When This Document Applies

Loaded by `/develop-story` and `/develop-task` during Phase 0. Where story and task variants differ, each sub-section is split into `#### develop-story` and `#### develop-task` sub-sections. Where content is identical, it is written once.

---

## 0a. Resolve the Document File

#### develop-story

Accept any of:

- **Story file**: `docs/stories/story.8.2.configure-validation-pipe/story.8.2.configure-validation-pipe.md`
- **Story directory**: `docs/stories/story.8.2.configure-validation-pipe/`
- **Bare filename**: `story.8.2.configure-validation-pipe.md`
- **GitHub issue URL** (direct or project board): `https://github.com/.../issues/297` or URL containing `issue=`
- **Issue hash notation**: `#297`
- **Bare issue number**: `297`

Jira key inline resolution: search `LOCAL_PATH=$(grep -rl "jira_key: ${JIRA_KEY}" docs/ 2>/dev/null | grep -v '\.implementation\.' | grep -v '\.review\.' | grep -v '\.gate\.' | head -1)`. Not found → HALT: "No local document found for Jira issue ${JIRA_KEY}. Run `/create-story` first to link it, or provide the file path directly."

GitHub issue inline resolution: extract `ISSUE_NUM`, fetch body, parse `DOC_URL`. Not found → fall back to `grep -rl "github_issue: {N}" docs/`. Still not found → HALT: "No local document found for issue #{N}. Run `/create-story` first, or provide the file path directly."

Explore subagent (file/directory/bare-filename inputs): find file matching `story.{epic}.{story}.*.md` that does NOT contain `.qa.`, `.gate.`, `.bug.`, or `.implementation.` in its name. Return absolute file path and story directory path.

Extract `{epic_number}` and `{story_number}` from the pattern `story.{epic}.{story}.{name}.md`.

**Epic resolution** — immediately after extracting epic_number/story_number:

```bash
EPIC_REF=$(grep '^epic:' {story-file} | awk '{print $2}')
```

If `EPIC_REF` is empty or missing: **HALT** — "Story must have an `epic:` frontmatter field referencing a parent epic (e.g. `epic: epic.178.feature-ui`). Add the field and re-run."

```bash
EPIC_NUM=$(echo "$EPIC_REF" | grep -oE '[0-9]+' | head -1)
EPIC_SLUG=$(echo "$EPIC_REF" | sed 's/epic\.[0-9]*\.//')
```

Locate the epic file (required):

```bash
EPIC_FILE=$(find docs/ -name "epic.${EPIC_NUM}.*.md" 2>/dev/null \
  | grep -v '\.review\.' | grep -v '\.gate\.' | grep -v '\.implementation\.' | head -1)
```

If `EPIC_FILE` is empty: **HALT** — "Epic file `epic.{EPIC_NUM}.*` not found in `docs/`. Ensure the epic document exists before running develop-story."

Store `EPIC_NUM`, `EPIC_SLUG`, and `EPIC_FILE` as pipeline-wide variables.

#### develop-task

Accept any of:

- **Task file**: `docs/tasks/task.2.home-page-content-realignment/task.2.home-page-content-realignment.md`
- **Task directory**: `docs/tasks/task.2.home-page-content-realignment/`
- **Bare filename**: `task.2.home-page-content-realignment.md`
- **GitHub issue URL** (direct or project board): `https://github.com/.../issues/297` or URL containing `issue=`
- **Issue hash notation**: `#297`
- **Bare issue number**: `297`

Jira key inline resolution: search `LOCAL_PATH=$(grep -rl "jira_key: ${JIRA_KEY}" docs/ 2>/dev/null | grep -v '\.implementation\.' | grep -v '\.review\.' | grep -v '\.gate\.' | head -1)`. Not found → HALT: "No local document found for Jira issue ${JIRA_KEY}. Run `/create-task` first to link it, or provide the file path directly."

GitHub issue inline resolution: extract `ISSUE_NUM`, fetch body, parse `DOC_URL`. Not found → fall back to `grep -rl "github_issue: {N}" docs/`. Still not found → HALT: "No local document found for issue #{N}. Run `/create-task` first, or provide the file path directly."

Explore subagent (file/directory/bare-filename inputs): find file matching `task.{id}.*.md` that does NOT contain `.qa.`, `.gate.`, `.bug.`, or `.implementation.` in its name. Return absolute file path and task directory path.

Extract `{task_id}` from the pattern `task.{id}.{name}.md`.

### Inline Resolution — Shared Logic

**Jira URL / issue key** (when `JIRA_URL` is set):

```bash
JIRA_KEY=$(echo "$INPUT" | grep -oE '[A-Z]+-[0-9]+' | tail -1)
```

**GitHub URL / issue number** (when `JIRA_URL` is NOT set):

```bash
# Direct issue URL:
ISSUE_NUM=$(echo "$INPUT" | grep -oE '(?<=/issues/)[0-9]+')
# Project board URL / hash notation / bare number — generic fallback:
[ -z "$ISSUE_NUM" ] && ISSUE_NUM=$(echo "$INPUT" | grep -oE '[0-9]+' | tail -1)

ISSUE_BODY=$(gh issue view {N} --json body -q '.body')
DOC_URL=$(echo "$ISSUE_BODY" | grep -o 'https://github\.com/[^)]*\.md' | head -1)
LOCAL_PATH=$(echo "$DOC_URL" | sed 's|https://github\.com/[^/]*/[^/]*/blob/[^/]*/||')
```

If the Explore subagent cannot find the file, HALT and ask the user to confirm the path.

---

## 0a-parallel. Parallel Phase 0 Fan-out

After 0a completes file path resolution, dispatch setup queries in a **single parallel message** (multiple `Agent` tool calls in one response). Do not send them sequentially — dispatch all applicable agents simultaneously and wait for all results before proceeding.

### Which agents to dispatch

| Input form                       | Resolver              | Tracker poller                    | Lite-mode + board detector   |
| -------------------------------- | --------------------- | --------------------------------- | ---------------------------- |
| Inline-resolved (URL / Jira key) | ❌ (already resolved) | ✅ (ISSUE_KEY from inline step)   | ✅                           |
| File / directory / bare-filename | ✅                    | ✅ (agent finds ISSUE_KEY itself) | ✅ (agent finds file itself) |

### Agent 1 — Resolver (file/directory/bare-filename inputs only)

Prompt template (pass verbatim to Explore subagent):

```
Find the {story/task} file that matches:
  - develop-story: pattern story.{epic}.{story}.*.md, does NOT contain .qa., .gate., .bug., or .implementation. in the filename
  - develop-task:  pattern task.{id}.*.md, does NOT contain .qa., .gate., .bug., or .implementation. in the filename

Search under docs/. Return:
  - absolute_file_path
  - task_or_story_directory (parent directory of the file)
  - task_id or story_id extracted from the filename pattern

If not found: return { "error": "File not found — <input>" }.
```

### Agent 2 — Tracker state poller

Prompt template (pass verbatim to Explore subagent):

```
Run the tracker state poller (references/tracker-state-poller-subagent.md).
Inputs:
  PR_NUMBER=    # empty string (no PR yet in Phase 0)
  ISSUE_KEY={ISSUE_KEY}    # GitHub issue number or Jira key extracted from document frontmatter
                           # For file/dir inputs: locate the file (pattern task.{id}.*.md or story.{epic}.{story}.*.md under docs/)
                           # and extract github_issue: or jira_key: from its YAML frontmatter.
                           # If not found, use empty string.

Follow the Execution Protocol in the referenced file exactly.
Return the compact JSON object only — no prose.
```

### Agent 3 — Lite-mode + always-load detector

Prompt template (pass verbatim to Explore subagent):

```
Read the document at {file_path} (or for file/dir inputs: find the file matching task.{id}.*.md or story.{epic}.{story}.*.md under docs/).

DETERMINE the lite-mode inputs by reading the document. This is the normal path — evaluate each
condition from what the document actually says, and report the three inputs as separate fields. Do NOT
decide `pipeline_mode` by impression: the Aggregation block below recomputes it from your booleans, so
your job is to report the inputs accurately, not to judge the outcome.

Extract, per references/develop-pipeline-lite-mode.md (the canonical contract):
  - risk_level: from frontmatter `risk_level:`. Use "absent" if the field is missing — do not infer a
    level from the document's tone or subject matter.
  - phase_count: count of `## Tasks` subsections (stories) or implementation phases (tasks).
  - single_module: true only if the document's scope touches ONE app or lib. When the module boundary is
    genuinely arguable, answer false — `standard` is the safe default, and lite mode shortens QA.
  - has_success_criteria_table / ac_count: from the structured-criteria section
    (## Acceptance Criteria for stories, ## Success Criteria for tasks).

Also check skills-config.yaml in the project root:
  - Does it exist?
  - If yes, extract the devLoadAlwaysFiles list (may be absent/empty).
  - Source `references/resolve-paths.sh` (or its bundled `references/resolve-paths.sh`) to populate `PRD_ROOT` and `ARCH_ROOT` env vars. Defaults: `docs/prd` and `docs/architecture`. Pipeline steps below use these env vars for any path operation that touches the PRD or architecture trees.

MERGE the document-derived fields with your skills-config discovery into the return shape below — every
field is required. Omitting `skills_config_exists` / `always_load_files` breaks always-load resolution.

Return compact JSON:
{
  "risk_level": "low|medium|high|absent",
  "phase_count": <integer>,
  "single_module": true|false,
  "has_success_criteria_table": true|false,
  "ac_count": <integer>,
  "skills_config_exists": true|false,
  "always_load_files": ["path1", "path2"]
}
```

### Aggregation

After all dispatched agents return:

```
RESOLVER_RESULT  ← Agent 1 result (or null if not dispatched)
TRACKER_RESULT   ← Agent 2 result (compact JSON)
LITEMODE_RESULT  ← Agent 3 result (compact JSON)

TASK_FILE      = RESOLVER_RESULT.absolute_file_path   (or already known from inline resolution)
TASK_DIR       = RESOLVER_RESULT.task_or_story_directory
# COMPUTE PIPELINE_MODE here, from the three booleans Agent 3 reported. Agent 3 does not return a
# `pipeline_mode` field: the decision belongs to this mechanical boolean AND, not to a subagent's
# judgement, so there is no free-form mode string that could drift from the rule.
# `risk_ok` is SET MEMBERSHIP — accept ONLY {"low", "absent"}; reject "medium" / "high" / anything else.
# Do NOT use a truthy or substring check.
risk_ok        = LITEMODE_RESULT.risk_level ∈ {"low", "absent"}
PIPELINE_MODE  = (risk_ok AND LITEMODE_RESULT.phase_count < 3 AND LITEMODE_RESULT.single_module)
                   ? "lite" : "standard"        (default: "standard" on Agent-3 failure)
ALWAYS_LOAD_FILES = LITEMODE_RESULT.always_load_files   (default: [] on failure)
HAS_SUCCESS_CRITERIA_TABLE = LITEMODE_RESULT.has_success_criteria_table   (default: false on failure)
TRACKER_STATE  = TRACKER_RESULT                         (null fields on failure)
```

Log in Decisions Log: which agents were dispatched, whether any failed, PIPELINE_MODE (with the three booleans it was computed from) and ALWAYS_LOAD_FILES determined.

### Failure handling

| Agent              | Failure response                                                                 |
| ------------------ | -------------------------------------------------------------------------------- |
| Resolver           | **HALT** — cannot continue without file path. Surface error to user.             |
| Tracker poller     | Log warning in Issues Log. Set tracker fields to null. Continue.                 |
| Lite-mode detector | Log warning. Default `PIPELINE_MODE=standard`, `ALWAYS_LOAD_FILES=[]`. Continue. |

---

## 0b. Check Pipeline State — Resume or Restart?

Before asking any questions, check whether a previous run was started:

#### develop-story

```bash
git branch --list "feature/story.{epic}.{story}.*"
gh pr list --head "feature/story.{epic}.{story}.*" --json number,url,state 2>/dev/null
ls {story-directory}/story.{epic}.{story}.implementation.*.md 2>/dev/null
```

**If a previous run is detected**: ask "A previous pipeline run exists for this story. What would you like to do?" Options: "Resume from last completed step" (Recommended) / "Start fresh".

#### develop-task

```bash
git branch --list "feature/task.{id}.*"
gh pr list --head "feature/task.{id}.*" --json number,url,state 2>/dev/null
ls {task-directory}/task.{id}.implementation.*.md 2>/dev/null
```

**If a previous run is detected**: ask "A previous pipeline run exists for this task. What would you like to do?" Options: "Resume from last completed step" (Recommended) / "Start fresh".

### Shared Resume Logic

If resuming: read the existing implementation report, identify the last ✅ step, and verify each completed step's artifact before skipping it. Skip upfront questions already recorded in the Decisions Log.

**Resume artifact verification**: see `references/develop-pipeline-resume-contract.md` for the full contract — per-step verification table, plan freshness check, gate file conflation warning, QA cycle count reconstruction, branch/PR cross-check, and MAX_ITER=5 stall semantics.

If starting fresh: continue to 0c.

---

## 0c. Read Document for Upfront Context

Before asking questions, read the document file and note the title (for implementation report naming), `Status:` field, `risk_level:` field, and tracker issue.

**Tracker detection (identical for both orchestrators):**

```bash
if [ -n "$JIRA_URL" ]; then
  TRACKER="jira"
  TRACKER_ISSUE=$(grep '^jira_key:' {document-file} | awk '{print $2}')
  if [ -z "$TRACKER_ISSUE" ] || [ "$TRACKER_ISSUE" = "null" ]; then
    echo "⚠️ No Jira issue linked (jira_key absent or null) — tracker references will be skipped"
    TRACKER_ISSUE=""
  fi
else
  TRACKER="github"
  TRACKER_ISSUE=$(grep '^github_issue:' {document-file} | awk '{print $2}')
  GITHUB_ISSUE="$TRACKER_ISSUE"   # kept for backward compatibility with sub-skills
  if [ -z "$TRACKER_ISSUE" ] || [ "$TRACKER_ISSUE" = "null" ]; then
    echo "No GitHub Issue linked — issue references will be skipped"
    TRACKER_ISSUE=""
    GITHUB_ISSUE=""
  fi
fi
```

`TRACKER` and `TRACKER_ISSUE` are pipeline-wide variables — every subsequent branch uses them.

**Autonomous status handling:**

#### develop-story

| Status                          | Action                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ready for Development`         | Proceed normally                                                                                                                             |
| `In Progress`                   | Proceed normally                                                                                                                             |
| `Draft`                         | Note in the implementation report. Proceed — Step 2 (`/review-story`) will validate and update the status autonomously. Do NOT ask the user. |
| `Ready for Review` / `accepted` | HALT — story is already past development. Ask the user if they want to re-run or check the wrong story path.                                 |
| Any other status                | HALT — status is unexpected. Report to user before proceeding.                                                                               |

#### develop-task

| Status                          | Action                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Draft`                         | Note in the implementation report. Proceed — Step 2 (`/review-task`) will validate and update the status autonomously. Do NOT ask the user. |
| `Planned`                       | Note in the implementation report. Proceed — Step 2 (`/review-task`) will validate and update the status autonomously. Do NOT ask the user. |
| `Ready for Development`         | Proceed normally                                                                                                                            |
| `In Progress`                   | Proceed normally                                                                                                                            |
| `Ready for Review` / `accepted` | HALT — task is already past development. Ask the user if they want to re-run or check the wrong task path.                                  |
| `Cancelled`                     | HALT — task is cancelled. Report to user before proceeding.                                                                                 |
| Any other status                | HALT — status is unexpected. Report to user before proceeding.                                                                              |

> ⚠️ **`Draft` added 2026-08-19, closing a three-way disagreement that made a legitimately-authored task undeliverable.** This table previously omitted `draft`, so it fell through to *"Any other status → HALT"* — while the docs linter validated task files against the **story** status set, which includes `draft`, and the corpus used it. A task could therefore be authored, pass every check, and then be impossible to develop.
>
> The pipeline was the wrong one of the three. **`develop-story` already proceeds on `Draft`** for exactly this reason (Step 2 promotes it), and **`review-task` Step 9 handles `Draft → Ready for Development` identically** — so `develop-task` was refusing to reach the step designed to fix the thing it was refusing over. Found when a `draft` task (`task.73`) reached the front of a consumer repo's roadmap queue and the pipeline halted at Phase 0c.

**Note (tasks only)**: if no `jira_key` is present (tasks are often purely technical), silently skip all Jira operations.

**Lite mode detection**: `PIPELINE_MODE` is resolved by the Lite-mode + always-load detector dispatched in **0a-parallel** (Agent 3), which **runs the production lite-mode CLI**. The Aggregation block then recomputes `PIPELINE_MODE` from the CLI's already-computed booleans (`risk_ok ∈ {low,absent} AND phase_count < 3 AND single_module`) as defence-in-depth. This mechanical boolean AND of pre-computed values is permitted — it is **not** the forbidden prose re-derivation of the FR3 rule from the document (which the CLI now owns). Do **not** re-parse the document's headings yourself. See `references/develop-pipeline-lite-mode.md` for trigger conditions, `PIPELINE_MODE=lite` behaviour, and the directive format passed to the QA skill.

---

## 0c-reg. Signal Work Started

> **Execution timing — relocated.** This procedure is **defined here** but **invoked from Step 1** (after branch + lock creation). Do **not** execute during Phase 0. See `references/develop-pipeline-step-1-create-branch.md` §"Signal Work Started" for the call site.
>
> Rationale: previously fired in Phase 0c-reg before branch creation, which left trackers stuck `In Progress` when Step 1 failed. Moving the signal after the lock writes guarantees the branch named in the comment actually exists.

If `TRACKER_ISSUE` is set (extracted in Phase 0c), signal that work has started on the linked tracker issue. Branch on `TRACKER`. **This section is identical for develop-story and develop-task.**

### Post the pipeline-start comment (both trackers)

The comment is the same on either tracker, so it is **one** call — `tracker-comment.js` branches on `TRACKER` internally:

> Engine source: `references/tracker-comment.js` (bundled into each skill as `references/tracker-comment.js`). Contract: `references/tracker-comment-contract.md`.


```bash
mkdir -p .claude/state
cat > .claude/state/comment-body.md <<EOF
Pipeline started — branch: \`{branch-name}\`
EOF

node .agents/skills/{develop-story|develop-task|develop-bug}/references/tracker-comment.js \
  --issue {TRACKER_ISSUE} --body-file .claude/state/comment-body.md \
  --stage work-started \
  --slot title="{the document's bare title, from Phase 0c}" \
  --json
```

> **`title` is the only slot `work-started` reads**, and it is a **text** slot — passed through
> verbatim. Give it the work item's own title, not its id and not the branch name: the lead is written
> for a reader who cannot look either of those up. Quote it — an unquoted `--slot` with a space in the
> value makes the next word a stray argument. Omit the slot entirely if the title is not resolved at
> this point rather than passing a placeholder; the template is grammatical without it.

**Which slots each stage reads** is fixed by the lead catalogue in
[`references/stakeholder-summary.md`](stakeholder-summary.md) — the engine validates slot names
against nothing, so a name no template reads is silently dropped and the comment posts looking exactly
as it would have with no slot at all.

Read `reason` from the JSON:

| `reason` | What it means | What to do |
|---|---|---|
| `posted` | The comment was created | Nothing |
| `already` | The marker says this exact moment was already commented | Nothing — this is a resume, not a failure |
| `deferred` | `access.tracker` is not `full`; recorded for the handover | Nothing — the record is the deliverable |
| `unverifiable` | 2+ marker matches, or the comment list was unreadable | Log in Issues Log and continue. **Do not post anyway** |
| `no-credentials` | No usable auth | **Only here** may the Jira path fall back to MCP — see below |

**The MCP fallback, and only on `no-credentials`.** The procedure lives in one
place — [`references/tracker-comment-contract.md`](tracker-comment-contract.md)
§"The MCP fallback" — and is not restated here. Restating it is what made the
parity guard vacuous: with the fallback spelled out at every site, the guard's
"is this mention near the word `no-credentials`?" window was satisfied
everywhere, and a genuinely bare MCP call re-inserted next to a reason table
passed. One canonical location means the guard can simply forbid the literal
outside the allowlist, which is a rule that cannot be satisfied by accident.

Do **not** run both paths. The CLI is authoritative whenever credentials exist.

### Jira path — status transition (when `TRACKER=jira`):

1. **Signal the `work-started` stage** — run the deterministic CLI:

   ```bash
   node .agents/skills/{develop-story|develop-task|develop-bug}/references/jira-stage.js \
     --issue {TRACKER_ISSUE} --stage work-started --json
   ```

   Read `reason` from the JSON:
   - `no-credentials` → the CLI found no `JIRA_*` env. **Fall back** to `references/jira-transition-protocol.md` with `candidates = ["In Progress", "Doing", "Started", "Development"]` and `terminal = false`, driving it through the Atlassian MCP tools. The protocol's MUST-NOT clauses are binding: if no transition matches, log the skip and return without calling `transitionJiraIssue`. Do NOT pick a fallback transition.
   - anything else → the CLI has already resolved, transitioned and verified. Log its line and move on; it exits 0 for `already`, `stage-disabled` and `no-transition` alike, all of which are correct outcomes on some boards.

   Do **not** run both paths. The CLI is authoritative whenever credentials exist.

3. **Post-condition verification** — only needed on the MCP fallback path (the CLI verifies its own transition):
   - Call `getJiraIssue` with `cloudId`, `issueIdOrKey: {TRACKER_ISSUE}`, `fields: ["status"]`
   - Check `fields.status.name`: if "In Progress" → log "✅ Jira issue {TRACKER_ISSUE} confirmed In Progress"
   - If NOT "In Progress": retry step 2 once; if still not moved, log "⚠️ Jira status not updated — proceeding" in Issues Log

All steps are **non-blocking** — failures are logged but do not halt the pipeline.

> **Note on Jira priority parity with GitHub.** The GitHub Projects v2 path (below) auto-sets `Priority = P2` when unset. The Jira path intentionally does **not** auto-set priority because Jira priority schemes are workflow- and project-specific — auto-setting risks overwriting team conventions (e.g. "Highest/High/Medium/Low/Lowest" vs custom enums). Set Jira priority manually if needed.

Add to the implementation report Pipeline Configuration table:

| Tracker Issue | {TRACKER_ISSUE} (Jira) or not linked |
| Tracker status | In Progress ✅ / ⚠️ transition failed |

### GitHub path (when `TRACKER=github`):

> The pipeline-start **comment** is already posted by the one `tracker-comment.js`
> call above, which covers both trackers. This section covers only the board
> move, which is GitHub-specific. Do not add a second `gh issue comment` here —
> it posts an unmarked duplicate the CLI's marker cannot see, so it recurs on
> every resume.

**1. Signal the `work-started` stage** — run the deterministic CLI:

```bash
node .agents/skills/{develop-story|develop-task|develop-bug}/references/gh-stage.js \
  --issue {TRACKER_ISSUE} --stage work-started --add-to-board --json
```

Engine source: `references/gh-stage.js` (bundled into each skill as `references/gh-stage.js`).

`--add-to-board` is what makes this call, and only this call, ensure board **membership** before setting status — `ensureOnBoard` performs the `gh project item-add`, waits for Projects API propagation, and re-queries once if the first read comes back empty. Board membership is not board status, so no later moment passes this flag.

The column this lands in comes from `pipeline.work-started` in `tracker-workflow.yaml`. Run `gh-stage.js --probe-board` to see your board's real options and which moment each resolves to.

The CLI re-reads the item after mutating and reports the option it actually landed on, so **no separate post-condition check is needed** — read `reason` from the JSON. It exits 0 for `already`, `stage-disabled`, `no-option`, `not-on-board` and `would-regress` alike, all of which are correct outcomes on some boards.

**3. Set Priority to P2 – Medium when unset** (graceful — warn and continue on any failure).

This is a **separate concern** that merely used to share a GraphQL response with the status move. `gh-stage.js` deliberately does not touch Priority — it owns the Status field and nothing else — so this block keeps its own query:

> **Ordering matters: this block must run *after* the `work-started` call above.** It carries no `item-add` and no propagation retry, because it does not need them — `ensureOnBoard` has already added the item, slept for Projects API propagation, and successfully read the item back (it could not have set the status otherwise). Running this block first, or on its own, against an issue not yet on a board would read an empty `projectItems` and silently skip the Priority default. That is graceful rather than harmful, but it is a silent no-op, so keep the order.

```bash
(
  OWNER=$(gh repo view --json owner -q '.owner.login')
  REPO_NAME=$(gh repo view --json name -q '.name')

  RESPONSE=$(gh api graphql -f query='
  {
    repository(owner: "'"$OWNER"'", name: "'"$REPO_NAME"'") {
      issue(number: {TRACKER_ISSUE}) {
        projectItems(first: 10) {
          nodes {
            id
            fieldValueByName(name: "Priority") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
            project {
              id
              fields(first: 20) {
                nodes {
                  ... on ProjectV2SingleSelectField {
                    id
                    name
                    options { id name }
                  }
                }
              }
            }
          }
        }
      }
    }
  }')

  ITEM_ID=$(echo "$RESPONSE" | jq -r '.data.repository.issue.projectItems.nodes[0].id // empty')
  PROJECT_ID=$(echo "$RESPONSE" | jq -r '.data.repository.issue.projectItems.nodes[0].project.id // empty')
  PRIORITY_FIELD_ID=$(echo "$RESPONSE" | jq -r '.data.repository.issue.projectItems.nodes[0].project.fields.nodes[] | select(.name == "Priority") | .id // empty')
  CURRENT_PRIORITY=$(echo "$RESPONSE" | jq -r '.data.repository.issue.projectItems.nodes[0].fieldValueByName.name // empty')
  P2_OPTION_ID=$(echo "$RESPONSE" | jq -r '.data.repository.issue.projectItems.nodes[0].project.fields.nodes[] | select(.name == "Priority") | .options[] | select(.name | startswith("P2")) | .id // empty')

  # Only when the field exists and is currently unset — never overwrite a human's choice.
  #
  # `tracker_write` wraps the mutation so a restricted run records a
  # `github.board.field-set` instead of performing it. The READS above stay bare:
  # they are GETs, and gating a read would break the very check that decides
  # whether a mutation is needed at all.
  if [ -n "$ITEM_ID" ] && [ -n "$PROJECT_ID" ] && [ -n "$PRIORITY_FIELD_ID" ] && [ -n "$P2_OPTION_ID" ] && [ -z "$CURRENT_PRIORITY" ]; then
    tracker_write gh api graphql -f query='
    mutation {
      updateProjectV2ItemFieldValue(input: {
        projectId: "'"$PROJECT_ID"'"
        itemId: "'"$ITEM_ID"'"
        fieldId: "'"$PRIORITY_FIELD_ID"'"
        value: { singleSelectOptionId: "'"$P2_OPTION_ID"'" }
      }) { projectV2Item { id } }
    }' >/dev/null 2>&1 \
      && echo "✅ Priority set to P2 – Medium (was unset)" \
      || echo "⚠️  Priority field update failed — continuing"
  fi
) || echo "⚠️  Priority update skipped (gh unavailable or auth scope missing)"
```

Add to the implementation report Pipeline Configuration table:

| Tracker Issue | #{TRACKER_ISSUE} (GitHub) or not linked |
| Board status | {landed option} ✅ / ⚠️ {reason} |

Report the option the CLI says it landed on, not the option you asked for. Log in Decisions Log: "GitHub board: work-started → {landed / already / no-option / not-on-board / would-regress}."

If `TRACKER_ISSUE` is not set, skip this entire section — no fallback register needed.

---

## 0c-load. Resolve Always-Load Files

Determine the list of files to pre-load as context for `/develop`. This section is identical for both orchestrators.

`ALWAYS_LOAD_FILES` is resolved by the Lite-mode + always-load detector dispatched in **0a-parallel** (Agent 3). Use `LITEMODE_RESULT.always_load_files` directly. Apply fallback defaults only when Agent 3 failed or returned an empty list AND `skills_config_exists` is false.

1. **Use 0a-parallel result** (`LITEMODE_RESULT.always_load_files`):
   - If `LITEMODE_RESULT.skills_config_exists = true` and `always_load_files` is non-empty: use that list.
   - If `LITEMODE_RESULT.skills_config_exists = true` but `always_load_files` is empty: skills-config.yaml has no `devLoadAlwaysFiles` key — fall back to defaults.
   - If `LITEMODE_RESULT.skills_config_exists = false` or Agent 3 failed: use defaults.

2. **Defaults** (when skills-config.yaml absent or Agent 3 failed) — anchored to `${ARCH_ROOT}` (default `docs/architecture`):
   - `${ARCH_ROOT}/concepts/coding-standards.md`
   - `${ARCH_ROOT}/concepts/tech-stack.md`
   - `${ARCH_ROOT}/concepts/source-tree.md`

3. **For each file in `ALWAYS_LOAD_FILES`**: verify it exists on disk. If missing, log a warning — `"⚠️ Always-load file not found: <path> — skipping"` — and remove it from the list.

4. **Log to Decisions Log**: `"Always-load files resolved: {N} files — {comma-separated paths}"`

Store `ALWAYS_LOAD_FILES` as a pipeline-wide variable — it is consumed in Step 3 when invoking `/develop`.

---

## 0d. Upfront Setup — Gather All Decisions Before Execution

Check the current branch:

```bash
git branch --show-current
```

Use the `AskUserQuestion` tool to ask all applicable questions in a single call. Auto-derived values are presented as the **first (Recommended)** option — selecting it requires only one keypress, but the user retains override capability via "Other".

**qa-planning skip is silent** — the pipeline always skips `/qa-planning`. Do **not** prompt for it. Record `"qa-planning: skipped (auto)"` in the Decisions Log.

**Q1 — Feature branch base:**

#### develop-story — epic integration pre-check (before building Q1 options)

Resolve the story's parent epic document (frontmatter `epic_source:`, else `epic:` under the configured
PRD root) and read its branch-model declaration. Key names are configurable; defaults:

```yaml
branch_model: epic-integration
integration_branch: "epic/178.feature-ui"
```

| Epic declares                                             | `EPIC_BRANCH`                                            | Q1/Q2 recommendation  |
| --------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| `branch_model: epic-integration` + `integration_branch`   | as declared                                              | `EPIC_BRANCH`         |
| `branch_model: epic-integration`, no `integration_branch` | derived from `branchPattern` (default `epic/{n}.{slug}`) | `EPIC_BRANCH`         |
| nothing, or `develop-direct`, or epic unreadable          | unset                                                    | `develop` (unchanged) |

**A declared `integration_branch` is used verbatim** — the epic document is the authority on its own
branch name. If the epic cannot be resolved, proceed with `EPIC_BRANCH` unset; never guess, never block.

> `epic/{n}.{name}` (integration branch — stories merge into it) is **not** `feature/epic.{n}.{name}`
> (an ordinary short-lived branch for editing the epic document, which `/review-epic` creates). Do not
> substitute one for the other.

#### develop-story Q1 options

Ask "Which branch should `feature/story.{epic}.{story}.{name}` be based on?"

**When `EPIC_BRANCH` is set** — it leads and is Recommended, because a story in an
integration-branch epic that lands on `develop` alone defeats the point of the epic delivering as one unit:

- Options: "`{EPIC_BRANCH}`" (Recommended) / "develop" / "Other"

**When `EPIC_BRANCH` is unset** — unchanged from before, plus the opt-in offered last:

- On `develop` or `main`: Options: "develop" (Recommended) / "main" / "Other"
- On any `feature/*` branch: Options: "develop" (Recommended) / "`feature/{current}`" / "Other"
- Append, only when `branching.epicIntegration.offerWhenUndeclared` is not `false`:
  "`{derived-epic-branch}` — create epic integration branch" (never Recommended)

Store: Feature branch base = the answer.

**If the chosen base does not exist yet**, `/create-branch` Step 2b.5 creates it from `develop` and
pushes it during Step 1. Do not create it here — Phase 0 must remain side-effect-free so a HALT before
Step 1 leaves no orphan branch behind.

#### develop-task Q1 options

Ask "Which branch should `feature/task.{id}.{name}` be based on?"

- On `develop` or `main`: Options: "develop" (Recommended) / "main" / "Other"
- On any `feature/*` branch: Options: "`feature/{current}`" (Recommended) / "develop" / "Other"

**Q2 — PR target branch:**

#### develop-story Q2

Ask "Which branch should the pull request target?"

**When `EPIC_BRANCH` is set** (from the Q1 pre-check), or when the user's Q1 answer was an `epic/*`
branch: Options: "`{EPIC_BRANCH}`" (Recommended) / "develop" / "Other"

**Otherwise:** Options: "develop" (Recommended) / "main" / "Other"

> Story PRs target `develop` by default; "main" or "Other" let the user redirect (e.g. a hotfix story that should land directly on `main`).
>
> **Q1 and Q2 must agree for an integration-branch story.** Basing a story on `epic/178.feature-ui` and
> then targeting `develop` produces a PR whose diff includes every earlier story in the epic — the base
> is already in `develop`'s future, not its past. If the user picks the epic branch for Q1 and `develop`
> for Q2, say so plainly and re-ask rather than proceeding.

#### develop-task Q2

Ask "Which branch should the pull request target?"
Options: "develop" (Recommended) / "feature/{current-branch}" / "Other"

If the user selects "Other" for Q1 or Q2, follow up with a plain text request for the branch name. Store all answers. Do not ask again mid-pipeline.

**No Q3** — qa-planning skip is silent (see paragraph above).

**Required-question count check (mandatory — prevents silent prompt drops).** Before issuing the `AskUserQuestion` tool call, count the questions you are about to send and verify against this table:

| Scenario        | Required questions in the call    | Count |
| --------------- | --------------------------------- | ----- |
| `develop-story` | Q1 (branch base) + Q2 (PR target) | **2** |
| `develop-task`  | Q1 (branch base) + Q2 (PR target) | **2** |

Resume cases skip any question whose answer is already recorded in the Decisions Log (typical resume: 0 questions).

If your count does not match the required count for the detected scenario, fix the call before invoking the tool. Do NOT invent additional questions ("Run mode?", "Auto-continue?", etc.) — pipeline mode is autonomous (lite-mode detection runs in 0a-parallel Agent 3) and any other policy comes from `references/develop-pipeline-autonomous-defaults.md`. Adding undocumented questions causes UX drift and may suppress the documented ones (observed regression in live-github-test).

Decisions Log entry after the call must list every question that was asked and its answer, so reviewers can verify the count matches the table above.

---

## 0e. Create the Implementation Report

Determine the implementation report number: scan the document directory for existing `*.implementation.*.md` files, find the highest N, new report is N+1 (or 1 if none exist). Derive `{descriptive-name}`: N=1 → `{name}-initial-run`; N>1 → append context (e.g. `{name}-post-escalation`, `{name}-retry-{N}`).

#### develop-story implementation report template

Create `story.{epic}.{story}.implementation.{N}.{descriptive-name}.md` in the story directory:

```markdown
# Implementation Report: {story title}

**Story**: `{story filename}`
**Run Number**: {N}
**Started**: {YYYY-MM-DD HH:MM}
**Status**: In Progress

---

## Summary

{One-line description derived from the story name and what this run is attempting}

---

## Pipeline Configuration

| Setting             | Value                                                                      |
| ------------------- | -------------------------------------------------------------------------- |
| Feature branch base | {feature branch base — default `develop`}                                  |
| PR target           | {PR target — default `develop`}                                            |
| qa-planning gate    | skipped (auto)                                                             |
| Story risk level    | {risk_level value or not set}                                              |
| Pipeline mode       | {lite / standard}                                                          |
| Always-load files   | {N} files — {comma-separated paths, or "defaults (no skills-config.yaml)"} |
| Board status        | {In Progress ✅ / ⚠️ update failed / N/A (no issue linked)}                |

---

## Pipeline Progress

| Step                        | Status     | Required Artifacts                                                                           | Notes | Subagent summary ref |
| --------------------------- | ---------- | -------------------------------------------------------------------------------------------- | ----- | -------------------- |
| 1. create-story-branch      | ⏳ Pending | Branch `feature/story.{epic}.{story}.*` exists in git                                        |       | —                    |
| 2. review-story             | ⏳ Pending | `story.{epic}.{story}.review.{N}.{name}.md` exists (or skip logged)                          |       | —                    |
| 3. develop                  | ⏳ Pending | Story status == `Ready for Review`                                                           |       | —                    |
| 4. create-pr                | ⏳ Pending | PR URL targets `develop` (or chosen base); issue/tracker comment posted                      |       | —                    |
| 5–6. qa-story / qa-fix loop | ⏳ Pending | `story.{epic}.{story}.qa.{N}.*.md`; `story.{epic}.{story}.gate.{N}.*.yml`; `**PR Review**` row on the highest `### QA Cycle {N}` holds `APPROVE` or `CONCERNS` (Step 5c); PR comment posted |       | —                    |
| 7. finalise                 | ⏳ Pending | `story.{epic}.{story}.dod.{N}.*.md`; story `status: accepted`                                |       | —                    |
| 8. commit-changes           | ⏳ Pending | All artifacts committed and pushed                                                           |       | —                    |

> The `Subagent summary ref` column points to the JSON artifact described in `references/subagent-summary-artifact.md`. Use `—` for steps that don't dispatch a subagent or for in-flight pipelines started before this column existed.

---

## Decisions Log

### Pipeline Startup — {YYYY-MM-DD}

- Feature branch base: {answer} — default `develop`
- PR target branch: {answer} — default `develop`
- qa-planning gate: skipped (auto — no prompt)

---

## Issues Log

_Problems encountered and how they were resolved or escalated._

---

## Tracker Actions Required

_Tracker mutations this run wanted but did not perform — because `access.tracker` restricts this
run, or because the call failed. Rendered from `.claude/state/tracker-actions.jsonl` by
`handover-render.js --format summary`; the committed checklist, script and JSON sidecar are the
`*.handover.{n}.{name}.{md,sh,json}` artifacts beside this report. **Omit this section entirely when
the journal is empty** — an empty heading reads as "nothing was deferred" in the same shape it would
read as "the renderer broke"._

---

## QA Iteration History

_Track each QA review/fix cycle._

---

## Completion

**Finished**: {populated at end}
**Final Status**: {Completed / Failed / Escalated}
**Branch**: {populated after Step 1}
**PR**: {populated after Step 4}
**QA Iterations**: {populated at end}
**DoD Summary**: {populated after Step 7}
**Tracker debt**: {populated after Step 7 — "none", or "{N} action(s) outstanding — see ## Tracker Actions Required"; reconcile later with /tracker-reconcile}
```

#### develop-task implementation report template

Create `task.{id}.implementation.{N}.{descriptive-name}.md` in the task directory:

```markdown
# Implementation Report: {task title}

**Task**: `{task filename}`
**Run Number**: {N}
**Started**: {YYYY-MM-DD HH:MM}
**Status**: In Progress

---

## Summary

{One-line description derived from the task name and what this run is attempting}

---

## Pipeline Configuration

| Setting             | Value                                                                      |
| ------------------- | -------------------------------------------------------------------------- |
| Feature branch base | {Q1 answer}                                                                |
| PR target           | {Q2 answer}                                                                |
| qa-planning gate    | skipped (auto)                                                             |
| Task risk level     | {risk_level value or not set}                                              |
| Pipeline mode       | {lite / standard}                                                          |
| Always-load files   | {N} files — {comma-separated paths, or "defaults (no skills-config.yaml)"} |
| Board status        | {In Progress ✅ / ⚠️ update failed / N/A (no issue linked)}                |

---

## Pipeline Progress

| Step                       | Status     | Required Artifacts                                                     | Notes | Subagent summary ref |
| -------------------------- | ---------- | ---------------------------------------------------------------------- | ----- | -------------------- |
| 1. create-branch           | ⏳ Pending | Branch `feature/task.{id}.*` exists in git                             |       | —                    |
| 2. review-task             | ⏳ Pending | `task.{id}.review.{N}.{name}.md` exists (or skip logged)               |       | —                    |
| 3. develop                 | ⏳ Pending | Task status == `Ready for Review`                                      |       | —                    |
| 4. create-pr               | ⏳ Pending | PR URL; issue comment posted                                           |       | —                    |
| 5–6. qa-task / qa-fix loop | ⏳ Pending | `task.{id}.qa.{N}.*.md`; `task.{id}.gate.{N}.*.yml`; `**PR Review**` row on the highest `### QA Cycle {N}` holds `APPROVE` or `CONCERNS` (Step 5c); PR comment posted |       | —                    |
| 7. finalise                | ⏳ Pending | `task.{id}.dod.{N}.*.md`; task `status: accepted`                      |       | —                    |
| 8. commit-changes          | ⏳ Pending | All artifacts committed and pushed                                     |       | —                    |

> The `Subagent summary ref` column points to the JSON artifact described in `references/subagent-summary-artifact.md`. Use `—` for steps that don't dispatch a subagent or for in-flight pipelines started before this column existed.

---

## Decisions Log

### Pipeline Startup — {YYYY-MM-DD}

- Feature branch base: {Q1 answer} — {rationale}
- PR target branch: {Q2 answer} — {rationale}
- qa-planning gate: skipped (auto — no prompt)

---

## Issues Log

_Problems encountered and how they were resolved or escalated._

---

## Tracker Actions Required

_Tracker mutations this run wanted but did not perform — because `access.tracker` restricts this
run, or because the call failed. Rendered from `.claude/state/tracker-actions.jsonl` by
`handover-render.js --format summary`; the committed checklist, script and JSON sidecar are the
`*.handover.{n}.{name}.{md,sh,json}` artifacts beside this report. **Omit this section entirely when
the journal is empty** — an empty heading reads as "nothing was deferred" in the same shape it would
read as "the renderer broke"._

---

## QA Iteration History

_Track each QA review/fix cycle._

---

## Completion

**Finished**: {populated at end}
**Final Status**: {Completed / Failed / Escalated}
**Branch**: {populated after Step 1}
**PR**: {populated after Step 4}
**QA Iterations**: {populated at end}
**DoD Summary**: {populated after Step 7}
**Tracker debt**: {populated after Step 7 — "none", or "{N} action(s) outstanding — see ## Tracker Actions Required"; reconcile later with /tracker-reconcile}
```

---

## 0f. Pre-flight Summary

Print this to the user before any irreversible action:

#### develop-story

```
🚀 Starting automated story pipeline

Story:        {story filename}
Branch:       feature/story.{epic}.{story}.{name} ← {Q1 base branch}
PR target:    {Q2 answer}
Report:       {report file path}

Pipeline will now run hands-free.
You will only be interrupted if a blocking issue arises.
Press Ctrl+C now to abort before any changes are made.
```

#### develop-task

```
🚀 Starting automated task pipeline

Task:         {task filename}
Branch:       feature/task.{id}.{name} ← {Q1 base branch}
PR target:    {Q2 answer}
Report:       {report file path}

Pipeline will now run hands-free.
You will only be interrupted if a blocking issue arises.
Press Ctrl+C now to abort before any changes are made.
```
