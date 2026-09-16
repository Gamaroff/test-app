---
name: create-story
description: Primary workflow for creating the next logical story in a development sequence. Implements a rigorous 10-step process to identify, extract, and document story requirements with complete technical context and anti-hallucination safeguards.
invokes: [ensure-epic-github-issue, ensure-epic-jira-issue, ensure-story-github-issue, ensure-story-jira-issue, mermaid-architect]
---

> **Status lifecycle**: see [`references/document-status-lifecycle.md`](references/document-status-lifecycle.md)

# Create Story Workflow

## When to Use This Skill

Use this skill when you need to:

- **Create the next sequential story** in an epic ("create next story", "draft story 2.3")
- **Prepare a new story** with complete developer context ("setup new story for epic 1")
- **Extract story requirements** from PRD and architecture docs systematically

Natural language triggers:

- "Create the next story for epic 2"
- "Draft story 3.4"
- "Prepare the next story in sequence"
- "Setup story 1.1"

**Looking for a different workflow?**

- Parallel stories for simultaneous worktree development → `create-parallel-stories`
- Validate a drafted story against the readiness checklist → `execute-checklist` (or `review-story --validate` for the full gate)
- Project pivot, blocker, or requirement change → `correct-course`

## Purpose

To identify the next logical story based on project progress and epic definitions, and then to prepare a comprehensive, self-contained, and actionable story file. This skill ensures the story is enriched with all necessary technical context, requirements, and acceptance criteria, making it ready for efficient implementation by a Developer Agent with minimal need for additional research.

## ⚠️ Scope: Documentation + Opt-in Tracker Sync — Do NOT Implement

This skill produces **the story document and its co-located plan file**, and then — **only after explicitly asking the user in Step 5.2a** — may optionally sync the story to an issue tracker (GitHub or Jira). It MUST NOT begin implementing the story; implementation is `develop-story`'s job, invoked separately. Tracker sync is **opt-in**: never create a remote issue without the user's confirmation in this run.

**Forbidden during this skill** (regardless of how compelling it seems):

- ❌ Editing, creating, or deleting any source file outside the story's directory
- ❌ Running migrations, codegen, build, lint-fix, or refactor commands
- ❌ Creating branches, committing, or pushing code changes
- ❌ Installing/removing dependencies or modifying `package.json`
- ❌ Starting Task 1 of the story's Tasks/Subtasks "to get a head start"
- ❌ Auto-invoking `develop-story`, `develop`, or any implementation skill on completion
- ❌ Creating Jira or GitHub issues **without first asking the user** — tracker sync is gated behind the Step 5.2a prompt and must never run unprompted

**Allowed writes** (the only filesystem changes this skill may make):

- ✅ The story directory `{epic-directory}/stories/story.{E}.{S}.{name}/`
- ✅ `story.{E}.{S}.{name}.md` (story doc)
- ✅ `story.{E}.{S}.plan.{name}.md` (plan doc — MUST be co-located in the story directory above)
- ✅ `${PRD_ROOT}/sprint-status.yaml` status field update (Step 6.2)
- ✅ *(only after the user opts in at Step 5.2a)* Creating the tracker issue(s) and writing `github_issue` / `jira_key` / `jira_url` back into the story frontmatter

**Forbidden plan locations** (the plan file is part of the repo, not agent scratch):

- ❌ `~/.claude/plans/` (Claude Code plan-mode default — outside repo, not version-controlled)
- ❌ `~/.agents/plans/`, `/tmp/`, repo root, or any non-story directory
- If a source plan exists at `~/.claude/plans/<name>.md`, relocate its content into the co-located plan file. Do not link to the home-directory path.

**If the user asks to "create the story and start implementing"**: complete the story doc + plan, then STOP and explicitly hand off — tell user to invoke `/develop-story` as a separate step. Do not chain.

## CRITICAL: Sequential Execution Required

**MANDATORY**: This workflow has 7 sequential steps that MUST be followed in order. Do NOT skip steps or proceed until the current step is complete.

Each step builds on the previous one. Skipping steps will result in incomplete or inaccurate stories.

---

## Step 0: Load Core Configuration and Check Workflow

**Purpose**: Establish project structure and file locations

**Actions**:

0. **Resolve paths.** Run `source references/resolve-paths.sh` (or its bundled copy at `references/resolve-paths.sh`). This exports `PRD_ROOT` (default `docs/prd`) and `ARCH_ROOT` (default `docs/architecture`). Use these for every path operation below — examples in this skill show `docs/prd/...` but you must substitute `${PRD_ROOT}/...` against the actual project. Same for architecture paths.

1. Load configuration from skills-config.yaml
2. If configuration does not exist, **HALT** and inform user:

   > "skills-config.yaml not found. This file is required for story creation. You can either:
   >
   > 1. Copy it from project templates and configure it for your project
   > 2. Create the configuration manually based on the reference structure
   >    Please add and configure skills-config.yaml before proceeding."

