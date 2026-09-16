---
name: develop
description: Provides guidance for implementing features and technical tasks. Use when starting new feature work, implementing stories, executing technical tasks, or needing guidance on development patterns. Covers task planning, platform separation, testing, and documentation standards. Includes story-driven development workflow with quality gates and comprehensive validation.
invokes: [qa-planning]
---

> **Status lifecycle**: see [`references/document-status-lifecycle.md`](references/document-status-lifecycle.md)

# Develop

## When to Use This Skill

Use this skill when:

- Implementing user stories from `{epic-directory}/stories/` (co-located inside epic dirs, e.g. `${PRD_ROOT}/<domain>/<feature>/epics/epic.{N}.<name>/stories/`)
- Executing technical tasks from `docs/tasks/`
- Starting new feature development
- Need guidance on development workflow
- Working through task sequences with tests
- Preparing code for review

## Input Handling

**Flexible Invocation:**

You can invoke this skill with:

- **A specific story file**: `story.178.8.example-feature.md`
- **A story directory**: `stories/story.178.8.example-feature/`
- **A specific task file**: `task.1.cache-lib-simplification.md`
- **A task directory**: `docs/tasks/task.1.cache-lib-simplification/`
- **An epic file**: `epic.178.feature-management.md` (triggers creation workflow)

**File Type Detection:**

1. **Epic File Detection** - Matches pattern: `epic.{number}.{name}.md`
   - If detected: Invoke epic handling workflow (see Epic File Handling section)

2. **Story File Detection** - Matches pattern: `story.{epic}.{story}.{name}.md`
   - Location: co-located within epic directories (`${PRD_ROOT}/<domain>/<feature>/epics/epic.{N}.<name>/stories/`) or as provided by the caller
   - Exclude files containing: `.qa.`, `.gate.`, or `.bug.`

3. **Task File Detection** - Matches pattern: `task.{id}.{name}.md`
   - Location: `docs/tasks/task.{id}.{name}/task.{id}.{name}.md` (each task has its own subdirectory)
   - Exclude files containing: `.qa.`, `.gate.`, or `.bug.`

**Directory Discovery Logic:**

When given a directory path:

1. List all files in the directory
2. Detect file type using patterns above
3. If story file found, load it and proceed with story workflow
4. If task file found, load it and proceed with task workflow
5. If multiple files found, use the one matching the directory name
6. If no valid file found, HALT and ask user for the correct path

**Examples:**

```
Input: stories/story.178.8.example-feature/
Discovers: story.178.8.example-feature.md
Type: Story File → Use Story Workflow

Input: docs/tasks/task.1.cache-lib-simplification/
Discovers: task.1.cache-lib-simplification.md
Type: Task File → Use Task Workflow

Input: epic.178.feature-management.md
Type: Epic File → Trigger Epic Handling Workflow
```

## Epic File Handling

**CRITICAL**: Epic files cannot be developed directly. Only stories and tasks can be implemented.

When an epic file is provided as input:

1. **Detect Epic File** - Match pattern: `epic.{number}.{name}.md`

2. **Warn User** - Display clear message:

   ```
   ⚠️  EPIC FILE DETECTED

   Epic files cannot be developed directly. You must create individual
   stories or tasks from this epic first.

   Epic: epic.{number}.{name}.md
   Location: {file_path}
   ```

3. **Offer Creation Options** - Use AskUserQuestion with these choices:

   **Question**: "What would you like to create from this epic?"

   **Options**:
   - **Create Story** - "Create a new story from this epic using /create-story skill"
     - Description: "Generate a comprehensive user story with acceptance criteria, dev notes, and tasks"

   - **Create Task** - "Create a new technical task from this epic using /create-task skill"
     - Description: "Generate a technical task document for refactoring, infrastructure, or technical improvements"

   - **Cancel** - "I'll specify a story or task file directly"
     - Description: "Exit and let me provide the correct story/task file path"

4. **Execute User Choice**:
   - **If "Create Story"**: Invoke `/create-story` skill
   - **If "Create Task"**: Invoke `/create-task` skill
   - **If "Cancel"**: HALT and prompt user for story/task file path

**Example Flow:**

```
User Input: /develop epic.178.feature-management.md

System Detection: Epic file detected (matches pattern epic.178.*)

System Warning:
⚠️  EPIC FILE DETECTED
Epic files cannot be developed directly. You must create individual
stories or tasks from this epic first.

Epic: epic.178.feature-management.md
Location: ${PRD_ROOT}/ui-domain/module-name/epics/epic.178.feature-management/epic.178.feature-management.md

System Prompt: [Displays AskUserQuestion with 3 options]

User Selection: "Create Story"

System Action: Invokes /create-story skill
→ Proceeds to create story.178.1.{name}.md
→ Story ready for development via /develop
```

## Caller Detection

Before any other workflow action, detect whether `/develop` is running standalone or orchestrated by `/develop-story` / `/develop-task`. The signal is the pipeline lock file written by the orchestrator at the end of its Step 1:

```bash
if [ -f .claude/state/develop-pipeline.lock ]; then
  CALLER_MODE=orchestrated   # called from develop-story or develop-task
else
  CALLER_MODE=standalone
fi
```

**Behavioural branches:**

| Concern                                                 | `standalone` (default) | `orchestrated`                                                           |
| ------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| Resume prompts to user                                  | shown                  | **skipped** — orchestrator owns resume                                   |
| Own implementation report                               | written/updated        | **not written** — orchestrator's report is canonical                     |
| Lock file lifecycle                                     | not touched            | **read-only** — never write/update/remove the lock; orchestrator owns it |
| Status validation, Risk Level Check, alignment analysis | run as documented      | run as documented                                                        |
| Calling `/finalise`                                     | per existing flow      | **never** — pipeline Step 7 handles it (see Pipeline bypass check)       |

