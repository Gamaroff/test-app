---
name: review-story
description: 'Story review with two modes. Interactive mode (default): asks clarifying questions to resolve ambiguities, conflicts, and missing information — use when story has unclear requirements or you need user input. Validate mode (--validate flag or "is this story ready?"): automated non-interactive GO/NO-GO gate with 1–10 readiness score — use for pre-implementation gates, batch validation across multiple stories, CI pipelines, or quick sanity checks without user interaction.'
invokes: [create-branch, ensure-epic-github-issue, ensure-epic-jira-issue, ensure-story-github-issue, ensure-story-jira-issue, mermaid-architect]
---

> **Status lifecycle**: see [`references/document-status-lifecycle.md`](references/document-status-lifecycle.md)

# Review Story

## When to Use This Skill

This skill has two modes. Use the right one for the job:

### Interactive Mode (default)

Use when:

- Story has **ambiguous requirements** that need clarification
- You need to **resolve conflicts or gaps interactively**
- You want **user input on technical decisions**
- Checking story accuracy against architecture documentation
- Finding inconsistencies in technical specifications
- Conducting deep peer reviews with user collaboration
- Investigating why a story implementation went off-track
- Improving story quality through interactive refinement

Natural language triggers:

- "Review story 2.3"
- "Check the story document for issues"
- "What's wrong with this story?"
- "Review the quality of story.310.5.md"
- "Find problems in the notification story"

### Validate Mode (`--validate`)

Use when:

- ✅ You need **automated GO/NO-GO decision** without user interaction
- ✅ Story appears complete and you want a readiness gate
- ✅ You're doing **batch validation** of multiple stories
- ✅ Running a **CI-style pre-implementation gate**
- ✅ You need a **readiness score** for project tracking
- ✅ You want to verify a story that was just edited is now clean

Natural language triggers:

- "Validate story 2.3"
- "Is story.310.5 ready to implement?"
- "Run the pre-implementation gate on #297"
- "Score this story's readiness"
- "Batch validate all stories in Epic 4"

**How to invoke validate mode:**

```
/review-story --validate path/to/story.md
/review-story --validate #297
/review-story --validate story.310.5
```

Or via natural language (agent detects intent): "Is this story ready?", "Score this story", "Validate all stories in Epic 4".

**Key differences between modes:**

|                 | Interactive                              | Validate                               |
| --------------- | ---------------------------------------- | -------------------------------------- |
| Questions asked | Yes — single batched question point      | Never                                  |
| Edits story     | Yes (with user approval)                 | Never*                                 |
| Output artifact | `.review.{n}.{story-name}.md`            | `.validate.{date}.md`*                 |
| Verdict label   | READY / NEEDS REVISION / REQUIRES REWORK | GO / NO-GO (Revision) / NO-GO (Rework) |
| CI exit code    | N/A                                      | Non-zero on NO-GO                      |
| Batch support   | No                                       | Yes                                    |

