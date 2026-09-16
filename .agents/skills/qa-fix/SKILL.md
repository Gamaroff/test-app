---
name: qa-fix
description: Implement fixes based on QA feedback. Use when QA has provided a gate file or assessments and you need to systematically address issues, close coverage gaps, and update the story file. Follows deterministic prioritization for risk-first fix implementation.
---

# QA Fix

## When to Use This Skill

Use this skill when:

- QA has created a gate file (PASS/CONCERNS/FAIL/WAIVED)
- QA assessments are available (test design, traceability, risk profile, NFR)
- Need to systematically implement fixes based on QA feedback
- Closing coverage gaps and addressing high-severity issues
- Preparing story for re-review after fixes

**Prerequisites**: Active PR exists for current branch. Workflow will halt if no PR found.

## Purpose

Systematically consume QA outputs and apply code/test changes:

- Read QA gate YAML and assessment markdowns
- Create deterministic, prioritized fix plan
- Apply code and test changes
- Update only authorized story file sections
- Signal readiness for QA re-review

## Required Inputs

```yaml
required:
  - story_id: '{epic}.{story}' # e.g., "2.2"
  - qa_root: from skills-config.yaml key qa.qaLocation (default: docs/qa)
  - story_location: nested (stories stored within epic directories)

optional:
  - story_title: derived from story H1 if missing
  - story_slug: derived from title if missing
```

## Input Handling

**Flexible Invocation:**

You can invoke this skill with either:

- **A specific file**: `story.178.8.example-feature.md`, `story.178.8.qa.1.initial-review.md`, or `story.178.8.gate.1.initial-review.yml`
- **A story directory**: `stories/story.178.8.example-feature/`

**File Discovery Logic:**

When given a directory path, discover all relevant QA artifacts:

1. **Story File**:
   - Pattern: `story.{epic}.{story}.{name}.md`
   - Exclude files containing: `.qa.`, `.gate.`, or `.bug.`
   - Use the one matching the directory name if multiple found

2. **QA Report** (most recent if multiple):
   - Pattern: `story.{epic}.{story}.qa.{number}.*.md`
   - Logic: Identify files with numeric version.
   - Sort: Use highest number (latest). If unnumbered, use modification time.

3. **Gate File** (most recent if multiple):
   - Pattern: `story.{epic}.{story}.gate.{number}.*.yml`
   - Logic: Identify files with numeric version.
   - Sort: Use highest number (latest). If unnumbered, use modification time.

4. **Bug Reports** (all matching):
   - Pattern: `story.{epic}.{story}.bug.*.md`
   - Load all bug reports found
   - Filter by status: only process "New" or "Reopened"

**For technical tasks**, the same discovery rules apply with `task.{id}` in place of `story.{epic}.{story}`:

- Task file: `task.{id}.{name}.md` (exclude `.qa.`, `.gate.`, `.bug.`)
- QA Report: `task.{id}.qa.{number}.*.md` (highest number wins)
- Gate File: `task.{id}.gate.{number}.*.yml` co-located in the task subdirectory (highest number wins)
- Bug Reports: `task.{id}.bug.*.md`

**Example:**

```
Input: stories/story.178.8.example-feature/
Discovers:
  - Story: story.178.8.example-feature.md
  - QA Report: story.178.8.qa.1.initial-review.md
  - Gate: story.178.8.gate.1.initial-review.yml
  - Bugs: story.178.8.bug.1.platform-issue.md, story.178.8.bug.2.platform-issue.md
```

## QA Artifact Locations

### For Stories (User-Facing Features)

**Story Directory Structure:**

Each story has its own subdirectory containing all related files:

```
stories/
└── story.{epic}.{story}.{story-name}/
    ├── story.{epic}.{story}.{story-name}.md           # Story file
    ├── story.{epic}.{story}.qa.{number}.{descriptive-name}.md  # QA report
    ├── story.{epic}.{story}.gate.{number}.{descriptive-name}.yml # Gate file
    ├── story.{epic}.{story}.bug.1.{description}.md    # Bug report 1
    ├── story.{epic}.{story}.bug.2.{description}.md    # Bug report 2
    └── ...
```

**File Naming Convention:**

- All files share the same base: `story.{epic}.{story}`
- File type indicated by segment after story ID: `.qa.{number}.`, `.gate.{number}.`, `.bug.{number}.`
- Bug reports include sequential number: `.bug.1.`, `.bug.2.`, etc.
- Descriptive name comes last before file extension

**Assessment Files** (co-located in story subdirectory, canonical naming):

- Risk Assessment: `story.{epic}.{story}.risk.*.{name}.md`
- Test Design: `story.{epic}.{story}.test-design.*.{name}.md`

For tasks:

- Risk Assessment: `task.{id}.risk.*.{name}.md` (in task subdirectory)
- Test Design: `task.{id}.test-design.*.{name}.md` (in task subdirectory)

**Bug Report Files** (co-located in story subdirectory):

- Pattern: `story.{epic}.{story}.bug.*.md` in story's own subdirectory
- Sequential numbering: `story.{epic}.{story}.bug.1.*.md`, `story.{epic}.{story}.bug.2.*.md`, etc.
- Status tracking: New | In Progress | Ready for QA | Reopened | Closed
- Example: `stories/story.178.8.example-feature/story.178.8.bug.1.platform-issue.md`

### For Technical Tasks (Non-User-Facing Work)

**Task Document** (in task subdirectory):

- Pattern: `docs/tasks/task.{id}.{name}/task.{id}.{name}.md`

**QA Report** (co-located in task subdirectory):

- Pattern: `docs/tasks/task.{id}.{name}/task.{id}.qa.{number}.{name}.md`

**Quality Gate** (co-located in task subdirectory):

- Pattern: `docs/tasks/task.{id}.{name}/task.{id}.gate.{number}.{name}.yml`
- Discovery glob: `task.{id}.gate.*.yml` in the task subdirectory; sort by gate number and take the latest

**Bug Report Files** (co-located in task subdirectory):

- Pattern: `task.{id}.bug.{number}.{name}.md` in task subdirectory
- Location: `docs/tasks/task.{id}.{name}/task.{id}.bug.{number}.{name}.md`
- Sequential numbering: `task.{id}.bug.1.*.md`, `task.{id}.bug.2.*.md`, etc.
- Status tracking: New | In Progress | Ready for QA | Reopened | Closed