**Rules:**

- `/develop` must never write, update, or delete `.claude/state/develop-pipeline.lock`. The lock's lifecycle is owned by the orchestrator (created in its Step 1, mutated as it advances steps, removed before terminal HALT).
- Read-only check; no race risk.
- If the lock exists but its `branch` field does not match the current git branch, log a warning ("Stale pipeline lock detected — branch mismatch; treating as standalone") and fall back to `CALLER_MODE=standalone`. This protects against an abandoned lock from a previous run.
- Lock schema: see `references/develop-pipeline-pause.md`.

## Caller-Supplied Context

When invoked by an orchestrator (`develop-story`, `develop-task`, or any future orchestrator), the caller may prepend structured context to the invocation prompt. Treat this context as authoritative for the current run — do not re-run Explore or re-read the listed files independently.

**Supported context types (all optional):**

| Type                        | Format                                                                                                       | Effect                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pre-develop surface map** | Compact list of file paths + 1-line descriptions (max 20 files) generated by an Explore subagent             | Skip the Explore-based file discovery in Implementation Alignment Analysis — use the supplied map instead                                                     |
| **Plan file path**          | `task.{id}.plan.*.md` or `story.{epic}.{story}.plan.*.md` included as context                                | Treat as authoritative implementation detail (code snippets, signatures, exact changes) that supplements the document's own Tasks/Implementation Plan section |
| **Iteration hint**          | Plain text: `"Resuming from partial completion — see [story/task] checkboxes for completed [tasks/phases]."` | Skip completed checkboxes and start from the first unchecked item                                                                                             |

**Contract rule:** If the caller prepends one of the above, `/develop` must honour it and must NOT re-derive the same information (no second Explore call, no re-read of already-summarised files, no fresh checkbox scan when an iteration hint is present). This keeps context lean across the full pipeline run and is the attach point for any future orchestrator that builds on this interface.

## Document Status Validation

**CRITICAL**: After detecting a valid story or task file, you MUST check the document status before beginning development.

### Status Check Procedure

1. **Read the Document Status Field**:
   - For stories: Check the `Status:` field in the story frontmatter
   - For tasks: Check the `Status:` field in the task metadata

2. **Validate Status** (allowed values):
   - ✅ **Ready for Development** - Proceed with implementation
   - ✅ **In Progress** - Resume implementation
   - ✅ **Ready for Review** - Skip to review process
   - ⚠️ **Draft** - HALT and validate readiness (see Draft Status Handling below)

### Draft Status Handling

**Pipeline bypass**: When `/develop` is invoked by the `develop-story` or `develop-task` orchestrator, the `/review-story` or `/review-task` skill has already run in Step 2 of the pipeline and validated the document. If called from either orchestrator, treat any Draft (story) or Planned (task) status as already validated — automatically select "Yes, ready to implement" and proceed without prompting the user. The orchestrator handles this autonomously.

**When Status is "Draft"**:

1. **Display Warning**:

   ```
   ⚠️  DRAFT DOCUMENT DETECTED

   This document has "draft" status and may not be ready for development.

   Document: [story/task file name]
   Status: Draft
   Location: [file path]
   ```

2. **Ask Clarifying Questions** - Use AskUserQuestion to validate readiness:

   **Question**: "Is this document ready for development?"

   **Options**:
   - **Yes, ready to implement** - "The requirements are clear and complete"
     - Description: "Begin implementation even though status is draft"

   - **No, needs review** - "Requirements need clarification or updates"
     - Description: "Use /review-story or /review-task to update document before development"

   - **Let me update it manually** - "I'll update the document myself"
     - Description: "Exit and let me manually edit the document first"

3. **Execute User Choice**:

   **If "Yes, ready to implement"**:
   - Update document status to "In Progress"
   - Proceed with normal development workflow
   - Continue to "Core Development Principles" section

   **If "No, needs review"**:
   - Determine document type (story vs task)
   - If story: Invoke `/review-story` skill with the story file path
   - If task: Invoke `/review-task` skill with the task file path
   - After review completes, ask user if ready to proceed with `/develop`

   **If "Let me update it manually"**:
   - HALT and display message:
     ```
     Development paused. Please update the document and run /develop again when ready.
     ```
   - Exit skill

### Example Flow

```
User Input: /develop story.178.8.example-feature.md

System Detection: Story file detected
System Status Check: Status field shows "draft"

System Warning:
⚠️  DRAFT DOCUMENT DETECTED
This document has "draft" status and may not be ready for development.

Document: story.178.8.example-feature.md
Status: draft
Location: ${PRD_ROOT}/<domain>/<feature>/epics/epic.178.<name>/stories/story.178.8.example-feature/

System Prompt: [Displays AskUserQuestion with 3 options]

User Selection: "No, needs review"

System Action: Invokes /review-story skill
→ Interactive review identifies gaps and inconsistencies
→ Document updated to "ready for development" status
→ User can now run /develop to begin implementation
```

## Risk Level Check

**CRITICAL**: After document status validation passes and before implementation analysis, check the story frontmatter for a `risk_level` field.

### Risk Level Check Procedure

1. **Read `risk_level` from story frontmatter**:
   - `risk_level: high` → Gate applies (see below)
   - `risk_level: medium` / `risk_level: low` / field absent → silently continue to Implementation Alignment Analysis

