---
name: qa-story
description: Use for comprehensive quality review during/after implementation. Performs adaptive test architecture review with conditional parallel agents based on story complexity. Uses direct tools for well-documented stories, spawns agents for complex/high-risk scenarios. Includes NFR validation (security, performance, reliability, maintainability) and requirements traceability mapping. Automatically performs re-review when previous gate has concerns or issues.
---

> **Status lifecycle**: see [`references/document-status-lifecycle.md`](references/document-status-lifecycle.md)

# QA Review

Comprehensive quality assurance review combining adaptive automated checks, test architecture assessment, non-functional requirements validation, and requirements traceability. Use this skill when reviewing implemented stories to ensure quality standards are met.

**Adaptive Review Strategy**: Intelligently chooses between direct tools (fast) and parallel agents (thorough) based on story size, complexity, and documentation quality. Completes review in single pass without waiting for user input.

**Re-Review Capability**: Automatically detects existing QA artifacts and performs re-review when previous gate has CONCERNS/FAIL or lists top_issues. Only skips re-review if gate is clean PASS with no issues.

## Lite Mode (Pipeline Contract)

When invoked from the `/develop-story` orchestrator, the call may be prefixed with the lite-mode directive. See `references/develop-pipeline-lite-mode.md` for trigger conditions, pipeline behaviour, and directive format.

**Effect on this skill**:

- Skip parallel agents in the Adaptive Review Strategy decision — use the **Lite mode** rule (rule 0 in the decision tree, direct tools only) regardless of story size or risk.
- **Phase 1.6 (Diff Code Review) still runs** — as a single read-only Explore subagent. It is the one exception to "skip parallel agents": it is not part of the Phase 1.5 parallel-agent set, and lite mode runs exactly one light code-review pass.
- **Phase 1.7 (Execute the Documented Commands) still runs** — scoped to blocks in the changed file. It is deterministic script execution, not an agent, so it costs nothing lite mode is trying to save; and it catches the class of defect an inspection-only review structurally cannot.
- All other phases (NFR, traceability, gate decision) run unchanged.
- Log the override in the QA report's Review Methodology section: `Adaptive strategy override: lite mode — direct tools only`.

If invoked outside the pipeline (no lite directive), the normal Adaptive Review Strategy applies.

## When to Use This Skill

- **Story Review**: When developer marks story as "Review" or "Ready for QA"
- **Re-Review**: When developer has addressed QA concerns and requests re-review (skill auto-detects)
- **NFR Validation**: Assessing security, performance, reliability, maintainability
- **Requirements Traceability**: Mapping acceptance criteria to test coverage
- **Code Quality Assessment**: Evaluating architecture, refactoring opportunities, technical debt

**Prerequisites**: Active PR exists for current branch. Review will halt if no PR found.

**Related Skills**:

- Before review, use `qa-planning` skill for upfront risk and test design
- After review, use `qa-gate` skill to create quality gate decisions

---

## Input Handling

**Flexible Invocation:**

You can invoke this skill with either:

- **A specific story file**: `story.178.8.example-feature.md`
- **A story directory**: `stories/story.178.8.example-feature/`

**Important**: Requires active PR for current branch. Review will halt if no PR found. See Prerequisites section.

**Optional Skill arg — caller-supplied traceability matrix:**

When invoked by the `develop-story` orchestrator, a pre-built traceability matrix may be passed via the Skill `args` field:

```
Skill(qa-story, args="traceability_matrix=<story-dir>/.summaries/qa-traceability-matrix.md")
```

When `traceability_matrix=<path>` is present in `args`:

1. Read the matrix file from `<path>`.
2. **Skip the Requirements Traceability Steps 1–4** (AC extraction, grep for spec/src files, coverage analysis, gap identification) — those were already performed by the Explore subagent.
3. Use the matrix table directly for coverage assessment and gap identification in the QA report and gate file.

When `traceability_matrix` arg is absent or the file at the path is unreadable: fall back to the existing internal traceability mapping (Steps 1–4 run in main context as before). Log: "No caller-supplied traceability matrix — performing internal mapping."

**Optional Skill arg — `code_review_blocking` run-level override:**

When invoked by the `develop-story` orchestrator (pipeline-wide default), the call may pass:

```
Skill(qa-story, args="traceability_matrix=<path> code_review_blocking=true")
```

Set `CODE_REVIEW_BLOCKING_ARG` from the `code_review_blocking=` token in `args` (default empty when absent). It feeds the canonical resolution in **Phase 1.6 step 4** so high-confidence code-review bugs gate the build (and thus get fixed in the qa-fix loop) without needing per-story frontmatter. A story still opts **out** with `code_review_blocking: false` in its frontmatter (escape hatch). Absent for standalone runs → code review stays advisory unless the story opts in via frontmatter.

**File Discovery Logic:**

When given a directory path:

1. List all files in the directory
2. Find the story file by pattern: `story.{epic}.{story}.{name}.md`
3. Exclude files containing: `.qa.`, `.gate.`, or `.bug.`
4. If multiple story files found, use the one matching the directory name
5. If no story file found, HALT and ask user for the correct path

When given only a story ID (e.g., `story.336.1`) with no path, locate the story directory using the nested pattern: `${PRD_ROOT}/**/epics/*/stories/story.{epic}.{story}.*`

**QA Artifacts Creation:**

When creating QA reports and gate files, they will be placed in the same directory as the story file with the appropriate naming:

- QA Report: `story.{epic}.{story}.qa.{number}.{descriptive-name}.md`
- Gate File: `story.{epic}.{story}.gate.{number}.{descriptive-name}.yml`
- Bug Reports: `story.{epic}.{story}.bug.{number}.{description}.md`

**Example:**

```
Input: stories/story.178.8.example-feature/
Discovers: story.178.8.example-feature.md
Creates: story.178.8.qa.1.initial-review.md
Creates: story.178.8.gate.1.initial-review.yml
```

---

## Prerequisites

### Task List Initialization

**CRITICAL**: Before starting the review, use `TaskCreate` to register every phase as a tracked task. Mark each `in_progress` before starting and `completed` immediately after finishing. This prevents silently skipping steps.

| Task Subject                    | Description                                                              |
| ------------------------------- | ------------------------------------------------------------------------ |
| PR existence check              | Validate PR exists for current branch; store PR metadata                 |
| Check for existing QA artifacts | Detect re-review vs fresh review; read prior gate/report                 |
| Locate and read story/task      | Read story/task file, extract ACs, identify implementation files         |
| Run test architecture review    | Assess test coverage, co-location, co-coverage                           |
| Run diff code review            | Adversarially review the change-set diff for bugs + cleanups (Phase 1.6) |
| Execute documented commands     | Extract and run the skill's fenced bash blocks under bash + zsh (Phase 1.7) |
| Run NFR validation              | Evaluate security, performance, reliability, maintainability             |
| Run requirements traceability   | Map ACs to test evidence; identify gaps                                  |
| Write QA report                 | Create co-located `.qa.N.*.md` report file                               |
| Write gate YAML                 | Create co-located `.gate.N.*.yml` file                                   |
| Update story/task file          | Add QA Results section, update status, link artifacts                    |
| Create bug reports              | Create `.bug.N.*.md` files for HIGH/MEDIUM issues (if any)               |
| Post PR comment                 | Post QA summary to PR — `gh pr comment` on GitHub, REST on Bitbucket     |
| Communicate to user             | Output final summary with gate decision and next steps                   |

---

### PR Existence Check

**CRITICAL**: The qa-story skill requires an active pull request for the current branch.

**How PR Selection Works:**

- The skill uses `gh pr view` to find the PR associated with your **current Git branch**
- GitHub CLI matches the PR where `headRefName` equals your current branch name
- If multiple PRs exist from the same branch, the most recent one is selected
- This ensures you're reviewing the PR for the branch you're currently working on

Before starting the review:

1. **Check for PR existence:**

   ```bash
   # Get current branch
   CURRENT_BRANCH=$(git branch --show-current)

   # Find PR for current branch
   PR_JSON=$(gh pr view --json url,state,title,number 2>&1)
   EXIT_CODE=$?

   if [ $EXIT_CODE -ne 0 ]; then
     echo "⚠️ No pull request found for branch: $CURRENT_BRANCH"
     echo ""
     echo "QA Review requires a pull request to post results."
     echo ""
     echo "Options:"
     echo "1. Create a PR: gh pr create"
     echo "2. Use /create-pr skill"
     echo "3. Push changes: git push -u origin $CURRENT_BRANCH"
     echo ""
     echo "Once PR is created, re-run /qa-story"
     exit 1
   fi
   ```

2. **Parse and validate PR information:**

   ```bash
   PR_URL=$(echo "$PR_JSON" | jq -r '.url')
   PR_STATE=$(echo "$PR_JSON" | jq -r '.state')
   PR_NUMBER=$(echo "$PR_JSON" | jq -r '.number')
   PR_TITLE=$(echo "$PR_JSON" | jq -r '.title')
   ```

3. **Handle PR state:**
   - **OPEN**: ✅ Proceed with review
   - **MERGED**: ⚠️ Warn user but continue (comment will be posted to merged PR)
   - **CLOSED**: ⚠️ Warn user but continue (comment will be posted to closed PR)
   - **No PR**: ❌ Halt and provide guidance

4. **Display PR status:**

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

5. **Store PR metadata:**
   Store PR_URL, PR_STATE, PR_NUMBER, PR_TITLE for use in "Review Completion" section

---

## QA Re-Review Logic

**CRITICAL**: Before starting a new review, check if QA artifacts already exist for this story.

### Re-Review Decision Process

After finding the story file and validating PR exists:

1. **Check for existing QA artifacts:**

   ```bash
   # Find existing gate files in story directory
   STORY_DIR=$(dirname "$STORY_FILE")
   LATEST_GATE=$(ls -t "$STORY_DIR"/story.*.gate.*.yml 2>/dev/null | head -1)
   ```

2. **If gate file exists, read and analyze:**

   ```bash
   if [ -n "$LATEST_GATE" ]; then
     GATE_STATUS=$(grep '^gate:' "$LATEST_GATE" | awk '{print $2}')
     HAS_ISSUES=$(grep -c '^  - issue:' "$LATEST_GATE")

     echo "📋 Found existing QA review: $LATEST_GATE"
     echo "   Gate Status: $GATE_STATUS"
     echo "   Issues Found: $HAS_ISSUES"
   fi
   ```

3. **Decide whether to re-review:**

   **Skip re-review (exit with success message) when:**
   - Gate status is `PASS`
   - AND `top_issues` list is empty (no issues found)
   - Message: "✅ Story already has clean PASS gate with no concerns. Re-review not needed."

   **Perform re-review when ANY of these conditions:**
   - Gate status is `CONCERNS` or `FAIL` or `WAIVED`
   - OR `top_issues` list has items (even if gate is PASS)
   - OR no gate file exists (first review)
   - Message: "🔄 Performing QA re-review (previous gate: $GATE_STATUS with $HAS_ISSUES issues)"

4. **For re-reviews, determine next QA artifact number:**

   ```bash
   # Find highest existing QA number
   LATEST_QA_NUM=$(ls "$STORY_DIR"/story.*.qa.*.md 2>/dev/null | \
                   sed -E 's/.*\.qa\.([0-9]+)\..*/\1/' | \
                   sort -n | tail -1)

   if [ -n "$LATEST_QA_NUM" ]; then
     NEXT_QA_NUM=$((LATEST_QA_NUM + 1))
   else
     NEXT_QA_NUM=1
   fi

   echo "📝 Creating QA report #$NEXT_QA_NUM"
   ```

5. **Re-review focus areas:**
   - Reference the previous QA report and gate file
   - Focus specifically on whether previous concerns were addressed
   - Check if new issues were introduced
   - Verify fixes don't break existing functionality
   - Update gate decision based on current state

### Re-Review Report Structure