## Prerequisites

### Environment Variables

| Variable              | Required when        | Purpose                                                                                                                                                                                                     |
| --------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BITBUCKET_ACCESS_TOKEN` | `PLATFORM=bitbucket`, Bearer | Bitbucket REST API auth via **Bearer** — a repository, project or workspace access token. Optional; **replaces** the username/token pair rather than supplementing it, and wins if both are set. |
| `BITBUCKET_USERNAME`  | `PLATFORM=bitbucket`, Basic | Bitbucket REST API auth (username). Not used on the Bearer path — an access token has no username.                                                                                             |
| `BITBUCKET_API_TOKEN` | `PLATFORM=bitbucket`, Basic | Bitbucket REST API auth — an Atlassian API token (`ATATT…`) with Bitbucket scopes ticked. `BITBUCKET_APP_PASSWORD` is read as a fallback; app passwords themselves were removed by Atlassian on 2026-07-28. |
| `JIRA_URL`            | Jira comment desired | Enables Jira MCP comment when set (e.g. `https://myorg.atlassian.net`)                                                                                                                                      |

Cross-reference: `create-pr` and `finalise` use the same variables — set them once in your shell profile.

### Platform Detection

Run once before the PR existence check. All downstream branches use `$PLATFORM` and `$TRACKER`. See `references/platform-detection.md` for the full resolver spec.

```bash
source references/resolve-platform.sh || exit 1
# TRACKER = jira | github; VCS = github | bitbucket
PLATFORM="$VCS"

REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ "$PLATFORM" = "bitbucket" ]; then
  BB_PATH=$(echo "$REMOTE_URL" | sed -E 's|.*bitbucket\.org[:/]||; s|\.git$||')
  BB_WORKSPACE=$(echo "$BB_PATH" | cut -d'/' -f1)
  BB_REPO=$(echo "$BB_PATH" | cut -d'/' -f2)
  BB_API="https://api.bitbucket.org/2.0"
  # Resolve the REST credential once. Sets BB_CURL_AUTH (curl args) and
  # BB_AUTH_SCHEME (bearer|basic); non-zero when neither credential is set.
  source references/bitbucket-auth.sh || exit 1
elif [ "$PLATFORM" = "github" ]; then
  : # gh CLI handles GitHub; no extra vars needed
else
  echo "❌ Unrecognised platform: $PLATFORM" >&2
  exit 1
fi
```

### PR Existence Check

**CRITICAL**: The qa-fix skill requires an active pull request for the current branch.

**How PR Selection Works:**

- On GitHub: `gh pr view` matches the PR where `headRefName` equals your current branch
- On Bitbucket: Bitbucket REST `/pullrequests` filtered by `source.branch.name` + `state=OPEN`
- If multiple PRs exist from the same branch, the most recent one is used

Before starting fixes:

1. **Check for PR existence (dual-path):**

   ```bash
   BRANCH=$(git branch --show-current)

   if [ "$PLATFORM" = "github" ]; then
     PR_JSON=$(gh pr view --json url,state,title,number 2>&1)
     if [ $? -ne 0 ]; then
       echo "⚠️ No pull request found for branch: $BRANCH"
       echo ""
       echo "Fix QA requires a pull request to post results."
       echo ""
       echo "Options:"
       echo "1. Create a PR: gh pr create"
       echo "2. Use /create-pr skill"
       echo "3. Push changes: git push -u origin $BRANCH"
       echo ""
       echo "Once PR is created, re-run /qa-fix"
       exit 1
     fi
     PR_URL=$(echo "$PR_JSON" | jq -r '.url')
     PR_STATE=$(echo "$PR_JSON" | jq -r '.state')
     PR_NUMBER=$(echo "$PR_JSON" | jq -r '.number')
     PR_TITLE=$(echo "$PR_JSON" | jq -r '.title')

   elif [ "$PLATFORM" = "bitbucket" ]; then
     ENCODED_BRANCH=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$BRANCH" 2>/dev/null || echo "$BRANCH")
     BB_PR_JSON=$(curl -sf "${BB_CURL_AUTH[@]}" \
       "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests?q=source.branch.name%3D%22${ENCODED_BRANCH}%22+AND+state%3D%22OPEN%22")
     if [ $? -ne 0 ] || [ "$(echo "$BB_PR_JSON" | jq '.values | length')" -eq 0 ]; then
       echo "⚠️ No open Bitbucket PR found for branch ${BRANCH}"
       echo ""
       echo "Fix QA requires a pull request to post results."
       echo ""
       echo "Options:"
       echo "1. Create a PR: /create-pr"
       echo "2. Push changes: git push -u origin $BRANCH"
       echo ""
       echo "Once PR is created, re-run /qa-fix"
       exit 1
     fi
     PR_NUMBER=$(echo "$BB_PR_JSON" | jq -r '.values[0].id')
     PR_URL=$(echo "$BB_PR_JSON" | jq -r '.values[0].links.html.href')
     PR_STATE=$(echo "$BB_PR_JSON" | jq -r '.values[0].state')
     PR_TITLE=$(echo "$BB_PR_JSON" | jq -r '.values[0].title')
   fi
   ```

2. **Handle PR state:**
   - **OPEN**: ✅ Proceed with fixes
   - **MERGED**: ⚠️ Warn user but continue (comment will be posted to merged PR)
   - **CLOSED**: ⚠️ Warn user but continue (comment will be posted to closed PR)
   - **No PR**: ❌ Halt and provide guidance

3. **Display PR status:**

   ```bash
   if [ "$PR_STATE" = "MERGED" ]; then
     echo "⚠️ Warning: PR #$PR_NUMBER is already MERGED"
     echo "   Title: $PR_TITLE"
     echo "   Comment will still be posted, but PR is merged."
     echo ""
   elif [ "$PR_STATE" = "CLOSED" ]; then
     echo "⚠️ Warning: PR #$PR_NUMBER is CLOSED"
     echo "   Title: $PR_TITLE"
     echo "   Comment will still be posted, but PR is closed."
     echo ""
   elif [ "$PR_STATE" = "OPEN" ]; then
     echo "✅ Found PR #$PR_NUMBER: $PR_TITLE"
     echo "   State: $PR_STATE"
     echo "   URL: $PR_URL"
   fi
   ```

4. **Store PR metadata:**
   Store PR_URL, PR_STATE, PR_NUMBER, PR_TITLE for use in completion checklist