2. **When `risk_level: high`**:

   Display warning:

   ```
   ⚠️  HIGH RISK STORY DETECTED

   This story is flagged as high risk (auth, payments, cryptographic operations, encryption, or external APIs).
   Running /qa-planning before development is strongly recommended to catch architecture or
   security issues before code is written — when they are cheapest to fix.

   Story: [story file name]
   Risk Level: high
   ```

   Ask user how to proceed using AskUserQuestion:

   **Question**: "This is a high-risk story. Would you like to run `/qa-planning` first?"

   **Options**:
   - **Run `/qa-planning` now** — "Recommended. Identify risks and design test strategy before writing code."
     - Description: "Generates risk matrix and test design document. Returns here when done."
   - **Skip, I've already planned** — "I've already assessed risks or this is a re-run."
     - Description: "Acknowledge the risk and proceed directly to implementation."
   - **Skip, low actual risk** — "The `risk_level: high` tag is overstated for this change."
     - Description: "Proceed without planning. Consider updating the story's risk_level."

3. **Execute User Choice**:

   **If "Run `/qa-planning` now"**:
   - Invoke `/qa-planning` skill with the current story context
   - After `/qa-planning` completes, return to this skill and continue to Implementation Alignment Analysis

   **If "Skip, I've already planned"** or **"Skip, low actual risk"**:
   - Log acknowledgement in Dev Agent Record under a "Risk Acknowledgement" note
   - Continue to Implementation Alignment Analysis

### Example Flow

```
User Input: /develop story.312.1.user-authentication.md

System Detection: Story file detected
System Status Check: Status shows "Ready for Development"
System Risk Check: risk_level = high

System Warning:
⚠️  HIGH RISK STORY DETECTED
Story: story.312.1.user-authentication.md
Risk Level: high

System Prompt: [Displays AskUserQuestion with 3 options]

User Selection: "Run /qa-planning now"

System Action: Invokes /qa-planning skill
→ Risk matrix generated, test design document created
→ Returns to /develop
→ Continues to Implementation Alignment Analysis
```

---

## Implementation Alignment Analysis

**CRITICAL**: After document status validation and risk level check pass, you MUST check if an implementation already exists and analyze alignment with the story/task document.

### Alignment Check Procedure

1. **Identify Target Files (using Explore subagent):**
   - Use the Agent tool with subagent_type="Explore" to discover files relevant to this story/task. Ask it to:
     - Find all files referenced in the story's Acceptance Criteria, Dev Notes, and Tasks sections
     - Find existing implementations in the same module/layer that may overlap
     - Return: file path + 1-line description per file (max 25 files)
   - Use the returned summary to decide what to read — do NOT load all discovered files into the main context
   - Only Read() the 3-5 files that most directly affect alignment assessment
   - After completing alignment assessment, write a 3-line summary of findings and release the discovered file list from active context before proceeding to implementation

2. **Analyze Existing Implementation** (if files exist):
   - Read the existing implementation code
   - Compare implementation details against the story/task requirements:
     - Does the code match the specified behavior?
     - Are the acceptance criteria already met?
     - Does the architecture align with the design notes?
     - Are there conflicting patterns or approaches?

3. **Determine Alignment Status**:
   - ✅ **Fully Aligned** - Implementation matches document requirements
   - ⚠️ **Partially Aligned** - Some aspects match, others don't
   - ❌ **Misaligned** - Implementation contradicts document requirements
   - 🆕 **No Implementation** - No existing code found (greenfield)

### Handling Misalignment

**When Status is "Partially Aligned" or "Misaligned"**:

1. **Document the Discrepancies**:
   - List specific differences between code and document
   - Identify which is more correct/appropriate
   - Consider business logic, user needs, and technical feasibility

2. **Ask User for Direction** - Use AskUserQuestion:

   **Question**: "Found existing implementation that differs from the story/task document. How should we proceed?"

   **Options**:
   - **Align code to document** - "Update implementation to match current requirements"
     - Description: "The document represents the source of truth; modify code to match specifications"

   - **Align document to code** - "Update document to reflect actual implementation"
     - Description: "The existing implementation is correct; update document to match reality"

   - **Hybrid approach** - "Partially update both for optimal solution"
     - Description: "Take best aspects from both; update code and document together"

   - **Let me decide manually** - "I'll review and provide specific direction"
     - Description: "Pause development while I analyze the discrepancies myself"

3. **Execute User Choice**:

   **If "Align code to document"**:
   - Treat existing code as legacy/incorrect implementation
   - Proceed with normal development workflow
   - Refactor/replace existing code to match document specifications
   - Update Dev Agent Record to note alignment changes made
   - Continue to "Core Development Principles" section

   **If "Align document to code"**:
   - Recognize existing implementation as source of truth
   - Update the story/task document to reflect actual implementation:
     - Modify requirements to match current behavior
     - Update acceptance criteria to reflect what exists
     - Adjust dev notes to describe actual architecture
   - Mark tasks as completed if implementation already satisfies them
   - Update Dev Agent Record to note documentation alignment
   - If all tasks already complete, proceed to completion process

   **If "Hybrid approach"**:
   - Collaborate with user to determine optimal path
   - Update both code and document sections as needed
   - Document the rationale for hybrid decisions
   - Proceed with modified implementation plan
   - Continue to "Core Development Principles" section

   **If "Let me decide manually"**:
   - HALT and display alignment analysis:

     ```
     Implementation alignment analysis paused.

     Discrepancies found:
     [List specific differences between code and document]

     Please review and provide specific direction for:
     - Which aspects of code should change
     - Which aspects of document should update
     - Any hybrid approaches to consider
     ```

   - Exit skill

### Example Flow

