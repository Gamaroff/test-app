---
name: review-task
description: Interactive task document review that asks clarifying questions instead of making assumptions. Identifies inaccuracies, gaps, inconsistencies, and implementability issues. Provides user-aligned recommendations based on collaborative input.
invokes: [create-branch, ensure-task-github-issue, ensure-task-jira-issue, mermaid-architect, sync-jira-task]
---

> **Status lifecycle**: see [`references/document-status-lifecycle.md`](references/document-status-lifecycle.md)

# Review Task

## When to Use This Skill

Use this skill when:

- Reviewing an existing task document for quality and completeness
- Identifying gaps or missing technical details in implementation plans
- Checking task accuracy against architecture documentation
- Finding inconsistencies in technical specifications or implementation phases
- Ensuring task is ready for developer handoff
- Conducting peer reviews of task documents
- Investigating why a task implementation went off-track

Natural language triggers:

- "Review task 50"
- "Check the task document for issues"
- "What's wrong with this task?"
- "Review task.50.expired-otp-auto-regeneration"
- "Is this task ready for implementation?"

## Purpose

To conduct a comprehensive, **interactive** review of an existing task document, identifying:

- **Inaccuracies**: Incorrect technical details, misaligned with architecture
- **Gaps**: Missing implementation details, incomplete phases, undefined requirements
- **Inconsistencies**: Conflicting information within the task or with related documents
- **Implementation Issues**: Unclear steps, missing files, ambiguous changes
- **Hallucinations**: Invented technical details not supported by source documents

**CRITICAL - Interactive Review Approach**:

Instead of making assumptions or creative decisions, this skill **asks clarifying questions** when encountering:

- Ambiguous implementation steps or technical approaches
- Missing information that could be filled different ways
- Conflicts between task and architecture/project standards
- Unclear intent or requirements
- Technical decisions that need user input
- Trade-offs between different approaches

The review produces **user-validated recommendations** through:

1. **Issue Detection** - Identify problems with specific locations
2. **Clarifying Questions** - Ask user to resolve ambiguities (using AskUserQuestion)
3. **User Decisions** - Capture user's intent and choices
4. **Aligned Recommendations** - Provide fixes based on user's vision

**Issue Severity Levels** (determined after user clarification):

- **Critical**: Must fix (blocks implementation or causes major issues)
- **Important**: Should fix (impacts quality or maintainability)
- **Optional**: Nice to have (improves clarity or completeness)

## Required Inputs

```yaml
required:
  - task_file: |
      Path to task document, OR any of:
      - GitHub issue URL (direct):       https://github.com/{owner}/{repo}/issues/297
      - GitHub project board URL:        https://github.com/orgs/.../projects/...?...issue=...
      - Issue hash notation:             #297
      - Bare issue number:               297

optional:
  - review_depth: "quick" | "standard" | "thorough" (default: "standard")
```

## Input Resolution

Before loading the task document, resolve the input to a local file path:

**Step 1 — Detect input type.** If the argument looks like a file path, skip to Step 4.

| Pattern | Matches |
|---------|---------|
| Matches `[A-Z]+-[0-9]+` (e.g. `PROJ-45`) | Jira issue key |
| Contains `github.com` | GitHub URL (direct issue or project board) |
| Starts with `#` followed by digits | Hash notation |
| All digits | Bare issue number |

**Step 2 — Extract the issue number / key** from whichever pattern matched:

```bash
# Jira key (e.g. PROJ-45): resolve to local file via frontmatter lookup
if echo "$INPUT" | grep -qE '^[A-Z]+-[0-9]+$'; then
  JIRA_KEY="$INPUT"
  LOCAL_PATH=$(grep -rl "jira_key: ${JIRA_KEY}" docs/ 2>/dev/null \
    | grep -E 'task\.[0-9]+\.' \
    | grep -v -E '\.(qa|gate|bug|implementation)\.' \
    | head -1)
  if [ -z "$LOCAL_PATH" ]; then
    echo "No local document found for Jira key ${JIRA_KEY}. Run /create-task first, or provide the file path directly."
    exit 1
  fi
  # Jump directly to Step 4 with LOCAL_PATH resolved
fi

# Direct issue URL:   https://github.com/owner/repo/issues/297
ISSUE_NUM=$(echo "$INPUT" | grep -oE '(?<=/issues/)[0-9]+')

# Project board URL:  ...issue=owner%7Crepo%7C297  (last digits after %7C or |)
# Hash notation:      #297
# Bare number:        297
# Generic fallback — last group of digits in the input:
[ -z "$ISSUE_NUM" ] && ISSUE_NUM=$(echo "$INPUT" | grep -oE '[0-9]+' | tail -1)
```

**Step 3 — Resolve to local file path:**

```bash
# Fetch issue body
ISSUE_BODY=$(gh issue view {N} --json body -q '.body')

# Extract the GitHub blob URL from the Document section
DOC_URL=$(echo "$ISSUE_BODY" | grep -o 'https://github\.com/[^)]*\.md' | head -1)

# Strip the URL prefix to get the repo-relative path
LOCAL_PATH=$(echo "$DOC_URL" | sed 's|https://github\.com/[^/]*/[^/]*/blob/[^/]*/||')
```

- If `LOCAL_PATH` is non-empty and the file exists: use it as `task_file`, skip to Step 4.
- If no Document link found (older issue without Document section): fall back to `grep -rl "github_issue: {N}" docs/` **or** `grep -rl "jira_key: {KEY}" docs/` and find `task.{N}.*.md` in the result (excluding `.qa.`, `.gate.`, `.bug.`, `.implementation.` files).
- If still not found: HALT — inform user: "No local document found for issue #{N}. Run `/create-task` first, or provide the file path directly."

**Step 4 — Continue with the resolved `task_file`.**

---

**Files to Load During Review**:

1. Task document (the file being reviewed)
2. Task template (for structure compliance)
3. Architecture documents (for accuracy verification)
4. Related task documents (for context and patterns)

---

## Interactive Questioning Strategy

**CRITICAL**: This skill MUST ask clarifying questions instead of making assumptions or creative decisions.

### When to Ask Questions

Ask clarifying questions when encountering:

1. **Ambiguities**:
   - Multiple valid implementation approaches
   - Unclear or vague requirements
   - Undefined technical decisions
   - Ambiguous scope boundaries
   - Unspecified file paths or component names

2. **Conflicts**:
   - Task contradicts architecture standards
   - Technical specs conflict with project patterns
   - Different phases of task contradict each other
   - Breaking changes without justification

3. **Gaps**:
   - Missing implementation details
   - Incomplete phase descriptions
   - Undefined error handling or edge cases
   - Unspecified database changes
   - Missing testing requirements

4. **Technical Decisions**:
   - Choice between multiple valid patterns
   - Technology selection not in architecture docs
   - API design decisions
   - Performance vs simplicity trade-offs
   - Migration path choices

5. **Hallucinations**:
   - Technical claims not in architecture docs
   - Invented libraries or frameworks
   - API patterns not in specs
   - Unverified technical details

### How to Ask Questions

Use `AskUserQuestion` tool with:

**Question Format**:

```yaml
question: "[Specific question about the implementation issue]"
header: "[Short label, max 12 chars]"
options:
  - label: "[Option 1]"
    description: "[What this means and implications]"
  - label: "[Option 2]"
    description: "[What this means and implications]"
```

**Question Quality Guidelines**:

- **Specific**: Reference exact location in task (Phase X, File Y)
- **Contextual**: Explain what was found and why it's an issue
- **Actionable**: Options lead to clear implementation steps
- **Informed**: Present trade-offs and implications
- **Neutral**: Don't bias toward one option

### Question Examples

#### Example 1: Ambiguous Implementation Step

```yaml
question: "Phase 2 says 'Update error handling' but doesn't specify which error types. What errors should be handled?"
header: "Error Types"
multiSelect: true
options:
  - label: "Network errors"
    description: "Connection failures, timeouts, DNS errors"
  - label: "Validation errors"
    description: "Invalid input, schema validation failures"
  - label: "Database errors"
    description: "Query failures, constraint violations"
  - label: "Business logic errors"
    description: "Domain-specific validation failures"
```

#### Example 2: Missing Database Schema

```yaml
question: "Task mentions 'database changes' but no schema is specified. Should this task include Prisma schema updates?"
header: "Schema Work"
options:
  - label: "Yes, add schema"
    description: "Task needs database changes. Specify which models/fields to add."
  - label: "No schema work"
    description: "Task only works with existing schema. No Prisma changes."
  - label: "Separate task"
    description: "Schema changes should be in a separate dependent task."
```

#### Example 3: Unclear File Modification

```yaml
question: "Phase 1 lists 'auth-service.ts' but doesn't specify if this is client or server. Which path is correct?"
header: "File Location"
options:
  - label: "Server: apps/{api-service}/src/modules/auth/auth-service.ts"
    description: "Backend authentication service (NestJS)"
  - label: "Client: apps/{app-name}/src/services/auth-service.ts"
    description: "Frontend authentication service (React Native)"
  - label: "Both needed"
    description: "Changes required in both client and server auth services"
```

#### Example 4: Conflicting Approach

```yaml
question: "Task uses REST endpoints but architecture docs specify GraphQL for this module. Which should be used?"
header: "API Approach"
options:
  - label: "Use REST"
    description: "Follow task specification. Update architecture docs to allow REST."
  - label: "Use GraphQL"
    description: "Follow architecture standard. Update task to use GraphQL patterns."
  - label: "Hybrid approach"
    description: "Use both - REST for simple operations, GraphQL for complex."
```

### Batching Questions

**IMPORTANT**: When multiple issues found, batch related questions:

**Batching Strategy**:

1. Complete full review analysis first
2. Group related issues by category
3. Create 1-4 high-impact questions (max) per batch
4. Ask all questions in single AskUserQuestion call
5. Use multiSelect where appropriate
6. Continue review with user's decisions

### After Questions Answered

1. **Incorporate User Decisions**: Use answers to inform recommendations
2. **Document Rationale**: Include user's reasoning in review report
3. **Prioritize Issues**: Severity based on user's priorities
4. **Aligned Recommendations**: Fixes reflect user's vision, not AI assumptions