---

## Workflow (7 Steps)

### Step 0: Initialize Task List, Load Config & Locate Story

**CRITICAL**: Before doing anything else, use `TaskCreate` to register every step as a tracked task. Mark each `in_progress` before starting and `completed` immediately after finishing.

| Task Subject                    | Description                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR existence check              | Validate PR exists; store PR_URL, PR_NUMBER, PR_STATE, PR_TITLE                                                                                       |
| Load config & locate story      | Read skills-config.yaml; find story file, QA report, gate, bug reports                                                                                |
| Collect QA findings             | Parse gate YAML, assessment markdowns, and bug reports                                                                                                |
| Build fix plan                  | Prioritize issues; resolve ambiguities with user before proceeding                                                                                    |
| Apply changes                   | Implement code fixes and add missing tests                                                                                                            |
| Validate                        | Run lint + tests; iterate until zero errors and all tests pass                                                                                        |
| Update story file & bug reports | Update authorized sections only; set correct status per Status Rule                                                                                   |
| Post fix summary to PR          | Post fix summary comment via platform-appropriate path (GitHub `gh pr comment` / Bitbucket REST); optionally post to Jira via MCP when `TRACKER=jira` |
| Communicate to user             | Output completion summary with next steps                                                                                                             |

---

**Configuration File**: `skills-config.yaml` (in project root)

1. Attempt to load `skills-config.yaml` from project root
2. If file does not exist, **notify user**:

   > "`skills-config.yaml` not found. Create this file to customize paths, or continue with default settings."

3. Resolve paths: source `references/resolve-paths.sh` to populate `${PRD_ROOT}` (default `docs/prd`). QA artifacts are co-located with the story (no `qa.qaLocation` key).
4. Locate story file via glob `${PRD_ROOT}/**/epics/*/stories/**/story.{epic}.{story}.*.md` — this searches the full nested epic structure. HALT if not found → ask user for path.
5. HALT if story not found → ask for correct story id/path