```
User Input: /develop story.310.5.socketio-real-time-delivery.md

System Detection: Story file detected
System Status Check: Status shows "Ready for Development"
System Implementation Check: Found existing WebSocket implementation

System Analysis:
- Story specifies Socket.IO for real-time delivery
- Existing code uses native WebSocket API
- Implementation patterns differ significantly

System Warning:
⚠️  IMPLEMENTATION ALIGNMENT ISSUE

Existing implementation found that differs from story requirements.

Story Requirements:
- Use Socket.IO library for real-time communication
- Implement Socket.IO event handlers
- Support automatic reconnection with exponential backoff

Current Implementation:
- Uses native WebSocket API (new WebSocket())
- Custom event handling with message parsing
- Manual reconnection logic

System Prompt: [Displays AskUserQuestion with 4 options]

User Selection: "Align code to document"

System Action:
→ Marks existing websocket-service.ts for refactoring
→ Proceeds with Socket.IO migration as specified in story
→ Updates Dev Agent Record with alignment decision
→ Continues with normal development workflow
```

### Alignment for Greenfield Implementation

**When Status is "No Implementation"** (greenfield):

- No alignment check needed
- Proceed directly to "Core Development Principles" section
- Begin implementation following story/task specifications

## Core Development Principles

### Story-Driven Development

**Key Rule**: Stories contain ALL information needed for implementation. Load only:

- The assigned story file
- Always-loaded files (coding standards, tech stack, source tree)
- Never load PRD/architecture/other docs unless explicitly directed in story notes

**Authorized Story Updates** (CRITICAL):
You may ONLY update these story file sections:

- Tasks / Subtasks Checkboxes
- Dev Agent Record (all subsections)
- Debug Log References
- Completion Notes List
- File List (all added/modified/deleted files)
- Change Log
- Status

**DO NOT modify**: Story content, Acceptance Criteria, Dev Notes, Testing sections, or any other sections.

**Dev Agent Record Documentation Requirements**:

As you implement each task, continuously update these Dev Agent Record sections:

1. **Implementation Summary** - High-level overview of what was accomplished
2. **Start Date** - Date work began (YYYY-MM-DD format)
3. **Completion Date** - Date work finished (populated at completion)
4. **Implementation Approach** - Detailed breakdown:
   - Architecture decisions and patterns used
   - Technical details (algorithms, data structures, workflows)
   - Integration points and dependencies
   - Key implementation challenges and solutions
5. **Testing Results** - Test coverage statistics and results
6. **File List** - All files created/modified/deleted (continuously updated)
7. **Change Log** - Chronological log of changes with dates
8. **Deferred Work** - Items planned but not completed (if applicable)
9. **Notes** - Additional context, decisions, or future considerations

**Why This Matters**: The Dev Agent Record serves as implementation documentation for QA, future developers, and audit purposes. It should tell the complete story of what was built and how.

### Conventions assumed

This skill works best with the following conventions in your project (adapt as needed):

- **Workspaces / monorepo** (npm workspaces, NX, pnpm, Turborepo — any)
- **Platform separation** (client/server exports for security and bundle optimization), where applicable
- **Test-first development** with co-located test files
- **Task tracking** (e.g. TodoWrite) for multi-step work
- **Comprehensive documentation** standards

## Available Workflows

### 1. Develop Story Workflow

**File Pattern**: `story.{epic}.{story}.{name}.md`
**Location**: co-located inside the epic dir: `{epic-directory}/stories/story.{epic}.{story}.{name}/story.{epic}.{story}.{name}.md` (epic-directory = `${PRD_ROOT}/<domain>/<feature>/epics/epic.{N}.<name>/`). Never a global `docs/stories/`.

**Starting Development**:

**CRITICAL**: Before implementing tasks, you MUST complete the Document Status Validation (see above).

After status validation passes:

1. Update story status to 'In Progress' if currently 'Not Started' or 'Ready for Development'
2. Update Dev Agent Record with:
   - Start Date: [YYYY-MM-DD]
3. Proceed to task implementation

**Partial resumption (when invoked by pipeline with pre-checked tasks):** Before reading the first task, count `[x]` vs `[ ]` task checkboxes. If any are already checked, log: "Resuming from partial completion: N/M tasks complete. Starting from task N+1." Skip directly to the first unchecked task.

**Order of Execution**:

```
1. Complete Document Status Validation (see Document Status Validation section above)
2. Complete Risk Level Check (see Risk Level Check section above) — gates on risk_level: high
3. Complete Implementation Alignment Analysis (see Implementation Alignment Analysis section above)
4. Set story status to 'In Progress' (if currently 'Not Started' or 'Ready for Development')
5. Before reading task: use Agent tool with subagent_type="Explore" to find files this task will touch (check task description + acceptance criteria). Get compact summary. Then Read() only the directly relevant files.
6. Read first or next task
7. Implement task and its subtasks
8. Write tests (co-located .spec.ts files)
9. Execute validations (linting + tests)
10. Only if ALL tests pass → update task checkbox with [x]
11. Document work in Dev Agent Record → Implementation Approach:
   - What you built (architecture decisions, patterns used)
   - Key technical details (algorithms, data flows)
   - Integration points and dependencies
12. Update story File List section (all new/modified/deleted files)
13. Repeat until all tasks complete
14. (Once, after ALL tasks are complete — not inside the loop) Append ONE Change Log row to the
    story's `## Change Log` section summarising the implementation, and bump frontmatter `updated`
    in the same edit:
    `| {today} |  | Implemented — {N} files, {M} tests | develop |`
    Leave `Version` blank — only `/finalise` bumps it. One row per develop run, never one per
    task: the per-task narrative already lives in the Dev Agent Record. Canonical format:
    [document-change-log.md](references/document-change-log.md).