---

## Pre-pass Summary Consumption

Before formulating questions in any step, consult the pre-pass summaries from Phase 1.5:

- **PREPASS_B** (architecture alignment): if `alignment` is `drift` or `conflict`, surface findings with `severity: medium|high` as a question in the technical accuracy phase (Step 3).
- **PREPASS_C** (codebase scan): if `implementation_status` is `partial` or `fully-implemented`, surface the relevant findings as a question during completeness review (Step 6) — ask whether the task should be scoped down or closed.

If a pre-pass summary is absent (agent failed or returned `alignment: unknown` / `implementation_status: unknown`): treat that axis as unreviewed and rely on in-line discovery for that phase.

---

## Review Workflow (8 Sequential Steps)

**NOTE**: Throughout all steps, collect issues and questions. Ask questions in batches at question points rather than interrupting continuously.

### Step 0: Determine Output Format

**Purpose**: Ask user whether they want a comprehensive review report file or just an actionable plan

**Actions**:

1. Use `AskUserQuestion` to ask about desired output format:

```yaml
question: "Would you like a comprehensive review report saved to a file, or just an actionable plan for immediate fixes?"
header: "Output Format"
options:
  - label: "Comprehensive report"
    description: "Generate detailed review report saved to task.{n}.review.{N}.{descriptive-name}.md with all findings, user decisions, and recommendations documented."
  - label: "Action plan only"
    description: "Provide prioritized list of issues and fixes to action immediately without saving a report file."
```

2. Store user's choice for use in Step 8 (final output generation)

**Pipeline note**: When invoked by the `develop-task` orchestrator, this question will be answered autonomously ("Comprehensive report" is always selected). If running inside the develop-task pipeline, skip the AskUserQuestion and proceed directly with "Comprehensive report" as the format selection. Only ask interactively when invoked standalone.

3. **Initialize task list** — use `TaskCreate` to register every step as a tracked task. Mark each `in_progress` before starting and `completed` immediately after finishing. This prevents silently skipping steps.

| Task Subject | Description |
|---|---|
| Determine output format | Capture user's report vs action-plan preference |
| Branch setup | Ensure review runs on a feature branch (Step 0a) |
| Load config & context | Locate task document, template, architecture docs |
| Template compliance | Verify task structure against template |
| Technical accuracy | Anti-hallucination review of implementation details |
| Implementation plan completeness | Check tasks, subtasks, effort estimates |
| Consistency & completeness | Detect contradictions and missing sections |
| Risk assessment & rollback | Verify risk mitigation and rollback plan |
| Generate output | Produce report file or action plan |
| Offer to implement fixes | Ask user if fixes should be applied now (Step 8.5 — always execute) |
| Update document status | Offer status update based on review outcome |

**Output**: User's output format preference captured; task list initialized

---

### Step 0a: Branch Setup (BEFORE any document mutation)

**Purpose**: Ensure all review artifacts (status updates, Change Log entries, `.review.*.md` reports, Jira/GitHub sync) land on a dedicated feature branch — not on `develop`/`main`.

**Pre-conditions**: `DOC_FILE` (task file path from Input Resolution), `MODE` (from Step 0), `SKILL_NAME=review-task`.

**Actions**: Execute the full protocol in `references/review-pipeline-step-0a-branch-setup.md`. Apply the **review-task** variant throughout:
- 0a.0 validate-mode short-circuit (skips entirely when `MODE=validate`).
- 0a.2 extract `TASK_ID` from the filename (`task.{id}.{name}.md`).
- 0a.3 auto-skip when on `feature/task.${TASK_ID}.*`.
- 0a.4 prompt: single question for base branch (current `feature/*` recommended when already on one, else `${BASE_DEFAULT}` recommended).
- 0a.5–0a.8 stash (`git stash create` + `store`) → invoke `/create-branch` with resolved `BASE_BRANCH` → pop stash by hash.

**Output**: `BRANCH_NAME`, `BASE_BRANCH`, `AUTO_SKIPPED` exported. Decisions Log entry (or inline preamble) recorded per 0a.9.

**Failure**: HALT with the exact error; stash recovery instructions surfaced; no document edits attempted.

---

### Step 1: Load Configuration and Context

**Purpose**: Establish project structure and locate all relevant documents

**Actions**:

1. Load task document to review
   - Extract task number from filename
   - Parse all sections and metadata (status, priority, effort, etc.)

2. Load task template from `resources/task-template.md`
   - For structure compliance validation

3. Load relevant architecture documents
   - Based on task scope (backend, frontend, database, etc.)
   - For accuracy verification

4. Load related task documents (if exists)
   - Previous tasks in same area
   - For context and pattern consistency

**Output**: Context package with all necessary documents loaded

---

### Phase 1.5: Pre-pass (2 Parallel Explore Subagents)

**Purpose**: Front-load conflict detection before interactive Q&A. Two read-only Explore agents run in parallel and return compact YAML summaries. Q&A (Steps 2–8) consumes these summaries to surface high-severity findings as early questions rather than discovering them mid-review.

**Prompt templates**: see `references/review-task-prepass-prompts.md` for the full prompt text and dispatch instructions for each agent.

**Actions**:

1. **Resolve variables** from Step 1 output:
   - `{task_path}` — the resolved task file path
   - `{arch_location}` — from `skills-config.yaml` → `architecture.architectureShardedLocation` (default: `docs/architecture`)

2. **Dispatch both agents in a single message** (parallel — one tool-call block, two Agent invocations):
   - **Agent B** (`subagent_type="Explore"`) — architecture alignment prompt from `review-task-prepass-prompts.md`
   - **Agent C** (`subagent_type="Explore"`) — codebase already-implemented prompt from `review-task-prepass-prompts.md`

3. **Collect results**: each agent returns a YAML block. Validate the top-level key (`alignment` for B; `implementation_status` for C). If a key is missing or an agent fails: log `⚠️ Pre-pass Agent {B/C} failed — proceeding without {architecture/codebase} summary` and continue with the remaining summary.

4. **Store summaries** as `PREPASS_B`, `PREPASS_C` in active context for use by the Q&A phase.

**Failure handling**: if both agents fail, log a warning and proceed to Step 2 without pre-pass summaries — the Q&A phase handles all finding detection as a fallback.

**Output**: up to 2 YAML summaries (architecture alignment, implementation status) available for Steps 2–8

---

### Step 2: Template Structure Compliance Review

**Purpose**: Verify task follows required template structure

**Questions to Answer**:

- Are all required sections present?
- Are there unfilled placeholders or TBD markers?
- Does structure match template requirements?
- Are metadata fields complete (status, priority, effort, etc.)?

**Validation Checks**:

1. **Section Presence**:
   - Overview
   - Motivation (Current Problems, Benefits)
   - Technical Background (Current vs Target Architecture)
   - Scope (In Scope, Out of Scope)
   - Breaking Changes (if applicable)
   - Implementation Plan (Phases with Files, Changes, Dependencies)
   - Files Summary (Modify, Delete, Add)
   - Testing Strategy
   - Success Criteria
   - Risk Assessment
   - Rollback Plan
   - Stakeholder Sign-off — **only when `sign-off.enabled: true`** in `skills-config.yaml` (see check 4a); never expected otherwise. Unnumbered by design; the 11 numbered sections above are the mandatory contract.
   - Progress Tracking
   - References

2. **File Naming Convention**:
   - MUST follow: `task.[number].[descriptive-name].md`
   - Use DOTS (.) for structural separators
   - Use hyphens (-) within descriptive names
   - Examples:
     - ✅ `task.50.expired-otp-auto-regeneration.md`
     - ❌ `task-50-expired-otp-auto-regeneration.md`
     - ❌ `50-expired-otp.md`

3. **Metadata Completeness**:
   - Status: Must be one of [Planned, In Progress, Paused, Completed, Cancelled]
   - Priority: Must be one of [Critical, High, Medium, Low]
   - Effort: Should have estimate
   - Dependencies: Should list other tasks if applicable