When performing a re-review (QA #2, #3, etc.), include this section at the top of the QA report:

```markdown
## Re-Review Context

**Previous QA Review**: [story.{epic}.{story}.qa.{prev_num}.{name}.md]
**Previous Gate**: {PASS/CONCERNS/FAIL} (Quality Score: {score}/100)
**Previous Issues**: {count} ({high} HIGH, {medium} MEDIUM, {low} LOW)

### Issues from Previous Review

1. **Issue 1**: {title} - Status: ✅ FIXED / ⚠️ PARTIAL / ❌ NOT FIXED
   - Previous concern: {description}
   - Current status: {verification notes}

2. **Issue 2**: {title} - Status: ✅ FIXED / ⚠️ PARTIAL / ❌ NOT FIXED
   - Previous concern: {description}
   - Current status: {verification notes}

### Re-Review Scope

This review focuses on:

- Verifying all previous concerns were addressed
- Checking for regression or new issues introduced by fixes
- Re-assessing NFR compliance after changes
- Validating test coverage for bug fixes
```

**And record the scope decision as one line in Review Methodology**, per
[`references/qa-re-review-scope.md`](references/qa-re-review-scope.md):

```
Re-review scope: unscoped (prior gate failed on security)
Re-review scope: since {LAST_GATE_DATE} (default)
```

Naming the scope is what makes a quiet cycle auditable. Without it, "we found nothing" and "we did
not look" are the same sentence.

### Example Re-Review Scenarios

**Scenario 1: Clean PASS → Skip**

```yaml
# Previous gate file
gate: PASS
top_issues: [] # Empty
```

Action: Display message and skip re-review.

**Scenario 2: PASS with concerns → Re-review**

```yaml
# Previous gate file
gate: PASS
top_issues:
  - issue: "Task 2 checkboxes not marked"
    severity: medium
    file: "docs/stories/story.1.3.auth/story.1.3.auth.md"
```

Action: Perform re-review to check if checkboxes are now marked.

**Scenario 3: CONCERNS/FAIL → Re-review**

```yaml
# Previous gate file
gate: CONCERNS
top_issues:
  - issue: "Integration tests missing"
    severity: medium
    file: "apps/api/src/auth/auth.controller.spec.ts"
  - issue: "No retry logic"
    severity: medium
    file: "apps/api/src/auth/auth.service.ts"
```

Action: Perform re-review to verify if issues were addressed.

---

## Mutation-Proof Spot Check

A green suite says the tests ran, not that they can fail. Before crediting a test
as coverage for a defect this cycle fixed, **revert the behaviour it names and
confirm that test goes red** — full procedure, the outcomes table, and the shapes
vacuity takes: [`references/mutation-proving.md`](references/mutation-proving.md).

Run it as the procedure says, not from memory — the steps below exist because a
QA cycle skipped them and wrote a false finding: **snapshot the file with `cp` and
restore from the snapshot** (never `git checkout --`, which restores committed
state and deletes the uncommitted fix with the mutant); **name the test you expect
to go red before running**; **assert the mutation applied** (a before/after count,
never a silent `|| true` on the edit); **baseline green between mutations**.

Scope it: not every assertion, but **every test guarding a fix made this cycle**,
plus any guard whose failure mode is silence.

Read each result against the outcomes table, not as red/green. A mutation that
reds nothing is a measurement of the tests, and the table's rows tell dead code
from a load-bearing branch no fixture reaches — the same reading, opposite
responses. A mutation that reds a *different* test than predicted is a finding
about the predicted test. A mutation that reds only because of today's corpus, or
only in an ad-hoc assertion that was never committed, is not coverage.

Record one line per proof in the QA report's Code Review section, carrying the
test that went red and the **outcome token** from the table —
`covered` · `wrong-test-red` · `mutation-void` · `no-red-dead` · `no-red-untested`
· `absorbed` · `not-run` · `data-dependent` · `dev-only`:

```markdown
mutation-proven: <what you reverted> → <test that went red> → <outcome>
```

**Only `covered` means covered**, and it means a *committed* test went red. A
criterion whose only evidence is a development-time mutation is `dev-only` — a
different claim from covered, and it must be written differently. A proof that
reached `covered` only after a fixture was added says so. Do **not** write "every
invariant mutation-proven" unless every one was actually reverted; if you proved
four of five, say four of five.

## Story Review Process

Perform a comprehensive test architecture review with quality assessment. This adaptive, risk-aware review creates both a QA report and a detailed gate file.

**Prerequisites**: See Prerequisites section above for PR validation requirements.

### Story Status Prerequisites

- Story status is "Draft", "Review", or "Ready for QA"
- Developer has completed all tasks and updated the File List
- All automated tests are passing

**IMPORTANT — Draft Status Transition**: If the story status is "Draft" at the time the review is invoked, update it to "In Review" in the frontmatter **before** proceeding with any other review phases. Log: "📝 Story status updated: Draft → In Review"

### Review Workflow

#### Phase 0: Check for Existing QA Artifacts (Re-Review Logic)

**CRITICAL**: Before starting the review, check if QA artifacts already exist.

1. **Search for existing gate files:**
   - Look for `story.{epic}.{story}.gate.*.yml` files in story directory
   - If found, read the latest gate file (most recent by timestamp)

2. **Analyze latest gate file:**
   - Check `gate` field: PASS, CONCERNS, FAIL, or WAIVED
   - Check `top_issues` array for any listed issues
   - Check `quality_score` for overall assessment

3. **Decide: Re-review or Skip:**

   **Skip re-review when:**
   - Gate status is `PASS`
   - AND `top_issues` list is empty (no issues)
   - Display: "✅ Story already has clean PASS gate with no concerns. Re-review not needed."
   - Exit gracefully

   **Perform re-review when:**
   - Gate status is `CONCERNS`, `FAIL`, or `WAIVED`
   - OR `top_issues` has items (even if gate is PASS)
   - OR no gate file exists (first review)
   - Display: "🔄 Performing QA re-review (previous gate: {status} with {count} issues)"
   - Increment QA artifact numbers (qa.1 → qa.2)
   - Focus on verifying previous concerns were addressed

4. **Reference previous QA report:**
   - Read previous QA report to understand what was checked
   - List each previous issue and verify if it was fixed
   - Include "Re-Review Context" section in new QA report

5. **For re-reviews: resolve the scope**

   The scope decision — default narrowing, the safety carve-out that overrides it, and what each
   changes — is stated once in [`references/qa-re-review-scope.md`](references/qa-re-review-scope.md).
   Read it and apply it; do not restate the trigger here.

   Evaluate `SAFETY_REPROBE` from the prior gate **now**, before Phase 1.6 needs it:

   ```bash
   # $LATEST_GATE is the prior gate file resolved above. Trigger clause 1, per the shared rule.
   # POSIX character classes only: `\s` is a GNU extension that BSD/mawk silently never match,
   # which fails the trigger CLOSED — the carve-out would never fire and nothing would say so.
   # LATEST_GATE is EMPTY on a first review. `awk 'prog' ""` passes no filename, falls back to
   # reading stdin, and hangs indefinitely — a hang, not an error. Guard it, and close stdin so the
   # fallback is unreachable even if the guard is ever removed.
   # Clause 1 has TWO halves and they fail in opposite directions: the status half
   # fails CLOSED (an unreadable gate is not evidence of a failure), the evidence half
   # fails OPEN (a missing `evidence:` key reads as `unverified` and FIRES). See the
   # shared rule — writing the second half closed makes every pre-existing gate silent.
   SAFETY_REPROBE=false
   if [ -n "$LATEST_GATE" ] && [ -r "$LATEST_GATE" ]; then
     SECURITY_AXIS=$(awk '
       # Three transit constraints govern every line below — no whole-record
       # variable, no apostrophe, no GNU-only escape. See "Transit constraints"
       # in the shared rule for why each one fails silently. Each has a test.
       !f && /^[[:space:]]*security:[[:space:]]*$/ {
         n = length; sub(/^[[:space:]]*/, ""); ind = n - length; f = 1; next
       }
       f {
         # A key at or left of the indent of security: ends the block, so keys
         # belonging to a later NFR axis can never be read as this one.
         n = length; sub(/^[[:space:]]*/, ""); lead = n - length
         if (length > 0 && lead <= ind) exit
         if (st == "" && /^status:/) {
           st = (/[[:space:]]FAIL[[:space:]]*$/) ? "FAIL" : "OK"
         }
         if (ev == "" && /^evidence:/) {
           ev = "unverified"
           if (/evidence:[^[:alpha:]]*measured/) ev = "measured"
           else if (/evidence:[^[:alpha:]]*reasoned/) ev = "reasoned"
         }
       }
       END {
         if (!f) { print "absent"; exit }
         printf "%s %s\n", (st == "" ? "OK" : st), (ev == "" ? "unverified" : ev)
       }
     ' "$LATEST_GATE" </dev/null)
     case "$SECURITY_AXIS" in
       absent)                     : ;;
       *FAIL*)                     SAFETY_REPROBE=true ;;
       *unverified*)               SAFETY_REPROBE=true ;;
       "OK measured"|"OK reasoned") : ;;
       # The branches above are EXHAUSTIVE over what the program can emit, so
       # reaching here means the reader produced something it cannot produce —
       # in practice the EMPTY string, from an awk that died, is missing, or had
       # its program corrupted in transit. That is a claim about the instrument,
       # not about the gate, so it fires: nothing has established the axis is
       # fine. `absent` is a deliberate answer; empty is not an answer at all.
       #
       # The clean readings must be listed BEFORE this. Leaving them to the
       # catch-all makes every passing gate fire — which is what happened when
       # this branch was first added.
       *)                          SAFETY_REPROBE=true ;;
     esac
   fi
   ```

   Clause 1 is mechanical and shown above. Clauses 2 and 3 are judgement calls made against the
   gate's `top_issues[]` and the story's own Acceptance Criteria — read the shared rule and set
   `SAFETY_REPROBE=true` if either holds.

   When `SAFETY_REPROBE` is false, scope the re-review to what changed since the previous gate:
   - Get the date of the previous gate file from its `updated:` field
   - Run: `git log --since="{gate_date}" --name-only --format="" | sort -u`
   - Return: list of files changed since the last QA review

   This scopes the re-review to only what changed — avoid re-checking unchanged files that already
   passed. When `SAFETY_REPROBE` is true it does **not** apply: the surface is searched again in
   full, and the report carries a **New Findings This Cycle** section stating what was searched.
   Log: "Re-review scope: {N} files changed since gate.{prev_num}"

**See "QA Re-Review Logic" section above for detailed implementation.**

#### Phase 0.5: Check for QA Planning Artifacts

Before running independent NFR and risk analysis, check the story directory for pre-existing qa-planning files:

1. **Glob for risk assessments**: `story.{epic}.{story}.risk.*.md` in the story directory
   - If found: load as baseline risk profile
   - Validate whether implementation mitigated the pre-identified risks rather than re-deriving them from scratch
   - Log: "Found qa-planning risk assessment — using as baseline"

2. **Glob for test design documents**: `story.{epic}.{story}.test-design.*.md` in the story directory
   - If found: use the pre-defined test scenarios as the traceability baseline
   - Flag which P0/P1 scenarios are covered vs missing in the implementation
   - Log: "Found qa-planning test design — using as traceability baseline"

3. **Reference throughout review**: When planning artifacts are found, reference them explicitly in the NFR and traceability sections of the QA report rather than performing fully independent analysis.

4. **Not found**: If no planning artifacts exist, proceed with independent analysis as normal (no behaviour change).

#### Phase 1: Risk Assessment (Determines Review Depth)

**Step 1a: Map changed files using Explore subagent (CRITICAL — do this first)**

Before reading any implementation files, use the Agent tool with subagent_type="Explore" to:

- Find all files changed in this PR: resolve the PR base first — `BASE="origin/$(gh pr view --json baseRefName -q .baseRefName 2>/dev/null || echo develop)"` — then run `git diff --name-only "$BASE...HEAD"` (resolve the PR's actual base branch rather than hardcoding `origin/develop`, in case a story PR targets a non-default base such as `main`)
- For each changed file, return: file path + module it belongs to + whether a co-located `.spec.ts` exists
- Return as a compact table (max 30 rows): `file | module | has_test`

Use this table to:

1. Determine review depth (see auto-escalate rules below)
2. Inform the adaptive strategy decision (Phase 1.5)
3. Pass as context to parallel agents — they do NOT need to re-discover changed files

Do NOT read the changed files themselves in the main context — that is the agents' job.

**Auto-escalate to deep review when:**

- Auth/payment/security files touched
- No tests added to story
- Diff > 500 lines
- Previous gate was FAIL/CONCERNS (re-review scenario)
- Story has > 5 acceptance criteria

**Interactive Elicitation** (when context needed):

Use AskUserQuestion to clarify:

- Which files/components are most critical?
- Are there specific security/performance concerns?
- What's the expected test coverage level?
- Are there any known technical debt areas?

#### Phase 1 Context Hygiene

After completing risk assessment and before launching agents:

1. Summarize Phase 1 findings: changed file count, modules affected, escalation decision, risk flags
2. Store the Explore file table as a variable to pass to agents — do not re-read changed files in main context
3. Release any implementation files read during risk assessment from active consideration

#### Phase 1.5: Adaptive Quality Checks

**CRITICAL**: Choose review approach based on story characteristics. This ensures efficiency while maintaining thoroughness.

**Adaptive Strategy Decision Tree:**

Evaluate story characteristics and select appropriate review method:

```
DECISION LOGIC:

0. IF lite mode directive received from `develop-story` orchestrator:
   → Use DIRECT TOOLS — skip parallel agents regardless of story size or risk

1. ELSE IF story has documented test coverage (>500 tests documented):
   → Use DIRECT TOOLS (fast, leverages existing documentation)

2. ELSE IF story is small (<5 files created/modified):
   → Use DIRECT TOOLS (overhead not justified)

3. ELSE IF re-review scenario (fixing previous issues):
   → Use DIRECT TOOLS (focused scope on specific concerns)

4. ELSE IF high-risk areas touched (auth/payment/security):
   → Use FOCUSED AGENTS (2-3 agents, not all 4)
   → Spawn only: Test Coverage + TypeScript Compliance + relevant domain agent

5. ELSE IF story is large (>10 files) AND first-time review:
   → Use PARALLEL AGENTS (all 4 agents for comprehensive check)

6. DEFAULT (medium complexity, first-time review):
   → Use HYBRID: Direct tools first, spawn agents if gaps found
```

**Review Method A: Direct Tools (Fast)**

When using direct tools approach:

1. **Test Coverage Check**: Use Glob to find test files, Read to verify test count
2. **TypeScript Compliance**: Use Grep to search for `any` types, `@ts-ignore`, type assertions
3. **Accessibility Review**: Read React Native components directly, check for accessibility props
4. **Definition of Done**: Read story file, verify against DoD checklist

**Review Method B: Parallel Agent Execution (Thorough)**

Use the Task tool to spawn multiple agents in parallel. Send a SINGLE message with MULTIPLE Task tool calls to execute these checks concurrently:

**Before launching agents — interpolate the file map:**

Take the Explore output from Phase 1 Step 1a (the `file | module | has_test` table) and format it as a plain markdown table string. Store it as `EXPLORE_FILE_TABLE`. When constructing each agent's Task prompt, replace the literal `{EXPLORE_FILE_TABLE}` with the actual table content inline. If the Explore step was skipped (direct-tools path), set `EXPLORE_FILE_TABLE` to "N/A — direct tools review, file map not generated."

1. **Test Coverage Analysis Agent**
   - Agent Type: `general-purpose`
   - Task: "Analyze test coverage for your project PR. Changed files (from Explore map): {EXPLORE_FILE_TABLE}. For each changed file: (a) check if a co-located .spec.ts file exists in the same directory, (b) run `npx nx test <project> --coverage --testPathPattern=<file>` for affected NX projects, (c) verify coverage meets targets: 80%+ overall, 95%+ for any file in critical business logic paths (payments, auth, transactions). Flag any changed file with 0% coverage as FAIL. Check test co-location (tests MUST be next to source, never in **tests**/ directories). Generate a report with: per-file coverage %, missing test files, co-location violations, critical path coverage shortfalls."
   - Output: Test coverage report with project-specific coverage targets

2. **TypeScript Strict Mode Compliance Agent**
   - Agent Type: `general-purpose`
   - Task: "Check TypeScript strict mode compliance for your NX monorepo PR. Changed files: {EXPLORE_FILE_TABLE}. Verify tsconfig.json has strict: true. Scan changed .ts/.tsx files for: `any` types (FAIL if in auth/payments/critical-path code), `@ts-ignore` comments, non-null assertions (!), unsafe `as` casts, missing return types. Also check: (a) no Node.js imports in client-side files (client/server separation violation), (b) no server-only packages imported in client-side code, (c) all financial amounts use proper typed values (not raw `number`). Generate compliance report with violations by severity."
   - Output: TypeScript compliance report with your platform-separation checks

3. **Accessibility & Code Quality Agent**
   - Agent Type: `general-purpose`
   - Task: "Review React Native components changed in your app PR. Changed files: {EXPLORE_FILE_TABLE}. Check: (a) accessibility labels/hints on interactive elements (Pressable, TouchableOpacity, TextInput), (b) no native WebSocket usage (must use socket.io-client), (c) no console.log/console.error (use the project logging library), (d) consistent terminology per project conventions, (e) correct Expo Router navigation patterns (no manual navigation stacks). Generate audit report with violations categorized by severity."
   - Output: Code quality and your app-convention compliance report

4. **Definition of Done Criteria Agent**
   - Agent Type: `general-purpose`
   - Task: "Verify Definition of Done for this your app story. Read the story file and check: (a) all AC checkboxes marked as implemented in Dev Agent Record, (b) File List in story is complete (all created/modified/deleted files listed), (c) Change Log has dated entries, (d) Dev Agent Record has Implementation Summary + Approach + Testing Results + Completion Date, (e) story status is 'Ready for Review', (f) no hardcoded secrets or API keys in changed files, (g) NX monorepo rules respected (no local node_modules in apps/, no direct cd + npm install). Generate DoD compliance report with PASS/FAIL per criterion."
   - Output: project-specific DoD compliance report

**Implementation Pattern:**

```typescript
// Launch all agents in parallel with a SINGLE message containing multiple Task calls
// Example pseudo-code:

// Task Call 1: Test Coverage Analysis
Task({
  subagent_type: "general-purpose",
  description: "Analyze test coverage",
  prompt: "[Full coverage analysis task description]",
});

// Task Call 2: TypeScript Strict Mode
Task({
  subagent_type: "general-purpose",
  description: "Check TypeScript compliance",
  prompt: "[Full TypeScript compliance task description]",
});

// Task Call 3: Accessibility Requirements
Task({
  subagent_type: "general-purpose",
  description: "Audit accessibility",
  prompt: "[Full accessibility audit task description]",
});

// Task Call 4: Definition of Done
Task({
  subagent_type: "general-purpose",
  description: "Verify Definition of Done",
  prompt: "[Full DoD verification task description]",
});

// All 4 agents run concurrently
// Wait for completion, then aggregate results
```

**Result Aggregation:**

After all parallel agents complete:

1. **Collect Agent Outputs:**
   - Read each agent's completion message or output
   - Extract key findings from each report
   - Identify severity levels (CRITICAL/HIGH/MEDIUM/LOW)
   - **Detect agent failures**: For each agent, verify its output contains at minimum a severity classification (CRITICAL/HIGH/MEDIUM/LOW) and at least one finding or an explicit "no issues found" statement. If an agent's output is empty, contains only an error message, or lacks these markers, flag it as FAILED.
   - **Handle failed agents**: Log the failure in the QA report under a "Review Gaps" section: "Agent {name} failed or returned no output — {area} checks are incomplete." Downgrade the gate to CONCERNS if any agent failed (cannot issue PASS with incomplete checks). Do not re-run the failed agent — note the gap and proceed.

2. **Synthesize Unified Report:**
   - Merge all findings into the main QA report
   - Cross-reference issues across agents (e.g., untested code with TypeScript violations)
   - Prioritize issues by combined impact and risk
   - Create consolidated recommendations with clear ownership
   - Eliminate duplicate findings

3. **Update Gate Criteria:**
   - Feed agent findings into gate decision logic
   - Coverage gaps → test architecture assessment
   - TypeScript violations → code quality/maintainability NFR
   - Accessibility issues → NFR compliance (usability/accessibility)
   - DoD failures → acceptance criteria validation

**Quality Score Impact:**

Each parallel check contributes to the overall quality assessment:

- **Test Coverage**:
  - < 70% coverage for changed files → CONCERNS
  - < 50% coverage for changed files → FAIL
  - Critical paths (auth, payments, security) with < 80% → FAIL
  - Financial operations with < 95% coverage → FAIL
  - Any changed file with 0% coverage → FAIL

- **Test Quality**:
  - Tests only check return values without business logic assertions → CONCERNS
  - No error scenario tests for critical paths → FAIL
  - No edge case tests (empty arrays, null values, boundaries) → CONCERNS
  - Tests depend on execution order (not isolated) → CONCERNS
  - Flaky tests (inconsistent pass/fail) → CONCERNS
  - Test execution time > 30s for unit tests → CONCERNS

- **Test Architecture**:
  - No integration tests for multi-component features → CONCERNS
  - Unit tests hitting real databases/APIs instead of mocks → FAIL
  - Over-mocking in integration tests (mocking what should be tested) → CONCERNS
  - No E2E tests for critical user journeys → CONCERNS (FAIL if auth/payment flows)
  - Tests use hardcoded production credentials → FAIL (security violation)

- **TypeScript Strict Mode**:
  - 1-5 violations → CONCERNS
  - > 5 violations → FAIL
  - Any `any` types in security/payment code → FAIL

- **Accessibility**:
  - Any WCAG 2.1 Level A violations → FAIL
  - Any WCAG 2.1 Level AA violations → CONCERNS
  - Missing accessibility labels on React Native components → CONCERNS

- **Definition of Done**:
  - Any incomplete P0 criteria (ACs, critical tests) → FAIL
  - Incomplete P1 criteria (docs, minor tests) → CONCERNS
  - All criteria met → PASS contribution

**Example Unified Finding:**

```markdown
### Issue: Untested Authentication Logic with Type Safety Violations

**Severity**: HIGH
**Sources**: Test Coverage Agent + TypeScript Compliance Agent
**Category**: Code Quality + Test Architecture

**Findings**:

- **Test Coverage Agent**: `auth-service.ts` has 0% coverage (0/45 lines tested, no test file found)
- **TypeScript Agent**: `auth-service.ts` contains 3 `any` types and 2 `@ts-ignore` comments in authentication methods

**Impact**:

- Critical authentication logic is completely untested
- Type safety violations mask potential runtime errors
- Combined risk: HIGH probability of production security failures
- Violates security testing requirements in Definition of Done

**Recommendation**:

1. Create `auth-service.spec.ts` with comprehensive unit tests (target: 90% coverage for security code)
2. Replace `any` types with proper `UserCredentials` and `AuthToken` interfaces
3. Remove `@ts-ignore` comments and fix underlying type issues (likely bcrypt type issues)
4. Add integration tests for complete auth flow
5. Estimated effort: 6-8 hours

**Gate Impact**: FAIL (untested critical security path + type safety violations in auth code)
**Suggested Owner**: dev
```

**Test Review Checklist** (For Manual Review):

When reviewing test files discovered by the Test Coverage Agent, check:

1. **Test File Discovery**:
   - [ ] Every changed `.ts`/`.tsx` file has corresponding `.spec.ts` file
   - [ ] Test files are co-located with source (same directory)
   - [ ] No orphaned test files (tests without corresponding source)

2. **Test Coverage Completeness**:
   - [ ] All public methods/functions have tests
   - [ ] All acceptance criteria have corresponding test cases
   - [ ] Edge cases are tested (null, undefined, empty, max values)
   - [ ] Error scenarios are tested (invalid input, exceptions)
   - [ ] Happy path and sad path both covered

3. **Test Quality**:
   - [ ] Tests have descriptive names (describe what they test, not how)
   - [ ] Each test has clear arrange-act-assert structure
   - [ ] Tests make meaningful assertions (not just "truthy" checks)
   - [ ] No commented-out tests or skipped tests (`xit`, `describe.skip`)
   - [ ] Tests are independent (can run in any order)

4. **Test Architecture**:
   - [ ] Unit tests use mocks for external dependencies
   - [ ] Integration tests test actual component interactions
   - [ ] No unit tests hitting real databases/APIs
   - [ ] Test data is created/cleaned up properly
   - [ ] No hardcoded IDs or production credentials in tests

5. **Test Maintainability**:
   - [ ] Test utilities/helpers are reusable
   - [ ] No excessive code duplication in tests
   - [ ] Test data factories used for complex objects
   - [ ] Clear test setup and teardown

6. **Critical Path Validation**:
   - [ ] Authentication flows have comprehensive tests
   - [ ] Payment/financial operations have 95%+ coverage
   - [ ] Security-critical code paths fully tested
   - [ ] Error handling in critical paths is tested

**Blocking Conditions:**

If any parallel agent fails to complete or reports critical errors:

- Document the agent failure in QA report with error details
- Continue with manual review for that specific category
- Mark corresponding quality assessment as CONCERNS with note: "Automated check failed"
- Include in gate file notes: "Agent [X] failed - manual review performed"
- Do not block overall QA review; proceed with available data

**Benefits of Parallel Execution:**

- **Speed**: 4x faster than sequential checks (all run concurrently)
- **Thoroughness**: Dedicated agents for each quality dimension
- **Consistency**: Automated checks reduce human error and bias
- **Traceability**: Clear agent outputs feed into unified report
- **Scalability**: Easy to add new quality checks as additional agents

#### Phase 1.6: Diff Code Review

Adversarially review the story's change set **diff** for **correctness bugs** (logic errors, null/async/race, API misuse, broken invariants) and **cleanups** (reuse of existing utilities, simplification, efficiency) — the lens the Phase 1.5 agents (coverage / TS-strict / a11y / DoD) and the document-anchored checks do **not** provide. Effort follows the **Phase 1.5 Adaptive decision tree**: a single light pass for lite/small/re-review; run it alongside the parallel agents for large/high-risk stories; skip entirely when the diff touches no reviewable code. **One exception, and it overrides the tree: cycle 2 is always a full refute pass** (step 1 below). A re-review that gets shallower each cycle is how a loop runs five times and learns nothing after the first.

1. **Scope the diff** and write it to a patch file (keeps diff bytes out of main context). First review → the whole branch diff. **Cycle 2 (exactly one prior gate) → the whole branch diff again, reviewed to refute** (see the refute directive under step 2). Cycle 3+ → the Phase 1 changed-file map, scoped to files changed since the last gate's `updated:` date:

   ```bash
   BASE_REF=$(gh pr view --json baseRefName -q .baseRefName 2>/dev/null)   # resolve the PR's actual base (default develop)
   BASE="origin/${BASE_REF:-develop}"
   DIFF_FILE=$(mktemp /tmp/qa-code-review-XXXXXX.diff)
   # How many gates already exist? 0 = first review, 1 = cycle 2, 2+ = cycle 3 and later.
   PRIOR_GATES=$(ls "$STORY_DIR"/story.*.gate.*.yml 2>/dev/null | wc -l | tr -d ' ')
   # Re-review only: derive the prior gate's date from its `updated:` field ($LATEST_GATE set in Phase 0).
   LAST_GATE_DATE=$(grep -E '^updated:' "$LATEST_GATE" 2>/dev/null | head -1 | sed -E "s/updated:[[:space:]]*//; s/['\"]//g")
   # $SAFETY_REPROBE was resolved in Phase 0 step 5 from the prior gate. It is a DISJUNCT on this
   # guard, not a second block in front of it — two places assigning $DIFF_FILE is how one of them
   # silently stops mattering.
   if [ "$PRIOR_GATES" -ge 2 ] && [ -n "$LAST_GATE_DATE" ] && [ "$SAFETY_REPROBE" != "true" ]; then   # cycle 3+ — scope to files changed since last gate
     REFUTE_PASS=false
     FILES=$(git log --since="$LAST_GATE_DATE" --name-only --format="" | sort -u)
     [ -n "$FILES" ] && git diff "$BASE...HEAD" -- $FILES > "$DIFF_FILE"
   else                                                             # first review, cycle 2, or safety re-probe — whole branch diff
     [ "$PRIOR_GATES" = "1" ] && REFUTE_PASS=true || REFUTE_PASS=false
     git diff "$BASE...HEAD" > "$DIFF_FILE" 2>/dev/null || git diff "origin/develop...HEAD" > "$DIFF_FILE"
   fi
   ```

   `$STORY_DIR` is the story directory resolved in Phase 0. The narrowing is a cost control, and on
   cycle 2 it costs more than it saves: the files changed since the last gate are exactly cycle 1's
   own fixes, so a narrowed cycle-2 review reads only the repairs and never re-reads the original
   change with what cycle 1 learned. On one observed task, four narrowed re-reviews walked past a
   defect that had been present in the *original* commit and surfaced only at cycle 5.

2. **Dispatch a read-only Explore subagent** with the prompt from `references/code-review-prompt.md` (the single source of truth — pass it verbatim), substituting `<DIFF_FILE>` and `<WORKING_DIR>` (repo root). It returns a `code_review:` YAML findings block. Never read the raw diff into main context.

   **Cycle 2 only (`REFUTE_PASS=true`) — refute, do not review.** Append this directive to the
   subagent prompt. It is the one pass in the loop performed by an agent that did not write the
   code and is not asked to agree with it:

   ```
   REFUTE PASS. This change set was written by the same pipeline that is now reviewing it, and
   cycle 1's fixes are the least-reviewed code in it. Your job is not to confirm the change works —
   it is to find the claim in it that is FALSE. Start with the fixes from the previous QA cycle:
   a fix is new code, not the closure of a finding.

   For every change that touches emission, subscription, caching or any lifecycle, probe these four
   transitions explicitly — they are the states the original findings never mentioned, and the
   steady-state suite structurally cannot see them:
     • Bulk teardown     — on unmount/disconnect/cleanup, does it emit, persist or announce
                           something it should not?
     • In-flight         — if input arrives WHILE the operation runs, is it applied, queued, or
                           silently dropped?
     • Error path        — when it fails, is state left recoverable, or stranded so retry is
                           impossible?
     • Reconnect         — after a drop and re-establish, does it converge, or resume from stale
                           state?

   Review the COMBINATION, not only each change: at least one real defect of this shape was caused
   by two earlier fixes that were each correct alone.
   ```

   This costs more than a narrowed cycle-2 pass and is expected to pay for itself, because the
   develop-story pipeline's convergence check ends the loop shortly after cycle 3 when it is not
   converging. The trade is **two deep cycles instead of five shallow ones**.

   **Safety re-probe (`SAFETY_REPROBE=true`) — search the surface, do not re-read the fixes.**
   Resolved in Phase 0 step 5 from the prior gate, per
   [`references/qa-re-review-scope.md`](references/qa-re-review-scope.md). It is
   **independent of `REFUTE_PASS`** — where both apply, append both directives, refute first.
   Append verbatim:

   ```
   SAFETY RE-PROBE. The previous gate failed on a safety axis. Do NOT scope your attention to the
   fixes: they are handled separately by the Re-Review Context table, and re-confirming them is not
   your job. Search the surface again as if for the first time — enumerate the boundary's inputs
   yourself and test them, rather than re-testing the inputs the previous cycle happened to name. A
   fix cycle changes the behaviour of code its own diff never touched, so a defect of the same class
   as the ones just closed is the expected finding, not a surprising one.
   ```

   Why both, rather than one flag: refuting the fixes and re-probing the surface have different
   targets. Collapsing them would make cycle 3+ lose the refute, or cycle 2 lose the re-probe.

3. **Record — always (advisory):** every finding (bugs + cleanups, with `file:line`) goes into the QA report `## Code Review` section and the PR comment.

4. **Gate mapping — resolve blocking, then map:** apply the **canonical resolution** from the **Opt-in to blocking** section of `references/code-review-prompt.md`. It combines a run-level override (from Skill `args`) with the story frontmatter flag; an explicit per-doc `false` is the escape hatch:

   ```bash
   # CR_OVERRIDE=true when the develop-story pipeline passed code_review_blocking=true in Skill args
   # (empty for standalone qa-story runs).
   CR_OVERRIDE=$([ "$CODE_REVIEW_BLOCKING_ARG" = "true" ] && echo true || echo "")
   DOC_FLAG=$(grep -E '^code_review_blocking:[[:space:]]*(true|false)\b' "$STORY_FILE" \
                | head -1 | grep -Eo '(true|false)' || true)
   if [ "$DOC_FLAG" = "false" ]; then CR_BLOCKING=false
   elif [ "$CR_OVERRIDE" = "true" ] || [ "$DOC_FLAG" = "true" ]; then CR_BLOCKING=true
   else CR_BLOCKING=false; fi
   ```

   `$CODE_REVIEW_BLOCKING_ARG` comes from the `code_review_blocking=` token in Skill `args` (see **Input Handling**). When `CR_BLOCKING=true`, append each `category: bug` + `confidence: high` finding to the gate `top_issues[]` as `{ id, severity, file, finding, suggested_action, suggested_owner: dev }` — `file` is the path from the finding's own `file:line`, which every code-review finding already carries; the existing **Gate Decision Criteria** then apply unchanged. Otherwise — resolved advisory, or every cleanup or non-high-confidence finding — the gate is **unaffected**.

5. `rm -f "$DIFF_FILE"`.

This is the single diff-aware code reviewer for the story; Phase 2B below defers to it rather than duplicating it. It keeps the QA→qa-fix loop safe: only a high-confidence correctness bug triggers a fix cycle. Under the develop-story pipeline (which sets the run-level override) this _is_ the code-review-and-fix loop; standalone, behaviour is unchanged unless the story opts in via frontmatter.

#### Phase 1.7: Execute the Documented Commands

Applies only when this story's deliverable is **runnable prose** — the diff adds or modifies a
`SKILL.md` or a `shared/resources/*.md` prompt containing at least one fenced ```bash block. The full
rule, including why the safety boundary is an allow-list rather than a deny-list, is stated once in
`references/qa-runnable-prose-detection.md`. Read it before changing anything here.

Phase 1.6 above reviews that prose by reading it. This phase runs it. The distinction is the whole
point: a skill can pass an inspection-only review carrying a defect that breaks its core function on the
default shell, which is exactly what happened to the `review-pr` skill — two clean QA cycles, a DoD
gate, forty passing contract tests, and a `ls` glob that collected **nothing** under zsh.

When the rule does not fire, record `Phase 1.7: not applicable — no runnable prose in the change set` in
the QA report's Review Methodology and move on.

When it does fire, run the engine over each changed in-scope file:

```bash
node references/qa-execute-snippets.mjs --file "$SKILL_FILE" --json
```

Bind any caller values the documented snippets expect with repeated `--bind NAME=VALUE`, and seed the
temp working directory from a real directory with `--copy <dir>` so the blocks see real data. Execution
always happens in that temp copy — never the live tree.

Record in the QA report:

1. **Counts** — blocks found, and how many classified `runnable` / `placeholder` / `mutating`.
2. **Every skipped block, with its line number and reason.** A silent skip recreates the failure this
   phase exists to prevent.
3. **Shells used** — note `zsh-unavailable` when the host has no zsh.
4. **Findings**, in the existing `code_review` shape: `category: bug`, `confidence: high` for an
   execution failure and `medium` for a shell disagreement. They feed `top_issues[]` under
   `code_review_blocking` on the same terms as any other Phase 1.6 finding — no new schema.

> **A run where zero blocks executed is never a pass — but it is two states, and the engine tells them
> apart for you.** Report whichever it emits; do not suppress either.
>
> - **`zero-blocks-executed`** (finding, `medium`) — `placeholder > 0`: the run was under-configured,
>   and `--bind` / `--copy` is the fix.
> - **`no-executable-blocks`** (information, in `notes[]`, exit `0`) — `placeholder === 0` and every
>   block refused as `mutating`: the file documents side-effecting commands that are deny-listed by
>   design, so **no configuration will ever make them runnable**. Still recorded, with a per-reason
>   refusal breakdown, so the step is never a silent no-op; not a finding, so it does not accumulate as
>   noise on most of the library (`bug.7`).
>
> `zsh` being absent is not either case — it never reduces the runnable count, so record it as
> information and continue.

**Lite mode**: this phase still runs, but only over blocks in the changed file.

#### Phase 2: Comprehensive Analysis

**A. Requirements Traceability**

- Map each acceptance criteria to its validating tests (document mapping with Given-When-Then, not test code)
- Identify coverage gaps
- Verify all requirements have corresponding test cases
- Reference test-design output if available from qa-planning skill
- **Leverage findings from Test Coverage Agent (Phase 1.5)** for coverage analysis

**B. Code Quality Review**

The diff-level code review is performed once in **Phase 1.6** (correctness bugs + reuse/simplification/efficiency cleanups, via `references/code-review-prompt.md`) — do **not** re-review the diff here. In this phase only:

- Consolidate the Phase 1.6 findings into the overall assessment (architecture / design-pattern concerns surfaced as bugs or cleanups).
- **Leverage findings from TypeScript Compliance Agent (Phase 1.5)** for type safety review.
- **Leverage findings from Accessibility Agent (Phase 1.5)** for component quality.
- Perform a safe refactor only if Phase 1.6 flagged a cleanup AND tests cover it (Phase 3) — otherwise record it as advisory.

**C. Test Architecture Assessment**

Perform comprehensive test quality evaluation:

**Test Coverage Analysis**:

- **Quantitative Coverage**: Lines, functions, branches, statements (from Test Coverage Agent)
- **Qualitative Coverage**: Are critical paths tested? Edge cases covered?
- **Coverage Gaps**: Which files/functions lack tests? Why?
- **Integration Test Coverage Agent findings (Phase 1.5)** into coverage assessment

**Test Level Appropriateness**:

- **Unit Tests**: Business logic, utilities, pure functions tested in isolation?
- **Integration Tests**: Component interactions, API endpoints, database operations?
- **E2E Tests**: Critical user journeys covered?
- **Test Pyramid Balance**: Appropriate ratio of unit:integration:e2e tests?

**Test Quality Metrics**:

- **Assertion Quality**: Do tests make meaningful assertions? Or just smoke tests?
- **Test Independence**: Can tests run in isolation without dependencies?
- **Test Clarity**: Are test names descriptive? Is intent clear?
- **Test Maintainability**: Are tests DRY? Reusable test utilities?
- **Test Reliability**: Do tests pass consistently? Or flaky?

**Test Data Strategy**:

- **Test Data Management**: How is test data created/cleaned up?
- **Fixtures**: Are fixtures well-organized and reusable?
- **Data Factories**: Are data builders/factories used for complex objects?
- **Test Isolation**: Does each test create/clean its own data?

**Mock/Stub Strategy**:

- **Mock Appropriateness**: Are mocks used for external dependencies only?
- **Mock Quality**: Do mocks accurately represent real behavior?
- **Over-mocking**: Are integration tests mocking too much?
- **Under-mocking**: Are unit tests hitting real databases/APIs?

**Edge Case and Error Coverage**:

- **Happy Path**: Basic functionality tested?
- **Edge Cases**: Boundary conditions (empty arrays, null values, max limits)?
- **Error Scenarios**: Invalid input, network failures, timeouts?
- **Security Edge Cases**: SQL injection attempts, XSS payloads, auth bypasses?

**Test Execution Characteristics**:

- **Execution Time**: Are tests fast enough? (Unit: <1s, Integration: <10s)
- **Test Reliability**: Pass rate? Any flaky tests?
- **Parallelization**: Can tests run in parallel?
- **CI/CD Integration**: Do tests run in continuous integration?

**Cross-Reference with Other Agents**:

- **Integrate Test Coverage Agent findings (Phase 1.5)** for quantitative metrics
- **Cross-reference with Definition of Done Agent (Phase 1.5)** for testing completeness
- **Validate against TypeScript Compliance Agent (Phase 1.5)** for test code quality

**D. Non-Functional Requirements (NFRs)**

See NFR Assessment section below for detailed process.

- **Incorporate TypeScript Compliance findings** into maintainability NFR
- **Incorporate Accessibility findings** into usability/accessibility NFR
- **Incorporate Test Coverage findings** into reliability/maintainability NFRs

**E. Testability Evaluation**

- **Controllability**: Can we control the inputs?
- **Observability**: Can we observe the outputs?
- **Debuggability**: Can we debug failures easily?

**F. Technical Debt Identification**

- Accumulated shortcuts
- Missing tests
- Outdated dependencies
- Architecture violations

#### Phase 3: Active Refactoring

- Refactor code where safe and appropriate
- Run tests to ensure changes don't break functionality
- Document all changes in QA report with clear WHY and HOW
- Do NOT alter story content beyond QA Report section
- Do NOT alter the story File List section
- Story status IS updated at review start (Draft → In Review) and at review completion per gate decision (see "Update Story Status" in Review Completion section)

#### Phase 4: Standards Compliance Check

- Verify adherence to `docs/coding-standards.md`
- Check compliance with `docs/unified-project-structure.md`
- Validate testing approach against `docs/testing-strategy.md`
- Ensure all guidelines mentioned in the story are followed
- **Review TypeScript Compliance Agent findings (Phase 1.5)** against project TypeScript standards
- **Review Accessibility Agent findings (Phase 1.5)** against project accessibility standards
- **Cross-check Definition of Done Agent (Phase 1.5)** for standards compliance

#### Phase 5: Acceptance Criteria Validation

- Verify each AC is fully implemented
- Check for any missing functionality
- Validate edge cases are handled
- **Validate against Definition of Done Agent findings (Phase 1.5)** for AC implementation status
- **Cross-reference Test Coverage Agent (Phase 1.5)** to ensure all ACs have test coverage

#### Phase 6: Documentation and Comments

- Verify code is self-documenting where possible
- Add comments for complex logic if missing
- Ensure any API changes are documented

### Story Review Outputs

#### Output 1: QA Report File

**CRITICAL FILE AUTHORIZATION RULES:**

You are **AUTHORIZED** to update the following sections in story/task files:

- `## QA Testing Results` section (gate decision, quality score, test coverage summary, key findings, links to QA artifacts)
- `## QA Completion Summary` section (final QA status, test results summary, deployment readiness, final notes)
- `## Change Log` section (append-only — one verdict row per QA cycle; never rewrite existing rows)
- Story/Task `status` field in frontmatter (based on gate decision)
- Frontmatter `updated` (bumped in the same edit as any Change Log row)

**DO NOT modify**: Story content, Acceptance Criteria, Dev Notes, Developer sections, or any other sections.

**QA Documentation Rule:**

1. Always update `## QA Testing Results` section with gate decision and summary
2. If testing is complete, update `## QA Completion Summary` section
3. Update story/task status based on gate decision
4. Include links to detailed QA report and gate files for full details
5. Append ONE `## Change Log` row recording the gate decision, in the same edit, and bump
   frontmatter `updated`:

   | 2026-05-14 |  | QA gate CONCERNS (6/10) — 2 findings | qa-story |

   Leave `Version` blank — only `/finalise` bumps it. A cycle that finds nothing still writes its
   row (`QA gate PASS (9/10) — no findings`): the verdict is the event being recorded, not the
   findings. Canonical format: [document-change-log.md](references/document-change-log.md).

   **Never write the gate `.yml` from here** — that file belongs to `qa-gate` alone. The converse
   also holds: `qa-gate` never touches the document. See
   [`docs/reference/anti-patterns.md`](../../docs/reference/anti-patterns.md).

**QA Report Location and Naming:**

- **Stories**: `story.[epic].[story].qa.[number].[descriptive-name].md`
- **Tasks**: `task.[number].qa.[number].[descriptive-name].md`
- **MUST co-locate with the story/task file in the same directory**

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

**Naming Convention:**

- All files in a story directory share the same base: `story.{epic}.{story}`
- File type is indicated by the segment after the story ID: `.qa.`, `.gate.`, `.bug.{number}.`
- QA reports and Gates include a sequential number: `.qa.1.`, `.gate.1.`, etc.
- Bug reports include a sequential number: `.bug.1.`, `.bug.2.`, etc.
- Descriptive name comes last before the file extension

**Examples:**

- Story directory: `docs/prd/domain-name/module-name/example-area/epics/epic.178.feature-ui/stories/story.178.8.example-feature/`
- Story file: `story.178.8.example-feature.md`
- QA report: `story.178.8.qa.1.example-feature.md`
- Gate file: `story.178.8.gate.1.example-feature.yml`
- Bug report: `story.178.8.bug.1.android-swipe-jank.md`

**QA Report Structure:**

````markdown
# QA Report: Story [epic].[story] - [Story Title]

**Epic**: [Epic Name]
**Story**: [epic].[story] - [Story Title]
**QA Engineer**: QA Engineer
**Testing Completed**: [Date]
**Status**: PASS/CONCERNS/FAIL

---

## Executive Summary

[Brief summary of testing scope and overall assessment]

## Testing Scope

### Prerequisites Verified ✅

- [x] Code is implemented and functional
- [x] Basic test suite exists and passes
- [x] Dependencies are available
- [x] [Other prerequisites]

### Testing Approach

- [ ] Manual Testing
- [ ] Automated Testing
- [ ] Performance Testing
- [ ] Security Review

## Test Results Summary

### Acceptance Criteria Status

| AC  | Status  | Test Result | Notes                     |
| --- | ------- | ----------- | ------------------------- |
| AC1 | ✅ PASS | Verified    | [Brief verification note] |
| AC2 | ✅ PASS | Verified    | [Brief verification note] |

## Issues Found

### HIGH Severity Issues (X)

#### Issue 1: [Issue Title]

**Severity**: HIGH
**Category**: [Security/Performance/Reliability/etc.]
**Observation**: [Detailed description]

**Impact**: [How this affects users/system/business]

**Risk Assessment**:

- **Likelihood**: [HIGH/MEDIUM/LOW]
- **Consequence**: [HIGH/MEDIUM/LOW]
- **Business Impact**: [Description]

**Recommendation**: [Suggested fix]

**Required Actions Before Re-Review**:

1. [Specific step]
2. [Specific step]

**Retest Strategy**: [How to verify the fix]

**Gate Recommendation**: [PASS/CONCERNS/FAIL]

## New Findings This Cycle

_Re-reviews only. **Required even when empty** — `None` is an answer; an absent section is
indistinguishable from a cycle that never asked the question. The Re-Review Context table answers
"were the previous findings fixed?"; this section answers "what else is there?"._

[for each new finding not present in the previous review:]

- **[{severity}]** `{file}:{line}` — {finding} → {suggested_action}

On an **unscoped** re-review reporting zero new findings, state what was searched — a bare `None` is
a defect in the report, not a clean result:

```markdown
None. Searched unscoped (prior gate: security FAIL): full `origin/develop...HEAD` diff, {N} files.
Re-enumerated {the boundary's inputs, named} and tested each against the current implementation.
```

## Code Review

[From Phase 1.6 — advisory unless the story opted in via `code_review_blocking: true`. Omit if the diff had no reviewable code.]

**Correctness bugs ([count]):**
[for each bug finding:]

- [[severity]/[confidence]] `[file_line]` — [finding] → [suggested_action]

**Cleanups ([count]):**
[for each cleanup finding (reuse / simplification / efficiency):]

- `[file_line]` — [finding] → [suggested_action]

[If any finding was promoted to a gate `top_issues` entry (opt-in blocking), note its id here.]

## Performance Results

### [Performance Category] ✅

- **[Metric]**: [Value] ([Target])
- **[Metric]**: [Value] ([Target])

## Security Assessment

### Findings ✅

- [Security finding or "No security concerns identified"]

## NFR Compliance Assessment

### Performance ✅

- Status: PASS/CONCERNS/FAIL
- Notes: [Findings]

### Reliability ✅

- Status: PASS/CONCERNS/FAIL
- Notes: [Findings]

### Security ✅

- Status: PASS/CONCERNS/FAIL
- Evidence: measured/reasoned/unverified — **how** the verdict was reached. `measured` only when
  hostile candidates were actually executed, and then `probes_executed` must be > 0; a verdict
  reached by reading is `reasoned`, which is accurate rather than a failing grade. Values, the
  placement constraint and the fail-open rule for a missing key:
  [`references/qa-gate-security-evidence.md`](references/qa-gate-security-evidence.md).
  `/review-security` emits a liftable block with the same key names — consuming it is optional;
  this skill owns the field
- Probes executed: [count — required when Evidence is `measured`]
- Notes: [Findings]

### Maintainability ✅

- Status: PASS/CONCERNS/FAIL
- Notes: [Findings]

## Recommendations

### Immediate Actions (Current Sprint)

1. [Action]
2. [Action]

### Short-term Actions (Next Sprint)

1. [Action]
2. [Action]

## Test Artifacts

### Files Reviewed

- [File path]
- [File path]

### Test Commands Executed

```bash
[Command executed]
```
````

### Coverage Report

- **Lines**: X% covered
- **Functions**: X% covered
- **Branches**: X% covered

## Final Assessment

### Gate Status: [STATUS]

**Rationale**: [Explanation]

### Deployment Recommendation: [APPROVED/BLOCKED]

**Conditions**: [If any]

### Next Steps

1. [Step]
2. [Step]

---

**QA Report Reference**: `story.[epic].[story].qa.[number].[descriptive-name].md` (co-located)
**Gate File**: `story.[epic].[story].gate.[number].[descriptive-name].yml` (co-located)

````

#### Output 2: Quality Gate File

> **`top_issues[]` holds THIS cycle's findings only.** Do not copy a previous cycle's entries
> forward, even annotated `status: closed`, and even though carrying the history reads as helpful.
> The develop pipeline's **third-strike rule** reads the `file:` of every HIGH entry across the last
> three gates and deliberately ignores `status: closed`, so a copied-forward HIGH makes one finding
> look like a file struck twice — and a third cycle then refuses to let `/qa-fix` patch a file that
> was never the problem. The history belongs in `bug_resolution`, in the QA report's Re-Review
> Context table, and in the bug reports.

**CRITICAL: Gate files MUST be co-located with story/task files (Updated 2025-12-09)**

**Gate File Location and Naming:**
- **Stories**: `story.[epic].[story].gate.[number].[descriptive-name].yml`
- **Tasks**: `task.[number].gate.[number].[descriptive-name].yml`
- **MUST co-locate with the story/task file in the same directory**
- Examples:
  - Story: `docs/prd/domain-name/module-name/epics/epic.1.<name>/stories/story.1.1.5.<slug>/story.1.1.5.gate.1.feature-implementation.yml`
  - Task: `docs/tasks/task.44.transactions-account-backend-integration/task.44.gate.1.transactions-account-backend-integration.yml`

**Legacy Note**: Old pattern of storing gates in `docs/qa/gates/[prd-path]/` is deprecated. All new gate files must be co-located.

**Gate File Structure:**

```yaml
schema: 1
story: '{epic}.{story}'
story_title: '{story title}'
gate: PASS|CONCERNS|FAIL|WAIVED
status_reason: '1-2 sentence explanation of gate decision'
reviewer: 'QA Engineer'
updated: '{ISO-8601 timestamp}'

top_issues: [] # Empty if no issues; otherwise a list of entries shaped:
  # - id: '{PREFIX-###}'
  #   severity: low|medium|high
  #   file: '{repo-relative path the finding is IN}'   # REQUIRED — see note below
  #   finding: '{what is wrong}'
  #   suggested_action: '{the fix}'
  #   suggested_owner: dev|sm|po
  #   status: open|closed         # set closed when a later cycle resolves it
  #   fixed_date: '{YYYY-MM-DD}'  # with status: closed
waiver: { active: false } # Set active: true only if WAIVED

# Extended fields (optional but recommended):
quality_score: 0-100 # 100 - (20*FAILs) - (10*CONCERNS) or use technical-preferences.md weights
expires: '{ISO-8601 timestamp}' # Typically 2 weeks from review

evidence:
  tests_reviewed: { count }
  risks_identified: { count }
  trace:
    ac_covered: [1, 2, 3] # AC numbers with test coverage
    ac_gaps: [4] # AC numbers lacking coverage

nfr_validation:
  security:
    status: PASS|CONCERNS|FAIL
    # `evidence:` goes BELOW `status:`, never between `security:` and `status:` —
    # the re-review probe reads the first `status:` after `security:` and fails
    # closed and silently if a key reaches that slot first. Values and the
    # probes_executed rule: references/qa-gate-security-evidence.md
    evidence: measured|reasoned|unverified
    probes_executed: 0 # REQUIRED when evidence: measured; `measured` with 0 is a schema error
    notes: 'Specific findings'
  performance:
    status: PASS|CONCERNS|FAIL
    notes: 'Specific findings'
  reliability:
    status: PASS|CONCERNS|FAIL
    notes: 'Specific findings'
  maintainability:
    status: PASS|CONCERNS|FAIL
    notes: 'Specific findings'

recommendations:
  immediate: # Must fix before production
    - action: 'Add rate limiting'
      refs: ['api/auth/login.ts']
  future: # Can be addressed later
    - action: 'Consider caching'
      refs: ['services/data.ts']
````

> **`file:` is required on every `top_issues[]` entry**, and it must be a repo-relative path that
> appears in the change set — not a description, not a module name, not `unknown`. The develop-story
> pipeline's **third-strike rule** reads it to detect a file that HIGH findings keep circling across
> cycles, and the rule works only because `file:` is checkable against the diff. A finding that
> genuinely spans several files names the one a fix would edit first. If a finding truly has no
> file (a missing artifact, a process gap), write the path it *should* exist at.

### Gate Decision Criteria

**Deterministic rule (apply in order):**

If risk_summary exists, apply its thresholds first (≥9 → FAIL, ≥6 → CONCERNS), then NFR statuses, then top_issues severity.

1. **Risk thresholds (if risk_summary present from qa-planning):**
   - If any risk score ≥ 9 → Gate = FAIL (unless waived)
   - Else if any score ≥ 6 → Gate = CONCERNS

2. **Test coverage gaps (if trace available):**
   - If any P0 test from test-design is missing → Gate = CONCERNS
   - If security/data-loss P0 test missing → Gate = FAIL

3. **Issue severity:**
   - If any `top_issues.severity == high` → Gate = FAIL (unless waived)
   - Else if any `severity == medium` → Gate = CONCERNS

4. **NFR statuses:**
   - If any NFR status is FAIL → Gate = FAIL
   - Else if any NFR status is CONCERNS → Gate = CONCERNS
   - Else → Gate = PASS

- **WAIVED** only when waiver.active: true with reason/approver

> **Code-review findings (Phase 1.6):** by default these do NOT enter `top_issues` and do NOT affect the gate. Only when the story opts in via `code_review_blocking: true` in its frontmatter are `category: bug` + `confidence: high` findings appended to `top_issues[]` — at which point the top_issues severity rules above apply unchanged. Cleanups and non-high-confidence findings are always advisory.

**Detailed criteria:**

- **PASS**: All critical requirements met, no blocking issues
- **CONCERNS**: Non-critical issues found, team should review
- **FAIL**: Critical issues that should be addressed
- **WAIVED**: Issues acknowledged but explicitly waived by team

### Quality Score Calculation

```text
quality_score = 100 - (20 × number of FAILs) - (10 × number of CONCERNS)
Bounded between 0 and 100
```

If `technical-preferences.md` defines custom weights, use those instead.

### Suggested Owner Convention

For each issue in `top_issues`, include a `suggested_owner`:

- `dev`: Code changes needed
- `sm`: Requirements clarification needed
- `po`: Business decision needed

### Review Completion

After review:

1. Create QA report file: `story.[epic].[story].qa.[number].[descriptive-name].md` (co-located with story file)
2. Create quality gate file: `{qa.qaLocation}/gates/[prd-path]/story.[epic].[story].gate.[number].[descriptive-name].yml`
3. **Update Story/Task File with QA Results**:

   **For Stories - Update these sections:**

   a. **QA Testing Results** section:

   ```markdown
   ## QA Testing Results

   **QA Status**: ✅ PASS / ⚠️ CONCERNS / ❌ FAIL
   **QA Engineer**: QA Engineer
   **Testing Date**: [Date]
   **Quality Score**: [score]/100
   **Gate Decision**: [PASS/CONCERNS/FAIL/WAIVED]

   ### QA Report

   - **Full Report**: [story.[epic].[story].qa.[number].[descriptive-name].md](./story.[epic].[story].qa.[number].[descriptive-name].md)
   - **Gate File**: [story.[epic].[story].gate.[number].[descriptive-name].yml](./story.[epic].[story].gate.[number].[descriptive-name].yml)

   ### Test Coverage Summary

   - **Acceptance Criteria Tested**: [X/Y]
   - **Tests Executed**: [Count]
   - **Critical Issues**: [Count]
   - **NFR Status**: Security: [STATUS], Performance: [STATUS], Reliability: [STATUS], Maintainability: [STATUS]

   ### Key Findings

   [Brief summary of critical issues or concerns, or "No critical issues identified"]
   ```

   b. **QA Completion Summary** section (if testing is complete):

   ```markdown
   ## QA Completion Summary

   **Final QA Status**: ✅ Passed / ⚠️ Passed with Concerns / ❌ Failed
   **QA Engineer**: QA Engineer
   **Final Testing Date**: [Date]

   ### Test Results Summary

   - **All Acceptance Criteria Met**: Yes / No
   - **Bug Reports Created**: [Number]
   - **Bug Reports Closed**: [Number]
   - **Regression Tests**: Passed / Failed
   - **Performance**: Acceptable / Issues Found
   - **Ready for Deployment**: Yes / No / Conditional

   ### Final Notes

   [Summary of recommendations, deployment conditions, or follow-up items]
   ```

   c. **Update Story Status** based on gate decision:
   - PASS → **leave at `ready-for-review`** — QA passing is not acceptance
   - CONCERNS → **leave at `ready-for-review`** (with notes about concerns)
   - FAIL → `in-progress` (requires fixes; this is the QA loop's backward edge)
   - WAIVED → **leave at `ready-for-review`** (with waiver notes)

   > **`accepted` is `finalise`'s to write, and only after the DoD check.** A gate PASS says the
   > implementation is good; it does not say the Definition of Done is met, and on a repo where CI
   > is a DoD gate it does not even say the build is green. Writing a terminal status here would
   > announce acceptance before the check that can refuse it.
   >
   > ⚠️ **Do not write `Ready for Done` or `Reopened`.** Both are outside the canonical set in
   > [`document-status-lifecycle.md`](references/document-status-lifecycle.md), which admits only
   > `draft`, `planned`, `ready-for-development`, `in-progress`, `ready-for-review`, `accepted` and
   > `cancelled`. A consumer repo that lints its status vocabulary will go **red** on either — and
   > because `finalise` overwrites the value minutes later, the window is short enough that the
   > fault only surfaces when a commit lands inside it. Observed live in `tinker-city`: `docs-lint`
   > runs ungated on every PR there and failed on `ready-for-done` during a DoD verification.
   >
   > These are **story/task** statuses. **Bug-report** statuses are a separate lifecycle
   > (`New | In Progress | Ready for QA | Reopened | Closed`) and `Reopened` remains correct there.

   d. **Append the verdict row to `## Change Log`** — in the same edit as (a)–(c), bumping
   frontmatter `updated`:

   ```markdown
   | 2026-05-14 |  | QA gate CONCERNS (6/10) — 2 findings | qa-story |
   ```

   One row per QA cycle. `Version` stays blank — only `/finalise` bumps it. Name the decision, the
   score and the finding count; the detail lives in the QA report this row sits alongside. A clean
   cycle still writes a row. Canonical format:
   [document-change-log.md](references/document-change-log.md).

   **For Tasks - Update similar sections** in task file with QA assessment results (the Change Log
   row is written by `qa-task` in its Step 12, with `Author` = `qa-task`)

4. Recommend next action based on gate decision
5. If files were modified during refactoring, list them in QA report and ask Dev to update File List
6. **Post QA Summary to PR** — **CRITICAL / BLOCKING**: This step is mandatory. The review is NOT complete until the PR comment is confirmed posted. Do not skip, defer, or treat as optional.

   Use the PR metadata stored in Prerequisites.

   **Resolve the platform first.** Source the resolver with `source references/resolve-platform.sh || exit 1` — guarded, because that file also validates the platform and access keys and returns non-zero on an unrecognised value. It sets `VCS` (which this step branches on) and provides `tracker_call_with_retry` (3× exponential backoff: 1s, 2s, 4s). Transient GitHub API / Anthropic API errors are common on long QA runs; the helper retries transparently before reporting failure. On Bitbucket, derive the REST coordinates and resolve the credential — the same Step 0.5 preamble `create-pr` uses.

   The fences below start at column 0 deliberately: an indented terminator does not close a heredoc, and indented body lines would be written into the comment verbatim.

```bash
source references/resolve-platform.sh || exit 1
# VCS = github | bitbucket; TRACKER = jira | github

if [ "$VCS" = "bitbucket" ]; then
  # Two sed passes, not one lazy-quantified capture — `[^/]+?` is a GNU
  # extension that BSD sed rejects.
  BB_PATH=$(git remote get-url origin | sed -E 's|.*bitbucket\.org[:/]||; s|\.git$||')
  BB_WORKSPACE=$(echo "$BB_PATH" | cut -d'/' -f1)
  BB_REPO=$(echo "$BB_PATH" | cut -d'/' -f2)
  BB_API="https://api.bitbucket.org/2.0"
  # Sets BB_CURL_AUTH (curl args) and BB_AUTH_SCHEME; non-zero when neither an
  # access token (Bearer) nor username + API token (Basic) is set.
  source references/bitbucket-auth.sh || exit 1
fi
```

   **Write the body to a file, then post it.** Always `--body-file`, never an inline `--body`: the body below carries backticks, `$(…)` and newlines, and an inline string invites the shell to evaluate them before `gh` ever sees them. The file is also what the Bitbucket arm reads.

```bash
mkdir -p .claude/state
BODY_FILE=.claude/state/qa-comment-body.md
cat > "$BODY_FILE" <<'EOF'
## 🧪 QA Review: [GATE_DECISION]

**Gate Decision**: ✅/⚠️/❌ [PASS/CONCERNS/FAIL]
**Quality Score**: [score]/100
**Reviewer**: QA Engineer
**Date**: [date]
**PR**: #{PR_NUMBER} - {PR_TITLE}
**PR State**: {PR_STATE}

---

### 📋 QA Artifacts

- **QA Report**: [story.[epic].[story].qa.[number].[descriptive-name].md](path/to/report.md)
- **Gate File**: [story.[epic].[story].gate.[number].[descriptive-name].yml](path/to/gate.yml)

### ✅ Summary

- **Tests Executed**: [Count]
- **AC Coverage**: [X/Y covered]
- **NFR Status**: Security: [PASS/CONCERNS/FAIL], Performance: [PASS/CONCERNS/FAIL], Reliability: [PASS/CONCERNS/FAIL], Maintainability: [PASS/CONCERNS/FAIL]
- **Critical Issues**: [count]
- **Coverage Gaps**: [count]
- **Code Review** (Phase 1.6): [B] bug(s), [C] cleanup(s) — [advisory, or '[N] promoted to gate (code_review_blocking)']

### 🔎 Code Review Findings

[Top correctness bugs + notable cleanups from Phase 1.6, each `file:line — finding`. "None identified" if empty. Advisory unless the story opted in via code_review_blocking.]

### 🎯 Critical Issues

[List critical issues if any, or "None identified"]

### 🚀 Deployment Recommendation

**Status**: ✅/⚠️/❌ [APPROVED/APPROVED WITH CONCERNS/BLOCKED]

**Conditions**: [Any conditions for deployment]

### 📝 Next Steps

1. [Step 1]
2. [Step 2]

---
EOF

# The plain-language lead, obtained ONCE and folded into $BODY_FILE — ABOVE the
# arm split below, so the GitHub and Bitbucket arms post the same bytes and
# cannot drift. `qa-gate` is the same stage the tracker comment for this moment
# uses; a pull-request comment about a moment that also exists on the tracker
# reuses that stage rather than inventing a second vocabulary.
#
# GATE_DECISION is bound HERE, deliberately. The heredoc above is quoted
# (`<<'EOF'`), so its [GATE_DECISION] placeholder is filled in textually when
# the body is written — it never becomes a shell variable. Set this to the same
# verdict you wrote into the body: PASS, CONCERNS, FAIL or WAIVED.
GATE_DECISION="{PASS|CONCERNS|FAIL|WAIVED — the same verdict written into the body above}"

# The verdict is MAPPED, never passed through: `CONCERNS` tells an outside reader
# nothing about whether to worry. Pass the raw token and let the catalogue map
# it — an unknown verdict renders "the results are recorded below" rather than
# defaulting to reassurance.
LEAD=$(node references/stakeholder-summary-cli.js --stage qa-gate \
  --slot verdict="$GATE_DECISION") || exit 1
printf '%s\n\n---\n\n%s\n' "$LEAD" "$(cat "$BODY_FILE")" > "${BODY_FILE}.tmp" \
  && mv "${BODY_FILE}.tmp" "$BODY_FILE"

if [ "$VCS" = "github" ]; then
  tracker_call_with_retry gh pr comment "$PR_URL" --body-file "$BODY_FILE"
  COMMENT_RC=$?
elif [ "$VCS" = "bitbucket" ]; then
  BB_COMMENT_PAYLOAD=$(jq -n --arg raw "$(cat "$BODY_FILE")" '{content: {raw: $raw}}')
  curl -sf -X POST \
    "${BB_CURL_AUTH[@]}" \
    -H "Content-Type: application/json" \
    "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests/${PR_NUMBER}/comments" \
    -d "$BB_COMMENT_PAYLOAD" >/dev/null
  COMMENT_RC=$?
fi

if [ "$COMMENT_RC" -ne 0 ]; then
  echo "⚠️ PR comment failed — non-blocking. Final canonical summary will be posted by /finalise."
fi
```

   **The two arms are not symmetric on retry, deliberately.** `tracker_call_with_retry` wraps `gh` only, so the GitHub arm retries 3× with exponential backoff and the **Bitbucket arm is single-shot** — the same asymmetry `qa-fix` ships and states. A `bitbucket_call_with_retry` helper would close the gap across every Bitbucket call site in the repo and is worth its own task — do not smuggle one in here.

   **This comment is per-cycle and deliberately not idempotent.** Each QA cycle posts its own decision, so the PR carries the history. Do **not** import `finalise`'s marker/update logic: `finalise` owns the single canonical summary at pipeline end, and this step owns the running commentary. Only the Bitbucket *transport* is borrowed from it.

   **Verify the comment was posted**: Confirm `COMMENT_RC` is 0. On GitHub the helper retries 3× on transient failure (5xx, rate limit, Anthropic API blip); on Bitbucket there is one attempt. If it still fails, report the error to the user and provide the comment body (`.claude/state/qa-comment-body.md`) for manual posting. Do NOT proceed to step 6b until the comment is confirmed posted.

6b. **Comment on Tracker Issue (graceful — non-blocking)**

Branch on the tracker resolved by `source references/resolve-platform.sh || exit 1` (which sets `TRACKER=github|jira`). Keep the `|| exit 1` — the resolver returns non-zero on an unrecognised `tracker:`, `vcs:` or `access:` value, and sourcing it bare would continue past the rejection with a default.

**One call, both trackers.** `tracker-comment.js` resolves `TRACKER` itself, so the issue identifier
is the only thing that differs between the two arms. Resolve it, then make the single call:

```bash
# The issue identifier — whichever tracker this project uses.
if [ "$TRACKER" = "jira" ]; then
  QA_ISSUE=$(grep -E '^jira_key:' "$STORY_FILE" | head -1 | sed -E 's/jira_key:[[:space:]]*//' | tr -d '"'"'"' ')
  [ "$QA_ISSUE" = "null" ] && QA_ISSUE=""
else
  QA_ISSUE="$GITHUB_ISSUE_QA"
fi
```

If `QA_ISSUE` is empty, skip this step silently — the story has no linked tracker issue.

```bash
if [ -n "$QA_ISSUE" ]; then
  mkdir -p .claude/state
  printf 'QA %s (%s/100) — PR #%s: %s\n' \
    "$GATE_DECISION" "$score" "$PR_NUMBER" "$PR_URL" > .claude/state/comment-body.md

  # blocking_count — the high-severity entries in the gate this run just wrote.
  # Derived here, at the call, rather than carried from earlier: the gate file is
  # the authority on what blocks, and it is complete by this point.
  #
  # Re-resolve the gate path rather than reusing LATEST_GATE from Phase 0 — that
  # one names the PREVIOUS run's gate (it is read to decide whether to re-review),
  # and this run has written a newer one since.
  THIS_GATE=$(ls -t "$STORY_DIR"/story.*.gate.*.yml 2>/dev/null | head -1)
  # `|| true`, NOT `|| echo 0`. `grep -c` PRINTS "0" and EXITS 1 when it matches
  # nothing, so `|| echo 0` appends a second zero and the variable becomes the
  # two-line string "0\n0" — which the engine's numeric coercion then reads as
  # NaN and drops. The slot would vanish on exactly the clean gates where saying
  # "no blocking issues" matters most, and nothing would report it.
  BLOCKING_COUNT=$(grep -c '^ *severity: high' "$THIS_GATE" 2>/dev/null || true)
  BLOCKING_COUNT=${BLOCKING_COUNT:-0}

  node .agents/skills/qa-story/references/tracker-comment.js \
    --issue "$QA_ISSUE" --body-file .claude/state/comment-body.md \
    --stage qa-gate \
    --slot verdict="$GATE_DECISION" \
    --slot blocking_count="$BLOCKING_COUNT" \
    --json \
    || echo "⚠️  Tracker issue comment failed — continuing"
fi
```

> **This replaced a bare `gh issue comment` on the GitHub arm.** That call carried no idempotency
> marker, so a resumed QA cycle posted a second copy; it was `gh`-only, so a Jira consumer got the Jira
> arm's comment and GitHub consumers got an unmarked one; and after task.104 it would have been one of
> the last tracker comments in the pipeline with no plain-language lead. Collapsing the two arms is
> what makes the same QA outcome read the same way on either tracker.
>
> **It also gave up the `tracker_call_with_retry` 3× backoff.** The engine owns the `ACCESS_TRACKER`
> deferral gate but has no retry of its own, and re-wrapping it would double-defer — so the retry is
> genuinely given up, and the `|| echo … continuing` above is what stands in its place. That matches
> `review-task`, the reference implementation for a converted site.
>
> **The two slots `qa-gate` reads are `verdict` and `blocking_count` — not `pr`.** `pr` is a real slot
> name on `in-review` and `done`, which is exactly what makes it look right here; the `qa-gate`
> template never reads it, and the engine validates no slot names, so passing it would be silently
> dropped. The PR stays in the body, where it already is.
>
> **`verdict` is passed as the raw gate token, and that is correct here** — it is the one slot the
> engine *maps* rather than prints, turning `PASS`/`CONCERNS`/`FAIL`/`WAIVED` into a plain sentence.
> The score deliberately does **not** reach the lead: a number on an unexplained scale is precisely
> what the standard forbids. It stays in the body.

> Engine source: `references/tracker-comment.js` (bundled into each skill as `references/tracker-comment.js`). Contract: `references/tracker-comment-contract.md`.


Read `reason` and act per [`references/tracker-comment-contract.md`](references/tracker-comment-contract.md) — only `no-credentials` may fall back to the Atlassian MCP tool.
3.  On success: log `📨 QA summary posted to Jira issue ${JIRA_KEY}`.
4.  On failure: log `⚠️ Jira comment failed for ${JIRA_KEY} — PR comment was posted successfully. Continuing.` (non-blocking — do not halt qa-story).

If `jira_key` is absent or null, skip silently. Failure does NOT halt the skill. Cross-reference: `qa-fix` and `finalise` post through the same `tracker-comment.js` call.

7. **Communicate to user** — **CRITICAL / BLOCKING**: Provide constructive feedback and actionable recommendations. This step is required — do not end the skill silently. Always output:
   - Gate decision and quality score
   - Top issues summary
   - Explicit next steps for the developer

**Review Completion Checklist — tick off each before marking the review done:**

- [ ] QA report file created and saved (co-located with story/task)
- [ ] Gate YAML file created and saved (co-located with story/task)
- [ ] Story/task `## QA Testing Results` section updated with gate status, quality score, and links to artifacts
- [ ] Story/task status correct per gate decision — `ready-for-review` on PASS/CONCERNS/WAIVED, `in-progress` on FAIL. Never `Ready for Done`, never `Reopened`, never `accepted` (that is `finalise`'s)
- [ ] `## Change Log` row appended recording the gate verdict (blank `Version`, `Author` = `qa-story` / `qa-task`), with frontmatter `updated` bumped in the same edit
- [ ] Bug report files created for all HIGH and MEDIUM severity issues (if any)
- [ ] Story Bug Reports section updated with current bug statuses (if any)
- [ ] PR comment posted via the `$VCS` arm (step 6 — BLOCKING): on GitHub, `tracker_call_with_retry gh pr comment "$PR_URL" --body-file` — confirm exit code 0 after up to 3 attempts; on Bitbucket, the single-shot REST POST to `…/pullrequests/${PR_NUMBER}/comments` — confirm exit code 0 (no retry)
- [ ] Tracker Issue comment posted (step 6b — graceful): `tracker-comment.js` invoked and its `reason` read (skipped if `github_issue` / `jira_key` absent or null); non-blocking on persistent failure
- [ ] Next steps communicated to user (step 7 — BLOCKING): gate decision + issues + next steps output

**File Creation Locations (Updated 2025-12-09):**

- **QA Report**: Same directory as story/task file (co-located)
- **Gate File**: Same directory as story/task file (co-located)
- **Story/Task Reference**: Add `## QA Report` section with link to QA report file

**Co-location Benefits**:

- Single source of truth - all related documentation in one place
- Easier discovery - no need to search multiple directories
- Better context - story/task, implementation, QA report, and gate all together
- Version control - changes tracked together in git history

---

## Bug Report Creation (Unhappy Path)

When issues are found during story review, create bug reports following the documented workflow.

### QA Testing Outcome Paths

**Happy Path (No Issues Found)**:

1. QA tests all acceptance criteria
2. All ACs pass, no bugs found
3. QA adds completion notes to story file's QA Handoff Notes section
4. Update story status to "Done"
5. **NO bug report files created** (only QA report with PASS status)

**Unhappy Path (Issues Found)**:

1. QA creates QA report: `story.[epic].[story].qa.[number].[descriptive-name].md`
2. QA creates bug report files for each HIGH/MEDIUM severity issue
3. QA updates story status to "Reopened"
4. Iterative fix cycle begins (detailed below)

### When to Create Bug Reports

**Create Individual Bug Reports For:**

- Each distinct **HIGH severity** issue found
- Each distinct **MEDIUM severity** issue found
- Issues that require developer investigation and fixes

**Document in QA Report Only (No Separate Bug File):**

- **LOW severity** issues (minor cosmetic issues, typos)
- Suggestions for future improvements
- General recommendations

### Bug Report Creation Workflow

#### Step 1: Determine Bug Reports Needed

Review all issues found and categorize by severity:

- **HIGH** → Always create bug report
- **MEDIUM** → Always create bug report
- **LOW** → Document in QA report only

#### Step 2: Sequential Bug Numbering

Use sequential numbering within each story:

**Format**: `story.[epic].[story].bug.[bug-number].[descriptive-name].md`

**Examples**:

- First bug: `story.8.5.3.bug.1.cache-cleanup-memory-leak.md`
- Second bug: `story.8.5.3.bug.2.offline-mode-regression.md`
- Third bug: `story.8.5.3.bug.3.performance-degradation.md`

**Numbering Rules**:

- Start at 1 for each story
- Increment sequentially (1, 2, 3, ...)
- Never reuse numbers even if bugs are closed

#### Step 3: Create Bug Report Files

**Template Location**: `docs/templates/bug-report-template.md`

**File Location**: Co-locate with story file (same directory)

**Required Bug Report Sections**:

```markdown
**Bug ID**: story.[epic].[story].bug.[bug-number].[description]
**Related Story**: [[Story [Epic].N] [Story Name]](./story.[epic].[story].[name].md)
**Status**: 🆕 New
**Priority**: Critical | High | Medium | Low
**Severity**: Blocker | Major | Minor | Trivial
**Created**: YYYY-MM-DD
**Assigned To**: [Developer Name]
**QA Engineer**: [QA Engineer Name]

## Bug Description

**Summary**: [1-2 sentence description]

**Expected Behavior**: [What should happen]

**Actual Behavior**: [What actually happens]

**Impact**: [How this affects users/system/business]

## Reproduction Steps

**Environment**: [OS, browser, device, etc.]

**Steps to Reproduce**:

1. [Step 1]
2. [Step 2]
3. [Step 3]

**Frequency**: Always | Sometimes | Rarely
**Reproducible**: Yes | No | Intermittent

## Evidence

**Screenshots/Videos**: [Link or embed]

**Logs and Stack Traces**:
```

[Paste relevant logs]

```

**Related Files**: [List files involved]

## Acceptance Criteria Violation

**AC Reference**: AC[N] - [AC description]

**How AC Failed**: [Specific explanation]

## Developer Fix Cycle

[Leave empty - Developer will fill in during fix process]

### Iteration 1

#### Investigation (New → In Progress)
**Date**: [Date]
**Developer**: [Name]

[Investigation notes, root cause analysis]

#### Fix Implementation (In Progress → Ready for QA)
**Date**: [Date]

**Root Cause**: [Explanation]

**Fix Description**: [What was changed]

**Files Modified**:
- [file1.ts]
- [file2.ts]

**Testing**: [How the fix was tested]

#### QA Verification (Ready for QA → Closed/Reopened)
**Date**: [Date]
**QA Engineer**: [Name]

**Verification Result**: ✅ Fixed | ⚠️ Still Failing

**Notes**: [Testing notes]

**Decision**: Closed | Reopened

### Status History

| Date | Status | Changed By | Notes |
|------|--------|------------|-------|
| [Date] | New | [QA Name] | Bug created |
| [Date] | In Progress | [Dev Name] | Investigation started |
```

#### Step 4: Update Story File

**Add Bug Report Links in Story File**:

If `## Bug Reports` section doesn't exist, add it. Then link all bug reports:

```markdown
## Bug Reports

### Open Bugs

- [Bug 8.5.3.1: Cache cleanup memory leak](story.8.5.3.bug.1.cache-cleanup-memory-leak.md) - 🆕 New - Priority: High
- [Bug 8.5.3.2: Offline mode regression](story.8.5.3.bug.2.offline-mode-regression.md) - 🆕 New - Priority: Medium

### Closed Bugs

[Will be moved here when bugs are closed]
```

#### Step 5: Update Story Status

**Status Transition**: "Ready for QA" → "Reopened"

**Update Story Metadata**:

```markdown
**Status**: ⚠️ Reopened
**Last Updated**: YYYY-MM-DD
```

### Bug Fix Iteration Cycle

After bug reports are created, the iterative fix cycle begins:

**Developer Fix Process**:

1. **Investigation** (New → In Progress)
   - Developer reads bug report
   - Investigates root cause
   - Documents findings in bug report's "Developer Fix Cycle" section

2. **Fix Implementation** (In Progress → Ready for QA)
   - Developer implements fix
   - Adds fix description, modified files, testing notes
   - Changes bug status to "Ready for QA"

3. **QA Verification** (Ready for QA → Closed/Reopened)
   - QA retests the specific bug
   - If fixed → Status: "Closed"
   - If still failing → Status: "Reopened", add new iteration section

4. **Iteration** (if Reopened)
   - Start new "Iteration 2" section in bug report
   - Repeat investigation → fix → verification cycle
   - Continue until bug is closed

5. **Final Story Re-test**
   - Once all bugs closed, QA performs full story re-test
   - If all ACs pass → Move story to "Done"
   - If new issues found → Create new bug reports, continue cycle

### Bug Report Best Practices

**Clear Descriptions**:

- Be specific about what's broken
- Include exact steps to reproduce
- Provide evidence (screenshots, logs)
- Reference which AC failed

**Severity Classification**:

- **Blocker**: Prevents testing, blocks deployment
- **Major**: Core functionality broken, workaround exists
- **Minor**: Cosmetic issue, low impact
- **Trivial**: Typo, formatting issue

**Priority Assignment**:

- **Critical**: Must fix before deployment
- **High**: Fix in current sprint
- **Medium**: Fix in next sprint
- **Low**: Fix when time permits

**Status Tracking**:

- Always update status history table
- Document all status transitions
- Include who made the change and when

### Integration with Gate Files

Bug reports influence gate decisions:

**Gate Status Impact**:

- **Any HIGH severity bugs** → Gate = FAIL
- **Multiple MEDIUM severity bugs** → Gate = CONCERNS
- **Only LOW severity issues** → Gate = PASS (with notes)

**Gate File Reference**:

Include bug count in gate file:

```yaml
top_issues:
  - issue: "Cache cleanup memory leak"
    severity: high
    file: "libs/cache/src/cleanup.ts"
    bug_ref: "story.8.5.3.bug.1.cache-cleanup-memory-leak.md"
    suggested_owner: dev
```

### Blocking Conditions

Stop the review and request clarification if:

- Story file is incomplete or missing critical sections
- File List is empty or clearly incomplete
- No tests exist when they were required
- Code changes don't align with story requirements
- Critical architectural issues that require discussion

---

## NFR Assessment

Quick NFR validation focused on the core four: security, performance, reliability, maintainability.

### Purpose

Assess non-functional requirements for a story and generate:

1. YAML block for the gate file's `nfr_validation` section
2. Brief markdown assessment saved to `{qa.qaLocation}/assessments/{epic}.{story}-nfr-{YYYYMMDD}.md`

### Fail-safe for Missing Inputs

If story_path or story file can't be found:

- Still create assessment file with note: "Source story not found"
- Set all selected NFRs to CONCERNS with notes: "Target unknown / evidence missing"
- Continue with assessment to provide value

### NFR Assessment Process

#### Step 1: Elicit Scope

**Interactive Elicitation** (when scope is unclear):

Use AskUserQuestion to ask which NFRs to assess:

- Security (default)
- Performance (default)
- Reliability (default)
- Maintainability (default)
- Usability
- Compatibility
- Portability
- Functional Suitability

**Non-interactive mode**: Default to core four (security, performance, reliability, maintainability)

#### Step 2: Check for Thresholds

Look for NFR requirements in:

- Story acceptance criteria
- `docs/architecture/*.md` files
- `docs/technical-preferences.md`

**Interactive Elicitation** (when thresholds missing):

Use AskUserQuestion for missing thresholds:

- What's your target response time? (e.g., 200ms for API calls)
- Required auth method? (e.g., JWT with refresh tokens)
- Test coverage target? (e.g., 80%)
- Security requirements? (e.g., rate limiting, encryption)

**Unknown targets policy**: If a target is missing and not provided, mark status as CONCERNS with notes: "Target unknown"

#### Step 3: Quick Assessment

For each selected NFR, check:

- Is there evidence it's implemented?
- Can we validate it?
- Are there obvious gaps?

### NFR Assessment Criteria

#### Security

**PASS if:**

- Authentication implemented
- Authorization enforced
- Input validation present
- No hardcoded secrets

**CONCERNS if:**

- Missing rate limiting
- Weak encryption
- Incomplete authorization

**FAIL if:**

- No authentication
- Hardcoded credentials
- SQL injection vulnerabilities

#### Performance

**PASS if:**

- Meets response time targets
- No obvious bottlenecks
- Reasonable resource usage

**CONCERNS if:**

- Close to limits
- Missing indexes
- No caching strategy

**FAIL if:**

- Exceeds response time limits
- Memory leaks
- Unoptimized queries

#### Reliability

**PASS if:**

- Error handling present
- Graceful degradation
- Retry logic where needed

**CONCERNS if:**

- Some error cases unhandled
- No circuit breakers
- Missing health checks

**FAIL if:**

- No error handling
- Crashes on errors
- No recovery mechanisms

#### Maintainability

**PASS if:**

- Test coverage meets target
- Code well-structured
- Documentation present

**CONCERNS if:**

- Test coverage below target
- Some code duplication
- Missing documentation

**FAIL if:**

- No tests
- Highly coupled code
- No documentation

### NFR Assessment Outputs

#### Output 1: Gate YAML Block

Generate ONLY for NFRs actually assessed (no placeholders):

```yaml
# Gate YAML (copy/paste):
nfr_validation:
  _assessed: [security, performance, reliability, maintainability]
  security:
    status: CONCERNS
    evidence: reasoned # measured|reasoned|unverified — below status:, always
    notes: "No rate limiting on auth endpoints"
  performance:
    status: PASS
    notes: "Response times < 200ms verified"
  reliability:
    status: PASS
    notes: "Error handling and retries implemented"
  maintainability:
    status: CONCERNS
    notes: "Test coverage at 65%, target is 80%"
```

#### Deterministic Status Rules

- **FAIL**: Any selected NFR has critical gap or target clearly not met
- **CONCERNS**: No FAILs, but any NFR is unknown/partial/missing evidence
- **PASS**: All selected NFRs meet targets with evidence

#### Quality Score Calculation

```
quality_score = 100
- 20 for each FAIL attribute
- 10 for each CONCERNS attribute
Floor at 0, ceiling at 100
```

If `technical-preferences.md` defines custom weights, use those instead.

#### Output 2: Brief Assessment Report

**ALWAYS save to:** `{qa.qaLocation}/assessments/{epic}.{story}-nfr-{YYYYMMDD}.md`

```markdown
# NFR Assessment: {epic}.{story}

Date: {date}
Reviewer: QA Engineer

<!-- Note: Source story not found (if applicable) -->

## Summary

- Security: CONCERNS - Missing rate limiting
- Performance: PASS - Meets <200ms requirement
- Reliability: PASS - Proper error handling
- Maintainability: CONCERNS - Test coverage below target

## Critical Issues

1. **No rate limiting** (Security)
   - Risk: Brute force attacks possible
   - Fix: Add rate limiting middleware to auth endpoints

2. **Test coverage 65%** (Maintainability)
   - Risk: Untested code paths
   - Fix: Add tests for uncovered branches

## Quick Wins

- Add rate limiting: ~2 hours
- Increase test coverage: ~4 hours
- Add performance monitoring: ~1 hour
```

#### Output 3: Story Hook Line

**Print this line for integration into QA report:**

```
NFR assessment: {qa.qaLocation}/assessments/{epic}.{story}-nfr-{YYYYMMDD}.md
```

#### Output 4: Gate Integration Line

**Always print at the end:**

```
Gate NFR block ready → paste into {qa.qaLocation}/gates/{epic}.{story}-{slug}.yml under nfr_validation
```

### NFR Quick Reference

**What to Check:**

```yaml
security:
  - Authentication mechanism
  - Authorization checks
  - Input validation
  - Secret management
  - Rate limiting

performance:
  - Response times
  - Database queries
  - Caching usage
  - Resource consumption

reliability:
  - Error handling
  - Retry logic
  - Circuit breakers
  - Health checks
  - Logging

maintainability:
  - Test coverage
  - Code structure
  - Documentation
  - Dependencies
```

---

## Requirements Traceability

Map story requirements to test cases using Given-When-Then patterns for comprehensive traceability.

### Purpose

Create a requirements traceability matrix that ensures every acceptance criterion has corresponding test coverage. This helps identify gaps in testing and ensures all requirements are validated.

**IMPORTANT**: Given-When-Then is used here for documenting the mapping between requirements and tests, NOT for writing the actual test code. Tests should follow your project's testing standards (no BDD syntax in test code).

### Traceability Process

**Caller-supplied matrix short-circuit**: If `traceability_matrix=<path>` was provided in Skill `args` and the file exists, read the matrix table from `<path>` and proceed directly to **Traceability Outputs** — skip Steps 1–4 below. The Explore subagent already performed AC extraction and grep mapping. Use the matrix rows as-is for coverage assessment and gap identification in the QA report and gate file.

If no matrix was supplied or the file is unreadable, run Steps 1–4 as normal.

#### Step 1: Extract Requirements

Identify all testable requirements from:

- Acceptance Criteria (primary source)
- User story statement
- Tasks/subtasks with specific behaviors
- Non-functional requirements mentioned
- Edge cases documented

#### Step 2: Map to Test Cases

For each requirement, document which tests validate it. Use Given-When-Then to describe what the test validates (not how it's written):

```yaml
requirement: "AC1: User can login with valid credentials"
test_mappings:
  - test_file: "auth/login.test.ts"
    test_case: "should successfully login with valid email and password"
    # Given-When-Then describes WHAT the test validates, not HOW it's coded
    given: "A registered user with valid credentials"
    when: "They submit the login form"
    then: "They are redirected to dashboard and session is created"
    coverage: full

  - test_file: "e2e/auth-flow.test.ts"
    test_case: "complete login flow"
    given: "User on login page"
    when: "Entering valid credentials and submitting"
    then: "Dashboard loads with user data"
    coverage: integration
```

#### Step 3: Coverage Analysis

Evaluate coverage for each requirement:

**Coverage Levels:**

- `full`: Requirement completely tested
- `partial`: Some aspects tested, gaps exist
- `none`: No test coverage found
- `integration`: Covered in integration/e2e tests only
- `unit`: Covered in unit tests only

#### Step 4: Gap Identification

Document any gaps found:

```yaml
coverage_gaps:
  - requirement: "AC3: Password reset email sent within 60 seconds"
    gap: "No test for email delivery timing"
    severity: medium
    suggested_test:
      type: integration
      description: "Test email service SLA compliance"

  - requirement: "AC5: Support 1000 concurrent users"
    gap: "No load testing implemented"
    severity: high
    suggested_test:
      type: performance
      description: "Load test with 1000 concurrent connections"
```

### Traceability Outputs

#### Output 1: Gate YAML Block

**Generate for pasting into gate file under `trace`:**

```yaml
trace:
  totals:
    requirements: 5
    full: 3
    partial: 1
    none: 1
  planning_ref: "{qa.qaLocation}/assessments/{epic}.{story}-test-design-{YYYYMMDD}.md"
  uncovered:
    - ac: "AC3"
      reason: "No test found for password reset timing"
  notes: "See {qa.qaLocation}/assessments/{epic}.{story}-trace-{YYYYMMDD}.md"
```

#### Output 2: Traceability Report

**Save to:** `{qa.qaLocation}/assessments/{epic}.{story}-trace-{YYYYMMDD}.md`

```markdown
# Requirements Traceability Matrix

## Story: {epic}.{story} - {title}

### Coverage Summary

- Total Requirements: 5
- Fully Covered: 3 (60%)
- Partially Covered: 1 (20%)
- Not Covered: 1 (20%)

### Requirement Mappings

#### AC1: User can login with valid credentials

**Coverage: FULL**

Given-When-Then Mappings:

- **Unit Test**: `auth.service.test.ts::validateCredentials`
  - Given: Valid user credentials
  - When: Validation method called
  - Then: Returns true with user object

- **Integration Test**: `auth.integration.test.ts::loginFlow`
  - Given: User with valid account
  - When: Login API called
  - Then: JWT token returned and session created

#### AC2: Invalid credentials return error

**Coverage: PARTIAL**

[Continue for all ACs...]

### Critical Gaps

1. **Performance Requirements**
   - Gap: No load testing for concurrent users
   - Risk: High - Could fail under production load
   - Action: Implement load tests using k6 or similar

2. **Security Requirements**
   - Gap: Rate limiting not tested
   - Risk: Medium - Potential DoS vulnerability
   - Action: Add rate limit tests to integration suite

### Test Design Recommendations

Based on gaps identified, recommend:

1. Additional test scenarios needed
2. Test types to implement (unit/integration/e2e/performance)
3. Test data requirements
4. Mock/stub strategies

### Risk Assessment

- **High Risk**: Requirements with no coverage
- **Medium Risk**: Requirements with only partial coverage
- **Low Risk**: Requirements with full unit + integration coverage
```

#### Output 3: Story Hook Line

**Print this line for integration:**

```text
Trace matrix: {qa.qaLocation}/assessments/{epic}.{story}-trace-{YYYYMMDD}.md
```

### Traceability Best Practices

#### Given-When-Then for Mapping (Not Test Code)

Use Given-When-Then to document what each test validates:

**Given**: The initial context the test sets up

- What state/data the test prepares
- User context being simulated
- System preconditions

**When**: The action the test performs

- What the test executes
- API calls or user actions tested
- Events triggered

**Then**: What the test asserts

- Expected outcomes verified
- State changes checked
- Values validated

**Note**: This is for documentation only. Actual test code follows your project's standards (e.g., describe/it blocks, no BDD syntax).

#### Coverage Priority

Prioritize coverage based on:

1. Critical business flows
2. Security-related requirements
3. Data integrity requirements
4. User-facing features
5. Performance SLAs

#### Test Granularity

Map at appropriate levels:

- Unit tests for business logic
- Integration tests for component interaction
- E2E tests for user journeys
- Performance tests for NFRs

### Traceability Quality Indicators

Good traceability shows:

- Every AC has at least one test
- Critical paths have multiple test levels
- Edge cases are explicitly covered
- NFRs have appropriate test types
- Clear Given-When-Then for each test

### Red Flags

Watch for:

- ACs with no test coverage
- Tests that don't map to requirements
- Vague test descriptions
- Missing edge case coverage
- NFRs without specific tests

### Integration with Gates

This traceability feeds into quality gates:

- Critical gaps → FAIL
- Minor gaps → CONCERNS
- Missing P0 tests from test-design → CONCERNS
- Full coverage → PASS contribution

---

## Integration with QA Workflow

### Workflow Sequence

1. **Planning** (qa-planning skill)
   - Risk profiling
   - Test design

2. **Review** (this skill)
   - Story review process
   - NFR assessment
   - Requirements traceability
   - Code refactoring

3. **Gate Decision** (qa-gate skill)
   - Formalize PASS/CONCERNS/FAIL/WAIVED
   - Create gate file with all assessment data

### Cross-Skill References

**From this skill to qa-planning**:

- "Reference risk profile from qa-planning skill"
- "Use test design matrix from qa-planning skill"
- "Validate risk mitigations identified in qa-planning"

**From this skill to qa-gate**:

- "See qa-gate skill for formalizing quality gate decisions"
- "Use qa-gate skill to create gate files from assessment data"

---

## Configuration and File Locations

### Expected Configuration

**Resolve paths first.** Source `references/resolve-paths.sh` to populate `${PRD_ROOT}` (default `docs/prd`) — the PRD root is configurable. The nested structure under it (and QA artifact co-location) is fixed (see [docs/reference/configuration.md](../../docs/reference/configuration.md#configurable-roots-and-fixed-conventions)):

- Stories: nested at `${PRD_ROOT}/{domain}/{feature}/epics/epic.{N}.{name}/stories/story.{E}.{S}.{name}/`
- QA artifacts (review report, NFR, traceability, gate, DoD): co-located with the story file. No `qa.qaLocation` key.

### File Naming Conventions (Updated 2025-12-09)

**QA Reports**:

- Stories: `story.[epic].[story].qa.[descriptive-name].md` (co-located with story)
- Tasks: `task.[number].qa.[descriptive-name].md` (co-located with task)

**Gate Files**:

- Stories: `story.[epic].[story].gate.[descriptive-name].yml` (co-located with story)
- Tasks: `task.[number].gate.[descriptive-name].yml` (co-located with task)

**NFR Assessments**: `{qa.qaLocation}/assessments/{epic}.{story}-nfr-{YYYYMMDD}.md` (legacy, deprecated)
**Trace Reports**: `{qa.qaLocation}/assessments/{epic}.{story}-trace-{YYYYMMDD}.md` (legacy, deprecated)

**Note**: NFR and Trace assessments should now be included within the main QA report (co-located), not as separate files.

### Directory Structure (Updated 2025-12-09)

**NEW STRUCTURE** (Co-located):

```
docs/
├── prd/
│   └── [domain]/
│       └── [feature]/
│           ├── story.1.1.epic-name.md
│           ├── story.1.1.qa.epic-name.md    # Co-located QA report
│           └── story.1.1.gate.epic-name.yml # Co-located gate file
└── development/
    └── tasks/
        └── task.44.name/
            ├── task.44.name.md
            ├── task.44.qa.name.md          # Co-located QA report
            └── task.44.gate.name.yml       # Co-located gate file
```

**LEGACY STRUCTURE** (Deprecated):

```
docs/
└── qa/
    ├── assessments/       # Deprecated - use co-located QA reports
    │   ├── 1.1-nfr-20250130.md
    │   └── 1.1-trace-20250130.md
    └── gates/             # Deprecated - use co-located gate files
        └── [mirrored PRD structure]/
            └── story.1.1.gate.epic-name.yml
```

---

## Key Principles

1. **Adaptive Review Strategy**: Choose review method based on story characteristics - direct tools for small/well-documented stories, parallel agents for complex/high-risk scenarios. Ensures efficiency without sacrificing thoroughness.
2. **Single Pass Completion**: Complete ALL quality checks in one pass without waiting for user input between checks. Aligns with project's "single pass" directive while maintaining comprehensive assessment.
3. **Comprehensive Review**: Test architecture, code quality, NFRs, traceability in one process, leveraging automated findings (whether from direct tools or agents)
4. **Risk-Aware**: Depth of review scales with risk signals - more thorough for auth/payment/security, lighter for well-tested features
5. **Actionable Feedback**: Concrete recommendations with clear ownership, synthesized from all quality checks
6. **Refactor When Safe**: Improve code quality during review (with tests)
7. **Document Results in Story/Task File**: Update QA Testing Results and QA Completion Summary sections with gate decision, quality score, key findings, and deployment readiness — and append one `## Change Log` row recording the verdict, so the document's own history shows the QA cycle and not just its outcome
8. **Given-When-Then for Mapping**: Document test coverage, not test code
9. **Interactive When Needed**: Use AskUserQuestion for unclear scope or thresholds
10. **Integrated Outputs**: All assessments (direct tools + agents when used) feed into unified gate decision
11. **Update Status Based on Gate**: Set story/task status according to gate decision (PASS/CONCERNS/WAIVED → leave at `ready-for-review`; FAIL → `in-progress`). `accepted` is `finalise`'s to write, and only after the DoD check
12. **Re-Review When Concerns Exist**: ALWAYS check for existing gate files. Only skip re-review if gate is PASS with NO top_issues. Re-review when gate has CONCERNS/FAIL or any top_issues listed, to verify fixes were implemented.