```

**Testing Checkpoints** (Execute at these milestones):

After implementing each task:

- **Unit Tests**: Run affected unit tests to verify the specific functionality works
- **Integration Tests**: If the task touches multiple components, run integration tests
- **Check Command**: `npx nx test <project> --testPathPattern=<test-file-pattern>`
- **Expected Outcome**: All tests pass before marking task complete

After completing 2-3 related tasks:

- **Regression Check**: Run the full test suite for the affected project
- **Check Command**: `npx nx test <project>`
- **Expected Outcome**: No regressions introduced

Before marking story as "Ready for Review":

- **Full Validation Suite**: Run all tests across all affected projects
- **Check Command**: `npx nx test <project> --coverage`
- **Expected Outcome**: All tests pass with coverage targets met (80%+ overall, 95%+ for financial operations)
- **Lint Check**: `npx nx lint <project>`
- **Expected Outcome**: No linting errors

**Test Failure Handling**:

Always capture test output to a temp file — never stream raw test output to main context (logs can be 1000+ lines for jest/pytest):

```bash
ITER=<current develop loop iteration, or 1 if not in an orchestrated loop>
TEST_LOG=".claude/state/test-output-${ITER}-$(date +%s).log"
<fastGateCommand> > "$TEST_LOG" 2>&1
TEST_EXIT=$?
```

`<fastGateCommand>` is `develop.fastGateCommand` from `skills-config.yaml` — the project's cheap
CI-equivalent (formatting plus the hermetic suite), and deliberately not its slow end-to-end tier.
**`npm run ci:fast` is the suggested value, not a default that works everywhere**: a skills library
cannot know a consumer's script names, so when this skill runs inside the develop loop that loop
verifies the named script resolves before its first iteration and HALTs naming the key if it does
not. Running only the test suite here is what let a task ship a
red build on formatting alone; running the slow tier here is what would make the correct fix feel
expensive enough to be reverted. The slow tier runs once, at `develop-next`'s merge gate, via
`<qualityGateCommand>`.

On non-zero exit, dispatch the Agent tool with `subagent_type="Explore"` using the prompt from `references/test-failure-triage-prompt.md` (substitute `<log_path>` with `$TEST_LOG`). Persist the triage result per the output contract in that file. Main reads only the returned triage summary (counts + ≤10 failure bullets + `next_file` hint).

Log cleanup: `TEST_EXIT == 0` → `rm -f "$TEST_LOG"`; `TEST_EXIT != 0` → retain for post-mortem.

Three-strikes escalation (applied to the triage summary, not the raw log):

1. **First failure**: Analyse triage summary (counts, failure bullets, `next_file` hint), identify root cause, fix
2. **Second failure**: Re-examine approach using `next_file` hint; consider alternative solution
3. **Third failure**: HALT and document the blocker:
   - Triage summary from each attempt
   - Fix strategies already tried
   - Potential root causes remaining
   - Ask user for guidance or clarification

**Important**: Do not mark a task as complete if its tests are failing. Tests must pass before checking off task checkboxes.

**And a passing test is not yet evidence.** For each invariant a new test claims to
hold, revert that behaviour in the source, re-run, and confirm *that* test goes
red before restoring. A test that passes whether or not the behaviour is present
reports coverage that does not exist. Snapshot the file with `cp` first and
restore from that snapshot — never `git checkout --`, which restores committed
state and deletes the uncommitted fix along with the mutant. Procedure, the
outcomes a run can produce, and the shapes vacuity takes:
[`references/mutation-proving.md`](references/mutation-proving.md).

**Blocking Conditions** (HALT and ask user):

- Unapproved dependencies needed
- Ambiguous requirements after checking story
- 3 consecutive failures implementing or fixing something
- Missing configuration
- Failing regression tests

**Ready for Review Criteria**:

- ✅ Code matches requirements
- ✅ All validations pass
- ✅ Follows coding standards
- ✅ File List is complete

**Completion Process**:

```
1. All Tasks and Subtasks marked [x] with tests
2. Run full validation and regression suite (EXECUTE ALL TESTS)
3. Complete Dev Agent Record documentation:
   - Implementation Summary (high-level overview)
   - Implementation Approach (detailed breakdown of all tasks)
   - Testing Results (test coverage statistics: X/X tests passing)
   - Completion Date
   - Deferred Work (if any items were not completed)
4. Ensure File List is complete (all created/modified/deleted files)
5. Ensure Change Log has all dated entries
6. **Pipeline bypass check** — Before invoking `/finalise`, determine the caller:
   - **Invoked by `develop-story` orchestrator**: **SKIP `/finalise`** — the pipeline's Step 7 runs `/finalise` after QA review and after PR creation, when all artifacts are available. Calling it here (before a PR exists) would produce premature DoD files and a failed or misplaced PR comment. Go directly to step 7.
   - **Invoked directly by user (not from `develop-story`)**: **CRITICAL / BLOCKING** — Invoke the `/finalise` skill. It performs the full DoD checklist, generates the Sprint Review summary, and posts a PR comment. If `/finalise` finds gaps, address them before proceeding.