3a. **OKF frontmatter conformance** (see [`open-knowledge-format.md`](references/open-knowledge-format.md)):
   - `type: task` present and non-empty → **Critical** if missing/empty (OKF's one hard requirement; also flag a legacy bold-line `**Task ID**:` header with no YAML frontmatter block as Critical — the task must use a YAML frontmatter block).
   - `description` (one-sentence summary) present → **Important** if missing.
   - `tags` is a YAML list (when present); `resource` is a URI (when present) → **Optional** if malformed. `updated` ≡ OKF `timestamp`; the tracker URL (derived from `github_issue`, or `jira_url`) ≡ OKF `resource` — absence of an explicit `resource` is not a finding.

4. **Placeholder Detection**:
   - Search for: `[TBD]`, `[TODO]`, `[PLACEHOLDER]`, `???`, `[Description]`
   - Each unfilled placeholder is a gap

4a. **Stakeholder Sign-off** (conditional — full spec: [`references/sign-off.md`](references/sign-off.md)):

Read `sign-off.enabled` from `skills-config.yaml`. **When it is absent or `false`, skip this check entirely** — do not flag a missing section, do not mention sign-off in the report. When `sign-off.enforcement` is `off`, likewise skip.

Otherwise check exactly two things — presence and fill. **There is no git verification, no name matching, and no identity check**; the commit history behind each signature is the audit trail and is left for humans to inspect.

- **Grade the table, not the config.** The rows present in the document are the source of truth. A row added by hand during refinement is enforced exactly like a config-seeded one; a deleted row is a removed requirement, visible in the diff. Never rewrite an existing table to match the config roster.
- A row is **signed** when both its Signature and Date cells are non-empty after trimming. Cells holding only a placeholder (`_sign here_`, `TBD`, `—`, `-`, `N/A`, or the template's `[Required Role]` stub) count as **unsigned**.
- A row is **optional** when its Role cell ends with ` (optional)` (case-insensitive). Optional rows are **never graded**.
- Flag when the section is **missing entirely**, or when **any required row is unsigned**.
- Correct the `**Sign-off status:**` line if it disagrees with the table; the table wins.
- The section must remain **unnumbered**. A `## 12. Stakeholder Sign-off` heading is an Optional finding — it breaks the 11-section mandatory contract that `countMandatorySections` asserts.

Severity is driven by `sign-off.enforcement`:

| `enforcement`        | Severity      | Verdict effect                                                                     |
| -------------------- | ------------- | ----------------------------------------------------------------------------------- |
| `advisory` (default) | **Important** | Score deduction only — `develop-task` must not be blocked.                          |
| `blocking`           | **Critical**  | Do **not** promote the task out of `planned` in Step 9 — the develop pipeline gates on `Status:`, not on the score, so leaving the status unpromoted is what actually stops the run. |
| `off`                | not checked   | —                                                                                   |

Name the outstanding roles so the human knows who to chase:

```markdown
- **[Important]** Stakeholder Sign-off incomplete — 0 of 1 required signatures.
  Awaiting: **Tech Lead**. Enforcement is `advisory`, so this does not block development.
```

> **Never sign on a stakeholder's behalf.** The auto-fix pass may create a missing section (roles only, from the roster) but must **never** write into a Signature or Date cell. An unsigned document stays unsigned until a human commits their name.

4b. **Change Log** (conditional — canonical spec: [`document-change-log.md`](references/document-change-log.md)):

Read `change-log.enabled` from `skills-config.yaml`. It defaults to **`true`**, unlike sign-off — a log is a record of what happened, not a gate on a human. **Skip this check entirely when `change-log.enabled: false`, or when `change-log.enforcement: off`.**

Otherwise check exactly two things:

- **Presence** — the document has a `## Change Log` section with the four canonical columns and at least one row.
- **Currency** — the newest row is consistent with frontmatter `status`. Flag **only** when `status` has advanced past `planned` **and** no row mentions a review, a status change, or an implementation event. A task at `ready-for-development` whose log stops at `Initial draft` is stale: a review promoted it and recorded nothing.

> **Define currency narrowly, and do not widen it.** The check compares the newest row against `status:` — not against the document's actual diff. A reviewer who edits prose without adding a row is not caught, and that is accepted at `advisory`. The failure mode being avoided is the opposite one: a heuristic eager enough to flag legitimately quiet documents trains reviewers to ignore the finding, and an ignored check is a check that does not exist. A no-findings review still writes a row (Step 8.5), so the quiet case is already covered by a writer rather than exempted here.

Severity is driven by `change-log.enforcement`:

| `enforcement`        | Missing or stale                                | Effect on the pipeline                                                                                                     |
| -------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `advisory` (default) | **Important** issue + readiness-score deduction | None — verdict may still be GO, `develop-task` proceeds                                                                    |
| `blocking`           | **Critical** issue → NO-GO                      | Do **not** promote the task out of `planned` in Step 9 — `develop-task` gates on `Status:`, so leaving it unpromoted is what actually stops the run |
| `off`                | not checked                                     | None                                                                                                                       |

Reviewer output — name what is stale and what would fix it:

```markdown
- **[Important]** Change Log is stale — newest row is `1.0 Initial draft` (2026-05-11) but
  status is `ready-for-development`. Enforcement is `advisory`, so this does not block development.
```

Under `blocking`, the same finding is `[Critical]` and the closing sentence becomes `Enforcement is 'blocking' — development cannot begin until the log is current.`

> **Expect legacy documents to report exactly one Important finding.** There is no backfill: every document written before the Change Log spec existed has no section. `advisory` is the default precisely so those documents score one point lower and report one extra finding while still returning GO. A missing section on an old document is not a defect in that document — it is the adoption boundary.

5. **Tracker Issue Linkage**:

   **Detection**: source the canonical resolver once per skill invocation, then branch on `TRACKER` — see `references/platform-detection.md`:
   ```bash
   source references/resolve-platform.sh || exit 1
   # TRACKER = jira | github
   ```
   When `TRACKER=jira` → Jira path; when `TRACKER=github` → GitHub path.

   **Tracker dedup** (applies to both paths, runs only when `jira_key` / `github_issue` is absent):

   Before creating a new tracker issue, search the tracker for an existing one matching the task title. This prevents duplicate issues when frontmatter was hand-edited or the task was authored outside `/create-task`.

   Lookup order:
   1. **Frontmatter present** (`jira_key` / `github_issue` has a value) → use it; skip create entirely.
   2. **Frontmatter absent** → run title-based search (see per-path details below):
      - Exactly one match (any status) → write frontmatter + body link, log `"Linked existing tracker issue"`, skip create.
      - Closed match → additionally log closed-issue warning.
      - Zero or multiple matches → fall through to create (existing behaviour); multi-match logs all match IDs.
      - Search failure → log warning and fall through to create (existing behaviour preserved).
   3. **Frontmatter write-back**: on link-existing, write `jira_key` + `jira_url` (or `github_issue`) before the closing `---` of the frontmatter block (same sed-based pattern as `create-task`). Also insert/repair the body cross-reference link so the next review pass does not flag it as missing.

   **Jira path:**

   > **Note**: priority drift between local frontmatter and remote Jira is corrected by `/sync-jira-task`, not by review. No analogue of the GitHub Project-board priority helper is needed — Jira priority is a built-in issue field, not a label, and `jira-sync.js` (`normalisePriority` + `diffFields`) already keeps them in sync.

   - Check frontmatter for `jira_key:` field
   - If `jira_key:` is missing or `null`:
     - Flag as **Important** gap
     - **Offer tracker sync (opt-in)** — prompt with `AskUserQuestion` (same gate as `/create-task` step 4.5; never create a remote issue unprompted):
       > **Header:** `Tracker sync`
       > **Question:** "This task has no linked Jira issue. Create and link one now? Detected platform: Jira."
       > **Options:**
       > - **Sync to Jira** `(Recommended)` — create the Jira issue and write `jira_key`/`jira_url` to frontmatter.
       > - **Skip — leave unlinked** — make no remote changes; leave `jira_key` unwritten. The user can run `/sync-jira-task` later.
       >
       > The user may also pick "Other" (auto-provided) to skip or explain.
     - **Skip / no sync chosen** → make no remote changes, keep the Important gap flagged, log `"Tracker sync skipped by user — run /sync-jira-task later."` and continue the review. Do NOT halt.
     - If the user chooses **Sync to Jira**, create via Jira REST API v2:
       - **Pre-create dedup search (Tracker dedup)** — run immediately before the create block:
         1. Search for an existing issue via Atlassian MCP `searchJiraIssuesUsingJql`:
            - `jql`: `summary ~ "[Task {id}] {title}" AND project={JIRA_PROJECT_KEY}` (no status filter — search across all states)
            - On search failure (outage / rate-limit): log `"⚠️ Jira dedup search failed — proceeding to create"` and fall through to create below (preserves current behaviour)
         2. **Exactly one match** → link existing, skip create:
            - Extract `task_key` (issue key) and build `task_url = ${JIRA_URL}/browse/${task_key}`
            - Write `jira_key: {task_key}` and `jira_url: {task_url}` into frontmatter (sed-based insert before closing `---`, same pattern as `create-task`)
            - Insert or repair body cross-reference link: `**Jira Issue**: [{task_key}]({task_url})`
            - If matched issue status is `Closed` or `Done`: log `"⚠️  Linked existing CLOSED tracker issue {task_key} — verify intent before continuing."`
            - Log `"Linked existing tracker issue {task_key} (skipped create)"` and **skip the curl block below**
         3. **Zero matches** → fall through to create block below
         4. **Multiple matches** → log `"⚠️ Dedup: {N} matches found for \"[Task {id}]\": {key1}, {key2}, … — proceeding to create"` and fall through to create block below
         - **Note on search/create asymmetry**: this search uses Atlassian MCP (`searchJiraIssuesUsingJql`); the create block below uses curl REST. This split is intentional — switching create to MCP is out of scope and tracked separately.
         - **Note on the description**: the card is a summary, not a copy of the task file — see [`references/tracker-card-summary.md`](./references/tracker-card-summary.md). The block below writes plain markdown via REST v2; `sync-jira-task` later re-renders the same shape as ADF and is the authority. Keep the two consistent.
       ```bash
       JIRA_AUTH=$(echo -n "${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}" | base64)
       JIRA_RESPONSE=$(curl -s -X POST \
         "${JIRA_URL}/rest/api/2/issue" \
         -H "Content-Type: application/json" \
         -H "Authorization: Basic ${JIRA_AUTH}" \
         -d "$(jq -n \
           --arg summary "[Task {id}] {title}" \
           --arg description "## Summary\n\n{first paragraph of Overview, capped at 4 sentences}\n\n## Success Criteria\n\n{first 5 criteria; if more remain add '+N more in the task document'}\n\n## Document\n📁 \`{task-file-relative-path}\`" \
           --arg project "$JIRA_PROJECT_KEY" \
           --arg priority "{High|Medium|Low}" \
           '{
             "fields": {
               "project": {"key": $project},
               "summary": $summary,
               "description": $description,
               "issuetype": {"name": "Task"},
               "priority": {"name": $priority}
             }
           }'
         )")
       task_key=$(echo "$JIRA_RESPONSE" | jq -r '.key // empty')
       task_url="${JIRA_URL}/browse/${task_key}"
       ```
     - On success: write `jira_key: {task_key}` and `jira_url: {task_url}` into frontmatter
     - On failure: flag as **Important**, continue
   - If `jira_key:` has a value → verify the issue exists:
     ```bash
     JIRA_AUTH=$(echo -n "${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}" | base64)
     HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
       "${JIRA_URL}/rest/api/2/issue/${jira_key}" \
       -H "Authorization: Basic ${JIRA_AUTH}")
     # 200 = exists; 404 = flag as Critical
     ```
   - **URL consistency check** (when `jira_key` is present and valid):
     - If `jira_url:` is also in frontmatter: verify it equals `{JIRA_URL}/browse/{jira_key}`. Any mismatch → flag as **Important**: "`jira_url` does not match `jira_key`"
     - Look for a `**Jira Epic**: [KEY](url)` or `**Jira Issue**: [KEY](url)` line in the document body. If found: verify the KEY matches `jira_key` and the URL ends with `/browse/{jira_key}`. Any mismatch → flag as **Important**: "Body cross-reference link does not match `jira_key`"
     - If no body link is found: flag as **Important** — add one (e.g., `**Jira Issue**: [{jira_key}]({jira_url})`)

   **GitHub path** (when `TRACKER=github`):
   - Frontmatter MUST contain `github_issue:` field
   - If `github_issue:` is missing or `null`:
     - Flag as **Important** gap
     - **Offer tracker sync (opt-in)** — prompt with `AskUserQuestion` (same gate as `/create-task` step 4.5; never create a remote issue unprompted):
       > **Header:** `Tracker sync`
       > **Question:** "This task has no linked GitHub issue. Create and link one now? Detected platform: GitHub."
       > **Options:**
       > - **Sync to GitHub** `(Recommended)` — create the GitHub issue, add it to the project board, and write `github_issue` to frontmatter.
       > - **Skip — leave unlinked** — make no remote changes; leave `github_issue` unwritten. The user can run `/sync-github-task` later.
       >
       > The user may also pick "Other" (auto-provided) to skip or explain.
     - **Skip / no sync chosen** → make no remote changes, keep the Important gap flagged, log `"Tracker sync skipped by user — run /sync-github-task later."` and continue the review. Do NOT halt.
     - If the user chooses **Sync to GitHub**, create the issue using the same pattern as `/create-task`:
       - **Pre-create dedup search (Tracker dedup)** — run immediately before the create block:
         1. Search for an existing issue:
            ```bash
            gh issue list --search "in:title \"[Task {id}]\"" --state all \
              --json number,url,state,title
            ```
            On failure: log `"⚠️ GitHub dedup search failed — proceeding to create"` and fall through to create below
         2. **Exactly one match** → link existing, skip create:
            - Extract `N` (issue number) and `url` from the result
            - Write `github_issue: {N}` into frontmatter (sed-based insert before closing `---`, same pattern as `create-task`)
            - Insert or repair body cross-reference link: `[#{N}](https://github.com/{owner}/{repo}/issues/{N})`
            - If matched issue `state` is `CLOSED`: log `"⚠️  Linked existing CLOSED tracker issue #{N} — verify intent before continuing."`
            - Self-heal the board Priority field on the linked issue (no-op if already correct):
              ```bash
              bash references/set-github-project-priority.sh "{N}" || true
              ```
            - Log `"Linked existing tracker issue #{N} (skipped create)"` and **skip the `gh issue create` block below**
         3. **Zero matches** → fall through to create block below
         4. **Multiple matches** → log `"⚠️ Dedup: {count} matches found for \"[Task {id}]\": #{n1}, #{n2}, … — proceeding to create"` and fall through to create block below
       Invoke the `ensure-task-github-issue` sub-routine with `TASK_FILE_PATH={resolved task file path}`. The sub-routine handles:
       - resolving the milestone (frontmatter `milestone:` → epic-registry lookup → `"Technical Tasks (standalone)"` default)
       - creating the issue (title `[Task {id}] {title}`, `task` + `priority:{priority}` labels)
       - adding it to the GitHub Project board
       - mirroring the priority label onto the board's Priority single-select field
       - writing `github_issue: {N}` into the task frontmatter and adding/repairing the body cross-reference link.

       On return, `TASK_ISSUE_NUM` is set (integer) or empty (on failure). Failure is non-blocking — review continues with a flagged Important gap.
   - If `github_issue:` has a numeric value:
     - Verify the issue exists: `gh issue view {N} --json state -q '.state'`
       - If the issue doesn't exist (command errors), flag as **Critical**
     - Self-heal the board Priority field (no-op if already correct; reads `priority:*` label when arg omitted):
       ```bash
       bash references/set-github-project-priority.sh "{N}" || true
       ```
     - **URL consistency check** — verify the cross-reference link in the document body is correct:
       - Look for any markdown link of the form `[#N](url)` or `[#N](https://github.com/...)` in the task body
       - If found: confirm the issue number in the link matches `github_issue:` in frontmatter; and confirm the URL path ends with `/issues/{N}`. Any mismatch → flag as **Important**: "Body link `[#X](url)` does not match frontmatter `github_issue: {N}`"
       - If no body link found: flag as **Important** — add one (e.g., `[#{N}](https://github.com/{owner}/{repo}/issues/{N})`)

5a. **Tracker Card Preflight**:

   The tracker card is a **summary that points at this document**, not a copy of
   it — see [`references/tracker-card-summary.md`](./references/tracker-card-summary.md).
   It is built from a handful of named `## ` headings, so a document whose
   headings do not match that list publishes a thin or empty card **and the sync
   still reports success**. That is not hypothetical: 28 task cards once shipped
   with empty bodies, and ~98% of stories published their acceptance criteria
   and nothing else. Both went unnoticed because there is no error to raise.

   Run the preflight (no auth, no network, no writes — it only reads the file):

   ```bash
   node .agents/skills/sync-jira-task/scripts/sync-jira-task.js --file "{task-file-path}" --check-card
   ```

   Exit 0 = every card block resolves. Exit 1 = at least one finding, printed
   with the exact fix. Add `--json` for a machine-readable `{ok, findings, blocks}`.

   Map the output to review findings:

   - A `missing` finding → **Critical**. The card loses a whole block. The fix is
     always in the **document** — rename or add the heading; no sync-side change
     can invent content the file does not have.
   - An `empty` finding → **Critical** (or **Important** for an optional block).
     The heading exists but holds only a table or a code block, so there is no
     prose or list to summarise.
   - A `no-body` finding → **Critical**. Nothing resolved; the card would publish
     an empty description.
   - Exit 0 → no finding. Do **not** raise anything about card length: the
     builder caps it (4-sentence summary, 5 success criteria, 3 breaking changes) and announces every omission
     with a `+N more` link, so a long document cannot produce a long card.

   Report the `+N more` counts in the review body as information, not a defect —
   they tell the author how much of the section a board reader will not see.

**Issues to Flag**:

- **Critical**: Missing required sections (Implementation Plan, Testing Strategy); unsigned sign-off when `sign-off.enforcement: blocking`; a tracker-card block that fails preflight with `missing`, `empty`, or `no-body`
- **Important**: Unfilled placeholders in core sections, missing GitHub issue linkage; unsigned sign-off when `sign-off.enforcement: advisory` (the default)
- **Optional**: Missing optional sections or metadata; a numbered `## 12. Stakeholder Sign-off` heading

**Output**: Template compliance report with specific issues listed. Card-preflight findings count toward the **Template Compliance** score — a document that cannot produce a usable card is not template-compliant, whatever else it satisfies. A missing or stale **Change Log** (check 4b) also deducts from this score under `change-log.enforcement: advisory`, and is named in that row's note.

**Questions to Collect** (for batch asking):

- When placeholders found: What should fill this section?
- When metadata incomplete: What is the correct value?
- When sections missing: Should this section be added?

---

### QUESTION POINT 1: Structure & Scope Clarifications

**CRITICAL**: Before continuing to technical review, ask batched questions about:

1. Template compliance issues (unfilled placeholders, missing sections)
2. File naming violations
3. Scope clarifications (what's in/out of scope)
4. Metadata corrections

**Action**: Use `AskUserQuestion` with 1-4 questions (max) covering high-priority issues from Step 2.

**After Questions**: Continue review with user's decisions incorporated.

---

### Step 3: Technical Accuracy and Anti-Hallucination Review

**Purpose**: Verify all technical claims are accurate and sourced

**Questions to Answer**:

- Is every technical detail traceable to architecture or existing code?
- Are there invented technologies, libraries, or patterns?
- Do technical specs match architecture documentation?
- Are file paths accurate and complete?
- Are API patterns consistent with project standards?

**Validation Checks**:

1. **Technology Inventory**:
   - Extract all mentioned libraries, frameworks, tools
   - Cross-reference with architecture/tech-stack.md
   - Flag anything not documented in architecture

2. **File Path Accuracy**:
   - Verify all file paths in Implementation Plan exist or are valid new paths
   - Check paths follow project structure conventions
   - Validate naming conventions (kebab-case, PascalCase where appropriate)

3. **API Pattern Accuracy**:
   - Verify endpoints match REST API patterns or GraphQL schemas
   - Check HTTP methods, request/response formats
   - Validate authentication/authorization requirements

4. **Database Schema Accuracy**:
   - If Prisma changes mentioned, verify schema definitions
   - Check field names, types, relationships
   - Validate indexes and constraints

5. **Code Example Accuracy**:
   - Verify code examples use correct syntax
   - Check imports are from valid paths
   - Validate examples match project coding standards

**Common Hallucination Patterns to Detect**:

- ❌ Libraries not in package.json or tech stack
- ❌ File paths that don't match project structure
- ❌ API patterns not documented in architecture
- ❌ Database fields not in Prisma schema
- ❌ Code patterns that violate project standards

**Issues to Flag**:

- **Critical**: Invented libraries/APIs, incorrect paths, wrong patterns
- **Important**: Unverified technical claims, inconsistent approaches
- **Optional**: Could be more specific or cite sources

**Output**: Technical accuracy report with hallucinations identified

**Questions to Collect** (for batch asking):

- When hallucinations found: What should be used instead?
- When paths unclear: Which file location is correct?
- When patterns conflict: Which approach to follow?

---

### Step 4: Implementation Plan Completeness

**Purpose**: Ensure implementation plan is detailed and actionable

**Questions to Answer**:

- Are all phases clearly defined with specific changes?
- Are file modifications explicit (not vague)?
- Are dependencies between phases clear?
- Are risk levels appropriate for each phase?
- Can a developer follow the plan without guesswork?

**Validation Checks**:

1. **Phase Definition Quality**:
   - Each phase should have:
     - Clear purpose
     - Risk level (Low/Medium/High)
     - Specific files to modify
     - Concrete changes with checkboxes
     - Dependencies on other phases

2. **File Change Specificity**:
   - Not: "Update auth service"
   - ✅ Yes: "Update `apps/{api-service}/src/modules/auth/auth.service.ts` - Add `verifyExpiredOtp()` method"

3. **Change Description Quality**:
   - Changes should specify WHAT and WHY
   - Should be measurably completable
   - Should reference specific functions/components

4. **Dependency Clarity**:
   - Phase dependencies should be explicit
   - Should prevent out-of-order implementation

5. **Risk Assessment**:
   - High-risk phases should have mitigation plans
   - Breaking changes flagged appropriately

6. **Effort Estimate**:
   - Check frontmatter for `estimated_effort_hours` (number).
   - **Absent or empty**: flag as **Optional** (LOW severity) — "No `estimated_effort_hours` set. PM tooling (Jira Original Estimate, GitHub Projects v2 Estimate field) will show this task as unestimated."
   - **Present**: recompute the rubric in `references/effort-estimation-rubric.md` against the current document state. If `abs(frontmatter - rubric) / max(frontmatter, rubric) > 0.5` (>2× divergence), flag as **Optional** (LOW severity): "Frontmatter `estimated_effort_hours: {X}` diverges from rubric estimate of **{Y}h** (success criteria: {n}, plan tasks: {m}, risk: {r}). Confirm or adjust."
   - Non-blocking — does **not** affect gate decision. In Interactive mode, may offer a single prompt to accept the rubric's number; in Validate mode, observe silently.

**Issues to Flag**:

- **Critical**: Vague changes, missing files, unclear dependencies
- **Important**: Insufficient detail, no risk assessment
- **Optional**: Could add more rationale or context, missing `estimated_effort_hours`

**Output**: Implementation plan completeness report

**Questions to Collect** (for batch asking):

- When changes vague: What specifically should be done?
- When files missing: Which files need modification?
- When dependencies unclear: What is the correct order?

---

### QUESTION POINT 2: Technical & Implementation Clarifications

**CRITICAL**: Before continuing to consistency review, ask batched questions about:

1. Hallucinated technologies or approaches
2. Missing implementation details
3. Unclear file modifications
4. Ambiguous change descriptions

**Pre-pass integration**: Consult `PREPASS_B` (architecture alignment) first. If `alignment` is `drift` or `conflict` and any finding has `severity: medium|high`, elevate it as the first question in this batch rather than relying on the user to raise it.

**Action**: Use `AskUserQuestion` with 1-4 questions (max) covering technical and implementation issues from Steps 3-4 (supplemented by `PREPASS_B` findings).

**After Questions**: Continue review with technical decisions clarified.

---

### Step 6: Consistency and Completeness Review

> Note: Step 5 is intentionally omitted. In `review-story`, Step 5 is "Completeness and Gap Analysis" — that concept is folded into this step (Step 6) for tasks. Numbering aligns with `review-story` for cross-skill comparability.

**Purpose**: Find contradictions and gaps across the task document

**Questions to Answer**:

- Do phases of the task align with each other?
- Do implementation changes match stated goals?
- Are testing plans sufficient for the changes?
- Does rollback plan cover the implementation?
- Are success criteria measurable?

**Validation Checks**:

1. **Internal Consistency**:
   - Overview should align with Implementation Plan
   - Files Summary should match files in phases
   - Testing Strategy should cover all changed code
   - Success Criteria should map to requirements

2. **Testing Completeness**:
   - Unit tests for new functions/methods
   - Integration tests for workflows
   - Contract tests for API changes
   - Performance tests if optimization claimed

3. **Rollback Completeness**:
   - Rollback plan should cover all phases
   - Should specify triggers for rollback
   - Should have verification steps

4. **Success Criteria Measurability**:
   - Each criterion should be verifiable
   - Should cover functional, performance, quality aspects
   - Should align with stated benefits

5. **Scope and Complexity Analysis**:
   - Count total implementation phases (>8 phases may indicate oversized task)
   - Estimate implementation time (>1 sprint suggests splitting into sub-tasks)
   - Check for distinct technical areas that could be independent sub-tasks
   - Identify phases that could be parallelized as separate task documents
   - Look for natural breakpoints (e.g., "Phase 1: Setup", "Phase 2: Migration", "Phase 3: Cleanup")
   - Assess if task mixes multiple concerns (database + API + testing + deployment)
   - Evaluate if task requires multiple developers working in parallel
   - Check if phases have minimal dependencies (good candidates for splitting)

**Issues to Flag**:

- **Critical**: Major inconsistencies, missing critical tests, task too large (recommend splitting)
- **Important**: Incomplete rollback plan, vague success criteria, task complexity high
- **Optional**: Additional helpful tests or criteria, potential optimization for parallel development

**Output**: Consistency and completeness report

**Questions to Collect** (for batch asking):

- When tests missing: What test coverage is needed?
- When rollback incomplete: How to handle failure in Phase X?
- When criteria vague: How to measure success for this?
- When task too large: Should task be split into sub-task documents?

---

### Step 6.5: Mermaid Diagram Validation (via `mermaid-architect`)

**Purpose**: Validate any embedded Mermaid diagrams (decision flowchart, ER, class, current-vs-target architecture) against syntax, metadata, and architectural-consistency rules. Recommend a diagram if the task lacks one and a visual would materially clarify the data shape or branching logic.

**Actions**:

1. **Detect diagrams**: scan the task doc and its co-located plan file for fenced ```` ```mermaid ```` blocks. Capture each block's section anchor (Technical Background, Implementation Plan, etc.) and YAML metadata header presence.
2. **Invoke `mermaid-architect` in review mode** for each block. Pass: task file path, the section anchor, and the entity / decision keywords already in the prose so the skill can verify the diagram type matches the content (e.g., `erDiagram` for data shapes, `flowchart` for decision logic) and that no architectural violations are encoded.
3. **Collect verdicts**: `pass`, `pass with notes`, `fail`. `fail` → Critical (data-shape error) or Important (cosmetic); `pass with notes` → Optional.
4. **If absent**:
   - Task introduces or migrates a data shape → recommend `erDiagram` or `classDiagram`
   - Task contains non-trivial branching logic → recommend `flowchart` with decision nodes
   - Task migrates "current → target" architecture → recommend side-by-side `flowchart` subgraphs
   Do not flag absence if the prose already conveys the structure clearly.
5. **If a diagram restates the Implementation Plan verbatim**: recommend removing it.

**Output**: append to Critical/Important/Optional buckets used by Steps 6, 7.

---

### Step 7: Risk Assessment and Rollback Review

**Purpose**: Evaluate risk identification and mitigation planning

**Questions to Answer**:

- Are all high-risk areas identified?
- Are mitigation strategies adequate?
- Is rollback plan realistic and testable?
- Are rollback triggers clearly defined?
- Can the task be safely rolled back if needed?

**Validation Checks**:

1. **Risk Identification**:
   - Database schema changes = High risk
   - Breaking API changes = High/Medium risk
   - New dependencies = Medium risk
   - Refactoring = Medium/Low risk

2. **Mitigation Quality**:
   - Each high risk should have mitigation
   - Mitigations should be actionable
   - Should prevent or minimize impact

3. **Rollback Feasibility**:
   - Database changes need migration down scripts
   - API changes need version compatibility
   - Should specify rollback time estimate
   - Should have verification steps

**Issues to Flag**:

- **Critical**: Missing risk assessment for dangerous changes
- **Important**: Inadequate mitigation, no rollback plan
- **Optional**: Additional risks to consider

**Output**: Risk and rollback assessment report

**Questions to Collect** (for batch asking):

- When risks missing: What risks should be added?
- When mitigation weak: How to better mitigate this risk?
- When rollback unclear: How to rollback Phase X changes?

---

### QUESTION POINT 3: Completeness & Safety Clarifications (Final)

**CRITICAL**: Before generating final report, ask batched questions about:

1. Missing test coverage
2. Incomplete rollback procedures
3. Unidentified risks
4. Unclear success criteria
5. Task scope/complexity (should it be split into sub-tasks?)

**Pre-pass integration**: Consult `PREPASS_C` (codebase scan) first. If `implementation_status` is `partial` or `fully-implemented` and any finding has a concrete `found_at` path, surface it as the first question in this batch — ask whether the task should be scoped down or closed.

**Action**: Use `AskUserQuestion` with 1-4 questions (max) covering remaining issues from Steps 6-7 (supplemented by `PREPASS_C` findings).

**Example Questions**:

```yaml
questions:
  - question: "Testing Strategy missing integration tests for database changes in Phase 2-4. Should integration tests be added?"
    header: "Integration Tests"
    options:
      - label: "Yes, add tests"
        description: "Add integration test details to Testing Strategy covering database operations"
      - label: "Unit tests sufficient"
        description: "Database changes covered by unit tests. No integration tests needed."
      - label: "Separate testing task"
        description: "Create separate task document focused on comprehensive test coverage"

  - question: "Task has 12 implementation phases across database, API, frontend, and deployment. This appears too large for one task document. Should it be split into sub-tasks?"
    header: "Split Task"
    options:
      - label: "Keep as one task"
        description: "All phases are tightly coupled and must be executed sequentially. Scope is acceptable."
      - label: "Split into sub-tasks"
        description: "Create sub-task documents for parallel development (e.g., task.1-1.database-migration.md, task.1-2.api-updates.md). Provide suggested split structure in recommendations."
      - label: "Reduce scope"
        description: "Some phases should be deferred to future tasks. Identify which phases to defer."

  - question: "Rollback Plan missing specific steps for reverting Phase 3 (cache layer changes). How should Phase 3 be rolled back?"
    header: "Phase 3 Rollback"
    options:
      - label: "Remove cache config"
        description: "Revert Redis configuration and restart services. Cache layer is optional."
      - label: "Graceful degradation"
        description: "Cache failures automatically fall back to database. No explicit rollback needed."
      - label: "Detailed procedure needed"
        description: "Add specific rollback steps including cache flush, config removal, and verification."
```

**After Questions**: Generate final report incorporating all user decisions and clarifications.

---

### Step 8: Generate Output

**Purpose**: Provide actionable recommendations for task improvement in user's preferred format

**CRITICAL**: Use the output format preference captured in Step 0 to determine whether to generate:
- **Comprehensive Report**: Full review report saved to file
- **Action Plan Only**: Prioritized list of fixes for immediate action

---

### Option A: Comprehensive Report (if user chose "Comprehensive report")

**Actions**:

1. Generate complete review report following the structure below
2. Save to file: `[task-directory]/task.{n}.review.{N}.{descriptive-name}.md`
3. Display summary to user with file location

**Report Structure**:

```markdown
# Task Review Report: Task [Number] - [Title]

**Reviewed:** [Date]
**Review Depth:** [Quick/Standard/Thorough]
**Task Status:** [Current status from task]
**Overall Assessment:** [EXCELLENT / GOOD / NEEDS IMPROVEMENT / MAJOR ISSUES]

---

## Executive Summary

[2-3 sentences summarizing the review findings]

**Critical Issues:** [count] 🚨
**Important Issues:** [count] ⚠️
**Optional Improvements:** [count] 💡

**User Clarifications:** [count] questions asked and answered
**Implementation Readiness:** [1-10 score]
**Recommendation:** [READY TO IMPLEMENT / NEEDS REVISION / REQUIRES REWORK]

---

## User Decisions & Clarifications

**IMPORTANT**: This section documents the clarifying questions asked during review and user's decisions. All recommendations below incorporate these decisions.

### Question Point 1: Structure & Scope

**Q1: [Question asked]**
- **User Decision**: [Answer selected]
- **Impact**: [How this affects recommendations]

### Question Point 2: Technical & Implementation

**Q2: [Question asked]**
- **User Decision**: [Answer selected]
- **Impact**: [How this affects recommendations]

### Question Point 3: Completeness & Safety

**Q3: [Question asked]**
- **User Decision**: [Answer selected]
- **Impact**: [How this affects recommendations]

---

## 1. Template Structure Compliance

**Status:** [PASS / ISSUES FOUND]

### Issues

#### Critical
- [List critical template issues]

#### Important
- [List important template issues]

#### Optional
- [List optional improvements]

### Recommendations (Based on User Decisions)

1. **[Action based on user decision]** - _Per user decision on Q[num]_
2. **[Action aligned with user's vision]** - _Per user decision on Q[num]_

---

## 2. Technical Accuracy

**Status:** [ACCURATE / ISSUES FOUND]
**Hallucinations Detected:** [count]

### Issues

#### Critical (Hallucinations)
- **[Invented library/technology]**: Task mentions "[name]" but this is not in tech stack
  - **Location:** Phase [X], File [Y]
  - **Recommendation:** Use [documented alternative] instead

#### Important
- **[Unverified claim]**: Technical detail without source
  - **Location:** [Section]
  - **Recommendation:** Verify against [architecture doc]

### Recommendations (Based on User Decisions)

1. **[Action based on user's tech choice]** - _Per user decision on Q[num]_
2. **[Action aligned with architecture]** - _Per user decision on Q[num]_

---

## 3. Implementation Plan Completeness

**Status:** [COMPLETE / GAPS FOUND]

### Issues

#### Critical
- **[Vague change description]**: Phase [X] says "update service" without specifics
  - **Impact:** Developer won't know what to change
  - **Recommendation:** Specify exact methods/functions to modify

#### Important
- **[Missing file path]**: Change mentions component without path
  - **Recommendation:** Add full path: `apps/[app]/src/[path]/[file].ts`

### Recommendations (Based on User Decisions)

1. **[Specific implementation step]** - _Per user decision on Q[num]_
2. **[File path clarification]** - _Per user decision on Q[num]_

---

## 4. Consistency & Completeness

**Status:** [CONSISTENT / ISSUES FOUND]

### Issues

#### Critical
- **[Major inconsistency]**: Overview says [X] but Phase 2 implements [Y]

#### Important
- **[Missing test coverage]**: No integration tests for workflow changes

### Recommendations (Based on User Decisions)

1. **[Consistency fix]** - _Per user decision on Q[num]_
2. **[Test coverage addition]** - _Per user decision on Q[num]_

---

## 5. Risk & Rollback Assessment

**Status:** [ADEQUATE / GAPS FOUND]

### Issues

#### Critical
- **[Unidentified risk]**: Database migration has no rollback plan

#### Important
- **[Weak mitigation]**: High-risk change lacks adequate mitigation

### Recommendations (Based on User Decisions)

1. **[Risk mitigation]** - _Per user decision on Q[num]_
2. **[Rollback procedure]** - _Per user decision on Q[num]_

---

## Summary of Recommendations

### Must Fix (Critical) - [count] issues

1. [Highest priority fix with specific action - per user decision]
2. [Second highest priority fix - per user decision]

### Should Fix (Important) - [count] issues

1. [Important improvement with specific action - per user decision]
2. [Second important improvement - per user decision]

### Consider (Optional) - [count] items

1. [Nice-to-have improvement - per user decision]
2. [Additional enhancement - per user decision]

---

## Implementation Readiness Assessment

**Score:** [1-10]/10

**Scoring Breakdown:**

- Template Compliance: [score]/10
- Technical Accuracy: [score]/10
- Implementation Clarity: [score]/10
- Consistency: [score]/10
- Risk Management: [score]/10

**Confidence Level for Successful Implementation:** [High/Medium/Low]

**Recommendation:**

- ✅ **READY TO IMPLEMENT**: [If score >= 8 and no critical issues]
- ⚠️ **NEEDS REVISION**: [If score 5-7 or important issues exist]
- 🚨 **REQUIRES REWORK**: [If score < 5 or critical issues exist]

**Justification:** [1-2 sentences explaining the recommendation based on user decisions]

---

## Next Steps

[If READY]: Task is ready for implementation. Developer should:

1. Follow implementation plan phase by phase
2. Check off progress tracking checkboxes
3. Run tests after each phase
4. Refer to rollback plan if issues arise

[If NEEDS REVISION]: Address the following before implementation:

1. [Priority 1 revision - based on user decision]
2. [Priority 2 revision - based on user decision]
3. [Priority 3 revision - based on user decision]

[If REQUIRES REWORK]: Task requires significant rework:

1. [Major rework item 1 - based on user input]
2. [Major rework item 2 - based on user input]
3. Consider using task creation tools to regenerate with proper context

---

## Review Metadata

- **Reviewer:** [Agent/Person]
- **Review Date:** [ISO date]
- **Review Depth:** [Quick/Standard/Thorough]
- **Task File:** [path]
- **Architecture Docs Consulted:** [list]
- **Review Duration:** [time]
```

**Output**: Save review report to `[task-directory]/task.{n}.review.{N}.{descriptive-name}.md`

---

### Option B: Action Plan Only (if user chose "Action plan only")

**Actions**:

1. Generate concise, prioritized action plan (DO NOT save to file)
2. Display directly to user for immediate action
3. Focus on critical/important issues only

**Action Plan Format**:

```markdown
# Task Review: [Task Title] - Action Plan

**Review Date:** [Date]
**Implementation Readiness:** [score]/10
**Status:** [READY / NEEDS REVISION / REQUIRES REWORK]

---

## Critical Issues (Must Fix) - [count]

1. **[Issue Title]**
   - **Problem:** [What's wrong]
   - **Location:** [Where in task]
   - **Fix:** [Specific action to take]
   - **User Decision:** [From clarifying questions if applicable]

2. **[Next critical issue]**
   - **Problem:** [What's wrong]
   - **Location:** [Where in task]
   - **Fix:** [Specific action to take]

[... all critical issues ...]

---

## Important Issues (Should Fix) - [count]

1. **[Issue Title]**
   - **Problem:** [What's wrong]
   - **Fix:** [Specific action to take]

2. **[Next important issue]**
   - **Problem:** [What's wrong]
   - **Fix:** [Specific action to take]

[... all important issues ...]

---

## Optional Improvements - [count]

1. [Brief improvement suggestion]
2. [Brief improvement suggestion]
3. [Brief improvement suggestion]

---

## Immediate Next Steps

**If READY TO IMPLEMENT:**
1. [Action 1]
2. [Action 2]
3. Begin implementation with `/develop` skill

**If NEEDS REVISION:**
1. [Priority 1 fix]
2. [Priority 2 fix]
3. [Priority 3 fix]
4. Run `/validate-task` after fixes (if available)

**If REQUIRES REWORK:**
1. [Major rework item 1]
2. [Major rework item 2]
3. Consider regenerating task document with proper context

---

**User Clarifications Applied:** [count] questions asked and answered
**Review Depth:** [Quick/Standard/Thorough]
**Review Time:** ~[minutes]

**Note:** This is an action plan only. No comprehensive report file was saved. To generate a full report with detailed documentation, run `/review-task` again and select "Comprehensive report".
```

**Output**: Display action plan to user (no file saved)

---

### Step 8.5: Offer to Implement Fixes

**Purpose**: Give the user the option to have the agent apply the recommended fixes to the task document immediately.

**When to Execute**: **CRITICAL / BLOCKING** — Always execute after Step 8, before Step 9. Do not skip or end the skill without presenting this offer.

**Pipeline note**: When invoked by the `develop-task` orchestrator, skip the `AskUserQuestion` and auto-answer **"Yes, apply all critical + important fixes"** — the pipeline proceeds autonomously and needs the task fully corrected before `/develop` runs in Step 3. Log in Decisions Log: "review-task Step 8.5 auto-answered: Yes, apply all critical + important fixes — pipeline proceeds autonomously."

**Actions**:

1. Use `AskUserQuestion` to ask:

```yaml
question: 'Would you like me to implement the recommended fixes to the task document now?'
header: 'Apply Fixes'
options:
  - label: 'Yes, apply all critical + important fixes'
    description: 'I will edit the task document to address all critical and important issues identified in the review.'
  - label: 'Yes, critical fixes only'
    description: 'I will apply only the must-fix (critical) changes to unblock implementation.'
  - label: 'No, I will fix manually'
    description: 'Skip automatic fixes. I will update the task document myself.'
```

2. **If "Yes, apply all critical + important fixes"** or **"Yes, critical fixes only"**:
   - Work through each issue in priority order (critical first, then important if selected)
   - For each fix: use the Edit tool to apply the change to the task document
   - After each fix, briefly state what was changed: `✅ Fixed: [issue title]`
   - If a fix requires information the agent doesn't have, skip it and note: `⏭ Skipped: [issue title] — requires your input`
   - After all fixes applied, summarise: `Fixes applied: [N] / Skipped (needs your input): [M]`
   - **Mark recommendations as implemented** — if a co-located report file was generated in Step 8:
     - Add `> **Implementation Status**: ✅ All [N] recommendations implemented — YYYY-MM-DD` to the report's opening summary
     - In the task file, add `**Review**: ✅ All review recommendations from \`[report-filename]\` implemented YYYY-MM-DD` immediately after the `**Status**:` line

3. **If "No, I will fix manually"**:
   - Acknowledge and proceed to Step 9
   - Remind user: "The full issue list is in the report above. Run `/review-task` again after making changes."

4. **Append a Change Log row** to the task recording the review outcome — **regardless of which option was chosen above** — and bump frontmatter `updated` to today in the same edit. Canonical format: [document-change-log.md](references/document-change-log.md). A review verdict bumps the minor version; `Author` is the skill name. Illustrative row:

   | 2026-08-12 | 1.1 | Review passed (9/10) — ready for development | review-task |

   Describe **what the review found and changed**, not that a review happened. A review that found nothing still writes a row (`Review passed (9/10) — no changes required`): the verdict is the event being recorded, not the edits. Check 4b's currency heuristic depends on this being unconditional. Skip only when `change-log.enabled: false` in `skills-config.yaml`.

   > Write this row **regardless of tracker platform** too. Step 8.6's Jira sync also appends a row on the Jira path, but that is a *sync* record, not the *review* record — and the GitHub and no-tracker paths get nothing at all without this step. This is the write that makes the local file the authoritative history the [tracker card contract](references/tracker-card-summary.md) already claims it is.

**Output**: Task document with fixes applied (if user chose to apply), or unchanged (if user declined) — and in both cases a Change Log row recording the review verdict.

---

### Step 8.6: Push Body Changes to Jira (when `TRACKER=jira` and fixes were applied)

**Purpose**: When Step 8.5 applied any Edit to the task body, the local body hash will diverge from `jira_last_body_hash` and the Jira description must be re-rendered. Execute the bundled `sync-jira-task` script directly — do NOT speculate about other paths.

**When to Execute**:
- `TRACKER=jira` (set by Step 1 resolver) AND
- At least one fix was applied in Step 8.5 OR `jira_last_body_hash` is missing/stale

**Skip when**: `TRACKER=github`, validate mode, or no body edits were made.

**Command**:

```bash
node .agents/skills/sync-jira-task/scripts/sync-jira-task.js \
  --file "$TASK_FILE_PATH" \
  --no-transition
```

> **`--no-transition` is required here, not tidiness.** This step pushes body changes only. Without the flag the sync also resolves the document's frontmatter `status:` through its own `loadStatusMap` and transitions the card, running as a second resolver after the `tracker-workflow.yaml` ladder has already placed it — in the `develop-task` pipeline this step runs at Step 2, after Step 1 signalled `work-started`, so un-flagged it walks the card back out of In Progress (bug.12). Note this step runs *before* Step 9 promotes the document, so the status it would push is the pre-promotion one — suppressing it removes a stale write, not a needed one. The ladder remains the single authority on the card's position.

> **Path note**: the script is bundled with the skill at `.agents/skills/sync-jira-task/scripts/sync-jira-task.js` (installed by `setup-consumer.sh`). Do **NOT** look for `.scripts/jira-sync*.js` in the consumer repo root — that path does not exist. Do **NOT** hand-craft a REST PUT, and do **NOT** leave `jira_last_body_hash` stale.

On success → `sync-jira-task` updates the Jira description, refreshes `jira_last_body_hash` in frontmatter, and appends a Change Log entry. Confirm: `✅ Pushed body update to Jira {jira_key}`.

On non-zero exit → log warning `⚠️ sync-jira-task failed — Jira description may be stale` and continue to Step 9 (do not halt).

---

### Step 9: Update Document Status (if applicable)

**Purpose**: Update the task document status after review and fixes are complete

**CRITICAL**: This step ensures that once a task has been reviewed and improved, its status reflects readiness for development.

**Pipeline note**: When invoked by the `develop-task` orchestrator and the current status needs updating, skip the `AskUserQuestion` and auto-answer **"Yes, fixes complete"** — the pipeline needs the task promoted to `Ready for Development` before `/develop` runs in Step 3. Log in Decisions Log: "review-task Step 9 auto-answered: Yes, fixes complete — pipeline proceeds autonomously." If the review outcome is NEEDS REVISION or REQUIRES REWORK and fixes applied in Step 8.5 were insufficient, do NOT skip — HALT the pipeline and surface the review findings to the user; the task is not ready for development.

**When to Execute This Step**:

- After Step 8.5 (offer to implement fixes) is complete
- Only if current status indicates document is not yet ready (e.g., "Draft", "Planned", "Not Started")

**Actions**:

1. **Check Current Document Status**:
   - Read the `Status:` field from task document metadata
   - If status is already "Ready for Development" or "In Progress", skip this step
   - If status is "Draft", "Planned", "Not Started", or similar, proceed

1a. **Sign-off gate** (only when `sign-off.enabled: true` AND `sign-off.enforcement: blocking`):

   If any required sign-off row is unsigned (Step 2, check 4a), do **NOT** promote the status — regardless of the review outcome, and including the pipeline auto-answer path above. Leave it at `planned` and tell the user:

   > "Task is technically ready but unsigned. Awaiting: **{roles}**. Status stays 'Planned' until a stakeholder types their name in the Stakeholder Sign-off table and commits the change. `develop-task` will HALT at Step 2 until then."

   This is the mechanism that actually blocks the pipeline: `develop-task` gates on the `Status:` field, not on the review outcome. Under `advisory` enforcement this gate does not apply — promote normally and let the Important issue stand in the report.

2. **Ask User About Fixes**:

   Use `AskUserQuestion` to determine if fixes have been completed:

   ```yaml
   question: "Have you completed the recommended fixes from the review?"
   header: "Fixes Done"
   options:
     - label: "Yes, fixes complete"
       description: "I've addressed all critical/important issues. Task is now ready for development."
     - label: "Partially complete"
       description: "I've addressed some issues but more work is needed before development."
     - label: "Not yet"
       description: "I haven't made changes yet. I'll update the document later."
   ```

3. **Update Status Based on User Response**:

   **If "Yes, fixes complete"**:
   - Update task document `Status:` field to "Ready for Development"
   - **Append a Change Log row** recording the transition, and bump frontmatter `updated` in the same edit. Format: [document-change-log.md](references/document-change-log.md). A status transition leaves `Version` blank — only the Step 8.5 verdict row bumps it:

     | 2026-08-12 |  | Status → ready-for-development | review-task |

     This row is **separate from the Step 8.5 verdict row** and both may appear. A review can pass without promoting — the sign-off gate below can withhold the promotion — so the log needs to show which of the two actually happened. Skip when `change-log.enabled: false`.
   - Confirm update to user: "Task status updated to 'Ready for Development'. You can now run `/develop` to begin implementation."

   **If "Partially complete"**:
   - Keep status as "Draft" or "Planned" or current value
   - Inform user: "Task status remains '[current status]'. Run `/review-task` again when ready."

   **If "Not yet"**:
   - Keep status unchanged
   - Inform user: "Task status unchanged. Update the document and run `/review-task` again when fixes are complete."

4. **Status Update Implementation**:

   When updating status, use Edit tool:

   ```yaml
   file_path: [task-file-path]
   old_string: "**Status:** Planned"
   new_string: "**Status:** Ready for Development"
   ```

**Status Transition Rules**:

- `Draft` → `Ready for Development` (after successful review and fixes)
- `Planned` → `Ready for Development` (after successful review and fixes)
- `Not Started` → `Ready for Development` (after successful review and fixes)
- `Draft` → `Draft` (if fixes incomplete)
- `Planned` → `Planned` (if fixes incomplete)
- Any other status → No change (respect existing workflow state)

**Output**: Task document with updated status field (if applicable)

**Example Flow**:

```
Initial Review: Task status is "Planned"
↓
Review Completed: Issues identified, recommendations provided
↓
User Makes Fixes: Addresses critical and important issues
↓
Step 9 Executes: Asks "Have you completed fixes?"
↓
User Selects: "Yes, fixes complete"
↓
Status Updated: "Planned" → "Ready for Development"
↓
User Can Now: Run `/develop` to begin implementation
```

---

### Step 10: Post Tracker Comment (graceful — non-blocking)

**Purpose**: Notify the linked tracker issue (Jira or GitHub) that a review has been completed, with the outcome, key findings, and a summary of any changes made to the task document.

**When to Execute**: Always — after Step 9 completes (regardless of review outcome or status update decision).

> **MUST execute — not gated by manual-sync user memories.** This auto-post is part of the review workflow itself. The `/create-*` skills' "Jira sync is manual only" rule (if present in user memory, e.g. `feedback_jira_sync_manual_only.md`) applies **only to `/create-epic`, `/create-story`, `/create-task`** — it does NOT apply to `/review-story`, `/review-task`, `/develop-story`, or `/develop-task`. These skills always auto-post review/PR/finalise outcomes to the linked tracker (GitHub or Jira/Bitbucket), symmetric across platforms. Skipping this step on the basis of a manual-sync memory and deferring to `/sync-jira-task` is a misapplication of that rule.

**Detection**: use `TRACKER` already set by the resolver (sourced in Step 5). When `TRACKER=jira` → Jira path; when `TRACKER=github` → GitHub path. See `references/platform-detection.md`.

**Collect context from previous steps** (both paths):

- `SCORE` — readiness score from Step 8
- `RECOMMENDATION` — READY TO IMPLEMENT | NEEDS REVISION | REQUIRES REWORK
- `CRITICAL`, `IMPORTANT`, `OPTIONAL` — issue counts from Step 8
- `REVIEW_FILE` — path to `.review.md` if saved, or `"Action plan only — no file saved"`
- `FIXES_APPLIED` — list of fix titles applied in Step 8.5, or empty string if user declined
- `FIXES_SKIPPED` — list of skipped fix titles from Step 8.5, or empty string
- `STATUS_CHANGE` — transition string (e.g. `"Planned → Ready for Development"`), or empty string

**Build `CHANGES_SECTION`** (shared by both paths):

```bash
CHANGES_SECTION=""

if [ -n "$FIXES_APPLIED" ] || [ -n "$FIXES_SKIPPED" ] || [ -n "$STATUS_CHANGE" ]; then
  CHANGES_SECTION="

### Changes Made to Task Document
"
  [ -n "$FIXES_APPLIED" ]  && CHANGES_SECTION+="
**Fixes applied:**
${FIXES_APPLIED}"
  [ -n "$FIXES_SKIPPED" ]  && CHANGES_SECTION+="

**Skipped (needs manual input):**
${FIXES_SKIPPED}"
  [ -n "$STATUS_CHANGE" ]  && CHANGES_SECTION+="

**Status updated**: ${STATUS_CHANGE}"
fi
```

---

**Jira path** (when `TRACKER=jira`):

1. Read `jira_key` from task frontmatter (already loaded in Step 1). If absent or `null`, skip this step silently.

2. Post the comment through the CLI:

   ```bash
   # Terminator at COLUMN 0 — an indented terminator does not close an unquoted
   # heredoc, and bash would swallow the invocation below into the comment body.
   # Body lines are unindented for the same reason: leading spaces would be
   # written into the comment verbatim.
   mkdir -p .claude/state
   cat > .claude/state/comment-body.md <<EOF
## Task Review Complete

**Recommendation**: ${RECOMMENDATION}
**Readiness Score**: ${SCORE}/10

| Severity | Count |
|---|---|
| Critical 🚨 | ${CRITICAL} |
| Important ⚠️ | ${IMPORTANT} |
| Optional 💡 | ${OPTIONAL} |

**Review artifact**: \`${REVIEW_FILE}\`
${CHANGES_SECTION}
EOF

   node .agents/skills/review-task/references/tracker-comment.js \
     --issue "{jira_key from frontmatter}" --body-file .claude/state/comment-body.md \
     --stage review-task \
     --slot outcome="{plain-language outcome — see the GitHub arm's note}" \
     --slot blocking="${CRITICAL}" \
     --json
   ```

> Engine source: `references/tracker-comment.js` (bundled into each skill as `references/tracker-comment.js`). Contract: `references/tracker-comment-contract.md`.


   Read `reason` and act per [`references/tracker-comment-contract.md`](references/tracker-comment-contract.md) — only `no-credentials` may fall back to the Atlassian MCP tool.

   > **This site used to be a raw `curl` against REST v2** with a plain-string
   > body — the only comment site in the repository that did, and invisible to
   > both interception layers because it went through neither `http()` nor `gh`.
   > It now renders as **v3 ADF** like every other comment, so the rendered
   > result differs: headings and tables become real ADF nodes instead of raw
   > markdown characters. That is the improvement, and it is why this was a
   > behaviour change rather than a mechanical swap.

3. On success → confirm: "✅ Review summary posted to Jira issue ${TASK_KEY}."
4. On failure → report error but do NOT halt.

**Output** (Jira path): Jira issue updated with review outcome comment (if `jira_key` present in frontmatter).

---

**GitHub path** (when `TRACKER=github`):

1. **Retrieve `github_issue`** from the task document YAML frontmatter. If absent, skip this step silently.

2. **Ensure issue is on the project board (idempotent, graceful)**:

   ```bash
   BOARD_NUM=$(grep 'project_board_number:' project.yml | awk '{print $2}')
   OWNER=$(grep '^ *owner:' project.yml | head -1 | awk '{print $2}')
   REPO=$(gh repo view --json name -q '.name')
   source references/resolve-platform.sh || exit 1
   tracker_write gh project item-add "$BOARD_NUM" --owner "$OWNER" \
     --url "https://github.com/$OWNER/$REPO/issues/$GITHUB_ISSUE" 2>/dev/null || true
   ```

   Failure does not halt Step 10 — the `|| true` ensures the comment step always runs.

3. **Build and post the comment**:

   ```bash
   GITHUB_ISSUE={github_issue from frontmatter}

   # The heredoc terminator sits at COLUMN 0 even though this block is indented
   # inside a numbered list — an indented terminator does not close an unquoted
   # heredoc, and bash would swallow the invocation below into the body.
   # The body lines are unindented for the same reason: leading spaces would be
   # written into the comment verbatim.
   mkdir -p .claude/state
   cat > .claude/state/comment-body.md <<EOF
## Task Review Complete

**Recommendation**: ${RECOMMENDATION}
**Readiness Score**: ${SCORE}/10

| Severity | Count |
|----------|-------|
| Critical 🚨 | ${CRITICAL} |
| Important ⚠️ | ${IMPORTANT} |
| Optional 💡 | ${OPTIONAL} |

**Review artifact**: \`${REVIEW_FILE}\`
${CHANGES_SECTION}
EOF

   node references/tracker-comment.js --issue "$GITHUB_ISSUE" \
     --body-file .claude/state/comment-body.md --stage review-task \
     --slot outcome="{plain-language outcome — see below}" \
     --slot blocking="${CRITICAL}" \
     --json \
     || echo "⚠️  GitHub issue comment failed — continuing"
   ```

   This is the same call the Jira path above makes — `tracker-comment.js` resolves
   `TRACKER` itself, so the two branches differ only in the issue identifier.

   > **`review-task` reads `outcome` and `blocking`, and both arms pass the same values** — the lead is
   > a property of the moment, not of the tracker.
   >
   > `outcome` is a **text** slot interpolated verbatim into "— the result was …", so do **not** pass
   > `${RECOMMENDATION}` raw. `READY TO IMPLEMENT`, `NEEDS REVISION` and `REQUIRES REWORK` are internal
   > vocabulary, and [`references/stakeholder-summary.md`](references/stakeholder-summary.md) requires
   > internal tokens to be mapped rather than passed through. Map at the call site:
   >
   > | Recommendation | `outcome` value |
   > | :--- | :--- |
   > | `READY TO IMPLEMENT` | `ready to build` |
   > | `NEEDS REVISION` | `needs more detail` |
   > | `REQUIRES REWORK` | `needs rework` |
   >
   > `blocking` is a **boolean** slot whose two renderings are opposites, so a wrong value says the
   > wrong thing rather than saying nothing. `${CRITICAL}` is safe: the engine reads `"0"` as *absent*,
   > which renders "Nothing is blocking the work from starting".
   >
   > The readiness score stays in the body — a number on an unexplained scale is what the standard
   > forbids in a lead.
   Always `--body-file`: the body carries backticks and newlines.

4. **Verify**: read `reason` from the JSON and act per [`references/tracker-comment-contract.md`](references/tracker-comment-contract.md). On `posted`, confirm: "✅ Review summary posted to GitHub issue #${GITHUB_ISSUE}." If it fails, report the error but do NOT halt the skill.

**Output** (GitHub path): GitHub issue updated with review outcome comment and added to the project board (if `github_issue` present in frontmatter).

---

## Review Depth Modes

### Quick Review (10-20 minutes)

- Focus on critical issues only
- Template compliance
- Major hallucinations
- High-level completeness check

**Use when**: Quick sanity check, time-constrained

### Standard Review (30-45 minutes) - DEFAULT

- All steps fully executed
- Comprehensive issue detection
- Actionable recommendations
- Full report generation

**Use when**: Normal pre-implementation review, quality gate

### Thorough Review (45-60+ minutes)

- All steps with deep analysis
- Cross-reference verification (actually check all sources)
- Detailed implementation review
- Comprehensive recommendations with examples

**Use when**: Critical task, high risk, complex changes, quality audit

---

## Success Criteria

Review is successfully completed when:

✅ All steps (0-10) systematically executed according to review depth
✅ Issues categorized by severity (critical/important/optional)
✅ Hallucinations identified and documented
✅ Gaps and inconsistencies flagged with specific locations
✅ Actionable recommendations provided (based on user decisions)
✅ Implementation readiness score calculated
✅ Clear GO/NO-GO recommendation made
✅ Comprehensive review report generated and saved (if applicable)
✅ Document status updated to reflect readiness (if fixes completed)
✅ Tracker comment posted with review outcome (Step 10 — graceful: skipped if tracker key absent from frontmatter)

---

## Anti-Hallucination Protocol

This skill implements rigorous safeguards to DETECT hallucinations:

### Detection Rules

1. **Technology Verification**: Every library/framework MUST be in tech stack
2. **Path Verification**: All file paths MUST match project structure
3. **Pattern Verification**: Code patterns MUST match architecture standards
4. **API Verification**: Endpoints MUST match documented APIs
5. **Schema Verification**: Database fields MUST exist in Prisma schema

### Reporting Hallucinations

When hallucination detected:

```markdown
#### Critical (Hallucination)

- **[Category]**: [Specific invented detail]
  - **Location:** Phase [X], [Section]
  - **Issue:** Task claims [X] but this is not documented in [source]
  - **Evidence:** [What verification check revealed]
  - **Recommendation:** [Specific fix based on user decision]
```

---

## Common Use Cases

### 1. Pre-Implementation Review

"Before starting task 50, review it for issues"

- Ensures task is ready for development
- Catches problems before they become code issues

### 2. Quality Audit

"Review all tasks in the testing category"

- Ensures consistency across related tasks
- Validates standard adherence

### 3. Post-Mortem Analysis

"Task 42 went off-track. Why?"

- Analyzes task gaps that led to issues
- Identifies missing or unclear requirements

### 4. Architecture Validation

"New architecture standards published. Review task 55"

- Verifies task accuracy against new standards
- Ensures compliance with updated patterns

---

## Resources

This skill uses:

- `resources/task-template.md` - Task template for structure validation
- Architecture documents - For technical accuracy verification

---

## Notes

- The review report (`task.{n}.review.{N}.{descriptive-name}.md`) is the primary output and is always saved separately. Use DOTS as structural separators and hyphens within the descriptive name. `{N}` starts at 1 and increments on re-reviews. Example: `task.29.review.1.subagent-triage.md`, `task.29.review.2.subagent-triage.md`.
- Steps 8.5 and 9 may modify the task document (apply fixes; update `Status:` field) — both are gated on user consent (or pipeline auto-answer)
- Can be used at any stage: planned, in progress, completed
- Designed to find problems through collaborative user input
- Questions are batched for efficient clarification