3. Extract key configurations:
   - `architecture.*` - Architecture document settings
   - `workflow.*` - Workflow preferences
   - `sign-off.*` - Stakeholder sign-off gate. `enabled` (default `false`) decides whether Step 5.55 emits the section at all; `story.required` / `story.optional` are the role roster. Spec: [`references/sign-off.md`](references/sign-off.md)

   PRD and architecture roots are configurable via `prd.prdShardedLocation` and `architecture.architectureShardedLocation` — resolved into `${PRD_ROOT}` / `${ARCH_ROOT}` in Step 0.0. Nested structure under each root is fixed. See [Configuration](../../docs/reference/configuration.md#configurable-roots-and-fixed-conventions).

**Fallback Defaults** (if config file doesn't exist but user approves proceeding):

```yaml
prd:
  prdShardedLocation: docs/prd
architecture:
  architectureShardedLocation: docs/architecture
```

> **CRITICAL — Story File Location**: Stories are **always** saved inside the `stories/` subdirectory of the epic directory that was provided as input (or identified in Step 1). The path is:
> `{epic-directory}/stories/story.{epicNum}.{storyNum}.{story-title-short}/story.{epicNum}.{storyNum}.{story-title-short}.md`
>
> Example: If the epic is at `docs/prd/domain-name/my-feature/epics/epic.336.my-epic/epic.336.my-epic.md`, stories go to:
> `docs/prd/domain-name/my-feature/epics/epic.336.my-epic/stories/story.336.1.my-story/story.336.1.my-story.md`
>
> Do **NOT** use a global `docs/stories/` directory.

---

## Step 1: Identify Next Story for Preparation

**Purpose**: Determine which story to create based on project progress

### 1.1 Locate Epic Files and Review Existing Stories

1. Locate epic files at `${PRD_ROOT}/{domain}/{feature}/epics/epic.{N}.*/epic.{N}.*.md`.

2. Look for existing story files inside the epic's `stories/` subdirectory (i.e. `{epic-directory}/stories/`). Load the highest-numbered `story.{epicNum}.{storyNum}.*` file found there.

3. **If highest story exists**:
   - Verify status is `Done`
   - If NOT Done, alert user:

     > "ALERT: Found incomplete story!
     > File: {lastEpicNum}.{lastStoryNum}.story.md
     > Status: [current status]
     > You should fix this story first, but would you like to accept risk & override to create the next story in draft?"

   - If proceeding, select next sequential story in the current epic
   - If epic is complete, prompt user:

     > "Epic {epicNum} Complete: All stories in Epic {epicNum} have been completed.
     > Would you like to:
     >
     > 1. Begin Epic {epicNum + 1} with story 1
     > 2. Select a specific story to work on
     > 3. Cancel story creation"

   - **CRITICAL**: NEVER automatically skip to another epic. User MUST explicitly instruct which story to create.

4. **If no story files exist**: The next story is ALWAYS `1.1` (first story of first epic)

5. Announce the identified story to the user:
   > "Identified next story for preparation: {epicNum}.{storyNum} - {Story Title}"

---

## Step 2: Gather Story Requirements and Previous Story Context

**Purpose**: Extract story-specific requirements and learn from previous implementation

### 2.1 Extract Story Requirements

1. Read the identified epic file (at `${PRD_ROOT}/{domain}/{feature}/epics/epic.{N}.{name}/epic.{N}.{name}.md`)
2. Extract for this specific story:
   - Story title and description
   - Acceptance criteria (numbered list)
   - Dependencies on other stories
   - Special requirements or constraints

### 2.2 Review Previous Story Context (if exists)

If a previous story exists (e.g., creating 2.3, so 2.2 exists):

1. Read previous story's **Dev Agent Record** sections:
   - Completion Notes and Debug Log References
   - Implementation deviations and technical decisions
   - Challenges encountered and lessons learned

2. Extract relevant insights that inform the current story's preparation:
   - Patterns that worked well
   - Technical decisions that affect this story
   - Warnings or gotchas discovered
   - File locations established

**Anti-Hallucination Rule**: Only extract insights that are explicitly documented. Do NOT assume or infer information not written in the previous story.

### 2.3 Analyse Git History

1. Run `git log --oneline -15` to get recent commits
2. Identify commits relevant to the current epic/story area:
   - Files created or modified in adjacent or related work
   - Library dependencies recently added or changed
   - Code patterns and conventions established
   - Reverts or fixes that signal known pitfalls
3. For 2-3 most relevant commits, inspect the diff to extract:
   - File locations and naming patterns established
   - Libraries already in use that satisfy this story's needs (avoids reinvention)
   - Testing approaches used in recent stories
   - Any patterns introduced that this story must follow for consistency
4. Document actionable insights in the Dev Notes section under **Git History Insights**

**Anti-Hallucination Rule**: Only extract insights from actual commit history. Do NOT infer beyond what the commits and diffs show.

---

## Step 3: Gather Architecture Context

**Purpose**: Load relevant technical specifications and standards

### 3.1 Determine Architecture Reading Strategy

Read `${ARCH_ROOT}/index.md` (or `${ARCH_ROOT}/README.md`) first if present, then follow the structured reading order below.

### 3.2 Read Architecture Documents Based on Story Type

**For ALL Stories (MANDATORY):**

- `tech-stack.md` - Technologies, frameworks, versions
- `unified-project-structure.md` - File locations and naming
- `coding-standards.md` - Code quality requirements
- `testing-strategy.md` - Testing approach and standards

**For Backend/API Stories, additionally:**

- `data-models.md` - Schema definitions
- `database-schema.md` - Database structure
- `backend-architecture.md` - Server-side patterns
- `rest-api-spec.md` - API endpoints and contracts
- `external-apis.md` - Third-party integrations

**For Frontend/UI Stories, additionally:**

- `frontend-architecture.md` - Client-side patterns
- `components.md` - UI component specifications
- `core-workflows.md` - User flows and navigation
- `data-models.md` - Client-side data structures

**For Full-Stack Stories:**

- Read BOTH Backend and Frontend sections above

### 3.3 Extract Story-Specific Technical Details

**CRITICAL ANTI-HALLUCINATION RULE**: Extract ONLY information directly relevant to implementing the current story. Do NOT invent new libraries, patterns, or standards not in the source documents.

Extract and document:

1. **Specific data models, schemas, or structures** the story will use
2. **API endpoints** the story must implement or consume
3. **Component specifications** for UI elements in the story
4. **File paths and naming conventions** for new code
5. **Testing requirements** specific to the story's features
6. **Security or performance considerations** affecting the story

**MANDATORY**: ALWAYS cite source documents using this format:

```
[Source: architecture/{filename}.md#{section}]
```

**Example**:

```markdown
- User authentication uses JWT tokens stored in HTTP-only cookies
  [Source: architecture/backend-architecture.md#authentication]
- Password hashing uses bcrypt with salt rounds of 12
  [Source: architecture/coding-standards.md#security-practices]
```

**If information is NOT found in architecture docs**:

- Explicitly state: "No specific guidance found in architecture docs"
- DO NOT guess or make assumptions
- Mark as "To be determined during implementation"

---

## Step 4: Verify Project Structure Alignment

**Purpose**: Ensure story requirements align with established project structure

### 4.1 Cross-Reference with Project Structure

1. Review `${ARCH_ROOT}/unified-project-structure.md` (or equivalent)
2. Verify that story requirements align with:
   - Defined file paths and directories
   - Component location conventions
   - Module naming standards
   - Package organization

### 4.2 Document Conflicts or Deviations

If discrepancies are found between story requirements and project structure:

1. Note the conflict explicitly
2. Document in "Project Structure Notes" within the story draft
3. Recommend resolution (follow structure OR update structure)

**Example Conflict**:

```markdown
**Project Structure Note**: Epic specifies placing new auth components
in `src/components/auth/`, but Project Structure Guide defines
`src/features/authentication/components/` as the standard location.
Recommend following Project Structure Guide for consistency.
```

---

## Step 5: Populate Story Template with Full Context

**Purpose**: Create comprehensive, self-contained story document

### 5.1 Create Story File and Directory

1. Determine story path name: `story.{epicNum}.{storyNum}.{story-title-short}`
2. Derive the output root from the epic file path provided (or identified in Step 1): `{epic-directory}/stories/`
3. Create directory: `{epic-directory}/stories/{story-path-name}/`
4. Create file inside directory: `{epic-directory}/stories/{story-path-name}/{story-path-name}.md`
5. Use Story Template from `resources/story-template.yaml` as structure

> **CRITICAL**: Never write to a global `docs/stories/` directory. Stories always live inside their own epic's `stories/` subdirectory.

### 5.2 Fill Basic Story Information

**Emit YAML frontmatter** conforming to [story-documents.md](../../docs/standards/story-documents.md) and [OKF v0.1](references/open-knowledge-format.md). Required/recommended fields:

```yaml
---
epic: epic.{epicNum}.{epic-name}
title: "{story title}"
type: story            # OKF's one hard requirement — must be exactly `story`
description: "{one-sentence summary of the story}"   # OKF-recommended
tags: []               # optional — short cross-cutting labels
status: draft
priority: Medium
assignee: TBD
created: {today}
updated: {today}
---
```

`type` and `description` are mandatory to emit (`type` is OKF-required, `description` OKF-recommended); `tags` is optional. Tracker fields (`github_issue`/`jira_key`/`jira_url`) and `estimated_effort_hours` are written later by the optional sync/estimate steps.

Populate these sections:

**Status**: `Draft`

**Story Statement** (from epic):

```markdown
**As a** {role},
**I want** {action},
**so that** {benefit}
```

**Acceptance Criteria** (copy from epic):

1. First acceptance criterion
2. Second acceptance criterion
3. etc.

### 5.2-est Prompt for Effort Estimate (Optional)

Before the optional tracker-sync step (5.2a), propose a default effort estimate and let the user accept or override. The accepted value is written to frontmatter as `estimated_effort_hours: {N}` and is picked up by Jira sync (→ `timetracking.originalEstimate`) and GitHub sync (→ Projects v2 `Estimate` number field).

**Step 1 — compute the recommendation.** Apply the deterministic rubric in `references/effort-estimation-rubric.md`:

- Count ACs, top-level tasks, distinct files mentioned in Dev Notes
- Read `risk_level` and `story_type` from frontmatter
- Scan body for integration keywords (`integration`, `external API`, `third-party`, `webhook`, `migration`, `schema change`)
- Plug into the formula and snap to the nearest bucket in `[1, 2, 4, 8, 16]`

**Step 2 — prompt.** Use `AskUserQuestion`:

> **Header:** `Effort`
> **Question:** "Recommended estimate based on {ac_count} ACs, {task_count} tasks, risk={risk_level}: **{snap}h**. Accept or pick a different value."
> Options: `1 hour`, `2 hours`, `4 hours`, `8 hours` — append `(Recommended)` to the snapped bucket label. (Tasks: shift to `4`, `8`, `16` if rubric > 8h.) The user can also pick "Other" for a custom number or "Skip — leave unestimated" to omit the field.

**Step 3 — write back.** If the user accepts the recommendation or picks any numeric option, write `estimated_effort_hours: {N}` into the frontmatter before the optional Step 5.2a sync (so the estimate is ready whether the user syncs now or later). If the user picks Skip, omit the field — review-story will flag it as a LOW gap later.

Do **not** silently write a value without prompting. The recommendation is a default for the user's prompt, not an auto-applied estimate.

### 5.2a Offer Tracker Sync (opt-in)

After the story document is fully written, ask the user whether to sync it to an issue tracker. This step never creates a remote issue without explicit confirmation in this run.

**Step A — detect** the configured platform using the canonical resolver (see `references/platform-detection.md`):

```bash
source references/resolve-platform.sh || exit 1
# TRACKER = jira | github   (empty/unknown if neither is configured)
```

**Step B — prompt** the user with `AskUserQuestion`:

> **Header:** `Tracker sync`
> **Question:** "Story doc created. Sync it to an issue tracker now? Detected platform: {TRACKER or 'none detected'}."
> **Options:**
> - **Sync to GitHub** — append `(Recommended)` when `TRACKER=github`. Creates the epic + story issues, adds them to the project board, links the story as a sub-issue of its epic, and writes `github_issue` to frontmatter.
> - **Sync to Jira** — append `(Recommended)` when `TRACKER=jira`. Creates/links the epic + story issues, adds to the backlog, and writes `jira_key`/`jira_url` to frontmatter.
> - **Skip — docs only** — make no remote changes; leave `github_issue`/`jira_key` unwritten. The user can run `/sync-github-story` or `/sync-jira-story` later.
>
> The user may also pick "Other" (auto-provided) to skip or explain.

**Step C — act on the answer:**

- **Skip / no tracker chosen** → make no remote changes, log "Tracker sync skipped by user — run /sync-github-story or /sync-jira-story later." and continue to Step 5.3. Do NOT halt.
- **Sync to Jira** → run the Jira Path below.
- **Sync to GitHub** → run the GitHub Path below.

> **Note:** If the user picks a platform that isn't actually configured (e.g. Jira while `JIRA_URL` is unset), the corresponding sub-routine logs a warning and returns an empty key — it never halts. Surface the warning and continue to Step 5.3.

#### Jira Path (when the user chose Sync to Jira)

1. Derive the parent epic file path using the grandparent directory rule:
   ```bash
   STORY_DIR=$(dirname "{resolved story file path}")
   EPIC_DIR=$(dirname "$(dirname "$STORY_DIR")")
   EPIC_FILE_PATH="${EPIC_DIR}/$(basename "$EPIC_DIR").md"
   ```
   If the file doesn't exist, glob for `epic.*.md` in `${EPIC_DIR}`. If still not found, set `EPIC_JIRA_KEY=""` and continue with a logged warning.

2. If the epic file exists, invoke the `ensure-epic-jira-issue` sub-routine with `EPIC_FILE_PATH`. On return, `EPIC_JIRA_KEY` is set (e.g. `PROJ-42`) or empty.

3. Invoke the `ensure-story-jira-issue` sub-routine with `STORY_FILE_PATH={just-written story file path}` and `EPIC_JIRA_KEY` from step 2. The sub-routine handles:
   - delegation to `sync-jira-story` for idempotent create (search by title/labels first),
   - linking the new story to the parent epic via `parent` field (team-managed) or Epic Link customfield (classic),
   - adding it to the project backlog (Scrum boards only),
   - embedding Bitbucket links via ADF,
   - writing `jira_key: {KEY}` and `jira_url: {JIRA_URL}/browse/{KEY}` into the story frontmatter and inserting the body cross-reference link.

**On failure**: the sub-routine logs a warning and returns `STORY_JIRA_KEY=""`. `create-story` leaves `jira_key: null` and continues. Never halt. Users can still run `/sync-jira-story` manually later to retry.

#### GitHub Path (when the user chose Sync to GitHub)

1. Derive the parent epic file path using the grandparent directory rule:
   ```bash
   STORY_DIR=$(dirname "{resolved story file path}")
   EPIC_DIR=$(dirname "$(dirname "$STORY_DIR")")
   EPIC_FILE_PATH="${EPIC_DIR}/$(basename "$EPIC_DIR").md"
   ```
   If the file doesn't exist, glob for `epic.*.md` in `${EPIC_DIR}`. If still not found, set `EPIC_ISSUE_NUM=""` and continue with a logged warning.

2. If the epic file exists, invoke the `ensure-epic-github-issue` sub-routine with `EPIC_FILE_PATH`. On return, `EPIC_ISSUE_NUM` is set (integer) or empty.

3. Invoke the `ensure-story-github-issue` sub-routine with `STORY_FILE_PATH={just-written story file path}` and `EPIC_ISSUE_NUM` from step 2. The sub-routine handles:
   - dedup-by-title search (adopts an existing issue if exactly one matches),
   - creating the issue with title `[Story {epic}.{story}] {title}`, `story` + `priority:{priority}` labels, milestone `Epic {epic} — {epic_title}`,
   - adding it to the GitHub Project board,
   - mirroring the priority label onto the board's Priority single-select field,
   - linking the new issue as a sub-issue of the parent epic issue (when `EPIC_ISSUE_NUM` is non-empty),
   - writing `github_issue: {N}` into the story frontmatter and inserting the body cross-reference link.

**On failure**: the sub-routine logs a warning and returns `STORY_ISSUE_NUM=""`. `create-story` leaves `github_issue:` unwritten and continues. Never halt.

### 5.3 Populate Dev Notes Section (CRITICAL)

**CRITICAL ANTI-HALLUCINATION REQUIREMENT**: This section MUST contain ONLY information extracted from architecture documents. NEVER invent or assume technical details.

Organize Dev Notes by these categories:

#### Previous Story Insights

- Key learnings from previous story (if applicable)
- Technical decisions that carry forward
- Patterns established in previous work

#### Data Models

- Specific schemas, validation rules, relationships
- **MANDATORY**: Include source references for each item
- Example: `User model includes email, passwordHash, createdAt fields [Source: architecture/data-models.md#user-schema]`

#### API Specifications

- Endpoint details (method, path, auth requirements)
- Request/response formats
- Error handling standards
- **MANDATORY**: Include source references

#### Component Specifications (for UI stories)

- UI component details, props, state management
- Styling approach and theme usage
- **MANDATORY**: Include source references

#### File Locations

- Exact paths where new code should be created based on project structure
- Naming conventions to follow
- **Source**: `[Source: architecture/unified-project-structure.md#section]`

#### Testing Requirements

- Specific test cases or strategies from testing-strategy.md
- Coverage requirements
- Test file locations
- **MANDATORY**: Include source references

#### Manual Testing Steps

Generate a concrete, step-by-step walkthrough for verifying this story in the running app. This is distinct from automated test design — it is a human-readable smoke test guide.

**Sources to consult** (in priority order):
1. `${ARCH_ROOT}/routing-and-file-structure.md` — for navigation paths and screen names
2. `${ARCH_ROOT}/concepts/core-workflows.md` — for user flows
3. The story's own acceptance criteria — one verification step per AC
4. Integration notes in the story (what parent component or screen triggers this feature)

**Structure to generate**:
```markdown
**Prerequisites**:
- App running (`npm run {app-name}:start:device`)
- [Auth state, seeded data, or feature flags required]

**Navigation Path**:
1. [Home/starting screen] → [tap X] → [intermediate screen] → [target screen]

**Verification Steps**:
- **AC1**: [Exact action] → expect [exact result]
- **AC2**: [Exact action] → expect [exact result]
- ...

**Edge Cases / Key Risks**:
- [Known tricky interaction, previously broken flow, or non-obvious behaviour to verify]
```

**Rules**:
- Use actual screen/button names from routing docs; if unknown, write "To be confirmed during implementation"
- Map every AC to at least one verification step
- The `dev-agent` may refine this section after implementation; the SM skeleton is sufficient to guide development
- Do NOT invent navigation paths — only extract from source documents

#### Rollback Plan

Document how to undo this story's changes if they cause a production incident:

- **What to revert**: Specific files, migrations, or feature flags that must be reversed
- **Revert steps**: Ordered list of actions (e.g., run down migration, redeploy previous build, toggle flag off)
- **Impact of rollback**: What functionality is lost or degraded after rollback
- **Rollback complexity**: Simple (revert PR) / Moderate (migration rollback needed) / Complex (data already mutated)

If a database migration is included, explicitly note whether it is reversible and provide the rollback SQL or Prisma command.

#### Technical Constraints

- Version requirements
- Performance considerations (response times, memory limits)
- Security rules (authentication, authorization, input validation)
- **MANDATORY**: Include source references

**If information for a category is not found**: Explicitly state:

> "No specific guidance found in architecture docs for [category]"

### 5.4 Generate Tasks / Subtasks Section

Create detailed, sequential list of technical tasks based on:

1. Epic Requirements
2. Story Acceptance Criteria
3. Reviewed Architecture Information

**Task Format**:

```markdown
- [ ] Task 1: {Description} (AC: 1, 3)
  - [ ] Subtask 1.1: {Specific action}
  - [ ] Subtask 1.2: {Specific action}
- [ ] Task 2: {Description} (AC: 2)
  - [ ] Subtask 2.1: {Specific action}
```

**Requirements**:

- Each task must reference relevant architecture documentation
- Link tasks to ACs where applicable: `(AC: 1, 3)`
- Include unit testing as explicit subtasks based on Testing Strategy
- Tasks should be sequential and logical

**Example**:

```markdown
- [ ] Task 1: Implement User model with validation (AC: 1)
  - [ ] Create User schema with required fields [Source: architecture/data-models.md#user-schema]
  - [ ] Add email validation using validator.js
  - [ ] Implement password hashing with bcrypt [Source: architecture/coding-standards.md#security]
  - [ ] Write unit tests for User model validation
- [ ] Task 2: Create user registration endpoint (AC: 2)
  - [ ] Implement POST /api/users/register endpoint [Source: architecture/rest-api-spec.md#user-endpoints]
  - [ ] Add input validation middleware
  - [ ] Connect to User model
  - [ ] Write integration tests for registration flow
```

### 5.45 Generate Plan File

After collecting tasks/subtasks and dev notes, generate a co-located implementation plan file.

**File**: `story.[N].[M].plan.[descriptive-name].md` — same directory as the story document.

**CRITICAL — co-location is mandatory. The plan file MUST be written into the story's directory (alongside the story doc, nested under the parent epic directory).**

- ❌ NEVER write the plan to `~/.claude/plans/`, `~/.agents/plans/`, `/tmp/`, the repo root, or any other shared/agent-scratch location.
- ❌ NEVER leave a plan in `~/.claude/plans/` (Claude Code plan-mode default) and link to it from the story — it is outside the repo, invisible to teammates, and not version-controlled.
- ✅ If a source/upstream plan already exists at `~/.claude/plans/<name>.md` (e.g., from Claude Code plan mode or a prior brainstorm), **relocate its content** into the co-located `story.[N].[M].plan.[descriptive-name].md` file. Do not just reference the original path.
- ✅ Use a relative path (filename only) when cross-referencing from the story doc — both files live in the same directory.

**Purpose**: The plan file contains implementation-level detail that the story document deliberately omits: code snippets, exact file changes, function signatures, and line-by-line guidance. The story doc describes *what* to build; the plan describes *how*.

**Content structure**:

```markdown
---
id: story.[N].[M].plan
title: "Implementation Plan: [story title]"
type: plan
story-ref: story.[N].[M].[descriptive-name].md
---

# Implementation Plan: [story title]

> Requirements and acceptance criteria: [story.[N].[M].[descriptive-name].md](story.[N].[M].[descriptive-name].md)

## Overview

[1-2 sentence summary of the implementation approach]

## Task-by-Task Implementation Guide

### Task 1: [Task Name]

**Files to modify:**
- `path/to/file.ts` — [what to change and why]

**Exact changes:**
[Code snippets, function signatures, line references, before/after examples]

### Task 2: [Task Name]
[Same structure repeated for each task]

## Key Patterns and References

[Existing code patterns to follow, utilities to reuse, architectural constraints]

## Testing Approach

[Specific test scenarios, test file locations, mocking strategies]
```

**Content sourcing rules**:
- Extract implementation-level detail from the interactive workflow (code examples, function signatures, file paths discussed during section collection)
- Reference specific lines/functions in existing files discovered during git history analysis (Step 2.3)
- Include before/after code snippets for each task where applicable
- Do NOT duplicate the story's Tasks/Subtasks section verbatim — the plan adds *how*, not restates *what*

**Cross-reference in story doc**: After generating the plan file, add a cross-reference line at the top of the Tasks / Subtasks section:

```markdown
> Detailed implementation guide: [story.[N].[M].plan.[descriptive-name].md](story.[N].[M].plan.[descriptive-name].md)
```

### 5.4.5 Visual Diagram (conditional, via `mermaid-architect`)

After Dev Notes are populated and the implementation plan exists, decide whether a Mermaid diagram materially clarifies the story. **Mandatory only if it enhances understanding** — do not add a diagram that just restates the Tasks list.

**Diagram type by story shape:**

- Story describes a request/response or multi-service interaction → `sequenceDiagram` (preferred)
- Story describes a stateful UI/component lifecycle (e.g., onboarding wizard, transaction status) → `stateDiagram-v2`
- Story describes a non-trivial decision/branching flow → `flowchart` with decision nodes

**Process:**

1. Invoke `mermaid-architect` with: story file path, the section anchor (Dev Notes or a new "Flow" subsection inside Dev Notes), API spec reference if applicable, and any explicit actors named in the story.
2. The skill will halt with clarifying questions if error states, actors, or transition triggers are missing — answer them before continuing. These answers may also surface gaps in the story itself; if so, update the relevant section.
3. Paste the returned Mermaid block (with YAML metadata header) into Dev Notes under a "## Flow" or "## Sequence" subheading. Append the 2-sentence "Architectural assumptions" summary directly below the block.
4. Accept `no diagram justified — {reason}` without pushing back.

### 5.4.6 Check for UI/Wireframe Opportunity (conditional, via `markdown-wireframe`)

After Dev Notes, plan, and diagrams are considered, check to see if the story document describes a user interface (UI) or visual components that could be drawn up in a wireframe.

**Detection Rule**: A story describes a UI that could be wireframed if it:
- Touches frontend code, UI screens, components, layout, navigation, or styles.
- Mentions visual elements like buttons, inputs, modals, forms, dashboards, lists, or headers.
- Has acceptance criteria referencing UI interactions, visual feedback, or layout requirements.

**Process**:

1. **If detection rule matches**, prompt the user using `AskUserQuestion`:
   - **Header**: `Wireframe`
   - **Question**: "This story describes a user interface (UI) that can be visualized as a wireframe. Would you like to add a wireframe for this story using the `markdown-wireframe` skill?"
   - **Options**:
     - `Yes — Add wireframe (Recommended)`: Create a low-fidelity text/YAML wireframe.
     - `No — Skip wireframe`: Do not add wireframes.

2. **If the user chooses Yes**:
   - Invoke the `markdown-wireframe` skill (read its instructions if you haven't already).
   - Deconstruct the UI requirements into a text/YAML structural map (as shown in `markdown-wireframe`'s `wireframe-examples.md`).
   - Embed the generated text/YAML wireframe directly into the story document under the **Dev Notes** section under a `## Visual Layout / Wireframe` subheading.
   - Add a task/subtask to the story's **Tasks / Subtasks** section to Stitch/implement the wireframe:
     - `- [ ] Stitch and implement low-fidelity wireframe using Stitch (see Dev Notes visual layout)`

### 5.5 Add Testing Guidance

In the **Testing** subsection of Dev Notes:

1. List relevant testing standards from Testing Strategy
2. Specify test file locations
3. Note testing frameworks and patterns to use
4. Include any specific testing requirements for this story

### 5.55 Scaffold Stakeholder Sign-off Section (conditional)

Human approval gate — stakeholders sign the story before development begins. Full spec: [`references/sign-off.md`](references/sign-off.md).

**Skip this step entirely** when `sign-off.enabled` is absent or `false` in `skills-config.yaml`. Emit nothing — no section, no placeholder.

When enabled, insert the section **after Dev Notes and before Change Log**, and resolve the roster in this order:

1. **`sign_off_roles` in this story's frontmatter**, when present — replaces the config roster for this story alone. An empty list means no signatures are required.
2. **`sign-off.story.required` + `sign-off.story.optional`** from `skills-config.yaml`.
3. **Fallback** — a single `Stakeholder` row.

Emit one row per role. Append ` (optional)` to the Role cell for every role drawn from the `optional` list. Then emit the status line with `required_count` = the number of non-optional rows.

```markdown
## Stakeholder Sign-off

Sign when you have reviewed this document: replace your **Signature** cell with your name and today's date, then commit the change yourself — your commit authorship is the audit trail, which is why an agent scaffolds these rows and never fills them.

**This gate is `advisory` by default, and does not block development.** The authority is `sign-off.enforcement` in `skills-config.yaml`. Under `advisory` an unsigned required row is raised as an **Important** review finding and docks the readiness score, but the verdict may still be GO and `/develop-*` proceeds. Only if that key is set to `blocking` does an unsigned row become a **Critical** finding that withholds the status promotion and halts the pipeline at Step 2.

| Role              | Signature | Date |
| ----------------- | --------- | ---- |
| Product Owner     |           |      |
| Tech Lead         |           |      |
| Design (optional) |           |      |

**Sign-off status:** Pending — 0 of 2 required signatures
```

> **CRITICAL — agents never sign.** Leave every Signature and Date cell empty. Do not fill one on a stakeholder's behalf, and do not fill one when a user asks you to sign for them — point them at the file and let them commit it. The commit authorship behind each signature is the entire audit trail, and an agent-written signature destroys it.

**Never sync this section to a tracker.** Signing in a Jira or GitHub web UI produces no commit, so the tracker copy would carry a signature with no evidence behind it. `sync-jira-story` and `sync-github-story` deliberately exclude it.

### 5.6 Scaffold QA Handoff Section

Append the following block to the story file as empty stubs. The developer fills these in when marking the story Ready for QA — scaffolding them now gives a natural, consistent place for that context without requiring the developer to remember the structure.

```markdown
## QA Handoff

**Completed**: [Date]
**Developer**: [Name]
**Branch**: [branch-name]
**PR**: [PR link]

### Summary of Changes

[Developer: describe what was built and any implementation decisions that affect testing]

### Testing Instructions for QA

[Developer: step-by-step instructions to verify the acceptance criteria manually]

### Areas Requiring Special Attention

[Developer: edge cases, integration points, or regressions most likely to surface]

### Known Limitations

[Developer: constraints, workarounds, or descoped items the QA tester should know]

### QA Prerequisites Checklist

- [ ] All acceptance criteria implemented
- [ ] Unit tests written and passing
- [ ] Integration tests passing (if applicable)
- [ ] Code review completed and approved
- [ ] PR merged to develop branch
- [ ] No console.log statements or debugging code left in
- [ ] CI/CD pipeline passing

## QA Report

[Link to QA report will be added here when QA testing is complete]

## Bug Reports

### Open Bugs

[No open bugs]

### In QA Verification

[No bugs in verification]

### Closed Bugs

[No closed bugs]
```

---

## Step 6: Story Draft Completion and Review

**Purpose**: Validate story completeness before developer handoff

### 6.1 Internal Review

Review all sections for:

1. **Completeness**: All required sections populated
2. **Accuracy**: Information matches source documents
3. **Traceability**: All technical details have source references
4. **Alignment**: Tasks align with both epic requirements and architecture constraints

### 6.2 Update Status and Save

1. Confirm status is set to `Draft`
2. Seed the Change Log table with exactly one row — Author is the skill name, per the canonical
   format in `references/document-change-log.md` (append-only, newest row last, four columns).
   Keep frontmatter `updated:` equal to the row's date:
   ```markdown
   | {today} | 1.0 | Initial draft | create-story |
   ```
3. Save the story file to the self-named subdirectory inside the epic's `stories/` folder: `{epic-directory}/stories/story.{epicNum}.{storyNum}.{story-title}/story.{epicNum}.{storyNum}.{story-title}.md`
4. If `${PRD_ROOT}/sprint-status.yaml` exists, update it:
   - Load the full file, preserving all comments and structure
   - Find the entry matching this story's key
   - Update its status from `backlog` → `ready-for-dev`
   - Save the file

5. **Run Documentation Standards Validation**
   - Invoke `documentation-standards-validator` on the created story file and directory
   - Confirm: story is in a self-named subdirectory (`story.E.S.name/story.E.S.name.md`)
   - Confirm: dots used as structural separators, hyphens within descriptive name, all lowercase
   - Confirm: all required YAML frontmatter fields present and ISO-formatted dates
   - Fix any violations before proceeding to adversarial review (6.3)

### 6.2a Card Preflight (offline, advisory)

Run the tracker-card preflight on the document just written, **before** reporting completion:

```bash
node references/card-preflight.js --file "{epic-directory}/stories/story.{E}.{S}.{name}/story.{E}.{S}.{name}.md"
```

Offline — no auth, no network, no writes. It reports whether this document will publish a complete
tracker card or a thin one, printing the exact heading to add or rename beside each finding.

- **No findings** → say nothing. A clean preflight is not news.
- **Findings** → print the tool's output verbatim and tell the user it is **advisory**: the document
  is not blocked, and `/review-story` is the gate that will block it.

Do not paraphrase a finding or re-derive its fix, and **never restate the list of required sections
in this skill**. The list lives once, in `CARD_SECTIONS_BY_KIND` in `references/jira-sync.js`;
a second copy here would drift, and it would drift silently in the direction that matters — this
check passing a document the sync then publishes thin. Full contract:
[`references/authoring-card-preflight.md`](references/authoring-card-preflight.md).

### 6.3 Execute Adversarial Quality Review

**CRITICAL / BLOCKING**: This step is mandatory and must not be skipped. Do not proceed to 6.4 or present the story to the user until this review is complete. Perform a full adversarial re-analysis of the completed story, treating it as if reviewing someone else's work. The goal is to make developer mistakes **impossible**.

**Disaster Prevention Checklist** — for each category, identify gaps and fix them before presenting the story:

#### 🚨 Critical (Must Fix)

- **Wheel reinvention**: Does the story direct the developer toward existing code they should extend, rather than re-implement? Check the codebase for related components, services, hooks, or utilities.
- **Wrong libraries**: Are all library references version-specific and consistent with what the project actually uses (check `package.json`)? No guessed or fabricated dependencies.
- **Wrong file locations**: Do all file paths in Dev Notes match the project's actual directory structure as confirmed in Step 4?
- **Regression risk**: Does the story identify existing functionality that could break? Are tests for adjacent features called out?
- **UX violations**: If this story touches UI, are UX requirements from the epic explicitly referenced with file citations?
- **Missing manual testing steps**: If this story touches UI or navigation, does the Manual Testing Steps section have a concrete walkthrough? Vague or empty steps must be filled or explicitly marked "To be confirmed during implementation".
- **Vague implementations**: Can every task be executed without ambiguity? Flag any task that requires guessing.
- **Compatibility risks**: Verify each of the following is explicitly addressed in the story:
  - [ ] No breaking changes to existing API contracts
  - [ ] Database changes (if any) are additive only, or a migration rollback is documented
  - [ ] UI changes follow existing design patterns (no new component libraries introduced)
  - [ ] Performance impact of the change is negligible or justified
- **Missing rollback plan**: Does the Rollback Plan section describe how to undo the change? If a migration is involved, is the rollback SQL/command included?

#### ⚡ Should Add

- **Previous story continuity**: Are patterns, file locations, and decisions from the previous story carried forward correctly?
- **Missing acceptance criteria coverage**: Does every AC map to at least one task?
- **Security or performance requirements**: If relevant, are they stated explicitly (not implied)?

#### ✨ Nice to Have

- **Token efficiency**: Is the story concise? Remove verbose explanations that don't add implementation value.
- **Scannable structure**: Are critical constraints visible at a glance, not buried in prose?

After completing the review, list all findings grouped by category. Fix all Critical items directly in the story file. Present Should Add and Nice to Have items to the user for confirmation before applying.

### 6.4 Provide Summary to User

Generate a comprehensive summary including:

```markdown
## Story Creation Complete

**Story Created**: `{epic-directory}/stories/story.{epicNum}.{storyNum}.{story-title}/story.{epicNum}.{storyNum}.{story-title}.md`
**Status**: Draft
**Epic**: {epicNum} - {Epic Title}
**Story Number**: {storyNum}

### Key Technical Components Included

- Data Models: [list extracted models with sources]
- API Endpoints: [list endpoints with sources]
- Components: [list UI components with sources]
- Testing Requirements: [summarize testing approach]

### Source References

Total references included: {count}
Architecture documents consulted: [list files read]

### Deviations or Conflicts

[List any noted conflicts between epic and architecture, or state "None"]

### Checklist Results

[Include validation report from story-draft-checklist]

### Next Steps

For Complex Stories:

1. Carefully review the story draft
2. Optionally have Product Owner run `review-story --validate` skill for comprehensive validation
3. Update status to "Approved" when ready
4. Hand off to Developer for implementation

For Simple Stories:

- Story is ready for developer handoff
- Ensure developer reads Dev Notes section thoroughly before starting
```

---

## Integration with Other Skills

**Calls**:

- `execute-checklist` - For story validation
- `documentation-standards-validator` - Validates story file naming, directory structure, and YAML frontmatter after creation
- `mermaid-architect` - Generates a sequence diagram (API interaction) or state diagram (stateful UI) for the story when a diagram materially clarifies the spec
- `markdown-wireframe` - For generating low-fidelity, mobile-focused outline wireframes for stories that contain UI/UX elements

**Outputs used by**:

- `develop` - Developers implement stories created by this skill
- `review-story --validate` - Product owners validate story completeness

---

## Anti-Hallucination Protocol Summary

This skill implements rigorous safeguards against AI hallucination:

### MANDATORY Rules

1. **Source Extraction Only**: All technical details MUST be extracted from existing documents
2. **Source Citations Required**: Every technical claim MUST include `[Source: ...]` reference
3. **No Invention**: NEVER invent libraries, patterns, frameworks, or standards not in source docs
4. **Explicit Unknowns**: If information doesn't exist, state "No specific guidance found" rather than guessing
5. **Verification**: Cross-reference claims against actual project files before inclusion

### Violation Examples (NEVER Do This)

❌ "The API uses Redis for caching" (without source reference)
❌ "Follow the standard React patterns" (vague, no source)
❌ "Authentication uses OAuth2" (if not in architecture docs)
❌ "Testing requires 80% coverage" (if not specified in testing-strategy.md)

### Correct Examples

✅ "The API uses Redis for session storage [Source: architecture/backend-architecture.md#caching-strategy]"
✅ "Follow React Hooks patterns defined in the project [Source: architecture/frontend-architecture.md#state-management]"
✅ "Authentication: No specific guidance found in architecture docs. To be determined during implementation."
✅ "Testing requires 80% coverage for financial operations [Source: architecture/testing-strategy.md#coverage-requirements]"

---

## Configuration Reference


Expected configuration structure:

```yaml
# PRD/epic/story locations are fixed conventions (see docs/reference/configuration.md):
#   PRDs:    docs/prd/
#   Epics:   ${PRD_ROOT}/{domain}/{feature}/epics/epic.{N}.{name}/epic.{N}.{name}.md
#   Stories: nested at {epic-dir}/stories/story.{E}.{S}.{title}/story.{E}.{S}.{title}.md
# PRD and architecture roots are configurable; the nested structure is fixed.

prd:
  prdShardedLocation: docs/prd        # ${PRD_ROOT}

architecture:
  architectureShardedLocation: docs/architecture  # ${ARCH_ROOT}

# Always-load files for developers
devLoadAlwaysFiles:
  - docs/architecture/concepts/coding-standards.md
  - docs/architecture/concepts/tech-stack.md
  - docs/architecture/concepts/source-tree.md
```

---

## Common Pitfalls to Avoid

1. ❌ **Skipping configuration loading** - Always start with Step 0
2. ❌ **Inventing technical details** - Only extract from source docs
3. ❌ **Missing source references** - Every technical claim needs citation
4. ❌ **Incomplete Dev Notes** - Developer must not need to read architecture docs
5. ❌ **Skipping validation** - Always run story-draft-checklist
6. ❌ **Auto-advancing epics** - Never create next epic's story without user approval
7. ❌ **Vague task descriptions** - Tasks must be specific and actionable
8. ❌ **Ignoring previous story insights** - Always review previous implementation notes

---

## Success Criteria

A story is successfully created when:

✅ Configuration loaded and validated
✅ Next story number correctly identified
✅ All relevant architecture docs read and extracted
✅ Dev Notes contain complete technical context with source references
✅ Tasks are detailed, sequential, and linked to acceptance criteria
✅ Story passes story-draft-checklist validation
✅ File saved to correct location
✅ Summary provided to user with next steps

---

## Resources

This skill uses the following resource files:

- `resources/story-template.yaml` - Story document structure and sections
- `resources/story-draft-checklist.md` - Validation criteria (via execute-checklist skill)

---

## Notes

- This is a **sequential workflow** - steps must be followed in order
- Average story creation time: 5-10 minutes (depending on architecture complexity)
- Stories are saved as Markdown files with YAML-like section structure
- The skill is designed for AI-driven development where complete context prevents mistakes
- Fresh context windows between agent roles (SM → Dev → QA) prevent contamination