7. Set story status to 'Ready for Review'
8. **Return to caller silently** — when invoked from `develop-story` / `develop-task`, do NOT emit "Pipeline bypass: skipping /finalise", "Development complete", "Returning to pipeline orchestrator", or any similar terminal-sounding message. Return control with a minimal status only (e.g. `develop done — status: Ready for Review`). The orchestrator's Step Transition Protocol takes over immediately; verbose closing text increases the chance the orchestrator stalls under context pressure (observed regression in live-github-test).
9. HALT
```

**Story Completion Checklist — tick off each before halting:**

- [ ] All task checkboxes marked `[x]` (none left unchecked)
- [ ] Full test suite run: zero failures, coverage target met (80%+ overall, 95%+ financial)
- [ ] Lint run: zero errors
- [ ] Dev Agent Record complete: Implementation Summary, Approach, Testing Results, Completion Date, Deferred Work
- [ ] File List complete and accurate (all created/modified/deleted files)
- [ ] Change Log has dated entries for all significant changes
- [ ] **Prisma schema check**: If `apps/my-web-api/prisma/schema.prisma` was modified, a migration file exists in `prisma/migrations/` (run `cd apps/my-web-api && npx prisma migrate dev --name <name>` if not)
- [ ] **New npm packages check**: Any new runtime package added to root `package.json` is also added to `apps/my-web-api/package.json` (see CLAUDE.md "my-web-api: Runtime Dependencies")
- [ ] Story status set to `Ready for Review`
- [ ] **Pipeline bypass applied**: If invoked by `develop-story`, `/finalise` was NOT called here — pipeline Step 7 handles it

### 2. Develop Task Workflow

**File Pattern**: `task.{id}.{name}.md`
**Location**: `docs/tasks/task.{id}.{name}/task.{id}.{name}.md` (each task has its own subdirectory)

**Starting Development**:

**CRITICAL**: Before implementing task phases, you MUST complete the Document Status Validation (see above).

After status validation passes:

1. Update task status to 'In Progress' if currently 'Planned' or 'Ready for Development'
2. Update task metadata with:
   - Start Date: [YYYY-MM-DD]
3. Proceed to phase implementation

**Partial resumption (when invoked by pipeline with pre-checked phases):** Before reading the first phase, count `[x]` vs `[ ]` phase checkboxes in the Implementation Plan. If any are already checked, log: "Resuming from partial completion: N/M phases complete. Starting from phase N+1." Skip directly to the first unchecked phase.

**Order of Execution**:

```
1. Complete Document Status Validation (see Document Status Validation section above)
2. Complete Implementation Alignment Analysis (see Implementation Alignment Analysis section above)
3. Set task status to 'In Progress' (if currently 'Planned' or 'Ready for Development')
4. Read first or next implementation phase
5. Implement phase changes (update checkboxes)
6. Write tests (co-located .spec.ts files)
7. Execute validations (linting + tests)
8. Only if ALL tests pass → update phase checkboxes with [x]
9. Document work in task metadata:
   - What you built (architecture decisions, patterns used)
   - Key technical details (algorithms, data flows)
   - Integration points and dependencies
10. Update task Files Summary section (all new/modified/deleted files)
11. Repeat until all phases complete
12. (Once, after ALL phases are complete — not inside the loop) Append ONE row to the task's
    `## Change Log` section — the unnumbered section that sits after `## 11. Rollback Plan` — and
    bump frontmatter `updated` in the same edit:
    `| {today} |  | Implemented — {N} files, {M} tests | develop |`
    Leave `Version` blank — only `/finalise` bumps it. One row per develop run, never one per
    phase. If the task predates the Change Log template and has no such section, create it with
    the four canonical columns. Canonical format:
    [document-change-log.md](references/document-change-log.md).
```

**Blocking Conditions** (HALT and ask user):

- Unapproved dependencies needed
- Breaking changes not documented
- 3 consecutive failures implementing or fixing something
- Missing configuration
- Performance regression detected
- Failing regression tests

**Ready for Review Criteria**:

- ✅ Code matches technical specifications
- ✅ All validations pass
- ✅ Follows coding standards
- ✅ All success criteria met
- ✅ Files Summary is complete
- ✅ No performance regressions

**Completion Process**:

```
1. All Implementation Plan phases marked [x] with tests
2. Run full validation and regression suite (EXECUTE ALL TESTS)
3. Complete task documentation:
   - Implementation summary (high-level overview)
   - Implementation approach (detailed breakdown of all phases)
   - Testing results (test coverage statistics: X/X tests passing)
   - Completion date
   - Deferred work (if any items were not completed)
4. Validate all Success Criteria (Functional, Performance, Quality, Migration)
5. Ensure Files Summary is complete (all created/modified/deleted files)
6. Ensure change log has all dated entries
7. Update CHANGELOG.md if the task changes public-facing behaviour, modifies an API contract, or adds/removes a feature. Skip only for internal refactors with no observable external change.
8. **Pipeline bypass check** — Before invoking `/finalise`, determine the caller:
   - **Invoked by `develop-task` orchestrator**: **SKIP `/finalise`** — the pipeline's Step 7 runs `/finalise` after QA review and after PR creation, when all artifacts are available. Go directly to step 9.
   - **Invoked directly by user (not from `develop-task`)**: **CRITICAL / BLOCKING** — Invoke the `/finalise` skill. It performs the full DoD checklist and generates review artifacts. If `/finalise` finds gaps, address them before proceeding.