\* The **Validate** column describes _standalone_ validate (`APPLY=false`, read-only). The orchestrated **validate-and-apply** variant (`APPLY=true`, set by `develop-story`/`po`) still asks no questions but _does_ edit the story (applies critical + important fixes, promotes status on a GO) and writes a `.review.{n}.{story-name}.md` report instead. See [Validate Sub-Modes](#validate-sub-modes).

## Purpose

To conduct a comprehensive, **interactive** review of an existing story document, identifying:

- **Inaccuracies**: Incorrect technical details, misaligned with architecture
- **Gaps**: Missing information, incomplete sections, undefined requirements
- **Inconsistencies**: Conflicting information within the story or with related documents
- **Quality Issues**: Vague descriptions, unclear guidance, poor structure
- **Hallucinations**: Invented technical details not supported by source documents

**CRITICAL - Interactive Review Approach**:

Instead of making assumptions or creative decisions, this skill **asks clarifying questions** when encountering:

- Ambiguities or multiple valid interpretations
- Missing information that could be filled different ways
- Conflicts between story and architecture/epic
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
  - story_file: |
      Path to story document, OR any of:
      - GitHub issue URL (direct):       https://github.com/{owner}/{repo}/issues/297
      - GitHub project board URL:        https://github.com/orgs/.../projects/...?...issue=...
      - Issue hash notation:             #297
      - Bare issue number:               297

optional:
  - mode: |
      "--validate" flag OR natural language intent → activates Validate mode (non-interactive GO/NO-GO gate).
      Omit for default Interactive mode.
  - focus_areas: Specific areas to focus on (e.g., "testing", "API specs")
  - review_depth: "quick" | "standard" | "thorough" (default: "standard")
      In validate mode, "quick" runs in 5-10 min (critical issues only), "standard" in 15-30 min, "thorough" in 30-60 min.
      In interactive mode, "quick" = 15-30 min, "standard" = 30-60 min, "thorough" = 60-90+ min.
```

### Mode Detection

Activate **Validate mode** when any of the following are true:

- `--validate` flag present in the invocation
- Natural language intent: "validate", "is this story ready?", "score this story", "batch validate", "CI gate", "pre-implementation gate"
- Called programmatically by `develop-story` or `po` pipeline (these always use validate mode — specifically the **validate-and-apply** variant; see Validate Sub-Modes below)

Default to **Interactive mode** for all other invocations.

#### Validate Sub-Modes

Validate mode (`MODE=validate`) is always non-interactive. It has two variants, selected by the `APPLY` flag:

- **Standalone validate** (`APPLY=false`, the default) — strictly **read-only**. Runs scoring and renders a GO / NO-GO verdict, skips Steps 9.5 and 10, never modifies the story document, and saves the report as `.validate.{date}.md`. This is the contract for CI gates, batch validation, and direct `--validate` calls.
- **Validate-and-apply** (`APPLY=true`) — set automatically when invoked by the `develop-story`/`po` orchestrator. Runs the same scoring, then runs the **constrained, non-interactive** forms of Step 9.5 (apply critical + important fixes) and Step 10 (promote `Draft → Ready for Development` on a GO; HALT on NO-GO). Saves a normal review report as `story.{epic}.{story}.review.{n}.{story-name}.md`, so the orchestrator's `…review.*.md` lookup finds it.

## Input Resolution

Before loading the story document, resolve the input to a local file path:

**Step 1 — Detect input type.** If the argument looks like a file path, skip to Step 4.

| Pattern                            | Matches                                    |
| ---------------------------------- | ------------------------------------------ |
| Contains `github.com`              | GitHub URL (direct issue or project board) |
| Starts with `#` followed by digits | Hash notation                              |
| All digits                         | Bare issue number                          |

**Step 2 — Extract the issue number** from whichever pattern matched:

```bash
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

- If `LOCAL_PATH` is non-empty and the file exists: use it as `story_file`, skip to Step 4.
- If no Document link found (older issue without Document section): fall back to `grep -rl "github_issue: {N}" docs/` and find `story.{epic}.{story}.*.md` in the result (excluding `.qa.`, `.gate.`, `.bug.`, `.implementation.` files).
- If still not found: HALT — inform user: "No local document found for issue #{N}. Run `/create-story` first, or provide the file path directly."

**Step 4 — Continue with the resolved `story_file`.**

---

**Files to Load During Review**:

1. Story document — always load in full (primary artifact, stays in context throughout)
2. Parent epic — load selectively: targeted section reads only (ACs and story list), not the full file
3. Architecture documents — discovered via Explore subagent; load at most 2-3 most relevant files
4. Story template — load for structure compliance check only; release after Step 2
5. Previous stories — load only if story explicitly references continuity; a 1-line summary is usually sufficient

**CRITICAL**: Use the Explore subagent to discover documents before loading them. Never load all architecture docs blindly — always select based on story domain.

---

## Interactive Questioning Strategy

**CRITICAL**: This skill MUST ask clarifying questions instead of making assumptions or creative decisions.

### When to Ask Questions

Ask clarifying questions when encountering:

1. **Ambiguities**:
   - Multiple valid interpretations of requirements
   - Unclear or vague acceptance criteria
   - Undefined technical approaches
   - Ambiguous scope boundaries

2. **Conflicts**:
   - Story contradicts epic requirements
   - Technical specs conflict with architecture
   - Different sections of story contradict each other
   - Breaking changes to established patterns

3. **Gaps**:
   - Missing essential information
   - Incomplete technical specifications
   - Undefined error handling or edge cases
   - Unspecified integration points

4. **Technical Decisions**:
   - Choice between multiple valid approaches
   - Technology selection not in architecture docs
   - Pattern deviations without justification
   - Performance vs simplicity trade-offs

5. **Hallucinations**:
   - Technical claims not in architecture docs
   - Invented libraries or frameworks
   - API endpoints not in specs
   - Unverified technical details

### How to Ask Questions

Use `AskUserQuestion` tool with:

**Question Format**:

```yaml
question: "[Specific question about the issue]"
header: "[Short label, max 12 chars]"
options:
  - label: "[Option 1]"
    description: "[What this means and implications]"
  - label: "[Option 2]"
    description: "[What this means and implications]"
  - label: "[Option 3 if applicable]"
    description: "[What this means and implications]"
```

**Question Quality Guidelines**:

- **Specific**: Reference exact location in story
- **Contextual**: Explain what was found and why it's an issue
- **Actionable**: Options lead to clear fixes
- **Informed**: Present trade-offs and implications
- **Neutral**: Don't bias toward one option

### Question Examples

#### Example 1: Ambiguous Requirement

```yaml
question: "Story AC #2 says 'provide fast response times' but doesn't specify a measurable threshold. What is the acceptable response time?"
header: "Response Time"
options:
  - label: "< 100ms (p95)"
    description: "Very fast, requires caching and optimization. Standard for real-time features."
  - label: "< 500ms (p95)"
    description: "Fast enough for most user interactions. Easier to achieve."
  - label: "< 2 seconds (p95)"
    description: "Acceptable for non-critical operations. Minimal optimization needed."
  - label: "Not performance-critical"
    description: "Remove specific timing requirement, rely on general performance standards."
```

#### Example 2: Technical Conflict

```yaml
question: "Story Dev Notes mention using 'WebSocket' but architecture docs specify Socket.IO for real-time communication. Which should be used?"
header: "Real-time Tech"
options:
  - label: "Socket.IO (Recommended)"
    description: "Matches architecture standard. Auto-fallback, rooms, namespaces. Already in use for chat."
  - label: "Native WebSocket"
    description: "Lower-level, more control. Requires custom reconnection logic. Deviates from standard."
  - label: "Update architecture docs"
    description: "Keep WebSocket in story, update architecture to allow native WebSocket for specific use cases."
```

#### Example 3: Missing Information

```yaml
question: "Task 3 mentions 'implement error handling' but doesn't specify what errors to handle. What error scenarios should be covered?"
header: "Error Cases"
multiSelect: true
options:
  - label: "Network errors"
    description: "Connection failures, timeouts, DNS errors"
  - label: "Authentication errors"
    description: "Invalid tokens, expired sessions, unauthorized access"
  - label: "Validation errors"
    description: "Invalid input, malformed data, constraint violations"
  - label: "Server errors"
    description: "500 errors, database failures, external service failures"
```

#### Example 4: Scope Clarification

```yaml
question: "Story includes tasks for 'comprehensive testing' but epic only requires unit tests. Should integration/e2e tests be included?"
header: "Test Scope"
options:
  - label: "Unit tests only"
    description: "Match epic requirement. Faster, simpler. Align with original scope."
  - label: "Unit + Integration"
    description: "More thorough. Tests API interactions. Adds time but better quality."
  - label: "Full test suite"
    description: "Unit + Integration + E2E. Maximum coverage. Significant time investment."
  - label: "Update epic"
    description: "Comprehensive testing is the right approach. Update epic to match story scope."
```

#### Example 5: Hallucination Resolution

```yaml
question: "Story mentions using 'react-query-plus' library which is not in tech-stack.md or package.json. How should data fetching be handled?"
header: "Data Fetching"
options:
  - label: "Use documented library"
    description: "Replace with existing solution from architecture docs (specify which one)"
  - label: "Add new library"
    description: "react-query-plus is correct choice. Update tech stack docs and install it."
  - label: "Clarify intent"
    description: "Story author meant something else. What was the intended approach?"
```

### Batching Questions

**IMPORTANT**: When multiple issues found in same category, batch related questions:

**Good** (batched):

```yaml
questions:
  - question: "Three ACs have ambiguous criteria. Should all be made measurable?"
    # ... options
  - question: "Two tasks mention undefined file paths. Use standard locations?"
    # ... options
```

**Bad** (one at a time):

- Asking 10 separate questions sequentially
- Making user answer questions one-by-one
- Interrupting review flow repeatedly

**Batching Strategy**:

1. Complete full review analysis first
2. Group related issues by category
3. Create 1-4 high-impact questions (max)
4. Ask all questions in single AskUserQuestion call
5. Use multiSelect where appropriate
6. Continue review with user's decisions

### Pre-pass Summary Consumption

Before formulating questions in any step, consult the pre-pass summaries from Step 1's pre-pass execution:

- **PREPASS_A** (epic alignment): if `alignment` is `drift` or `conflict`, surface findings with `severity: medium|high` during the epic alignment review (Step 3) and carry them to the Unified Question Point.
- **PREPASS_B** (architecture alignment): if `alignment` is `drift` or `conflict`, surface findings with `severity: medium|high` during the technical accuracy review (Step 4) and carry them to the Unified Question Point.
- **PREPASS_C** (codebase scan): if `implementation_status` is `partial` or `fully-implemented`, surface the relevant findings during the completeness review (Step 5) and carry them to the Unified Question Point — ask whether the story should be scoped down or closed.

Severity `low` findings from any summary: add to the review report findings list but do not elevate to a user question unless they cluster with other issues.

If a pre-pass summary is absent (agent failed or returned `alignment: unknown` / `implementation_status: unknown`): treat that axis as unreviewed and rely on in-line discovery for that phase.

### After Questions Answered

1. **Incorporate User Decisions**: Use answers to inform recommendations
2. **Document Rationale**: Include user's reasoning in review report
3. **Prioritize Issues**: Severity based on user's priorities
4. **Aligned Recommendations**: Fixes reflect user's vision, not AI assumptions

---

## Review Workflow (Unified Analysis & Batch Questioning)

**CRITICAL Execution Protocol**:

1. **Zero Intermediate Finding-Clarification:** While running the analysis steps (Steps 2–8), the agent MUST NOT pause to ask the user clarifying questions about review findings — collect every finding silently and defer all finding-clarification to the single Unified Question Point after Step 8. This does **not** suppress the explicit pre-flight and side-effect gates that have their own defined prompts: the Step 0 output-format choice, the Step 0a branch-setup prompts, and the Step 2 tracker-sync opt-in. Those still fire at their defined points.
2. **Unified Question Batching:** The agent must collect all compliance gaps, epic conflicts, technical inaccuracies, and UI wireframe opportunities into memory.
3. **Single Prompt Turn:** After completing Step 8, the agent presents a single consolidated `AskUserQuestion` call containing up to 4 high-impact questions covering all findings.
4. **No Partial Reviews:** If a step requires information from a later step (e.g., assessing whether a wireframe is needed based on screen inventory), it must be done during the initial scan.

**Pre-pass summaries** (`PREPASS_A`, `PREPASS_B`, `PREPASS_C` from Step 1's pre-pass execution): Before formulating any question in Steps 2–8, check the relevant pre-pass summary first. If a finding has `severity: high` or `severity: medium`, surface it as a clarifying question rather than asking the user to discover it themselves. If a finding has `severity: low`, note it in the review report without necessarily elevating it to a user question. If the relevant pre-pass summary is absent (agent failed), proceed with in-line discovery as usual.

### Step 0: Determine Mode and Output Format

**Purpose**: Detect interactive vs validate mode; in interactive mode ask user for output format preference.

**Actions**:

1. **Detect mode** (from invocation flags / natural language — see Mode Detection above):
   - **Validate mode**: set `MODE=validate`. Skip `AskUserQuestion` entirely. Skip the Unified Question Point. Then branch on the `APPLY` flag (see Validate Sub-Modes above):
     - **Standalone validate** (`APPLY=false`, default, read-only): save the report as `.validate.{date}.md`. Skip Steps 9.5 and 10 — never modify the story document.
     - **Validate-and-apply** (`APPLY=true`, set automatically by the `develop-story`/`po` orchestrator): save the report as `story.{epic}.{story}.review.{n}.{story-name}.md`, then run the constrained, non-interactive forms of Steps 9.5 (apply critical + important fixes) and 10 (promote `Draft → Ready for Development` on a GO; HALT on NO-GO). See those steps' Pipeline notes.
   - **Interactive mode**: set `MODE=interactive`. Continue to step 2 below.

2. **Interactive mode only** — use `AskUserQuestion` to ask about desired output format:

```yaml
question: "Would you like a comprehensive review report saved to a file, or just an actionable plan for immediate fixes?"
header: "Output Format"
options:
  - label: "Comprehensive report"
    description: "Generate detailed review report saved to story.{epic}.{story}.review.{n}.{story-name}.md with all findings, user decisions, and recommendations documented. The {story-name} slug MUST match the parent story file's name slug exactly (the hyphenated portion after `story.{epic}.{story}.` in the story filename) — never a free-form summary of the review focus."
  - label: "Action plan only"
    description: "Provide prioritized list of issues and fixes to action immediately without saving a report file."
```

3. Store `MODE` and output format preference for use throughout the workflow.

**Pipeline note**: When invoked by the `develop-story` orchestrator, always use the **validate-and-apply** variant — set `MODE=validate` and `APPLY=true`, and skip the `AskUserQuestion`. This applies critical + important fixes and promotes the story on a GO (Steps 9.5 and 10 run in their constrained, non-interactive forms) and writes the report as `story.{epic}.{story}.review.{n}.{story-name}.md`. Only ask interactively when invoked standalone in interactive mode; standalone validate (`APPLY=false`) stays read-only.

4. **Initialize task list** — use `TaskCreate` to register every step as a tracked task. Mark each `in_progress` before starting and `completed` immediately after finishing. This prevents silently skipping steps.

**Interactive mode task list:**

| Task Subject                | Description                                                         |
| --------------------------- | ------------------------------------------------------------------- |
| Determine output format     | Capture user's report vs action-plan preference                     |
| Branch setup                | Ensure review runs on a feature branch (Step 0a)                    |
| Load config & context       | Load skills-config.yaml, locate story + architecture docs           |
| Template compliance         | Verify story structure against template                             |
| Epic alignment              | Check story fits within its parent epic                             |
| Technical accuracy          | Anti-hallucination review of implementation details                 |
| Completeness & gap analysis | Identify missing ACs, tasks, NFRs                                   |
| Consistency & conflicts     | Detect internal contradictions                                      |
| Quality & clarity           | Score story readability and precision                               |
| Previous story context      | Review predecessor story if applicable                              |
| Generate output             | Produce report file or action plan                                  |
| Offer to implement fixes    | Ask user if fixes should be applied now (Step 9.5 — always execute) |
| Update document status      | Offer status update based on review outcome                         |

**Validate mode task list:**

| Task Subject                | Description                                                   |
| --------------------------- | ------------------------------------------------------------- |
| Branch setup                | Validate-mode short-circuit (no-op when pipeline owns branch) |
| Load config & context       | Load skills-config.yaml, locate story + architecture docs     |
| Template compliance         | Verify story structure against template                       |
| Epic alignment              | Check story fits within its parent epic                       |
| Technical accuracy          | Anti-hallucination check of implementation details            |
| Completeness & gap analysis | Identify missing ACs, tasks, NFRs                             |
| Consistency & conflicts     | Detect internal contradictions                                |
| Quality & clarity           | Score story readability and precision                         |
| Previous story context      | Review predecessor story if applicable                        |
| Generate validation report  | Write verdict + findings to `.validate.{date}.md`             |
| Post tracker comment        | Notify linked issue with verdict (non-blocking)               |

**Output**: Mode and output format captured; task list initialized

---

### Step 0a: Branch Setup (BEFORE any document mutation)

**Purpose**: Ensure all review artifacts (status updates, Change Log entries, `.review.*.md` reports, Jira/GitHub sync) land on a dedicated feature branch — not on `develop`/`main`.

**Pre-conditions**: `DOC_FILE` (story file path from Input Resolution), `MODE` (from Step 0), `SKILL_NAME=review-story`.

**Actions**: Execute the full protocol in `references/review-pipeline-step-0a-branch-setup.md`. Apply the **review-story** variant throughout:

- 0a.0 validate-mode short-circuit (skips entirely when `MODE=validate`).
- 0a.2 extract `EPIC_NUM`, `STORY_NUM` from filename + validate story `epic:` frontmatter is present.
- 0a.3 auto-skip when on `feature/story.${EPIC_NUM}.${STORY_NUM}.*`.
- 0a.4 prompt: single question — story branch base (default `${BASE_DEFAULT}`, i.e. `develop`; overridable). No epic branch is created.
- 0a.5–0a.8 stash (`git stash create` + `store`) → invoke `/create-branch` with resolved `BASE_BRANCH` → pop stash by hash.

**Output**: `BRANCH_NAME`, `BASE_BRANCH`, `AUTO_SKIPPED` exported. Decisions Log entry (or inline preamble) recorded per 0a.9.

**Failure**: HALT with the exact error; stash recovery instructions surfaced; no document edits attempted.

---

### Step 1: Context Discovery and Parallel Pre-pass Execution

Purpose: Parallelize file discovery, project structure checks, and core alignment evaluations into a single background turn cycle to minimize latency and context bloat.
Actions:

1. Resolve paths: Source references/resolve-paths.sh to populate ${PRD_ROOT} and ${ARCH_ROOT}.
2. Load skills-config.yaml from the project root (or apply default fallback values).
3. Load the primary story document in full using the Read tool.
4. Dispatch Parallel Subagents: Execute one single message to parallelize background analysis. Invoke four subagent operations concurrently:
   - Subagent 1 (Discovery): Scan directories and find the parent epic file path, the previous story path, the template file, and identify at most 2-3 matching domain-specific architecture files. Return only file paths and 1-line descriptions.
   - Subagent 2 (Epic Alignment): Evaluate the story's alignment against the parent epic requirements. Return a compact YAML summary (PREPASS_A).
   - Subagent 3 (Architecture Alignment): Evaluate the story's technical details against core system architecture. Return a compact YAML summary (PREPASS_B).
   - Subagent 4 (Codebase Scan): Analyze current branch implementation status. Return a compact YAML summary (PREPASS_C).
5. Handle Failures Gracefully: If any alignment/scan subagents fail or return an unknown status, log a specific warning (e.g., "⚠️ Pre-pass Agent A failed - proceeding via in-line discovery") and fall back to native validation checks in Steps 2-6.
   Output: Up to 3 verified YAML summaries stored in active context; target file paths fully resolved for immediate step execution.

---

### Step 2: Template Structure Compliance Review

**Purpose**: Verify story follows required template structure

**Questions to Answer**:

- Are all required sections present?
- Are there unfilled placeholders (e.g., `{{role}}`, `_TBD_`, `[TODO]`)?
- Does structure match template requirements?
- Are all agent-editable sections included?
- Are QA integration sections present?

**Validation Checks**:

1. **Section Presence**:
   - Status
   - Story Statement
   - Acceptance Criteria
   - Tasks / Subtasks
   - Dev Notes
   - Testing (subsection of Dev Notes)
   - Manual Testing Steps (subsection of Dev Notes) — required for UI/navigation stories
   - Stakeholder Sign-off — **only when `sign-off.enabled: true`** in `skills-config.yaml` (see check 4a); never expected otherwise
   - Change Log
   - Dev Agent Record
   - QA Handoff Notes
   - QA Report
   - Bug Reports

2. **File Naming Convention**:
   - MUST follow: `story.[epic].[story].[descriptive-name].md`
   - Use DOTS (.) for structural separators
   - Use hyphens (-) within descriptive names
   - Examples:
     - ✅ `story.2.1.auto-hide.md`
     - ❌ `story-2-1-auto-hide.md`
     - ❌ `2.1-auto-hide.md`

2a. **OKF frontmatter conformance** (see [`open-knowledge-format.md`](references/open-knowledge-format.md)):

- `type: story` present and non-empty → **Critical** if missing/empty (OKF's one hard requirement).
- `description` (one-sentence summary) present → **Important** if missing.
- `tags` is a YAML list (when present); `resource` is a URI (when present) → **Optional** if malformed. `updated` ≡ OKF `timestamp`; the tracker URL (`github_url`/`jira_url`) ≡ OKF `resource` — absence of an explicit `resource` is not a finding.

3. **Placeholder Detection**:
   - Search for: `{{...}}`, `_TBD_`, `[TODO]`, `[PLACEHOLDER]`, `???`
   - Each unfilled placeholder is a gap

4. **Section Structure**:
   - Story Statement must use "As a / I want / So that" format
   - Acceptance Criteria must be numbered list
   - Tasks must use checkbox format with subtasks
   - Change Log must be table format

4a. **Stakeholder Sign-off** (conditional — full spec: [`references/sign-off.md`](references/sign-off.md)):

Read `sign-off.enabled` from `skills-config.yaml`. **When it is absent or `false`, skip this check entirely** — do not flag a missing section, do not mention sign-off in the report. When `sign-off.enforcement` is `off`, likewise skip.

Otherwise check exactly two things — presence and fill. **There is no git verification, no name matching, and no identity check**; the commit history behind each signature is the audit trail and is left for humans to inspect.

- **Grade the table, not the config.** The rows present in the document are the source of truth. A row added by hand during refinement is enforced exactly like a config-seeded one; a deleted row is a removed requirement, visible in the diff. Never rewrite an existing table to match the config roster.
- A row is **signed** when both its Signature and Date cells are non-empty after trimming. Cells holding only a placeholder (`_sign here_`, `TBD`, `—`, `-`, `N/A`) count as **unsigned**.
- A row is **optional** when its Role cell ends with ` (optional)` (case-insensitive). Optional rows are **never graded** — an unsigned optional row is not a finding at any enforcement level.
- Flag when the section is **missing entirely**, or when **any required row is unsigned**.
- Correct the `**Sign-off status:**` line if it disagrees with the table; the table wins.

Severity is driven by `sign-off.enforcement`:

| `enforcement`        | Severity      | Verdict effect                                                                        |
| -------------------- | ------------- | ------------------------------------------------------------------------------------- |
| `advisory` (default) | **Important** | Score deduction only. The verdict may still be GO — `develop-story` must not be blocked. |
| `blocking`           | **Critical**  | Forces NO-GO. Do **not** promote the story out of `draft` in Step 10 — the develop pipeline gates on `Status:`, not on the score, so leaving the status unpromoted is what actually stops the run. |
| `off`                | not checked   | —                                                                                      |

Name the outstanding roles so the human knows who to chase:

```markdown
- **[Important]** Stakeholder Sign-off incomplete — 1 of 2 required signatures.
  Awaiting: **Tech Lead**. Enforcement is `advisory`, so this does not block development.
```

> **Never sign on a stakeholder's behalf.** This applies in validate-and-apply mode too: the auto-fix pass may create a missing section (roles only, from the roster) but must **never** write into a Signature or Date cell. An unsigned document stays unsigned until a human commits their name.

4b. **Change Log** (conditional — canonical spec: [`document-change-log.md`](references/document-change-log.md)):

Read `change-log.enabled` from `skills-config.yaml`. It defaults to **`true`**, unlike sign-off — a log is a record of what happened, not a gate on a human. **Skip this check entirely when `change-log.enabled: false`, or when `change-log.enforcement: off`.**

The Change Log already appears in the Section Presence list above; this check adds the second half — whether the log is *current*, not merely present:

- **Presence** — the document has a `## Change Log` section with the four canonical columns and at least one row.
- **Currency** — the newest row is consistent with frontmatter `status`. Flag **only** when `status` has advanced past `draft` **and** no row mentions a review, a status change, or an implementation event. A story at `ready-for-development` whose log stops at `Initial draft` is stale: a review promoted it and recorded nothing.

> **Define currency narrowly, and do not widen it.** The check compares the newest row against `status:` — not against the story's actual diff. A reviewer who edits prose without adding a row is not caught, and that is accepted at `advisory`. The failure mode being avoided is the opposite one: a heuristic eager enough to flag legitimately quiet documents trains reviewers to ignore the finding, and an ignored check is a check that does not exist. A no-findings review still writes a row (Step 10), so the quiet case is already covered by a writer rather than exempted here.

Severity is driven by `change-log.enforcement`:

| `enforcement`        | Missing or stale                                | Effect on the pipeline                                                                                                    |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `advisory` (default) | **Important** issue + readiness-score deduction | None — verdict may still be GO, `develop-story` proceeds                                                                  |
| `blocking`           | **Critical** issue → NO-GO                      | Do **not** promote the story out of `draft` — `develop-story` gates on `Status:`, so leaving it unpromoted is what actually stops the run |
| `off`                | not checked                                     | None                                                                                                                      |

Reviewer output — name what is stale and what would fix it:

```markdown
- **[Important]** Change Log is stale — newest row is `1.0 Initial draft` (2026-05-11) but
  status is `ready-for-development`. Enforcement is `advisory`, so this does not block development.
```

Under `blocking`, the same finding is `[Critical]` and the closing sentence becomes `Enforcement is 'blocking' — development cannot begin until the log is current.`

> **Expect legacy documents to report exactly one Important finding.** There is no backfill: every document written before the Change Log spec existed has no section. `advisory` is the default precisely so those documents score one point lower and report one extra finding while still returning GO. A missing section on an old document is not a defect in that document — it is the adoption boundary.

5. **Title Format**:
   - When the story `title` frontmatter (or the `# ` heading) embeds a story-id prefix, it MUST use the canonical bracket form `[Story N.M] Name` — never the colon form `Story N.M: Name` nor the hyphen form `Story N-M: Name`.
   - Detect by matching `^\s*Story\s+[\d.\-]+\s*:` against the title/heading value; also flag a bare `Story N.M` / `Story N-M` prefix that lacks the brackets.
   - Flag as a **Major** issue. `sync-jira-story`'s `normaliseStorySummary` strips the **colon-dot** form on push, but the **hyphen** form (`Story 1-1:`) is NOT stripped and produces a doubled summary (`[Story 1.1] Story 1-1: …`); either way the local doc title shows the wrong format until corrected.
   - Fix: set `title` to the bracket form `[Story N.M] Name` (or to the bare descriptive name — `sync-jira-story` prepends `[Story {epic}.{story}]` automatically), then re-run `sync-jira-story` so the Jira issue summary is corrected in the same operation. Apply this fix before any tracker sync.

6. **Tracker Issue Linkage**:

   Detect tracker platform using the canonical resolver — see `references/platform-detection.md`. Source the helper once per skill invocation:

   ```bash
   source references/resolve-platform.sh || exit 1
   # TRACKER = jira | github
   ```
   - When `TRACKER=jira` → **Jira path** (check for `jira_key:` in frontmatter)
   - When `TRACKER=github` → **GitHub path** (check for `github_issue:` in frontmatter)

   **Tracker dedup** (applies to both paths, runs only when `jira_key` / `github_issue` is absent):

   Before creating a new tracker issue, search the tracker for an existing one matching the story title. This prevents duplicate issues when frontmatter was hand-edited or the story was authored outside the standard creation flow.

   Lookup order:
   1. **Frontmatter present** (`jira_key` / `github_issue` has a value) → use it; skip create entirely.
   2. **Frontmatter absent** → run title-based search (see per-path details below):
      - Exactly one match (any status) → write frontmatter + body link, log `"Linked existing tracker issue"`, skip create (including `ensure-epic-jira-issue` / `ensure-epic-github-issue` — existing issue assumed already linked to its parent epic).
      - Closed match → additionally log closed-issue warning.
      - Zero or multiple matches → fall through to create (existing behaviour); multi-match logs all match IDs.
      - Search failure → log warning and fall through to create (existing behaviour preserved).
   3. **Frontmatter write-back**: on link-existing, write `jira_key` + `jira_url` (or `github_issue`) before the closing `---` of the frontmatter block (same sed-based pattern as `create-task`). Also insert/repair the body cross-reference link so the next review pass does not flag it as missing.

# Tracker Dedup Fallback Search Addendum (Applies to both Jira and GitHub paths):

- Pattern Match Search (Primary): Query by string prefix "[Story {epic}.{story}] {title}".
- Structural Label Search (Fallback - Execute if primary match returns zero results):
  - For Jira: Execute Atlassian MCP searchJiraIssuesUsingJql with jql: `project = {JIRA_PROJECT_KEY} AND labels = "story-${EPIC_NUM}.${STORY_NUM}"`.
  - For GitHub: Run `gh issue list --search "label:story-${EPIC_NUM}.${STORY_NUM}" --state all --json number,url,state,title`.
- Handling Drift: If a single match is found via the fallback label search but the title has drifted from the local filename/title, link the existing tracker issue, write back the keys to frontmatter, and log a warning: "⚠️ Title drift detected between local file and existing tracker issue. Issue linked via structural label." Also insert/repair the body cross-reference link so the next review pass does not flag it as missing.

  **Jira path:**

  > **Note**: priority drift between local frontmatter and remote Jira is corrected by `/sync-jira-story`, not by review. No analogue of the GitHub Project-board priority helper is needed — Jira priority is a built-in issue field, not a label, and `jira-sync.js` (`normalisePriority` + `diffFields`) already keeps them in sync.
  - Frontmatter MUST contain `jira_key:` field
  - If `jira_key:` is missing or `null`:
    - Flag as **Important** gap
    - **Offer tracker sync (opt-in)** — prompt with `AskUserQuestion` (same gate as `/create-story` Step 5.2a; never create a remote issue unprompted):
      > **Header:** `Tracker sync`
      > **Question:** "This story has no linked Jira issue. Create and link one now? Detected platform: Jira."
      > **Options:**
      >
      > - **Sync to Jira** `(Recommended)` — create the Jira issue, link it to the parent epic, and write `jira_key`/`jira_url` to frontmatter.
      > - **Skip — leave unlinked** — make no remote changes; leave `jira_key` unwritten. The user can run `/sync-jira-story` later.
      >
      > The user may also pick "Other" (auto-provided) to skip or explain.
    - **Skip / no sync chosen** → make no remote changes, keep the Important gap flagged, log `"Tracker sync skipped by user — run /sync-jira-story later."` and continue the review. Do NOT halt.
    - If the user chooses **Sync to Jira**: 0. **Pre-create dedup search (Tracker dedup)** — run before steps 1–4:
      - Use Atlassian MCP `searchJiraIssuesUsingJql`:
        - `jql`: `summary ~ "[Story {epic}.{story}] {title}" AND project={JIRA_PROJECT_KEY}` (no status filter — all states)
        - Verify story title pattern against what `/create-story` Step 5.2a / `sync-jira-story` actually emits; align if the format differs
        - On search failure (outage / rate-limit): log `"⚠️ Jira dedup search failed — proceeding to create"` and fall through to steps 1–4 below (preserves current behaviour)
        - **Fallback Structural Label Search**: If primary title match returns zero results, execute fallback search with jql: `project = {JIRA_PROJECT_KEY} AND labels = "story-${EPIC_NUM}.${STORY_NUM}"` (see Tracker Dedup Fallback Search Addendum for details).
      - **Exactly one match** → link existing, skip steps 1–4 entirely (including `ensure-epic-jira-issue`):
        - Extract `jira_key` and build `jira_url = ${JIRA_URL}/browse/${jira_key}`
        - Write `jira_key: {jira_key}` and `jira_url: {jira_url}` into frontmatter (sed-based insert before closing `---`, same pattern as `create-task`)
        - Insert or repair body cross-reference link: `**Jira Issue**: [{jira_key}]({jira_url})`
        - Existing issue is assumed to already have its parent epic linkage — do NOT re-invoke `ensure-epic-jira-issue`
        - If matched issue status is `Closed` or `Done`: log `"⚠️  Linked existing CLOSED tracker issue {jira_key} — verify intent before continuing."`
        - Log `"Linked existing tracker issue {jira_key} (skipped create)"` and **skip steps 1–4 below**
      - **Zero matches** → fall through to steps 1–4 below
      - **Multiple matches** → log `"⚠️ Dedup: {N} matches found for \"[Story {epic}.{story}]\": {key1}, {key2}, … — proceeding to create"` and fall through to steps 1–4 below
      1.  Derive the epic file path using the grandparent directory rule:
          ```bash
          STORY_DIR=$(dirname "{resolved story file path}")
          EPIC_DIR=$(dirname "$(dirname "$STORY_DIR")")
          EPIC_FILE_PATH="${EPIC_DIR}/$(basename "$EPIC_DIR").md"
          ```
          If the file doesn't exist, glob for `epic.*.md` in `$EPIC_DIR`. If still not found, log `⚠️ Epic file not found — skipping parent epic issue check` and set `EPIC_JIRA_KEY=""`.
      2.  If the file exists, invoke the `ensure-epic-jira-issue` sub-routine with `EPIC_FILE_PATH`. On return, `EPIC_JIRA_KEY` is set or empty. Set `EPIC_TRACKER_KIND="jira"`.
      3.  Create the Jira Story using the same pattern as `/create-story` Step 5.2a (Jira path), using `EPIC_JIRA_KEY` for `jira_epic_key` linkage
      4.  Write `jira_key`, `jira_epic_key`, `jira_url` into frontmatter and Story Information table
  - If `jira_key:` has a value, verify the issue exists using the `getJiraIssue` Atlassian MCP tool with `issueIdOrKey: {jira_key}` and `fields: ["status", "summary"]`.
    - If the tool returns a valid issue object → issue exists, continue.
    - If the tool returns an error or null/empty result → flag as **Critical**: "Jira issue `{jira_key}` not found — it may have been deleted". Do NOT halt — record the finding and continue the review.
  - **URL consistency check** (when `jira_key` is present and valid):
    - If `jira_url:` is also in frontmatter: verify it equals `{JIRA_URL}/browse/{jira_key}`. Any mismatch → flag as **Important**: "`jira_url` does not match `jira_key`"
    - Look for a `**Jira Epic**: [KEY](url)` or `**Jira Issue**: [KEY](url)` line in the story body. If found: verify the KEY matches `jira_key` and the URL ends with `/browse/{jira_key}`. Any mismatch → flag as **Important**: "Body cross-reference link does not match `jira_key`"
    - If no body link is found: flag as **Important** — add one (e.g., `**Jira Issue**: [{jira_key}]({jira_url})`)

  **GitHub path** (when `TRACKER=github`):
  - Frontmatter MUST contain `github_issue:` field
  - If `github_issue:` is missing or `null`:
    - Flag as **Important** gap
    - **Offer tracker sync (opt-in)** — prompt with `AskUserQuestion` (same gate as `/create-story` Step 5.2a; never create a remote issue unprompted):
      > **Header:** `Tracker sync`
      > **Question:** "This story has no linked GitHub issue. Create and link one now? Detected platform: GitHub."
      > **Options:**
      >
      > - **Sync to GitHub** `(Recommended)` — create the GitHub issue, link it as a sub-issue of the parent epic, add it to the project board, and write `github_issue` to frontmatter.
      > - **Skip — leave unlinked** — make no remote changes; leave `github_issue` unwritten. The user can run `/sync-github-story` later.
      >
      > The user may also pick "Other" (auto-provided) to skip or explain.
    - **Skip / no sync chosen** → make no remote changes, keep the Important gap flagged, log `"Tracker sync skipped by user — run /sync-github-story later."` and continue the review. Do NOT halt.
    - If the user chooses **Sync to GitHub**: 0. **Pre-create dedup search (Tracker dedup)** — run before steps 1–4:
      1. Search for an existing issue:
         ```bash
         gh issue list --search "in:title \"[Story {epic}.{story}]\"" --state all \
           --json number,url,state,title
         ```
         Verify story title pattern against what `/create-story` Step 5.2a actually emits; align if the format differs.
         On failure: log `"⚠️ GitHub dedup search failed — proceeding to create"` and fall through to steps 1–4 below
         - **Fallback Structural Label Search**: If primary title match returns zero results, run: `gh issue list --search "label:story-${EPIC_NUM}.${STORY_NUM}" --state all --json number,url,state,title` (see Tracker Dedup Fallback Search Addendum for details).
      2. **Exactly one match** → link existing, skip steps 1–4 entirely (including `ensure-epic-github-issue`):
         - Extract `N` (issue number) and `url` from the result
         - Write `github_issue: {N}` into frontmatter (sed-based insert before closing `---`, same pattern as `create-task`)
         - Insert or repair body cross-reference link: `[#{N}](https://github.com/{owner}/{repo}/issues/{N})`
         - Existing issue is assumed to already have its parent epic linkage — do NOT re-invoke `ensure-epic-github-issue`
         - If matched issue `state` is `CLOSED`: log `"⚠️  Linked existing CLOSED tracker issue #{N} — verify intent before continuing."`
         - Log `"Linked existing tracker issue #{N} (skipped create)"` and **skip steps 1–4 below**
      3. **Zero matches** → fall through to steps 1–4 below
      4. **Multiple matches** → log `"⚠️ Dedup: {count} matches found for \"[Story {epic}.{story}]\": #{n1}, #{n2}, … — proceeding to create"` and fall through to steps 1–4 below
      5. Derive the epic file path using the grandparent directory rule:
         ```bash
         STORY_DIR=$(dirname "{resolved story file path}")
         EPIC_DIR=$(dirname "$(dirname "$STORY_DIR")")
         EPIC_FILE_PATH="${EPIC_DIR}/$(basename "$EPIC_DIR").md"
         ```
         If the file doesn't exist, glob for `epic.*.md` in `$EPIC_DIR`. If still not found, log `⚠️ Epic file not found — skipping parent epic issue check` and set `EPIC_ISSUE_NUM=""`.
      6. If the file exists, invoke the `ensure-epic-github-issue` sub-routine with `EPIC_FILE_PATH`. On return, `EPIC_ISSUE_NUM` is set or empty. Set `EPIC_TRACKER_KIND="github"`.
      7. Invoke the `ensure-story-github-issue` sub-routine with `STORY_FILE_PATH={resolved story file path}` and `EPIC_ISSUE_NUM={value returned by ensure-epic-github-issue}`. The sub-routine handles:
         - creating the issue (with title `[Story {epic}.{story}] {title}`, `story` + `priority:{priority}` labels, milestone `Epic {epic} — {epic_title}`)
         - adding it to the GitHub Project board
         - mirroring the priority label onto the board's Priority single-select field
         - linking the new issue as a sub-issue of the parent epic issue (only if `EPIC_ISSUE_NUM` is non-empty)
         - writing `github_issue: {N}` into the story frontmatter and adding/repairing the Story Information table row.

         On return, `STORY_ISSUE_NUM` is set (integer) or empty (on failure). Failure is non-blocking — review continues with a flagged Important gap.
  - If `github_issue:` has a numeric value:
    - Verify the issue exists: `gh issue view {N} --json state -q '.state'`
      - If the issue doesn't exist (command errors), flag as **Critical**
    - **URL consistency check** — verify the cross-reference link in the story body is correct:
      - Look for any markdown link of the form `[#N](url)` or `[#N](https://github.com/...)` in the story body
      - If found: confirm the issue number in the link matches `github_issue:` in frontmatter; and confirm the URL path ends with `/issues/{N}`. Any mismatch → flag as **Important**: "Body link `[#X](url)` does not match frontmatter `github_issue: {N}`"
      - If no body link found: flag as **Important** — add one (e.g., `[#{N}](https://github.com/{owner}/{repo}/issues/{N})`)

6a. **Tracker Card Preflight**:

   The tracker card is a **summary that points at this document**, not a copy of
   it — see [`references/tracker-card-summary.md`](./references/tracker-card-summary.md).
   It is built from a handful of named `## ` headings, so a document whose
   headings do not match that list publishes a thin or empty card **and the sync
   still reports success**. That is not hypothetical: 28 task cards once shipped
   with empty bodies, and ~98% of stories published their acceptance criteria
   and nothing else. Both went unnoticed because there is no error to raise.

   Run the preflight (no auth, no network, no writes — it only reads the file):

   ```bash
   node .agents/skills/sync-jira-story/scripts/sync-jira-story.js --file "{story-file-path}" --check-card
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
     builder caps it (4-sentence summary, 5 acceptance criteria) and announces every omission
     with a `+N more` link, so a long document cannot produce a long card.

   Report the `+N more` counts in the review body as information, not a defect —
   they tell the author how much of the section a board reader will not see.

**Issues to Flag**:

- **Critical**: Missing required sections (Story, ACs, Tasks, Dev Notes); unsigned sign-off when `sign-off.enforcement: blocking`; a tracker-card block that fails preflight with `missing`, `empty`, or `no-body`
- **Important**: Unfilled placeholders in core sections, missing GitHub issue linkage; unsigned sign-off when `sign-off.enforcement: advisory` (the default)
- **Optional**: Missing optional sections or subsections

**Output**: Section compliance report with specific issues listed. Card-preflight findings count toward the **Template Compliance** score — a document that cannot produce a usable card is not template-compliant, whatever else it satisfies. A missing or stale **Change Log** (check 4b) also deducts from this score under `change-log.enforcement: advisory`, and is named in that row's note.

---

### Step 3: Epic Alignment Verification

**Purpose**: Ensure story accurately implements epic requirements

**Questions to Answer**:

- Do Acceptance Criteria match epic requirements?
- Are there AC deviations without justification?
- Does story scope align with epic story definition?
- Are epic dependencies properly reflected?
- Are there requirements in epic not covered in story?

**Validation Checks**:

1. **AC Comparison**:
   - Compare story ACs with epic story requirements
   - Flag additions not in epic
   - Flag omissions from epic
   - Flag wording changes that alter meaning

2. **Scope Verification**:
   - Story should implement one epic story item
   - Should not expand beyond epic scope without notes
   - Should not reduce scope without justification

3. **Dependency Check**:
   - Epic dependencies should be documented in story
   - Cross-story dependencies should be noted

4. **Justification Review**:
   - If deviations exist, check for Dev Notes explaining why
   - Deviations without justification are issues

**Issues to Flag**:

- **Critical**: Missing epic ACs, unjustified scope reduction
- **Important**: AC wording changes meaning, missing dependencies
- **Optional**: Additional ACs without epic source reference

**Output**: Epic alignment report with deviations noted

**Questions to Collect** (for batch asking):

- When AC deviations found: Intentional change or mistake?
- When scope differs: Update story or update epic?
- When dependencies missing: Which dependencies are required?

---

### Step 4: Technical Accuracy and Anti-Hallucination Review

**Purpose**: Verify all technical claims are accurate and sourced

**Questions to Answer**:

- Is every technical detail traceable to source documents?
- Are there invented technologies, libraries, or patterns?
- Do technical specs match architecture documentation?
- Are all references correct and accessible?
- Are version numbers and configurations accurate?

**Validation Checks**:

1. **Source Verification**:
   - Every technical claim should have `[Source: ...]` reference
   - Verify source documents exist and contain the claim
   - Check for vague sources ("according to standards", "best practices")

2. **Technology Inventory**:
   - Extract all mentioned libraries, frameworks, tools
   - Cross-reference with architecture/tech-stack.md
   - Flag anything not documented in architecture

3. **API Specification Accuracy**:
   - Verify endpoint paths match REST API spec
   - Check request/response formats against architecture
   - Validate HTTP methods and authentication requirements

4. **Data Model Accuracy**:
   - Verify schema definitions against data-models.md
   - Check field names, types, validations
   - Validate relationships and constraints

5. **Configuration Accuracy**:
   - Check environment variables exist
   - Verify file paths match project structure
   - Validate naming conventions

6. **Reference Validation**:
   - Test all `[Source: ...]` references point to real sections
   - Check internal story links work
   - Verify external document references exist

**Common Hallucination Patterns to Detect**:

- ❌ "Uses the standard React patterns" (vague, no source)
- ❌ "Authentication uses OAuth2" (if not in architecture)
- ❌ "Testing requires 80% coverage" (if not specified)
- ❌ "API uses Redis for caching" (no source reference)
- ❌ Libraries not in package.json or tech stack docs
- ❌ Endpoints not in API specification
- ❌ Database fields not in schema definitions

**Issues to Flag**:

- **Critical**: Invented libraries/APIs, incorrect schema/endpoints
- **Important**: Missing source references, unverified technical claims
- **Optional**: Vague references, could be more specific

**Output**: Technical accuracy report with hallucinations identified

---

### Step 5: Completeness and Gap Analysis

**Purpose**: Identify missing information needed for implementation

**Questions to Answer**:

- Is Dev Notes section complete enough to implement without external docs?
- Are all ACs covered by tasks?
- Are file locations specified for new code?
- Are testing requirements clear?
- Are error handling and edge cases addressed?
- Are integration points defined?
- Are security considerations documented?

**Validation Checks**:

1. **Dev Notes Completeness**:
   - Should cover all technical areas needed:
     - Data models/schemas (if applicable)
     - API endpoints (if applicable)
     - Component specifications (if UI)
     - File locations (always)
     - Testing requirements (always)
     - Technical constraints (if applicable)
   - Each area should have specific, actionable details

2. **AC to Task Mapping**:
   - Every AC should be referenced by at least one task
   - Tasks should indicate which ACs they satisfy: `(AC: 1, 3)`
   - Check for orphaned ACs with no corresponding tasks

3. **Task Completeness**:
   - Tasks should be specific and actionable
   - File paths should be concrete, not vague
   - Subtasks should break down implementation steps
   - Each task should be measurably completable

4. **Testing Coverage**:
   - Testing section should specify:
     - Test file locations
     - Testing frameworks/tools
     - Key test scenarios
     - Coverage requirements
   - Should not just say "write tests"

4a. **Manual Testing Steps** (UI/navigation stories only):

- Must be present when story touches screens, modals, navigation, or user-visible interactions
- Must include: Prerequisites, Navigation Path, Verification Steps (one per AC), Edge Cases
- Navigation Path must name actual screens/buttons (not vague descriptions)
- Every AC must map to at least one verification step
- Acceptable placeholder: "To be confirmed during implementation" — but only for unknown screen names, not for the entire section
- Flag as **Important** if section is absent on a UI story
- Flag as **Optional** if present but navigation path uses vague language

5. **File Location Specification**:
   - New files should have specific paths
   - Paths should align with project structure docs
   - No vague locations ("in the services folder")

6. **Error Handling**:
   - Check for error scenarios in ACs or tasks
   - Should address failure cases, not just happy path
   - Should specify error messages/handling approach

7. **Integration Points**:
   - APIs consumed should be specified
   - Data sources should be identified
   - External dependencies should be listed
   - Integration testing should be planned

8. **Security Considerations**:
   - If story involves auth, data, or APIs:
     - Authentication requirements should be clear
     - Authorization checks should be specified
     - Input validation should be addressed
     - Sensitive data handling should be defined

9. **Effort Estimate**:
   - Check frontmatter for `estimated_effort_hours` (number).
   - **Absent or empty**: flag as **Optional** (LOW severity) — "No `estimated_effort_hours` set. PM tooling (Jira Original Estimate, GitHub Projects v2 Estimate field) will show this story as unestimated."
   - **Present**: recompute the rubric in `references/effort-estimation-rubric.md` against the current document state. If `abs(frontmatter - rubric) / max(frontmatter, rubric) > 0.5` (>2× divergence), flag as **Optional** (LOW severity): "Frontmatter `estimated_effort_hours: {X}` diverges from rubric estimate of **{Y}h** (AC: {n}, tasks: {m}, risk: {r}). Confirm or adjust."
   - Non-blocking — does **not** affect gate decision or readiness score. In Interactive mode, may offer a single prompt to accept the rubric's number; in Validate mode, observe silently.

**Issues to Flag**:

- **Critical**: ACs with no tasks, missing essential Dev Notes categories, no testing guidance
- **Important**: Vague file locations, missing error handling, incomplete testing specs
- **Optional**: Could add more detail, nice-to-have context, missing `estimated_effort_hours`

**Output**: Gap analysis report with missing information categorized

**Questions to Collect** (for batch asking):

- When critical gaps found: What should go in missing sections?
- When technical approach unclear: Which approach to use?
- When multiple valid options: User's preference?
- When testing scope undefined: What level of testing?

---

### Step 6: Consistency and Conflict Detection

**Purpose**: Find contradictions within story or with related documents

**Questions to Answer**:

- Do sections of the story contradict each other?
- Do ACs and tasks align in scope and detail?
- Does story conflict with project structure standards?
- Are there conflicting technical approaches mentioned?
- Do configurations and code specs agree?

**Validation Checks**:

1. **Internal Consistency**:
   - ACs should align with Story Statement
   - Tasks should implement what ACs require
   - Dev Notes should support task execution
   - File paths should be consistent across mentions

2. **Technical Approach Consistency**:
   - Should not mention multiple solutions to same problem without decision
   - Technology choices should be consistent
   - Patterns should align (don't mix state management approaches)

3. **Project Structure Alignment**:
   - File locations should match unified-project-structure.md
   - Naming conventions should follow coding-standards.md
   - Module organization should match architecture patterns

4. **Configuration Consistency**:
   - Environment variables should be consistently named
   - Port numbers, endpoints should match across references
   - Database schema should match field names everywhere

5. **Cross-Story Consistency**:
   - If previous story exists, check for:
     - Contradicting decisions or approaches
     - Breaking changes to established patterns
     - Incompatible technical choices
   - Deviations should be justified

6. **Epic Consistency**:
   - Story should not contradict epic technical requirements
   - Should use same terminology and concepts
   - Should follow epic's architectural guidance

**Common Inconsistencies to Detect**:

- Tasks mention files in one location, Dev Notes specify different location
- ACs require feature X, tasks don't implement it
- Dev Notes say "use REST API", tasks reference GraphQL
- File paths use different naming conventions
- Previous story established pattern A, this story uses pattern B without explanation

**Issues to Flag**:

- **Critical**: Direct contradictions, breaking changes without justification
- **Important**: Inconsistent naming, misaligned approaches
- **Optional**: Minor terminology variations, could be more consistent

**Output**: Consistency report with conflicts identified

---

### Step 6.5: Mermaid Diagram Validation (via `mermaid-architect`)

**Purpose**: Validate any embedded Mermaid diagrams (sequence, state, flowchart) in Dev Notes against syntax, metadata, and architectural-consistency rules. Recommend a diagram if the story lacks one and a visual would materially clarify the spec.

**Actions**:

1. **Detect diagrams**: scan the story (and its co-located plan file if present) for fenced ` ```mermaid ` blocks. For each, capture: section anchor, diagram type, presence of YAML metadata header (`<!-- mermaid-architect: ... -->`).
2. **Invoke `mermaid-architect` in review mode** for each block. Pass: story file path, the section anchor, the API spec ref (if applicable), and the actor/component names already in the story so the skill can verify naming consistency, time-order correctness for sequences, and that no architectural violations are encoded (e.g., a Client talking directly to a Database).
3. **Collect verdicts**: `pass`, `pass with notes`, `fail`. Map `fail` → Important (or Critical if it encodes an architectural violation); `pass with notes` → Optional.
4. **If absent**: assess whether one would materially clarify the story:
   - Story describes a request/response or multi-service interaction → suggest `sequenceDiagram`
   - Story describes a stateful UI/component lifecycle → suggest `stateDiagram-v2`
   - Story has non-trivial branching or decision logic → suggest `flowchart`
     Do NOT flag absence as an issue if Dev Notes prose already conveys the flow clearly.

Missing Diagram Proactive Draft Rule:
If a visual diagram is absent but highly recommended (e.g., the story describes a complex multi-party API request/response loop or stateful UI view lifecycle), do not merely flag its absence. You must generate a highly accurate, syntactically correct sample draft snippet directly within the review report's recommendation section (using markdown code fences for the specified mermaid type). Use the verified component, file, or endpoint naming conventions extracted during the technical accuracy review so the user can easily copy and insert it.

5. **If a diagram is present but adds no value over the prose**: recommend removing it.
6. **If diagram type is wrong** (e.g., a time-ordered API protocol drawn as a generic flowchart): recommend the correct type.

**Output**: append findings to Critical/Important/Optional buckets used by Steps 6–7.

---

### Step 6.6: Wireframe Verification (via `markdown-wireframe`)

**Purpose**: Check if the story document describes a user interface (UI) or visual components that could be drawn up in a wireframe. If so, verify if a wireframe is already embedded directly in the story document. If not, recommend adding one.

**Actions**:

1. **Detect UI/Wireframe Opportunity**: A story describes a UI that could be wireframed if it:
   - Touches frontend code, UI screens, components, layout, navigation, or styles.
   - Mentions visual elements like buttons, inputs, modals, forms, dashboards, lists, or headers.
   - Has acceptance criteria referencing UI interactions, visual feedback, or layout requirements.

2. **Verify Existing Wireframes**:
   - Check if there is an existing wireframe section embedded directly in the story document (e.g. under a `## Visual Layout / Wireframe` subheading in Dev Notes).
   - Check if the story's Dev Notes or tasks reference this embedded wireframe.

3. **Determine Wireframe Opportunity**:
   - If UI is detected but no embedded wireframe is present, flag this as an **Optional** issue (or **Important** if the UI is complex/bespoke).
   - In Interactive mode: collect this finding for the **Unified Question Point** to ask the user if they want to embed a wireframe.
   - In Validate mode: record the absence of an embedded wireframe in the validation report (non-blocking).

**Output**: Wireframe verification findings added to the review report/validation report.

---

### Step 7: Quality and Clarity Assessment

**Purpose**: Evaluate story quality for developer usability

**Questions to Answer**:

- Can a developer understand what to build?
- Are instructions clear and unambiguous?
- Is technical guidance actionable?
- Are acceptance criteria measurable?
- Is the story self-contained enough?

**Validation Checks**:

1. **Clarity Scoring (1-10 scale)**:
   - **Story Statement**: Clear role, action, benefit?
   - **Acceptance Criteria**: Specific, measurable, testable?
   - **Tasks**: Actionable, clear sequence, proper granularity?
   - **Dev Notes**: Specific technical details vs vague guidance?
   - **Testing**: Clear test plan vs "add tests"?

2. **Ambiguity Detection**:
   - Vague terms: "appropriate", "as needed", "proper", "good"
   - Unmeasurable ACs: "fast", "user-friendly", "robust"
   - Unclear scope: "enhance", "improve", "optimize" without specifics
   - Multiple interpretations: "update authentication" (what part? how?)

3. **Self-Containment Assessment**:
   - Can story be implemented with minimal external document reading?
   - Are domain terms explained or obvious?
   - Are assumptions stated explicitly?
   - Is context provided for references?

4. **Developer Perspective**:
   - Would a competent developer know where to start?
   - Are there likely to be blocking questions?
   - Is the scope clear and bounded?
   - Are there obvious gotchas or warnings needed?

5. **AC Quality**:
   - Are they testable (can verify pass/fail)?
   - Are they specific (not vague goals)?
   - Are they measurable (quantifiable where possible)?
   - Are they independent (not overlapping)?

6. **Task Quality**:
   - Proper granularity (not too broad, not too detailed)?
   - Logical sequence (dependency order)?
   - Clear ownership (who/what does this)?
   - Completeness (nothing assumed that's not obvious)?

7. **Scope and Complexity Analysis**:
   - Count total tasks/subtasks (>10 tasks may indicate oversized story)
   - Estimate implementation time (>1 sprint suggests splitting)
   - Check for distinct feature areas that could be independent sub-stories
   - Identify tasks that could be parallelized as separate stories
   - Look for natural breakpoints (e.g., "Phase 1", "Phase 2" in tasks)
   - Assess if story mixes multiple concerns (backend + frontend + database)

   **Split Indicators**:
   - ✋ **10+ tasks total** - Story may be too large
   - ✋ **Multiple distinct features** - Each could be its own story
   - ✋ **"Phase 1/2/3" structure** - Phases could be sub-stories
   - ✋ **Mixed concerns** - Backend, frontend, database work could split
   - ✋ **Parallel-safe sections** - Independent work could be sub-stories

   **When to Recommend Splitting**:
   - Story would take >1 sprint to complete
   - Clear natural boundaries exist between tasks
   - Multiple developers could work in parallel on different sections
   - Story combines independent features that don't need to ship together

**Quality Issues to Flag**:

- **Critical**: Ambiguous ACs, unclear scope, missing context
- **Important**: Vague guidance, unmeasurable criteria, poor task granularity, **oversized story (recommend splitting)**
- **Optional**: Could be clearer, additional helpful detail

**Split Recommendation Issues**:

- **Recommend Splitting**: Story has 10+ tasks, multiple distinct features, clear natural boundaries, or estimated >1 sprint
  - Document specific split suggestions (which tasks go into which sub-story)
  - Identify parallel-safe sections
  - Suggest sub-story breakdown structure

**Output**: Quality assessment report with clarity scores, issues, and split recommendations (if applicable)

---

### Step 8: Previous Story Context Review (if applicable)

**Purpose**: Learn from previous implementation and ensure continuity

**Actions**:

1. If previous story exists (e.g., reviewing 2.3, so 2.2 exists):
   - Read Dev Agent Record sections
   - Extract implementation insights:
     - Patterns that worked well
     - Technical decisions made
     - Challenges encountered
     - Lessons learned
     - Deviations from original plan

2. Check if current story:
   - Incorporates relevant learnings
   - Avoids repeating mistakes
   - Maintains established patterns
   - References previous decisions where relevant

3. Verify continuity:
   - File locations consistent with previous story
   - Technology choices align
   - Patterns continue (or deviations justified)
   - No conflicting approaches

**Issues to Flag**:

- **Critical**: Contradicts previous story decisions without justification
- **Important**: Ignores relevant lessons learned, breaks established patterns
- **Optional**: Could benefit from previous story context

**Output**: Previous story context assessment

**Questions to Collect** (for batch asking):

- When clarity issues found: What was intended meaning?
- When conflicting approaches: Which to follow?
- When pattern breaks: Justified change or mistake?

---

### UNIFIED QUESTION POINT: Consolidated Story Clarifications

**CRITICAL**: **Skip entirely in Validate mode** — collect findings silently and proceed to Step 9. In Interactive mode: before generating final report or proposing fixes, ask a single batched set of questions (maximum 4) resolving all discovered issues across all categories:

1. Ambiguous requirements or ACs
2. Conflicting information requiring resolution
3. Quality/clarity issues needing user input
4. Pattern deviations requiring justification
5. **Story split recommendations** (if story appears oversized)
6. **UI wireframe opportunities** (from Step 6.6)

**Action**: Use `AskUserQuestion` with 1-4 questions (max) covering the highest-impact unresolved issues across all analysis steps (Steps 2–8).

**IMPORTANT**: If the scope and complexity analysis in Step 7 indicates the story should be split, ALWAYS ask the user whether to split. If Step 6.6 indicates a UI wireframe opportunity exists but no embedded wireframe is present, ask the user if they want to embed one. When findings exceed the 4-question budget, prioritise Critical and Important findings — but always reserve a slot for an unresolved split or wireframe decision when one exists, since these cannot be inferred without the user.

**Example Questions**:

```yaml
questions:
  - question: "This story describes a user interface (UI) or visual components, but does not have a wireframe embedded. Would you like to embed a wireframe directly in this story using the `markdown-wireframe` skill?"
    header: "UI Wireframe"
    options:
      - label: "Yes — Add wireframe (Recommended)"
        description: "Invoke the markdown-wireframe skill to generate a text/YAML wireframe, embed it directly in the story's Dev Notes section, and add a task to Stitch it."
      - label: "No — Skip wireframe"
        description: "Proceed without wireframes."

  - question: "AC #3 says 'fast response time' which is unmeasurable. What specific performance threshold is required?"
    header: "Performance"
    options:
      - label: "< 100ms (p95)"
        description: "Very fast, requires caching/optimization"
      - label: "< 500ms (p95)"
        description: "Fast enough for most interactions"
      - label: "< 2s (p95)"
        description: "Acceptable for non-critical operations"
      - label: "Remove threshold"
        description: "No specific requirement, general standards apply"

  - question: "Tasks reference both '/api/v1/users' and '/api/users' endpoints. Which version is correct?"
    header: "API Version"
    options:
      - label: "Use v1 (/api/v1/users)"
        description: "Versioned endpoints as per architecture standard"
      - label: "Use unversioned (/api/users)"
        description: "Unversioned for this specific case"
      - label: "Consistency error"
        description: "Should all be same. Correct tasks to use consistent version."

  - question: "Story uses different error handling pattern than previous story 2.2. Is this intentional?"
    header: "Error Pattern"
    options:
      - label: "Follow 2.2 pattern"
        description: "Maintain consistency with established approach"
      - label: "New pattern correct"
        description: "This story requires different approach (explain why in Dev Notes)"

  - question: "Story has 15 tasks across 3 distinct feature areas (database, API, frontend). This appears too large for one story. Should it be split into sub-stories?"
    header: "Split Story"
    options:
      - label: "Keep as one story"
        description: "All tasks are tightly coupled and must ship together. Scope is acceptable."
      - label: "Split into sub-stories"
        description: "Create sub-stories for parallel development. Provide suggested split structure in recommendations."
      - label: "Reduce scope"
        description: "Some tasks should be moved to future stories. Identify which tasks to defer."
```

**After Questions**: Generate final report incorporating all user decisions and clarifications.

---

### Step 9: Generate Output

**Purpose**: Produce the output artifact appropriate to the active mode.

**CRITICAL**: Branch on `MODE`:

- **Validate mode** → generate Option V (Validation Report) below. Never generate Option A or B.
- **Interactive mode** → use the output format preference from Step 0: Option A (Comprehensive Report) or Option B (Action Plan Only).

---

### Option V: Validation Report (Validate mode only)

**Actions**:

1. Compute the **Implementation Readiness Score** (1–10 weighted average of per-dimension scores).

Critical Scoring Engine Rule (The Floor Gate):
The Implementation Readiness Score is calculated as a weighted average across all checked dimensions on a 1-10 scale. However, the calculation must respect a strict structural floor rule:

- If Technical Accuracy is less than 6 OR Completeness is less than 6 due to critical/important blockers, the final weighted Implementation Readiness Score is automatically capped at a maximum value of 5/10.
- The Verdict must instantly drop to NO-GO (Rework) or NO-GO (Revision), regardless of perfect scores in Template Compliance or Consistency.
- Ensure the breakdown summary includes a specific annotation if this floor rule is triggered (e.g., "Overall score capped due to critical technical accuracy or completeness deficits").

2. Determine the **Verdict**:
   - ✅ **GO** — score ≥ 8 AND zero Critical issues
   - ⚠️ **NO-GO (Revision)** — score 5–7, OR Important issues materially blocking confidence
   - 🚨 **NO-GO (Rework)** — score < 5 OR any Critical issue present
3. Write the report. **Standalone validate** (`APPLY=false`) → `[story-directory]/[story-name].validate.[date].md`. **Validate-and-apply** (`APPLY=true`, orchestrated) → `[story-directory]/story.{epic}.{story}.review.{n}.{story-name}.md` (the canonical review-report name, so the orchestrator's `…review.*.md` lookup finds it).
4. Print a concise stdout summary (for CI / pipeline callers):

```
Verdict: <GO|NO-GO (Revision)|NO-GO (Rework)>
Score:   <N>/10
Issues:  <critical> critical · <important> important · <optional> optional
Report:  <path>
```

5. **CI exit code**: if Verdict is any NO-GO variant, exit non-zero so pipelines / CI gates fail automatically.

**Report Structure**:

```markdown
# Story Validation Report: Story [Epic].[Story] — [Title]

**Validated:** [ISO date]
**Validation Depth:** [Quick/Standard/Thorough]
**Story Status:** [Current status from story]
**Verdict:** ✅ GO / ⚠️ NO-GO (Revision) / 🚨 NO-GO (Rework)
**Implementation Readiness Score:** [1-10]/10

---

## Executive Summary

[2-3 sentences: what was validated, what the verdict is, single biggest blocker if any.]

**Critical Issues:** [count] 🚨
**Important Issues:** [count] ⚠️
**Optional Improvements:** [count] 💡

**Confidence Level for Successful Implementation:** [High/Medium/Low]

---

## Verdict Justification

[1-2 sentences citing the specific rules that fired — e.g. "Critical hallucination in Dev Notes → Rework" or "Score 8.5/10, zero criticals → GO".]

---

## Scoring Breakdown

| Dimension                 | Score            | Notes         |
| ------------------------- | ---------------- | ------------- |
| Template Compliance       | [1-10]/10        | [1-line note] |
| Epic Alignment            | [1-10]/10        | [1-line note] |
| Technical Accuracy        | [1-10]/10        | [1-line note] |
| Completeness              | [1-10]/10        | [1-line note] |
| Consistency               | [1-10]/10        | [1-line note] |
| Quality & Clarity         | [1-10]/10        | [1-line note] |
| Previous Story Continuity | [1-10]/10 or N/A | [1-line note] |

> Card preflight (Step 2 check 6a) has no dimension of its own. A document that
> cannot produce a usable tracker card is a template-compliance defect, so its
> findings lower **Template Compliance** and are named in that row's note. A
> `missing` / `empty` / `no-body` finding is Critical, which the verdict rules
> above already turn into NO-GO (Rework) whatever the numeric score.

**Overall:** [weighted average]/10

---

## 1. Template Structure Compliance — [PASS / ISSUES FOUND]

## 2. Epic Alignment — [ALIGNED / DEVIATIONS FOUND]

## 3. Technical Accuracy — [ACCURATE / ISSUES FOUND]

## 4. Completeness & Gaps — [COMPLETE / GAPS FOUND]

## 5. Consistency & Conflicts — [CONSISTENT / CONFLICTS FOUND]

## 6. Quality & Clarity

## 7. Previous Story Context — [CONSISTENT / ISSUES FOUND / N/A]

(Each section: Critical / Important / Optional sub-buckets. Same format as Interactive Comprehensive Report sections.)

---

## Summary of Findings

### Must Fix (Critical) — [count]

### Should Fix (Important) — [count]

### Consider (Optional) — [count]

---

## Next Steps

**If GO:** Story ready for implementation. Run `/develop` to begin.

**If NO-GO (Revision):** Run `/review-story` (interactive) to resolve interactively and apply fixes. Re-run `/review-story --validate` after fixes to confirm GO.

**If NO-GO (Rework):** Run `/review-story` (interactive) to walk through issues, or `/create-story` to regenerate from scratch.

---

## Validation Metadata

- **Mode:** validate (automated; read-only when `APPLY=false`, applies fixes + promotes when `APPLY=true`)
- **Validation Date:** [ISO date]
- **Validation Depth:** [Quick/Standard/Thorough]
- **Story File:** [path]
- **Parent Epic:** [epic file path]
- **Architecture Docs Consulted:** [list]

---

_Generated by /review-story --validate. In standalone validate (`APPLY=false`) no changes are made to the story document — to apply fixes, run /review-story (interactive). Under validate-and-apply (`APPLY=true`, orchestrated) critical + important fixes are applied and the status is promoted on a GO._
```

**Output**: Validation report saved (`.validate.{date}.md` for standalone validate; `story.{epic}.{story}.review.{n}.{story-name}.md` for validate-and-apply). Stdout summary printed.

---

### Option A: Comprehensive Report (if user chose "Comprehensive report")

**Actions**:

1. Generate complete review report following the structure below

Critical Scoring Engine Rule (The Floor Gate):
The Implementation Readiness Score is calculated as a weighted average across all checked dimensions on a 1-10 scale. However, the calculation must respect a strict structural floor rule:

- If Technical Accuracy is less than 6 OR Completeness is less than 6 due to critical/important blockers, the final weighted Implementation Readiness Score is automatically capped at a maximum value of 5/10.
- The Verdict must instantly drop to NO-GO (Rework) or NO-GO (Revision), regardless of perfect scores in Template Compliance or Consistency.
- Ensure the breakdown summary includes a specific annotation if this floor rule is triggered (e.g., "Overall score capped due to critical technical accuracy or completeness deficits").

2. Save to file: `[story-directory]/story.{epic}.{story}.review.{n}.{story-name}.md`
   - `{story-name}` MUST be the parent story's own name slug — the hyphenated portion after `story.{epic}.{story}.` in the story filename. Do NOT invent a free-form descriptive slug summarizing the review focus.
   - Example: story file `story.1.2.configure-typescript-path-mapping.md` → review file `story.1.2.review.1.configure-typescript-path-mapping.md`.
   - Derive programmatically: strip `.md`, strip the leading `story.{epic}.{story}.` prefix from the basename — the remainder is `{story-name}`.
3. Display summary to user with file location

**Report Structure**:

```markdown
# Story Review Report: Story [Epic].[Story] - [Title]

**Reviewed:** [Date]
**Review Depth:** [Quick/Standard/Thorough]
**Story Status:** [Current status from story]
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

### Unified Question Point: Consolidated Clarifications

_All clarifying questions were asked in a single batch after analysis completed. List each below (one entry per question asked)._

**Q1: [Question asked]**

- **User Decision**: [Answer selected]
- **Impact**: [How this affects recommendations]

**Q2: [Question asked]**

- **User Decision**: [Answer selected]
- **Impact**: [How this affects recommendations]

_[Add Q3, Q4 as needed — up to the 4-question batch maximum.]_

---

## 1. Template Structure Compliance

**Status:** [PASS / ISSUES FOUND]

### Issues

#### Critical

- [List critical template issues]

#### Important

- [List important template issues]

#### Optional

- [List optional template improvements]

### Recommendations (Based on User Decisions)

**IMPORTANT**: These recommendations incorporate user clarifications from the Unified Question Point above.

1. **[Action based on user decision]** - _Per user decision on Q[num]_
2. **[Action aligned with user's vision]** - _Per user decision on Q[num]_

---

## 2. Epic Alignment

**Status:** [ALIGNED / DEVIATIONS FOUND]

### Issues

#### Critical

- [Missing epic requirements]
- [Unjustified scope changes]

#### Important

- [AC deviations]
- [Missing dependencies]

#### Optional

- [Minor inconsistencies]

### Recommendations (Based on User Decisions)

**IMPORTANT**: These recommendations incorporate user clarifications about epic alignment.

1. **[Action based on user's choice about scope]** - _Per user decision on Q[num]_
2. **[Action aligned with user's intent]** - _Per user decision on Q[num]_

---

## 3. Technical Accuracy

**Status:** [ACCURATE / ISSUES FOUND]
**Hallucinations Detected:** [count]

### Issues

#### Critical (Hallucinations)

- **[Invented library/technology]**: Story mentions "[name]" but this is not in tech stack or architecture docs
  - **Location:** [Section where mentioned]
  - **Recommendation:** Remove or replace with documented alternative

- **[Incorrect API specification]**: Endpoint "[path]" does not match API spec
  - **Source:** Story claims [X], but docs say [Y]
  - **Recommendation:** Correct to match [source doc#section]

#### Important

- **[Missing source reference]**: Technical claim without source
  - **Location:** [Where in story]
  - **Recommendation:** Add [Source: architecture/file.md#section]

#### Optional

- [Vague references that could be more specific]

### Recommendations

1. [Action to fix hallucination]
2. [Action to add missing sources]
3. [Action to verify technical claims]

---

## 4. Completeness & Gaps

**Status:** [COMPLETE / GAPS FOUND]

### Issues

#### Critical

- **[Missing Dev Notes section]**: No guidance on [area]
  - **Impact:** Developer won't know [what]
  - **Recommendation:** Add section covering [specific details]

- **[ACs without tasks]**: AC [number] not covered by any task
  - **Impact:** Requirement won't be implemented
  - **Recommendation:** Add task to implement [specific AC]

#### Important

- **[Vague file location]**: Tasks mention "services folder" without specific path
  - **Recommendation:** Specify exact path: `apps/{api-service}/src/modules/[module]/services/[file].ts`

- **[Missing testing detail]**: Testing section just says "write tests"
  - **Recommendation:** Specify test file locations, frameworks, key scenarios

#### Optional

- [Additional helpful context could be added]

### Recommendations

1. [Action to fill critical gap]
2. [Action to improve completeness]

---

## 5. Consistency & Conflicts

**Status:** [CONSISTENT / CONFLICTS FOUND]

### Issues

#### Critical

- **[Direct contradiction]**: ACs require [X] but tasks implement [Y]
  - **Location:** AC [num] vs Task [num]
  - **Recommendation:** Align tasks with AC requirement

#### Important

- **[Inconsistent naming]**: File paths use different naming conventions
  - **Examples:** [list examples]
  - **Recommendation:** Use consistent kebab-case throughout

- **[Breaks previous pattern]**: Story [prev] established [pattern], this story uses [different pattern]
  - **Recommendation:** Either follow previous pattern or add Dev Notes explaining why change is necessary

#### Optional

- [Minor terminology variations]

### Recommendations

1. [Action to resolve conflict]
2. [Action to ensure consistency]

---

## 6. Quality & Clarity

**Clarity Scores:**

- Story Statement: [1-10]/10
- Acceptance Criteria: [1-10]/10
- Tasks/Subtasks: [1-10]/10
- Dev Notes: [1-10]/10
- Testing Guidance: [1-10]/10

**Overall Clarity:** [1-10]/10

### Issues

#### Critical

- **[Ambiguous AC]**: AC [num] "[text]" is not measurable
  - **Problem:** Can't determine when it's done
  - **Recommendation:** Rephrase as: "[specific, measurable criterion]"

#### Important

- **[Vague task]**: Task "[text]" is not actionable
  - **Problem:** Developer won't know what to do
  - **Recommendation:** Break down into specific subtasks: [examples]

#### Optional

- [Could be clearer but not blocking]

### Recommendations

1. [Action to improve clarity]
2. [Action to make ACs measurable]
3. [Action to make tasks actionable]

---

## 7. Previous Story Context (if applicable)

**Status:** [CONSISTENT / ISSUES FOUND / N/A]

### Issues

- [Ignored lessons learned from previous story]
- [Contradicts previous technical decisions]
- [Missing continuity with established patterns]

### Recommendations

1. [Action to incorporate previous learnings]
2. [Action to maintain continuity]

---

## 8. Summary of Recommendations

### Must Fix (Critical) - [count] issues

1. [Highest priority fix with specific action]
2. [Second highest priority fix]
3. [etc.]

### Should Fix (Important) - [count] issues

1. [Important improvement with specific action]
2. [Second important improvement]
3. [etc.]

### Consider (Optional) - [count] items

1. [Nice-to-have improvement]
2. [Additional enhancement]
3. [etc.]

---

## Implementation Readiness Assessment

**Score:** [1-10]/10

**Scoring Breakdown:**

- Template Compliance: [score]/10
- Epic Alignment: [score]/10
- Technical Accuracy: [score]/10
- Completeness: [score]/10
- Consistency: [score]/10
- Quality & Clarity: [score]/10

**Confidence Level for Successful Implementation:** [High/Medium/Low]

**Recommendation:**

- ✅ **READY TO IMPLEMENT**: [If score >= 8 and no critical issues]
- ⚠️ **NEEDS REVISION**: [If score 5-7 or important issues exist]
- 🚨 **REQUIRES REWORK**: [If score < 5 or critical issues exist]

**Justification:** [1-2 sentences explaining the recommendation]

---

## Next Steps

[If READY]: Story is ready for implementation. Developer should:

1. Read Dev Notes thoroughly before starting
2. Follow task sequence as specified
3. Reference architecture docs for additional context as needed

[If NEEDS REVISION]: Address the following before implementation:

1. [Priority 1 revision]
2. [Priority 2 revision]
3. [Priority 3 revision]

[If REQUIRES REWORK]: Story requires significant rework:

1. [Major rework item 1]
2. [Major rework item 2]
3. Consider using `/create-story` to regenerate with proper context

---

## Review Metadata

- **Reviewer:** [Agent/Person]
- **Review Date:** [ISO date]
- **Review Depth:** [Quick/Standard/Thorough]
- **Story File:** [path]
- **Parent Epic:** [epic file path]
- **Architecture Docs Consulted:** [list]
- **Review Duration:** [time]
```

**Output**: Save review report to `[story-directory]/story.{epic}.{story}.review.{n}.{story-name}.md` — `{story-name}` is the parent story's own name slug (same hyphenated suffix as the story filename), NOT a free-form review-focus summary.

---

### Option B: Action Plan Only (if user chose "Action plan only")

**Actions**:

1. Generate concise, prioritized action plan (DO NOT save to file)
2. Display directly to user for immediate action
3. Focus on critical/important issues only

**Action Plan Format**:

```markdown
# Story Review: [Story Title] - Action Plan

**Review Date:** [Date]
**Implementation Readiness:** [score]/10
**Status:** [READY / NEEDS REVISION / REQUIRES REWORK]

---

## Critical Issues (Must Fix) - [count]

1. **[Issue Title]**
   - **Problem:** [What's wrong]
   - **Location:** [Where in story]
   - **Fix:** [Specific action to take]
   - **User Decision:** [From clarifying questions if applicable]

2. **[Next critical issue]**
   - **Problem:** [What's wrong]
   - **Location:** [Where in story]
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
4. Run `/review-story` again after fixes

**If REQUIRES REWORK:**

1. [Major rework item 1]
2. [Major rework item 2]
3. Consider using `/create-story` to regenerate with proper context

---

**User Clarifications Applied:** [count] questions asked and answered
**Review Depth:** [Quick/Standard/Thorough]
**Review Time:** ~[minutes]

**Note:** This is an action plan only. No comprehensive report file was saved. To generate a full report with detailed documentation, run `/review-story` again and select "Comprehensive report".
```

**Output**: Display action plan to user (no file saved)

---

### Step 9.5: Offer to Implement Fixes

**Purpose**: Give the user the option to have the agent apply the recommended fixes to the story document immediately.

**When to Execute**: **CRITICAL / BLOCKING** — Always execute after Step 9, before Step 10, in **Interactive mode** and in **validate-and-apply** (`MODE=validate` + `APPLY=true`, the orchestrated path). **Skip entirely in standalone Validate mode** (`APPLY=false`) — standalone validate is read-only and never modifies the story document.

**Pipeline note**: When invoked by the `develop-story` orchestrator, skip the `AskUserQuestion` and auto-answer **"Yes, apply all critical + important fixes"** — the pipeline proceeds autonomously and needs the story fully corrected before `/develop` runs in Step 3. Log in Decisions Log: "review-story Step 9.5 auto-answered: Yes, apply all critical + important fixes — pipeline proceeds autonomously."

**Actions**:

1. Use `AskUserQuestion` to ask:

```yaml
question: "Would you like me to implement the recommended fixes to the story document now?"
header: "Apply Fixes"
options:
  - label: "Yes, apply all critical + important fixes"
    description: "I will edit the story document to address all critical and important issues identified in the review."
  - label: "Yes, critical fixes only"
    description: "I will apply only the must-fix (critical) changes to unblock implementation."
  - label: "No, I will fix manually"
    description: "Skip automatic fixes. I will update the story document myself."
```

2. **If "Yes, apply all critical + important fixes"** or **"Yes, critical fixes only"**:

Step 9.5 Execution Guardrails (Atomic Rollback Protocol):
Before executing any tool calls to apply changes to the story file or review markdown:

1. Create a transient local snapshot of the unmodified active story document (e.g., cache it in memory or make a hidden `.story_file.bak` copy).
2. Apply the sequenced Edit tool calls block by block in priority order.
3. Catch and Remediate Failures: If any individual Edit call fails to match lines, encounters regex/patch conflicts, or throws an error, immediately halt the operation. Revert the entire file back to the transient local snapshot state.
4. Clean Exit: Wipe the backup file, skip all automatic text adjustments, log the specific error, and surface a graceful recovery prompt: "⚠️ Automated edit failed at fix [issue title] due to a patch conflict. Rolling back all partial edits. Please resolve this section manually."

   - Work through each issue in priority order (critical first, then important if selected)
   - **UI Wireframe Insertion**: If the user selected to add a wireframe during the Unified Question Point, generate the wireframe using the `markdown-wireframe` skill instructions, embed it directly into the story's Dev Notes under a `## Visual Layout / Wireframe` subheading, and append the Stitch task:
     `- [ ] Stitch and implement low-fidelity wireframe using Stitch (see Dev Notes visual layout)` to the Tasks / Subtasks section.
   - For each fix: use the Edit tool to apply the change to the story document
   - After each fix, briefly state what was changed: `✅ Fixed: [issue title]`
   - If a fix requires information the agent doesn't have (e.g., user must decide the value), skip it and note: `⏭ Skipped: [issue title] — requires your input`
   - After all fixes applied, summarise:
     ```
     Fixes applied: [N]
     Skipped (needs your input): [M]
     ```
   - **Mark recommendations as implemented** — update both documents:

     **In the review report** (if a co-located report file was generated in Step 9):
     - Add the following line immediately after the readiness/score line in the report's opening summary block:
       `> **Implementation Status**: ✅ All recommendations implemented — YYYY-MM-DD`
       (or: `> **Implementation Status**: ✅ Critical/Important recommendations implemented — YYYY-MM-DD` if partial)
     - In the Recommended Actions / Issues list, prefix each applied item with `✅ ` and each skipped item with `⏭️ skipped — [reason]`

     **In the story file**:
     - Add the following line immediately after the `**Status**:` line at the top of the story:
       `**Review**: ✅ All review recommendations from \`[report-filename]\` implemented YYYY-MM-DD`(or:`**Review**: ✅ Critical/Important recommendations implemented YYYY-MM-DD — see review report for details` if partial)

5. **If "No, I will fix manually"**:
   - Acknowledge and proceed to Step 10
   - Remind user: "The full issue list is in the report above. Run `/review-story` again after making changes."

**Output**: Story document with fixes applied and implementation status noted on both report and story file (if user chose to apply), or unchanged (if user declined).

---

### Step 9.6: Sync Body Changes to Tracker (when fixes were applied)

**Purpose**: When Step 9.5 applied any Edit to the story body, sync the updated content back to the linked tracker issue (Jira or GitHub). This syncs **both** the story **Description** _and_ the **doc URL** to the story file — `story_bitbucket_url` / `epic_bitbucket_url` plus the body "View on Bitbucket" links (Jira), or the issue's `## Document` link block (GitHub). The doc URL is **pinned to the durable `develop` branch** (when the file already exists there) so it does not 404 once the feature branch is deleted post-merge.

**When to Execute**:

- At least one fix was applied in Step 9.5 (i.e. `FIXES_APPLIED` is non-empty) AND
- Not validate mode

**Skip when**: validate mode or no body edits were made.

**Resolve the durable doc-link branch** (`PIN_BRANCH`) once, before the tracker split — Step 10 reuses it:

```bash
# Prefer develop, fall back to repo default branch, then main (same as finalise).
if git ls-remote --exit-code --heads origin develop >/dev/null 2>&1; then
  DURABLE_BRANCH=develop
else
  DURABLE_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
  DURABLE_BRANCH="${DURABLE_BRANCH:-main}"
fi
# Only pin if the story file already exists on the durable branch — otherwise a story that
# only exists on the feature branch would 404 on develop right now. Empty PIN_BRANCH => the
# sync uses its normal current-branch resolution; finalise re-points durably at acceptance.
DOC_REL=$(git ls-files --full-name -- "$STORY_FILE_PATH")
if [ -n "$DOC_REL" ] && git cat-file -e "origin/${DURABLE_BRANCH}:${DOC_REL}" 2>/dev/null; then
  PIN_BRANCH="$DURABLE_BRANCH"
else
  PIN_BRANCH=""
  echo "ℹ️ Story not yet on origin/${DURABLE_BRANCH} — doc URL kept on the current branch; finalise will pin it durably at acceptance."
fi
```

**Branch on TRACKER**:

**Jira path** (`TRACKER=jira`):

```bash
node .agents/skills/sync-jira-story/scripts/sync-jira-story.js \
  --file "$STORY_FILE_PATH" ${PIN_BRANCH:+--doc-branch "$PIN_BRANCH"} \
  --no-transition
```

> **`--no-transition` is required here, not tidiness.** This step's job is the description and the doc link. Without the flag the sync also resolves the document's frontmatter `status:` through its own `loadStatusMap` and transitions the card — a second resolver running after the `tracker-workflow.yaml` ladder has already placed it. In the `develop-story` pipeline this step runs at Step 2, *after* Step 1 signalled `work-started`, while the frontmatter still reads `ready-for-development`; un-flagged, it walks the card back out of In Progress (bug.12; same shape as bug.11). Step 10 below is the deliberate status push — it is the one that must *not* carry the flag.

> **Path note**: the script is bundled at `.agents/skills/sync-jira-story/scripts/sync-jira-story.js` (installed by `setup-consumer.sh`). Do **NOT** look for `.scripts/jira-sync*.js` in the consumer repo root — that path does not exist and never did. Do **NOT** hand-craft a REST PUT, and do **NOT** leave `jira_last_body_hash` stale.

On success → `sync-jira-story` updates the Jira description, re-points `story_bitbucket_url` / `epic_bitbucket_url` and the "View on Bitbucket" links to `${PIN_BRANCH:-current branch}`, refreshes `jira_last_body_hash` in frontmatter, and appends a Change Log entry. Confirm: `✅ Pushed description + doc URL to Jira {jira_key} (link pinned to ${PIN_BRANCH:-current branch})`.

On non-zero exit → log warning `⚠️ sync-jira-story failed — Jira description may be stale` and continue to Step 10 (do not halt).

**GitHub path** (`TRACKER=github`):

Invoke the `sync-github-story` sub-skill with `STORY_FILE_PATH={resolved story file path}` and `DOC_BRANCH={PIN_BRANCH}` (may be empty — the sub-skill then falls back to its current-branch default). The sub-skill updates the GitHub issue body, re-points the `## Document` link to `DOC_BRANCH`, and appends a Change Log entry to match the edited story.

On success → confirm: `✅ Pushed description + doc URL to GitHub issue #{github_issue} (link pinned to ${PIN_BRANCH:-current branch})`.
On failure → log warning `⚠️ sync-github-story failed — GitHub issue body may be stale` and continue to Step 10 (do not halt).

---

### Step 10: Update Document Status (if applicable)

**Purpose**: Update the story document status based on the review outcome.

**CRITICAL**: **Skip entirely in standalone Validate mode** (`APPLY=false`) — status transitions are the interactive review's job; proceed directly to Step 11 (post tracker comment). In **validate-and-apply** (`APPLY=true`, orchestrated) this step runs in its constrained, non-interactive form per the Pipeline note below: promote `Draft → Ready for Development` on a GO, HALT on NO-GO.

**Pipeline note**: When invoked by the `develop-story` orchestrator and the review outcome is READY TO IMPLEMENT, skip the `AskUserQuestion` and auto-answer **"Yes, update status"** — the pipeline needs the story promoted to `Ready for Development` before `/develop` runs in Step 3. Log in Decisions Log: "review-story Step 10 auto-answered: Yes, update status — pipeline proceeds autonomously." If the outcome is NEEDS REVISION or REQUIRES REWORK, do NOT skip the step — HALT the pipeline and surface the review findings to the user; the story is not ready for development.

**When to Execute This Step**:

- After generating comprehensive report OR action plan
- Only if current status indicates document is not yet ready (e.g., "Draft", "Not Started")

**Actions**:

1. **Check Review Outcome**:
   - If recommendation is **READY TO IMPLEMENT** (score >= 8, no critical issues) → Offer immediate status update
   - If recommendation is **NEEDS REVISION** or **REQUIRES REWORK** → Skip status update, inform user to fix and re-review

2. **If READY TO IMPLEMENT — Ask User About Status Update**:

   Use `AskUserQuestion` to confirm:

   ```yaml
   question: "Review result is READY TO IMPLEMENT with readiness score [X]/10. Update story status to 'Ready for Development'?"
   header: "Update Status"
   options:
     - label: "Yes, update status"
       description: "Update status to 'Ready for Development'. Story can be handed off to /develop."
     - label: "Keep current status"
       description: "Leave status as '[current status]'. I'll update manually when ready."
   ```

3. **If NEEDS REVISION or REQUIRES REWORK**:
   - Do NOT offer status update
   - Inform user: "Story status remains '[current status]'. Address the critical/important issues above, then run `/review-story` again."

3a. **Sign-off gate** (only when `sign-off.enabled: true` AND `sign-off.enforcement: blocking`):

   If any required sign-off row is unsigned (Step 2, check 4a), do **NOT** promote the status — regardless of the readiness score or a READY TO IMPLEMENT recommendation. Leave it at `draft` and tell the user:

   > "Story is technically ready but unsigned. Awaiting: **{roles}**. Status stays 'Draft' until a stakeholder types their name in the Stakeholder Sign-off table and commits the change. `develop-story` will HALT at Step 2 until then."

   This is the mechanism that actually blocks the pipeline: `develop-story` gates on the `Status:` field, not on the numeric score. Under `advisory` enforcement this gate does not apply — promote normally and let the Important issue stand in the report.

4. **Update Status Based on User Response** (READY TO IMPLEMENT path only):

   **If "Yes, update status"**:
   - Update story document `Status:` field to "Ready for Development"
   - Append a row to the Change Log table and bump frontmatter `updated` in the same edit. Canonical format: [document-change-log.md](references/document-change-log.md). A review verdict bumps the minor version, and `Author` is the skill name in lowercase — `review-story`, not `Review-Story`:
     ```markdown
     | YYYY-MM-DD | [version] | Review passed (9/10) — ready for development | review-story |
     ```
   - Skip when `change-log.enabled: false` in `skills-config.yaml`
   - Confirm update to user: "✅ Story status updated to 'Ready for Development'. You can now run `/develop` to begin implementation."

   **After status edit — sync to tracker (non-blocking)**:

   Reuse the `PIN_BRANCH` resolved in Step 9.6 so the doc URL stays pinned to the durable branch. (If Step 9.6 was skipped — no fixes applied — re-resolve `PIN_BRANCH` using the same snippet from Step 9.6 first.)

   - **Jira path** (`TRACKER=jira`): run `sync-jira-story.js` to push the status transition and updated frontmatter:

     ```bash
     node .agents/skills/sync-jira-story/scripts/sync-jira-story.js \
       --file "$STORY_FILE_PATH" ${PIN_BRANCH:+--doc-branch "$PIN_BRANCH"}
     ```

     > **This site deliberately omits `--no-transition`, unlike Step 9.6.** Driving the transition *is* the point here — the status has just changed locally and this is what carries it to the card. The two steps ran the same command line until bug.12; they are now different on purpose, so do not "restore consistency" by flagging this one. The `jira-sync-no-transition` parity guard (test G, in the shared test suite) records this step in its deliberate-status-push allowlist — the file is named without its path on purpose: the bundler treats a literal shared-resources path in shipped prose as a resource to copy into this skill, and a test is not a shared resource.

     On success → `✅ Status synced to Jira {jira_key} (doc link pinned to ${PIN_BRANCH:-current branch})`.
     On failure → log `⚠️ sync-jira-story failed after status update — Jira may be stale` and continue.

   - **GitHub path** (`TRACKER=github`): invoke the `sync-github-story` sub-skill with `STORY_FILE_PATH` and `DOC_BRANCH={PIN_BRANCH}`. This reflects the new status in the GitHub issue body and Change Log, with the `## Document` link pinned to the durable branch.
     On success → `✅ Status synced to GitHub issue #{github_issue} (doc link pinned to ${PIN_BRANCH:-current branch})`.
     On failure → log `⚠️ sync-github-story failed after status update — GitHub issue may be stale` and continue.

   **If "Keep current status"**:
   - Keep status unchanged
   - Inform user: "Story status unchanged at '[current status]'. Run `/develop` when ready."

5. **Status Update Implementation**:

   When updating status, use Edit tool:

   ```yaml
   file_path: [story-file-path]
   old_string: "Status:** Draft"
   new_string: "Status:** Ready for Development"
   ```

**Status Transition Rules**:

- `Draft` → `Ready for Development` (only when READY TO IMPLEMENT and user confirms)
- `Not Started` → `Ready for Development` (only when READY TO IMPLEMENT and user confirms)
- Any status → No change if NEEDS REVISION, REQUIRES REWORK, or user declines

**Output**: Story document with updated status field (if applicable)

**Example Flow**:

```
Review Complete: Score 9/10, no critical issues → READY TO IMPLEMENT
↓
Step 10: "Update story status to 'Ready for Development'?"
↓
User Selects: "Yes, update status"
↓
Status Updated: "Draft" → "Ready for Development"
Change Log Updated: Review entry added
↓
User Can Now: Run `/develop` to begin implementation
```

---

### Step 11: Post Tracker Comment (graceful — non-blocking)

**Purpose**: Notify the linked tracker issue (Jira or GitHub) that a review has been completed, with the outcome, key findings, and a summary of any changes made to the story document.

**When to Execute**: Always — after Step 10 completes (regardless of review outcome or status update decision).

> **MUST execute — not gated by manual-sync user memories.** This auto-post is part of the review workflow itself. The `/create-*` skills' "Jira sync is manual only" rule (if present in user memory, e.g. `feedback_jira_sync_manual_only.md`) applies **only to `/create-epic`, `/create-story`, `/create-task`** — it does NOT apply to `/review-story`, `/review-task`, `/develop-story`, or `/develop-task`. These skills always auto-post review/PR/finalise outcomes to the linked tracker (GitHub or Jira/Bitbucket), symmetric across platforms. Skipping this step on the basis of a manual-sync memory and deferring to `/sync-jira-story` is a misapplication of that rule.

**Actions**:

1. **Detect tracker platform**: use `TRACKER` already set by the resolver (sourced in Step 5). When `TRACKER=jira` → Jira path; when `TRACKER=github` → GitHub path. See `references/platform-detection.md`.

2. **Collect context from previous steps**:

   - `SCORE` — readiness score from Step 9
   - `RECOMMENDATION` — READY TO IMPLEMENT | NEEDS REVISION | REQUIRES REWORK
   - `CRITICAL`, `IMPORTANT`, `OPTIONAL` — issue counts from Step 9
   - `REVIEW_FILE` — path to `.review.md` if saved, or `"Action plan only — no file saved"`
   - `FIXES_APPLIED` — list of fix titles applied in Step 9.5, or empty string if user declined
   - `FIXES_SKIPPED` — list of skipped fix titles from Step 9.5, or empty string
   - `STATUS_CHANGE` — transition string if Step 10 updated status (e.g. `"Draft → Ready for Development"`), or empty string

3. **Build the CHANGES_SECTION** (shared between both paths):

   ```bash
   CHANGES_SECTION=""
   if [ -n "$FIXES_APPLIED" ] || [ -n "$FIXES_SKIPPED" ] || [ -n "$STATUS_CHANGE" ]; then
     CHANGES_SECTION="

   ### Changes Made to Story Document
   "
     [ -n "$FIXES_APPLIED" ] && CHANGES_SECTION+="
   **Fixes applied:**
   ${FIXES_APPLIED}"
     [ -n "$FIXES_SKIPPED" ] && CHANGES_SECTION+="

   **Skipped (needs manual input):**
   ${FIXES_SKIPPED}"
     [ -n "$STATUS_CHANGE" ] && CHANGES_SECTION+="

   **Status updated**: ${STATUS_CHANGE}"
   fi
   ```

4. **Post comment — branch on TRACKER:**

   ***

   **Jira path** (when `TRACKER=jira`):

   Read `jira_key` from story frontmatter. If absent, skip this step silently.

   Post the comment through the CLI:

   ```bash
   # Terminator at COLUMN 0 — a QUOTED heredoc needs an unindented terminator
   # just as an unquoted one does; bash otherwise swallows the call below into
   # the body. Body lines are unindented too: leading spaces are written
   # verbatim, and the inconsistent 3/5-space mix here would have shown up as
   # a stray indented block inside the posted comment.
   mkdir -p .claude/state
   cat > .claude/state/comment-body.md <<'EOF'
## Story Review Complete

**Recommendation**: {RECOMMENDATION}
**Readiness Score**: {SCORE}/10

| Severity | Count |
|---|---|
| Critical 🚨 | {CRITICAL} |
| Important ⚠️ | {IMPORTANT} |
| Optional 💡 | {OPTIONAL} |

**Review artifact**: `{REVIEW_FILE}`
{CHANGES_SECTION}
EOF

   node .agents/skills/review-story/references/tracker-comment.js \
     --issue "$REVIEW_ISSUE" --body-file .claude/state/comment-body.md \
     --stage review-story \
     --slot outcome="{plain-language outcome — see the table below}" \
     --slot blocking="${CRITICAL}" \
     --json \
     || echo "⚠️  Tracker issue comment failed — continuing"
   ```

> Engine source: `references/tracker-comment.js` (bundled into each skill as `references/tracker-comment.js`). Contract: `references/tracker-comment-contract.md`.


   Read `reason` and act per [`references/tracker-comment-contract.md`](references/tracker-comment-contract.md) — only `no-credentials` may fall back to the Atlassian MCP tool.

   On `posted` → confirm: "✅ Review summary posted to Jira issue {jira_key}."
   On failure → log warning "⚠️ Jira comment failed — continuing", do NOT halt.

   ***

   **GitHub path** (when `TRACKER=github`):

   Read `github_issue` from story frontmatter. If absent, skip this step silently.

   Ensure issue is on the project board (idempotent, graceful):

   ```bash
   BOARD_NUM=$(grep 'project_board_number:' project.yml | awk '{print $2}')
   OWNER=$(grep '^ *owner:' project.yml | head -1 | awk '{print $2}')
   REPO=$(gh repo view --json name -q '.name')
   source references/resolve-platform.sh || exit 1
   tracker_write gh project item-add "$BOARD_NUM" --owner "$OWNER" \
     --url "https://github.com/$OWNER/$REPO/issues/$GITHUB_ISSUE" 2>/dev/null || true
   ```

   Self-heal the board Priority single-select field (idempotent; reads the issue's `priority:*` label when no arg given). Placed in the comment-posting phase intentionally — it runs on every review pass regardless of whether the issue was created, linked-existing via dedup, or already in frontmatter, so any drift is corrected each review:

   ```bash
   bash references/set-github-project-priority.sh "$GITHUB_ISSUE" || true
   ```

   **There is no separate comment call on this arm.** The Jira block above is the whole of it —
   `tracker-comment.js` resolves `TRACKER` itself, so the two arms differ only in which identifier
   `$REVIEW_ISSUE` holds. Set it once, before that block, and let the single call serve both:

   ```bash
   if [ "$TRACKER" = "jira" ]; then
     REVIEW_ISSUE=$(grep -E '^jira_key:' "$STORY_FILE" | head -1 | sed -E 's/jira_key:[[:space:]]*//' | tr -d '"'"'"' ')
   else
     REVIEW_ISSUE="$GITHUB_ISSUE"
   fi
   [ "$REVIEW_ISSUE" = "null" ] && REVIEW_ISSUE=""
   ```

   If `REVIEW_ISSUE` is empty, skip the comment silently.

   On `posted` → confirm: "✅ Review summary posted to tracker issue ${REVIEW_ISSUE}."
   On failure → report the error, do NOT halt.

   > **This replaced a bare `gh issue comment` carrying a multi-line inline `--body`, and
   > `review-story` was the last `review-*` skill whose GitHub arm was not on the CLI.** `review-task`
   > has had both arms on the engine for some time; the asymmetry was an accident, and it is why the
   > same review outcome read differently depending on which tracker a project used.
   >
   > **Which body won, and why.** The two arms carried the *same content* — recommendation, score, the
   > severity table, the review artifact, the changes section — so nothing had to be chosen between
   > them on substance. The Jira arm's **form** won: it is a heredoc with body lines at column 0,
   > whereas the GitHub arm's inline `--body` was indented to match the surrounding numbered list, and
   > those leading spaces are written into the posted comment verbatim. The collapse therefore also
   > fixes a stray indented block that GitHub readers were seeing and Jira readers were not.
   >
   > **It gave up the `tracker_call_with_retry` 3× backoff.** The engine owns the `ACCESS_TRACKER`
   > deferral gate but has no retry of its own, and re-wrapping it would double-defer — so the retry is
   > genuinely given up, and `|| echo … continuing` stands in its place, matching `review-task`.
   >
   > **`review-story` reads `outcome` and `blocking`.** `outcome` is a **text** slot interpolated
   > verbatim, so do **not** pass `${RECOMMENDATION}` raw — `GO`, `NO-GO` and `NEEDS REVISION` are
   > internal vocabulary, and `stakeholder-summary.md` requires internal tokens to be mapped rather
   > than passed through. Map at the call site: GO → `ready to build`, NEEDS REVISION →
   > `needs more detail`, NO-GO → `needs rework`. `blocking` is a **boolean** slot whose two renderings
   > are opposites; `${CRITICAL}` is safe because the engine reads `"0"` as *absent*, which renders
   > "Nothing is blocking the work from starting" — the correct sentence for a clean review.
   >
   > The score stays in the body. A number on an unexplained scale is what the standard forbids in a
   > lead.

**Output**: Tracker issue updated with review outcome comment (Jira or GitHub, whichever is active).

---

## Review Depth Modes

### Quick Review (15-30 minutes)

- Focus on critical issues only
- Template compliance
- Epic alignment
- Technical accuracy (major hallucinations only)
- High-level completeness check

**Use when**: Quick sanity check needed, time-constrained

### Standard Review (30-60 minutes) - DEFAULT

- All steps fully executed
- Comprehensive issue detection
- Actionable recommendations
- Full report generation

**Use when**: Normal pre-implementation review, quality gate

### Thorough Review (60-90+ minutes)

- All steps with deep analysis
- Cross-reference verification (actually check all sources)
- Detailed quality scoring
- Comprehensive recommendations with examples
- Comparison with similar stories for consistency

**Use when**: Critical story, high risk, mentoring junior developers, quality audit

---

## Success Criteria

**Interactive mode** — review is successfully completed when:

✅ All steps (0–11) systematically executed according to review depth
✅ Issues categorized by severity (critical/important/optional)
✅ Hallucinations identified and documented
✅ Gaps and inconsistencies flagged with specific locations
✅ Actionable recommendations provided for each issue
✅ Implementation readiness score calculated
✅ Clear READY / NEEDS REVISION / REQUIRES REWORK recommendation made
✅ Report or action plan generated (per user choice)
✅ Document status updated to reflect readiness (if fixes completed and user confirms)
✅ Tracker comment posted with review outcome (Step 11 — graceful: skipped if tracker key absent)

**Validate mode** — validation is successfully completed when:

✅ All steps systematically executed without user interaction — steps 0–9, 11 in standalone validate; steps 0–11 (including the constrained 9.5 and 10) in validate-and-apply
✅ Issues categorized by severity with precise locations
✅ Hallucinations identified and documented with evidence
✅ Scoring breakdown produced with per-dimension scores
✅ Clear GO / NO-GO (Revision) / NO-GO (Rework) verdict rendered with justification
✅ Report saved — `[story-dir]/[story-name].validate.[date].md` (standalone) or `[story-dir]/story.{epic}.{story}.review.{n}.{story-name}.md` (validate-and-apply)
✅ Stdout summary printed for pipeline/CI callers
✅ Exit non-zero if verdict is any NO-GO variant
✅ **Standalone validate only**: zero modifications to the story document (besides the `.validate.` report itself). Under validate-and-apply, critical + important fixes are applied and status is promoted on a GO.
✅ Tracker comment posted with verdict (Step 11 — graceful: skipped if tracker key absent)

---

## Integration with Other Skills

**Called by**:

- `develop-story` pipeline — as a pre-implementation gate (validate mode, auto-selected)
- `po` — for product owner review (validate mode)
- Manual invocation by user (either mode)

**Calls**:

- `mermaid-architect` — validates any embedded Mermaid diagrams (Step 6.5) and recommends a diagram if absent
- `markdown-wireframe` — checks for UI/wireframe opportunities (Step 6.6) and generates wireframes for UI-focused stories

**Outputs used by**:

- `develop` — reads verdict before starting implementation
- Scrum masters — project-readiness tracking, batch validation
- Developers — understand story issues before starting
- Product owners — validate story accuracy
- QA — understand testing completeness

---

## Common Use Cases

### 1. Pre-Implementation Gate (Validate mode)

"Is story 2.3 ready to develop?" / `/review-story --validate story.2.3.auth-flow.md`

Standard depth → verdict → if GO, proceed to `/develop`; if NO-GO, run interactive mode.

### 2. Batch Validation (Validate mode)

"Validate all stories in Epic 4"

Iterate story files → quick depth on each → aggregate verdicts into per-epic readiness summary.

### 3. Post-Edit Confirmation (Validate mode)

"I just edited story 3.2. Is it clean now?"

Standard depth → verdict → confirm GO or show remaining blockers.

### 4. CI Quality Gate (Validate mode)

"Block the PR if the story isn't ready"

Quick depth in CI → exit non-zero on NO-GO → post comment to tracker issue.

### 5. Pre-Implementation Review (Interactive mode)

"Before starting work on story 2.3, review it for issues"

Standard review depth → clarifying questions → actionable recommendations → apply fixes.

### 6. Quality Audit (Interactive mode)

"Review all stories in Epic 3 for quality"

Thorough depth → pattern violations → consistency across stories.

### 7. Post-Mortem Analysis (Interactive mode)

"Story 4.2 implementation went off-track. Review the story to see why"

Thorough depth → gaps and ambiguities → compare original story to Dev Agent Record.

### 8. Architecture Validation (Interactive mode)

"New architecture docs published. Review story 3.2 for accuracy"

Standard depth → focus on technical accuracy → verify sources still valid.

---

## Anti-Hallucination Protocol

This skill implements rigorous safeguards to DETECT hallucinations:

### Detection Rules

1. **Source Traceability**: Every technical claim MUST have verifiable source
2. **Cross-Reference Validation**: Claims MUST match source document content
3. **Invention Detection**: Flag any technology/pattern not in architecture docs
4. **Vague Source Detection**: Flag generic sources without specific references
5. **Assumption Verification**: Check explicit assumptions against reality

### Reporting Hallucinations

When hallucination detected:

```markdown
#### Critical (Hallucination)

- **[Category]**: [Specific invented detail]
  - **Location:** [Exact location in story]
  - **Issue:** Story claims [X] but this is not documented in [source docs]
  - **Evidence:** [What source check revealed]
  - **Recommendation:** [Specific fix - remove, replace, verify, or source]
```

### Verification Process

For each technical claim in story:

1. Extract claim
2. Find source reference
3. Load source document
4. Verify claim matches source content
5. Flag if:
   - No source reference exists
   - Source document doesn't exist
   - Source doesn't contain the claim
   - Source contradicts the claim

---

## Configuration Reference

Expected configuration in `skills-config.yaml`:

```yaml
prd:
  prdShardedLocation: docs/prd
architecture:
  architectureShardedLocation: docs/architecture
```

Both roots are configurable; nested structure is fixed (see [docs/reference/configuration.md](../../docs/reference/configuration.md#configurable-roots-and-fixed-conventions)):

- PRDs live under `${PRD_ROOT}/`
- Epics: `${PRD_ROOT}/{domain}/{feature}/epics/epic.{N}.{name}/epic.{N}.{name}.md`
- Stories: nested at `{epic-dir}/stories/`

**Note**: If `skills-config.yaml` is missing, the skill will use sensible defaults based on your project organization.

---

## Resources

This skill uses:

- `resources/story-tmpl.yaml` - Story template for structure validation
- `skills-config.yaml` - Project configuration (optional, uses fallbacks)

---

## Notes

- Review reports are saved as `story.{epic}.{story}.review.{n}.{story-name}.md`, where `{story-name}` is the parent story file's own name slug (the hyphenated portion after `story.{epic}.{story}.` in the story filename) — NOT a free-form descriptive slug summarizing the review focus. Use DOTS as structural separators. Example: parent story `story.1.2.configure-typescript-path-mapping.md` → review `story.1.2.review.1.configure-typescript-path-mapping.md`. The `{n}` is a sequence number for multiple reviews of the same story (mirrors the QA `qa.{n}` pattern).
- Story status is updated in-place only when review outcome is READY TO IMPLEMENT and user confirms
- Can be used at any stage: draft, in progress, completed
- Use `--validate` flag (or natural language like "is this story ready?") for the automated non-interactive gate. Standalone validate is a strict subset of interactive mode — same checks, same scoring, no questions, read-only, CI-friendly exit codes. The orchestrated **validate-and-apply** variant (`APPLY=true`, set by `develop-story`/`po`) adds the constrained Steps 9.5 and 10: it applies critical + important fixes and promotes the story on a GO.
- Designed to find problems, not just validate compliance

```

```

---

## Pipeline Lock Cooperation (when invoked by `/develop-story` or `/develop-task`)

When this skill is invoked as a step in a develop pipeline, advance the pipeline lock as the **last action** before returning, so the orchestrator's next turn does not depend on model discipline:

```bash
if [ -f .claude/state/develop-pipeline.lock ]; then
  bash .agents/skills/review-story/references/advance-pipeline-lock.sh --skill review-story 2>/dev/null || true
fi
```

Idempotent in every degraded path: noops when the lock is missing (skill invoked standalone), already advanced past this step, or the helper script is not installed. Full rationale and cooperation order with the `Stop` hook: see [`references/pipeline-lock-cooperation.md`](references/pipeline-lock-cooperation.md).