The PRD root is configurable; the nested structure under it and QA-artifact co-location are fixed (see [Configuration](../../docs/reference/configuration.md#configurable-roots-and-fixed-conventions)).

### Step 1: Collect QA Findings

**Note**: PR metadata (PR_URL, PR_NUMBER, PR_STATE, PR_TITLE) is already validated and available from Prerequisites section.

#### Step 1a: Dispatch Findings Ingester Subagent (Primary Path)

Dispatch a read-only Explore subagent to ingest all QA artifacts and return a compact, risk-sorted Findings Summary. This keeps raw artifact content out of main context.

Load the prompt from `references/qa-findings-ingester-prompt.md`. Substitute placeholders before dispatching:

- `<dir>`: substitute with absolute path to the story or task directory
- `<mode>`: substitute with `story` or `task`
- `<epic>`, `<story>` (story mode) OR `<id>` (task mode): substitute with the relevant IDs from context

Dispatch: `Agent(subagent_type="Explore", prompt=<loaded-prompt-with-substitutions>)`

**On subagent success**: Findings Summary (YAML) is available in context. Proceed directly to Step 1.5 (no-op path) then Step 2. Raw artifacts were never loaded into main context.

**On `truncated_count > 0`**: Print the warning below and **HALT unconditionally** — including when invoked from an autonomous `/develop-task` pipeline. Do not auto-acknowledge. Pipeline must pause until user confirms they have reviewed the full gate/report manually.

```
⚠️ QA FINDINGS TRUNCATED — {truncated_count} additional findings not shown.
Raw QA artifacts contain more findings than the ingester cap (20).
Pipeline paused. Review the full gate YAML and QA report manually, then re-invoke /qa-fix.
```

**On subagent failure or error**: Log the failure and fall through to Step 1b.

---

#### Step 1b: Inline Reads (Fallback — only when Step 1a fails)

Parse latest gate YAML for:

- Gate status (PASS|CONCERNS|FAIL|WAIVED)
- `top_issues[]` with id, severity, `file`, finding, suggested_action
- `nfr_validation.*.status` and notes
- Trace coverage summary and gaps
- `test_design.coverage_gaps[]`
- `risk_summary.recommendations.must_fix[]`

Read assessment markdowns and extract:

- Explicit gaps and recommendations
- Uncovered requirements
- Missing test scenarios

**Load qa-planning artifacts** (if present in story directory):

- Glob for `story.{epic}.{story}.risk.*.md` — load all risk assessments found
- Glob for `story.{epic}.{story}.test-design.*.md` — load all test design documents found
- Use these to understand pre-identified risks and intended test coverage when building the fix plan
- For tasks: glob `task.{id}.risk.*.md` and `task.{id}.test-design.*.md` in task subdirectory

**Parse Bug Reports** (if any exist):

Locate all bug report files: `story.{epic}.{story}.bug.*.md` in story directory

For each bug report, extract:

- Bug ID and descriptive name
- Current status (New, In Progress, Ready for QA, Reopened, Closed)
- Priority and Severity
- Bug description and expected vs actual behavior
- Acceptance criteria violation
- Existing fix iterations (if any)
- Reproduction steps

**Bug Status Filtering**:

- Only process bugs with status: **New** or **Reopened**
- Skip bugs with status: Closed, Ready for QA (QA is testing)
- Bug fixes take precedence in fix plan based on severity

### Step 1.5: Consolidate Findings and Release Raw Artifacts

**When Step 1a succeeded**: This step is a **no-op** — the ingester subagent already returned a compact Findings Summary and raw artifacts were never loaded into main context. Proceed directly to Step 2.

**When Step 1b (fallback) ran**: After parsing all QA artifacts inline, consolidate before building the fix plan:

1. Write a **Findings Summary** (bullet list):
   - Gate status + quality score
   - Each issue: ID, severity, file/location, 1-line description
   - Each open bug: ID, severity, 1-line description
   - NFR failures (list only FAIL items)
   - Coverage gaps (list only P0/P1 gaps)

2. **Release from active context**: the full gate YAML content, full QA report markdown, full bug report markdowns — these have been consumed. The Findings Summary is the authoritative source from here on.

3. Proceed to Step 2 using ONLY the Findings Summary — do not re-read gate/QA files unless a specific detail is needed later.

This prevents the large QA artifact content from polluting the fix implementation context.

### Step 2: Build Deterministic Fix Plan

**Priority Order** (highest first):

1. **Blocker/Critical severity bug reports** → Fix immediately, blocks deployment
2. **High severity** bug reports → Fix in current cycle
3. **High severity** items in `top_issues` (security/performance/reliability/maintainability)
4. **NFR FAIL statuses** → must fix all FAIL items
5. **Medium severity** bug reports → Address after critical items
6. **NFR CONCERNS** → minimize or document
7. **Test Design coverage_gaps** → prioritize P0 scenarios
8. **Trace uncovered requirements** → AC-level gaps
9. **Risk must_fix recommendations**
10. **Low severity** bug reports and issues → Fix when time permits

**Step 2a: Identify Ambiguities and Multiple Options**

**CRITICAL**: Before proceeding with implementation, analyze QA findings for ambiguity or multiple options:

**Ambiguity Indicators**:

- QA provides multiple suggested actions without clear priority
- Conflicting recommendations from different QA sections (e.g., test design vs NFR assessment)
- Vague or open-ended "suggested_action" fields
- Multiple valid implementation approaches mentioned
- Unclear scope of fixes (e.g., "improve error handling" without specifics)
- Optional vs mandatory fixes not clearly distinguished

**Examples of Ambiguous QA Findings**:

```yaml
# Example 1: Multiple options without priority
top_issues:
  - id: perf-1
    suggested_action: "Consider implementing caching OR optimizing database queries OR using CDN"

# Example 2: Vague recommendation
top_issues:
  - id: sec-1
    suggested_action: "Improve input validation"

# Example 3: Multiple conflicting recommendations
nfr_validation:
  performance:
    notes: "Response times acceptable but could be faster with Redis caching"
  maintainability:
    notes: "Adding Redis introduces complexity; consider simpler solution first"
```

**When Ambiguity Is Detected**:

1. **Pause implementation** - Do not proceed with changes
2. **Use AskUserQuestion** to clarify:
   - Which option to pursue
   - Priority of competing recommendations
   - Scope and acceptance criteria for vague recommendations
   - Which fixes are mandatory vs optional
   - Which approach to take when multiple valid options exist

**Question Examples**:

```markdown
**Ambiguity Found**: QA suggests three options for performance improvement (caching, query optimization, CDN). Which approach should I prioritize?

Options:

- Option A: Implement Redis caching (faster, adds dependency)
- Option B: Optimize database queries (minimal changes, moderate improvement)
- Option C: Use CDN for static assets (infrastructure change required)

**Ambiguity Found**: QA states "improve input validation" without specifics. What level of validation is required?

Options:

- Option A: Add basic type checking and required field validation
- Option B: Implement comprehensive schema validation with custom rules
- Option C: Add validation + sanitization + rate limiting

**Ambiguity Found**: Test design recommends P0 coverage gaps, but NFR assessment suggests maintainability concerns with test complexity. How should I balance coverage vs maintainability?

Options:

- Option A: Add comprehensive test coverage as recommended (increases test complexity)
- Option B: Add targeted tests for critical paths only (maintains simplicity)
- Option C: Add coverage with test helpers/fixtures to manage complexity
```

**Only Proceed After Clarity**:

- Wait for user responses to clarifying questions
- Update fix plan based on user decisions
- Record the chosen approach in the Dev Agent Record — **not** as its own Change Log row. The
  Change Log gets exactly one row on loop exit (see the authorised-sections list below); a row per
  decision is the churn this format exists to avoid.

**Guidance**:

- Add tests closing coverage gaps before or with code changes
- Keep changes minimal and targeted
- Follow project architecture and coding standards
- When in doubt about scope or approach, ask rather than assume

### Step 2.5: Honour the third strike — replace, do not patch again

The develop-story / develop-task pipeline passes a **third strike** into this invocation when a
file has been the subject of HIGH findings in three consecutive QA cycles. It names the file and
the cycles. When you receive one:

**You may not patch that file again.** A fourth correction to a mechanism that has been corrected
three times is the loop's failure mode, not its progress. The permitted moves are exactly three,
and the fix plan must record which one was chosen and why:

| Move                       | When it is right                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------ |
| **Delete the artifact**    | What it was for is already covered elsewhere, or was never worth its cost.            |
| **Replace its mechanism**  | The job is still needed but this approach cannot do it. A different approach — not another correction to this one. A rewrite that keeps the defeated mechanism is a patch wearing a rewrite's diff. |
| **Waive**                  | The residual is tolerable. Record the reason in the fix summary so QA can write it into the gate's `waiver` block; a waiver with no stated reason is not one. |

If none of the three is available — the file is load-bearing, the mechanism is the only one that
works, the residual is not tolerable — say so explicitly in the fix summary and make no change to
that file. The pipeline's convergence check will escalate to a human, which is the correct outcome
and better than a fourth patch.

Determining the strike is the pipeline's job, not yours: it reads the `file:` key on each gate's
HIGH `top_issues[]` entries across the last three gates. You act on the strike you are given.

### Step 3: Apply Changes

**Pre-fix codebase mapping (do this before any code changes):**

Use the Agent tool with subagent_type="Explore" to map the codebase around the files being fixed:

- For each file in the fix plan, find: the file itself, its spec file, any service/module it imports from, any similar implementations in the same module
- Identify the existing patterns and conventions used in the affected module (naming, error handling style, dependency injection patterns)
- Return a compact summary: file path + pattern observation (max 2 lines per file)

Use this summary to ensure fixes follow existing patterns rather than introducing inconsistencies. Do NOT read all discovered files — use Read() only for the 2-3 files whose patterns are most directly relevant to each fix.

- Implement code fixes per plan
- Add missing tests (unit first; integration where required by AC)
- Follow project patterns:
  - Keep imports centralized where the project enforces platform separation (client/server entry points)
  - Follow DI boundaries and existing patterns
- Maintain test co-location (.spec.ts files next to source)
- **Pattern before change**: Before modifying each file, spend one Read() to confirm the existing pattern in that file — do not assume from memory. After implementing each fix, summarize what changed in 2-3 lines and move on; do not retain the full file content.

### Step 3.5: Adversarial pass over the fixes themselves

**A fix is new code, not the closure of a finding.** Do not let "the finding is addressed" stand in
for "the change is correct". This step is cheap and it catches a defect class the suite structurally
cannot: a change that is right in the steady state and wrong in a transition.

**Why this exists.** On one privacy-critical story, **three of six HIGH findings were introduced by
the fixes to earlier findings**, with a fourth of the same shape surfacing at the DoD gate. Every one
was a correct steady-state change that broke a transition, and **none was catchable by the suite as it
stood** — each was found only by re-reading the changed code adversarially. The fix for "browsing
broadcast as playing" made *teardown* announce a tile as play; the fix for an ordering bug *dropped* a
delta arriving mid-computation; those two combined *stranded* a socket that could no longer retry; and
the fix that made a preference absolute in *content* leaked it in *timing*.

For each fix that touches emission, subscription, caching or any lifecycle, probe these four
explicitly — they are the states the original finding never mentioned:

| Transition | Ask |
| ---------- | --- |
| **Bulk teardown** | On unmount/disconnect/cleanup, does this emit, persist or announce something it should not? |
| **In-flight computation** | If input arrives *while* the operation is running, is it applied, queued, or silently dropped? |
| **Error path** | When the operation fails, is state left recoverable — or stranded so retry is impossible? |
| **Reconnect** | After a drop and re-establish, does it converge to correct state, or resume from a stale one? |

**Review the combination, not only each fix.** At least one real defect of this shape was caused by
two earlier fixes that were each correct alone. After the last fix in a cycle, re-read the full diff
as one change.

**Weight by surface, not by finding count.** On privacy, security, auth or payment paths a regression
is **silent** — nothing goes red — so this pass is mandatory. Elsewhere it is proportionate: skip it
for typos, copy changes and pure test edits.

Record anything found as a new finding in this cycle rather than fixing it silently, so the cycle
count reflects what actually happened.

### Step 4: Validate

```bash
# For your project:
npx nx lint <project>
npx nx test <project> --coverage

# For Deno projects:
deno lint
deno test -A
```

Iterate until:

- Zero lint errors
- All tests pass
- Coverage targets met

### Step 5: Update Story File and Bug Reports (Authorized Sections ONLY)

**CRITICAL - Story File Authorization**: Dev agent may ONLY update these sections:

- ✅ Tasks / Subtasks Checkboxes (mark fix tasks as done)
- ✅ Dev Agent Record:
  - Agent Model Used (if changed)
  - Debug Log References (commands/results like lint/test output)
  - Completion Notes List (what changed, why, how)
  - File List (all added/modified/deleted files)
- ✅ Change Log — ONE row on **exiting** the fix loop, not one per finding and not one per cycle.
  Put the iteration count in the Description; the per-cycle detail belongs in the implementation
  report. Blank `Version` (only `/finalise` bumps it), `Author` = `qa-fix`. Bump frontmatter
  `updated` in the same edit. Canonical format:
  [document-change-log.md](references/document-change-log.md):

  `| 2026-05-14 |  | QA findings fixed — gate PASS (9/10), 2 iterations | qa-fix |`
- ✅ Status (see Status Rule below)
- ✅ Bug Reports section (update bug statuses when fixes applied)

**CRITICAL - Bug Report File Authorization**: Dev agent may update these sections in bug reports:

- ✅ Bug Status (New → In Progress → Ready for QA)
- ✅ Developer Fix Cycle section:
  - Investigation subsection (root cause analysis)
  - Fix Implementation subsection (fix description, files modified, testing)
  - Add new iterations if bug was Reopened
- ✅ Status History table (add new status transitions)

**Bug Report Update Workflow**:

1. **Starting Investigation** (New/Reopened → In Progress):
   - Change bug status to "In Progress"
   - Add investigation notes to Developer Fix Cycle section
   - Document root cause analysis
   - Add status history entry

2. **Implementing Fix** (In Progress → Ready for QA):
   - Document fix description
   - List all files modified
   - Describe testing performed
   - Change bug status to "Ready for QA"
   - Add status history entry

3. **Iteration Handling** (if bug was Reopened):
   - Add new "Iteration N" section in Developer Fix Cycle
   - Document what was re-investigated
   - Describe revised fix approach
   - Change status to "Ready for QA" when complete

**Story Status Rule**:

- Gate was PASS + all gaps closed + all bugs closed → `Status: Ready for Review`
- Bug fixes applied + ready for QA verification → `Status: Ready for Review`
- Otherwise → `Status: Ready for Review` (notify QA to re-run review)

> All three land on the same value, and that is correct rather than redundant: `qa-fix` hands work
> **back to QA**, so the document stays at `ready-for-review` until `finalise` accepts it. ⚠️ Do not
> write `Ready for Done` — it is outside the canonical set in
> [`document-status-lifecycle.md`](references/document-status-lifecycle.md) and a consumer repo that
> lints its status vocabulary will go red on it. **Bug-report** statuses are a separate lifecycle;
> `Reopened` stays valid there.

### Step 6: Do NOT Edit Gate Files

- Dev does not modify gate YAML files
- If fixes address issues, request QA to re-run `review-story` to update the gate
- Gate ownership remains with QA

### Step 7: Post Fix Summary to PR — Best-effort, non-blocking

**PR-comment authorship contract**:

| Skill      | Owns                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `qa-task`  | Per-cycle gate decision (best-effort, non-blocking)                                                       |
| `qa-fix`   | Per-cycle fix summary (best-effort, non-blocking)                                                         |
| `finalise` | Canonical summary — PR + final gate + QA cycle count + DoD path + accepted status (idempotent via marker) |

**This step is best-effort.** If the comment cannot be posted (network error, auth issue), log the failure and continue — do not halt. The final canonical summary is posted by `/finalise` at pipeline end.

Use the PR metadata stored in Step 0 (Prerequisites). Compose the comment body then post it via the active platform.

**One content variable, two wrappers.** The PR comment and the tracker-issue comment carry the same
fix summary, but they are not the same comment: the tracker comment opens with a plain-language lead
rendered by `tracker-comment.js`, and the PR comment is written for a reviewer already reading the
diff. Keeping `FIX_SUMMARY` as the single source of the shared text — rather than duplicating the prose
into two variables — is what stops the two drifting apart, which duplicated prose in this repository
does within weeks.

```bash
# The shared content. Edit this once; both wrappers below pick the change up.
FIX_SUMMARY="**Status**: ✅ Fixes Complete - Ready for Re-Review 🔄
**Date**: [date]
**PR**: #$PR_NUMBER - $PR_TITLE
**PR State**: $PR_STATE

---

### 🐛 Issues Addressed

**Critical/High Severity**:
- [Issue 1]: [Brief description] - Status: ✅ Fixed
- [Issue 2]: [Brief description] - Status: ✅ Fixed

**Medium Severity**:
- [Issue 3]: [Brief description] - Status: ✅ Fixed

**Coverage Gaps Closed**:
- [Gap 1]: Added test coverage for [scenario]
- [Gap 2]: Added test coverage for [scenario]

### 📁 Files Modified

**Implementation**:
- [file1.ts] - [Brief description of change]
- [file2.service.ts] - [Brief description of change]

**Tests**:
- [file1.spec.ts] - Added tests for [scenario]
- [file2.spec.ts] - Enhanced coverage for [scenario]

### ✅ Verification

**Test Results**:
\`\`\`
[Test output showing all tests passing]
\`\`\`

**Coverage**: [X%] (target: [Y%])

### 🎯 Bug Report Updates

- [Bug 1]: Status changed to \"Ready for QA\"
- [Bug 2]: Status changed to \"Ready for QA\"

### 📝 Next Steps

1. QA to verify all fixes
2. QA to update gate file with verification results
3. Close bugs if fixes verified

---

**Artifacts Updated**:
- Story File: [path/to/story.md]
- Bug Reports: [path/to/bugs/]
- QA Gate: [path/to/gate.yml] (QA to update)

### 🚀 Action Required

- [ ] Ready for QA Verification

---
"

# The cycle number, derived from the gate this fix cycle is answering. Gate files
# are `*.gate.{N}.{name}.yml` and {N} IS the QA cycle, so the number is already on
# disk — no caller has to pass it, and nothing invents it. `$STORY_FILE` is the
# resolved story or task document, bound in Step 0 (locate-story).
#
# Derived HERE, once, because both comments need it: the pull-request lead below
# and the tracker comment further down. Deriving it twice would let the two
# comments disagree about which round this is.
DOC_DIR=$(dirname "$STORY_FILE")
FIX_CYCLE=$(ls -t "$DOC_DIR"/*.gate.*.yml 2>/dev/null | head -1 \
  | sed -E 's/.*\.gate\.([0-9]+)\..*/\1/')

# The pull-request wrapper — its own heading, then its own plain-language lead.
# The lead is added HERE, once, above the arm split below, so both arms post the
# same bytes. It must NOT be folded into $FIX_SUMMARY: that variable also feeds
# $TRACKER_COMMENT_BODY, where tracker-comment.js renders the lead itself, and a
# lead in the shared value would double-lead the tracker comment.
QA_FIX_LEAD=$(node references/stakeholder-summary-cli.js --stage qa-fix \
  --slot cycle="$FIX_CYCLE") || exit 1
PR_COMMENT_BODY="## 🛠️ QA Fixes Applied

${QA_FIX_LEAD}

---

${FIX_SUMMARY}"

# The tracker-issue wrapper — no heading of its own. tracker-comment.js renders the
# plain-language lead above this body, and a heading between the lead and the detail
# reads as a second opening.
TRACKER_COMMENT_BODY="${FIX_SUMMARY}"
```

**Post the comment (dual-path):**

```bash
if [ "$PLATFORM" = "github" ]; then
  # Wrapped in tracker_call_with_retry (3× exponential backoff). Source the helper from references/resolve-platform.sh first.
  tracker_call_with_retry gh pr comment "$PR_URL" --body "$PR_COMMENT_BODY"
  COMMENT_RC=$?
elif [ "$PLATFORM" = "bitbucket" ]; then
  BB_COMMENT_PAYLOAD=$(jq -n --arg raw "$PR_COMMENT_BODY" '{content: {raw: $raw}}')
  curl -sf -X POST \
    "${BB_CURL_AUTH[@]}" \
    -H "Content-Type: application/json" \
    "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests/${PR_NUMBER}/comments" \
    -d "$BB_COMMENT_PAYLOAD" >/dev/null
  COMMENT_RC=$?
fi

if [ $COMMENT_RC -ne 0 ]; then
  echo "⚠️ PR comment failed after retries — non-blocking. Final canonical summary will be posted by /finalise."
fi
```

**Non-blocking**: GitHub path retries 3× automatically via `tracker_call_with_retry`. If all attempts fail (`COMMENT_RC != 0`), log the warning and continue. Bitbucket path is single-shot for now (no equivalent helper); a failure logs and continues. The implementation report (in git) is the durable audit trail; this PR comment is convenience only.

**Tracker issue comment (after the PR comment is confirmed):**

Also post the fix summary to the linked tracker issue. **Non-blocking** — a failure here does NOT stop
qa-fix from completing. `tracker-comment.js` resolves `TRACKER` itself, so this is one call on either
tracker; only the issue identifier differs.

`$STORY_FILE` is the resolved story or task document, bound in Step 0 (locate-story).

```bash
if [ "$TRACKER" = "jira" ]; then
  FIX_ISSUE=$(grep -E '^jira_key:' "$STORY_FILE" | head -1 | sed -E 's/jira_key:[[:space:]]*//' | tr -d '"'"'"' ')
else
  FIX_ISSUE=$(grep -E '^github_issue:' "$STORY_FILE" | head -1 | sed -E 's/github_issue:[[:space:]]*//' | tr -d '"'"'"' ')
fi
[ "$FIX_ISSUE" = "null" ] && FIX_ISSUE=""
```

If `FIX_ISSUE` is empty, skip this step silently.

```bash
if [ -n "$FIX_ISSUE" ]; then
  mkdir -p .claude/state
  printf '%s' "$TRACKER_COMMENT_BODY" > .claude/state/comment-body.md

  # $FIX_CYCLE was derived once, where $PR_COMMENT_BODY is built — from the gate
  # filename, which is where the round number genuinely lives. Reused here so the
  # pull-request comment and this tracker comment cannot disagree about which
  # round they are reporting. Re-derive it only if you are running this block on
  # its own.

  node .agents/skills/qa-fix/references/tracker-comment.js \
    --issue "$FIX_ISSUE" --body-file .claude/state/comment-body.md \
    --stage qa-fix \
    --slot cycle="$FIX_CYCLE" \
    --json \
    || echo "⚠️  Tracker issue comment failed — continuing"
fi
```

> **`cycle` is the only slot `qa-fix` reads**, and it is numeric — positive integers only, so a
> non-numeric value is dropped and the lead degrades to the shorter true sentence rather than rendering
> a stray token.
>
> **It is derived, not passed in, and that is deliberate.** An earlier draft of this block read
> `--slot cycle="$QA_CYCLE"` — a variable that exists nowhere in this skill. It would have expanded to
> the empty string, which the engine drops, so the lead would have degraded silently and correctly and
> nobody would ever have found out. Deriving from the gate filename uses a value that is genuinely on
> disk at this point. When no gate file is found, `FIX_CYCLE` is empty and the slot is dropped by the
> same rule — the degraded path is reached by the engine's own coercion rather than by hoping.
>
> This posts `$TRACKER_COMMENT_BODY`, not `$PR_COMMENT_BODY`. The two differ only by their wrapper and
> share `$FIX_SUMMARY` — edit the summary in one place; never duplicate the prose.

> Engine source: `references/tracker-comment.js` (bundled into each skill as `references/tracker-comment.js`). Contract: `references/tracker-comment-contract.md`.


Read `reason` and act per [`references/tracker-comment-contract.md`](references/tracker-comment-contract.md) — only `no-credentials` may fall back to the Atlassian MCP tool.

3. On success: log `📨 Fix summary posted to Jira issue ${JIRA_KEY}`.
4. On failure: log `⚠️ Jira comment failed for ${JIRA_KEY} — PR comment was posted successfully. Continuing.` (non-blocking — do not halt qa-fix).

Cross-reference: `finalise` uses the same MCP call shape at lines 827-832 (`contentFormat: "markdown"`). ADF format is permitted but not the default.

## Blocking Conditions

**HALT and ask user if**:

- Missing story file for provided `story_id`
- No QA artifacts found (neither gate nor assessments)
  - Request QA to generate at least a gate file OR
  - Proceed only with clear developer-provided fix list
- **QA findings contain ambiguities or multiple options** (Step 2a)
  - Use AskUserQuestion to clarify approach before implementing
  - Do not proceed with fixes until user provides clear direction
  - Record the chosen approach in the Dev Agent Record (the single Change Log row is written on
    loop exit and summarises the cycle, not each decision)

## Completion Checklist

Before marking complete:

- ✅ **Ambiguities resolved**: All unclear or multi-option QA findings clarified with user
- ✅ **User decisions documented**: Chosen approaches recorded in the Dev Agent Record
- ✅ Lint: 0 problems
- ✅ Tests: all pass
- ✅ All blocker/critical bug reports addressed
- ✅ All high severity bug reports addressed
- ✅ All high severity `top_issues` addressed
- ✅ NFR FAIL → resolved
- ✅ NFR CONCERNS → minimized or documented with rationale
- ✅ Coverage gaps → closed or documented with rationale
- ✅ Bug reports updated with Developer Fix Cycle details
- ✅ Bug statuses changed to "Ready for QA"
- ✅ Story file updated (authorized sections only)
- ✅ Story Bug Reports section updated with current statuses
- ✅ File List complete and accurate
- ✅ Change Log: exactly ONE row added for this fix loop, with the iteration count in the Description
- ✅ Status set correctly per Status Rule
- ✅ **Post Fix Summary to PR** (Step 7 — BLOCKING): Confirm platform-appropriate comment call (`gh pr comment` on GitHub / Bitbucket REST on Bitbucket) exited with code 0. Workflow is not done until this is verified.
- ✅ **Tracker comment** (non-blocking): If `jira_key` / `github_issue` is present in story/task frontmatter, `tracker-comment.js` was invoked and its `reason` read; failure is logged but does not block completion.

---

## Bug Report Workflow Support

### Locating Bug Reports

**Pattern**: `story.{epic}.{story}.bug.*.md` in the same directory as the story file

**Glob Pattern**: `story.{epic}.{story}.bug.*.md`

**Examples**:

- `story.8.5.3.bug.1.cache-cleanup-memory-leak.md`
- `story.8.5.3.bug.2.offline-mode-regression.md`

### Reading Bug Reports

For each bug report file, extract:

1. **Bug Metadata** (header section):
   - Bug ID
   - Related Story link
   - Current Status (New, In Progress, Ready for QA, Reopened, Closed)
   - Priority (Critical, High, Medium, Low)
   - Severity (Blocker, Major, Minor, Trivial)
   - Assigned developer
   - QA engineer

2. **Bug Description**:
   - Summary
   - Expected vs Actual behavior
   - Impact on users/system

3. **Reproduction Steps**:
   - Environment details
   - Step-by-step reproduction
   - Frequency and reproducibility

4. **Evidence**:
   - Screenshots/videos
   - Logs and stack traces
   - Related files

5. **Acceptance Criteria Violation**:
   - Which AC failed
   - How it failed

6. **Developer Fix Cycle** (existing iterations):
   - Previous investigation notes
   - Previous fixes attempted
   - QA verification results

### Bug Status Lifecycle

**Status Flow**:

```
New → In Progress → Ready for QA → Closed
                                 ↓
                             Reopened → In Progress → Ready for QA → Closed
```

**Status Definitions**:

- **New**: Bug just created by QA, not yet investigated
- **In Progress**: Developer investigating or implementing fix
- **Ready for QA**: Fix complete, awaiting QA verification
- **Reopened**: QA verified fix still failing, needs re-investigation
- **Closed**: QA verified fix working, bug resolved

### Updating Bug Reports

#### Starting Investigation (New/Reopened → In Progress)

**Update Bug Header**:

```markdown
**Status**: 🔄 In Progress
```

**Add to Developer Fix Cycle** (create new iteration if Reopened):

```markdown
### Iteration 1

#### Investigation (New → In Progress)

**Date**: 2025-01-30
**Developer**: [Your Name]

**Investigation Notes**:

- Reviewed reproduction steps
- Identified root cause in [file.ts:line]
- Cause: [Explanation of what's wrong]

**Root Cause Analysis**:
[Detailed explanation of why the bug occurs]

**Proposed Fix**:
[Brief description of planned fix]
```

**Update Status History**:

```markdown
| Date       | Status      | Changed By | Notes                 |
| ---------- | ----------- | ---------- | --------------------- |
| 2025-01-30 | In Progress | [Dev Name] | Investigation started |
```

#### Implementing Fix (In Progress → Ready for QA)

**Update Bug Header**:

```markdown
**Status**: ✅ Ready for QA
```

**Complete Fix Implementation Section**:

```markdown
#### Fix Implementation (In Progress → Ready for QA)

**Date**: 2025-01-30

**Root Cause**: [Summary from investigation]

**Fix Description**:

- Modified [component/service] to [what was changed]
- Added validation for [edge case]
- Updated error handling to [improvement]

**Files Modified**:

- `libs/cache-lib/src/services/cleanup.service.ts` - Fixed memory leak
- `libs/cache-lib/src/services/cleanup.service.spec.ts` - Added test coverage

**Testing**:

- Added unit test: `should properly clean up cache references`
- Verified no memory growth over 1000 iterations
- Tested edge cases: empty cache, concurrent cleanup

**Verification Steps for QA**:

1. [Step 1 to verify fix]
2. [Step 2 to verify fix]
```

**Update Status History**:

```markdown
| 2025-01-30 | Ready for QA | [Dev Name] | Fix implemented |
```

#### Handling Reopened Bugs

If QA reopens a bug, add a new iteration:

```markdown
### Iteration 2

#### Re-Investigation (Reopened → In Progress)

**Date**: 2025-02-01
**Developer**: [Your Name]

**QA Reopening Reason** (from previous QA Verification):
[Copy QA's notes on why fix failed]

**Re-Investigation Notes**:

- Reviewed QA's findings
- Identified additional edge case: [case]
- Previous fix didn't handle [scenario]

**Revised Approach**:
[How the new fix differs from previous attempt]

#### Fix Implementation (In Progress → Ready for QA)

**Date**: 2025-02-01

[Same structure as first iteration]
```

### Updating Story Bug Reports Section

After fixing bugs, update the story file's Bug Reports section:

```markdown
## Bug Reports

### In QA Verification

- [Bug 8.5.3.1: Cache cleanup memory leak](story.8.5.3.bug.1.cache-cleanup-memory-leak.md) - ✅ Ready for QA - Priority: High (Fixed 2025-01-30)
- [Bug 8.5.3.2: Offline mode regression](story.8.5.3.bug.2.offline-mode-regression.md) - ✅ Ready for QA - Priority: Medium (Fixed 2025-01-30)

### Closed Bugs

[Bugs will be moved here by QA after verification]

### Open Bugs

[Bugs not yet addressed remain here]
```

### Bug Fix Best Practices

**Investigation Phase**:

- Read reproduction steps carefully
- Reproduce the bug locally
- Use debugging tools to identify root cause
- Document findings clearly for future reference

**Fix Implementation Phase**:

- Keep changes minimal and targeted
- Add test coverage for the bug scenario
- Test edge cases related to the fix
- Verify existing tests still pass

**Documentation Phase**:

- Describe WHY the bug occurred, not just WHAT was changed
- Provide clear verification steps for QA
- List all modified files
- Update status history table

**Common Pitfalls**:

- Don't rush investigation - understand root cause first
- Don't fix symptoms without addressing root cause
- Don't forget to add test coverage
- Don't leave bug status stale after implementing fix

### Integration with QA Workflow

**Developer→QA Handoff**:

1. Developer fixes bug
2. Developer updates bug status to "Ready for QA"
3. Developer updates story Bug Reports section
4. QA receives notification (via story status change)
5. QA verifies fix

**QA Verification Outcomes**:

- **Fixed** → QA changes bug status to "Closed", moves to Closed Bugs section
- **Still Failing** → QA changes bug status to "Reopened", adds verification notes

---

## Example: Story 2.2

**Gate shows**:

- `coverage_gaps`: Back action behavior untested (AC2)
- `coverage_gaps`: Centralized dependencies enforcement untested (AC4)

**Fix Plan**:

1. Add test ensuring Toolkit Menu "Back" action returns to Main Menu
2. Add static test verifying imports for service/view go through deps.ts
3. Re-run lint/tests
4. Update story File List and Change Log

**Result**: All tests pass, gaps closed, status → Ready for Review

## Key Principles

- **Deterministic prioritization**: Risk-first, severity-based
- **Minimal changes**: Targeted fixes only
- **Tests validate behavior**: Close gaps with comprehensive tests
- **Strict authorization**: Only update allowed story sections
- **QA ownership**: Gate files remain with QA; Dev signals readiness via Status

## Post-Fix QA Artifact Updates

After all bugs have been fixed and are "Ready for QA", request QA to update artifacts:

**Command**:

```
You: "Update QA report and gate with bug resolutions for {task_id}"
```

**What Gets Updated** (NOT new versions created):

1. **Latest QA Report** (`docs/tasks/task.{id}.{name}/task.{id}.qa.{number}.{name}.md`):
   - Adds "Bug Resolution Summary" section at end
   - Lists each bug fixed with verification results
   - Updates gate status and deployment recommendation
   - Adds new timestamp

2. **Latest Quality Gate** (`docs/tasks/task.{id}.{name}/task.{id}.gate.{number}.{name}.yml`):
   - Updates `gate` field (CONCERNS → PASS)
   - Updates `status_reason` with fix summary
   - Updates `updated` timestamp
   - Adds `status: closed` and `fixed_date` to issues
   - Updates `quality_score`
   - Adds `bug_resolution` section

**IMPORTANT**:

- QA may choose to create a new versioned file (e.g. `qa.2`) if significant changes or re-testing occurred.
- If updating in place, ensure the latest file (highest number) is the one updated.
- Bug reports track iteration history
- QA report shows final state after all fixes

**Full QA Re-run** (for complex fixes with new functionality):

```
You: "Re-run QA on task.{id} after bug fixes"
```

This executes full QA process and updates original QA artifacts.

## Related Skills

- **develop-bug**: End-to-end bug-fix orchestrator — invokes qa-fix as the fix engine inside its verify loop, then closes the bug with a Resolution Summary (qa-fix itself stops at "Ready for QA")
- **develop**: Main development workflow
- **execute-checklist**: Run Definition of Done validation
- **review-story --validate**: Pre-implementation story validation (automated GO/NO-GO, non-interactive)
- **qa-create-task**: Full QA review process for technical tasks

## Resources

See `resources/` directory for:

- `qa-fix-workflow-detailed.md` - Extended workflow documentation
- `qa-gate-template.yaml` - Example gate file structure
- `core-config-reference.yaml` - Project configuration reference