9. Set task status to 'Ready for Review'
10. **Return to caller silently** — when invoked from `develop-task` / `develop-story`, do NOT emit "Pipeline bypass: skipping /finalise", "Development complete", "Returning to pipeline orchestrator", or any similar terminal-sounding message. Return control with a minimal status only (e.g. `develop done — status: Ready for Review`). The orchestrator's Step Transition Protocol takes over immediately; verbose closing text increases the chance the orchestrator stalls under context pressure.
11. HALT
```

**Task Completion Checklist — tick off each before halting:**

- [ ] All implementation plan phase checkboxes marked `[x]` (none left unchecked)
- [ ] Full test suite run: zero failures, coverage targets met
- [ ] Lint run: zero errors
- [ ] All Success Criteria validated (Functional, Performance, Quality, Migration)
- [ ] Task documentation complete: Implementation Summary, Approach, Testing Results, Completion Date, Deferred Work
- [ ] Files Summary complete and accurate (all created/modified/deleted files)
- [ ] Change Log has dated entries for all significant changes
- [ ] CHANGELOG.md updated (if public behaviour/API/feature changed; skip for internal refactors only)
- [ ] **Pipeline bypass applied**: If invoked by `develop-task`, `/finalise` was NOT called here — pipeline Step 7 handles it
- [ ] Task status set to `Ready for Review`

**QA Handoff**:

When task is complete, inform user that QA can review using `qa-story` skill for:

- Technical task assessment
- Risk validation
- Breaking changes verification
- Performance benchmarking
- Quality gate creation

After QA review passes, use `finalise` skill to verify Definition of Done and mark as accepted.

### 3. Review QA Feedback

When QA provides feedback, use the `qa-fix` skill to systematically implement fixes.

### 4. Finalise Story/Task

After QA review passes and all fixes are complete, use the `finalise` skill to verify Definition of Done and mark as accepted.

### 5. Run Tests

Execute project linting and test suite:

```bash
npx nx test <project> --coverage
```

### 6. Explain (Training Mode)

Teach what and why you did in detail, as if training a junior engineer.

## Project Configuration

**Key Paths**:

- Stories: `${PRD_ROOT}/<domain>/<feature>/epics/epic.{N}.<name>/stories/` (co-located within epics)
- Tasks: `docs/tasks/`
- QA Artifacts: gate files and QA reports are **co-located** with their story/task (e.g. `{story-dir}/story.{N}.{M}.gate.{n}.{name}.yml`); `docs/qa/` is reserved for cross-cutting assessments only
- PRD: `${PRD_ROOT}/` (sharded; default `docs/prd/`, configurable)
- Architecture: `${ARCH_ROOT}/` (sharded; default `docs/architecture/`, configurable)
- Debug Log: `.ai/debug-log.md`

**Always-Loaded Files**: resolved by the `develop-task`/`develop-story` orchestrator during Phase 0c-load from `skills-config.yaml devLoadAlwaysFiles`, falling back to `coding-standards.md`, `tech-stack.md`, and `source-tree.md` if the key is absent. Files are pre-loaded and passed as caller-supplied context before `/develop` is invoked — do not re-read them independently.

**Story Directory Structure:**

Each story has its own subdirectory containing all related files:

```
${PRD_ROOT}/<domain>/<feature>/epics/epic.{N}.<name>/stories/
└── story.{epic}.{story}.{story-name}/
    ├── story.{epic}.{story}.{story-name}.md           # Story file (source of truth)
    ├── story.{epic}.{story}.qa.{number}.{descriptive-name}.md  # QA report (created by QA)
    ├── story.{epic}.{story}.gate.{number}.{descriptive-name}.yml # Quality gate (created by QA)
    ├── story.{epic}.{story}.bug.1.{description}.md    # Bug report 1 (created by QA)
    ├── story.{epic}.{story}.bug.2.{description}.md    # Bug report 2 (created by QA)
    └── ...
```

**File Naming Convention:**

- All files in a story directory share the same base: `story.{epic}.{story}`
- File type is indicated by the segment after the story ID:
  - `.qa.{number}.` = QA report
  - `.gate.{number}.` = Quality gate file
  - `.bug.{number}.` = Bug report (sequential numbering)
- Descriptive name comes last before the file extension
- Example: `story.178.8.example-feature.md`

**Developer Responsibilities:**

- Read the story file from its subdirectory
- Update only authorized sections (Tasks, Dev Agent Record, File List, Change Log, Status)
- Never modify QA-created files (QA reports, gate files)
- Update bug report files when fixing bugs (Investigation, Fix Implementation sections)

**Task Directory Structure:**

Each task has its own subdirectory containing all related files:

```
docs/tasks/
└── task.{id}.{task-name}/
    ├── task.{id}.{task-name}.md                          # Task file (source of truth)
    ├── task.{id}.qa.{number}.{descriptive-name}.md       # QA report (created by QA)
    ├── task.{id}.bug.1.{description}.md                  # Bug report 1 (created by QA)
    ├── task.{id}.bug.2.{description}.md                  # Bug report 2 (created by QA)
    └── ...
```

**Task File Naming Convention:**

- All files in a task directory share the same base: `task.{id}`
- File type is indicated by the segment after the task ID:
  - `.qa.{number}.` = QA report
  - `.bug.{number}.` = Bug report (sequential numbering)
- Quality gate files are co-located in the task directory: `task.{id}.gate.{number}.{name}.yml`
- Descriptive name comes last before the file extension
- Example: `task.1.cache-lib-simplification.md`

**Task Developer Responsibilities:**

- Read the task file from its subdirectory
- Update Implementation Plan checkboxes as phases complete
- Update Files Summary section with all new/modified/deleted files
- Update Success Criteria checkboxes when criteria are met
- Never modify QA-created files (QA reports)
- Update bug report files when fixing bugs (Investigation, Fix Implementation sections)

## Task Planning

**Use TodoWrite when**:

- Task has 3+ distinct steps
- Multiple files will be affected
- Implementation requires coordination across layers

**Skip TodoWrite when**:

- Single straightforward change
- Trivial updates (< 3 steps)
- Purely conversational tasks

Reference: See CLAUDE.md "Task Management" section for complete guidelines.

## Platform-Specific Architecture

**Key Decision**: Does this code need to run in both client (React Native/browser) and server (NestJS/Node.js)?

### Client/Server Separation Required When

- Different runtime dependencies (Node.js packages vs React Native packages)
- Security-critical operations (password hashing, JWT signing - server only)
- Different behavior by platform (file system, environment variables, device detection)

### Pattern Structure

```typescript
// Client export (React Native/Browser)
libs / my - lib / src / client.ts;

// Server export (Node.js/NestJS)
libs / my - lib / src / server.ts;

// Common utilities (both platforms)
libs / my - lib / src / index.ts;
```

**Security Rule**: Never attempt crypto operations (hashing, signing, encryption) in client code. Server handles all security-critical operations.

Reference: See CLAUDE.md "Platform-Specific Security Architecture" for complete patterns.

## Testing Approach

**Test-First Development**:

1. Read affected files to understand dependencies
2. Create test file co-located with source (`.spec.ts` suffix)
3. Implement feature
4. Run tests: `npx nx test <project> --coverage`
5. Verify tests pass before completing

**Co-location Pattern**:

```
libs/example-lib/src/lib/
├── user-service.ts
├── user-service.spec.ts        # ✅ Co-located with source
```

**Coverage Targets**:

- 80%+ overall
- 95%+ for financial operations

Reference: See CLAUDE.md "Testing & Quality Standards" for complete testing patterns.

## Documentation Standards

**When to Document**:

- User-facing features → Use PRD/Epic/Story templates in `docs/templates/`
- Technical improvements → Use Technical Task documents or development-todos.md
- Bug fixes → Use GitHub Issues

**File Naming**:

- Epics: `epic.[number].[name].md`
- Stories: `story.[epic].[story].[name].md`
- Use dots (.) for structural separators, hyphens (-) within descriptive names

Reference: See CLAUDE.md "Documentation Standards" and `docs/templates/README.md`

## Library Creation

**When to Create New Library**:

- Shared functionality across multiple apps
- Distinct business domain
- Reusable utilities

**Create Using NX Generator**:

```bash
npx nx generate @nx/react-native:library {lib-name} \
  --directory=libs/{lib-name} \
  --linter=eslint \
  --unitTestRunner=jest
```

**Post-Creation**:

- Configure client/server exports if needed
- Add to namespace: `@your-org/{lib-name}`
- Create corresponding test files

Reference: See CLAUDE.md "Creating Libraries" for complete setup.

## Development Workflow Pattern

**Typical Flow** (adapt as needed):

1. **Plan** - Use TodoWrite for multi-step tasks
2. **Map then Read** - Use Agent tool with subagent_type="Explore" to identify affected files and dependencies. Get the compact summary (file paths + 1-line descriptions), then only Read() the 2-4 files most critical to the current task. Do not load the entire dependency graph into the main context.
3. **Implement** - Follow dependency order (utilities → services → components → screens)
4. **Test** - Write and verify co-located test files
5. **Verify** - Run coverage checks
6. **Document** - Update relevant documentation if needed

## Common Patterns

**Authentication Flow**:

- Server: Full auth-lib (hashing, JWT generation)
- Client: auth-lib/client (token parsing only)

**Logging**:

- Always use `@your-org/logging-lib` (not console)
- Client: lightweight console logger
- Server: Winston-based structured logging

## Example: Simple Feature Implementation

```typescript
// 1. Plan (if 3+ steps)
TodoWrite: ["Research existing code", "Implement feature", "Add tests"]

// 2. Read affected files
Read: libs/{lib-name}/src/services/{service-name}.ts

// 3. Implement with platform separation
// libs/{lib-name}/src/server.ts (server-only)
export class MyService {
  async secureOperation(data: string) {
    // Server-side crypto
  }
}

// libs/{lib-name}/src/client.ts (client-safe)
export class MyClientService {
  parseData(data: string) {
    // No crypto operations
  }
}

// 4. Add co-located tests
// libs/{lib-name}/src/server.spec.ts
describe('MyService', () => {
  it('should handle secure operations', () => {
    // Test implementation
  });
});

// 5. Verify
npx nx test {lib-name} --coverage
```

## Anti-Patterns to Avoid

- Never create `__tests__/` directories (use co-location)
- Never import server utilities in React Native
- Never hash passwords or sign JWTs client-side
- Never use `any` type for financial data
- Never install packages in app directories (use workspace root)
- Never create local `node_modules` in NX app subdirectories

## References

**Complete Documentation**:

- Development patterns: `CLAUDE.md`
- Story templates: `docs/templates/README.md`
- E2E testing: `apps/{api-service}/test/integration/groups/README.md`

**Key Commands**:

- Start Metro: `npx nx start <app-name> --reset-cache --clear`
- Start API: `npx nx run {api-service}:serve`
- Run tests: `npx nx test <project> --coverage`
- Build library: `npx nx build @your-org/library-name`

---

**Note**: This skill provides flexible guidance. Adapt patterns based on specific feature requirements and always reference CLAUDE.md for authoritative project standards.

---

## Pipeline Lock Cooperation (when invoked by `/develop-story` or `/develop-task`)

When this skill is invoked as a step in a develop pipeline, advance the pipeline lock as the **last action** before returning, so the orchestrator's next turn does not depend on model discipline:

```bash
if [ -f .claude/state/develop-pipeline.lock ]; then
  bash .agents/skills/develop/references/advance-pipeline-lock.sh --skill develop 2>/dev/null || true
fi
```

Idempotent in every degraded path: noops when the lock is missing (skill invoked standalone), already advanced past this step, or the helper script is not installed. Full rationale and cooperation order with the `Stop` hook: see [`references/pipeline-lock-cooperation.md`](references/pipeline-lock-cooperation.md).
