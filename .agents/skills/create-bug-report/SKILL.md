---
name: create-bug-report
description: Create bug report files for issues found during QA or code sweeps. Use when QA identifies bugs during story/task testing, or when a cross-cutting bug with no single story/task owner needs filing. Supports three modes — story bugs (co-located with the story), task bugs (co-located in the task subdirectory), and general bugs (docs/bugs/ with a global bug-registry). Implements sequential numbering and a shared bug report template.
---

# Create Bug Report

## When to Use This Skill

Use this skill when:

- QA testing identifies bugs during story or task implementation review
- A cross-cutting bug is found during a code sweep (lint, security, dependency audit) with **no single story/task owner**
- Issues are found that require developer investigation and fixes
- Creating individual bug reports for HIGH or MEDIUM severity issues
- Need to track bug fix iterations separately from QA reports

**Do NOT use for**:

- LOW severity issues (document in QA report only)
- General recommendations or suggestions
- Issues that are immediately fixed during QA review

## Bug Report Type Decision

**CRITICAL**: Determine the bug report type before proceeding. There are **three** modes.

| Mode             | When to use                                                                                      | Location                                              | Filename                             | Numbering                                    |
| ---------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| **Story bug**    | Bug found during user-facing feature (story) testing                                             | Co-located with the story file                       | `story.{epic}.{story}.bug.{n}.{name}.md` | Per-story (scan story dir, max + 1)          |
| **Task bug**     | Bug found during technical-task QA (refactoring, infrastructure, technical debt)                 | `docs/tasks/task.{id}.{name}/`                        | `task.{id}.bug.{n}.{name}.md`        | Per-task (scan task dir, max + 1)            |
| **General bug**  | Cross-cutting / sweep bug with **no single story or task owner** (lint, security, deps, drift)   | `docs/bugs/bug.{N}.{name}/` (own self-named subdir)   | `bug.{N}.{name}.md`                  | **Global** (via `docs/bugs/bug-registry.md`) |

**Decision Rule**:

- Bug found during **story testing** → **Story Bug** workflow (below)
- Bug found during **technical task QA** → **Task Bug** workflow (see "Technical Task Bug Report Workflow")
- Bug has **no single story/task owner** → **General Bug** workflow (see "General Bug Report Workflow")

**Reference**: All three follow `docs/standards/file-naming.md`. The general bug is a first-class
core document (like a task) — see `docs/standards/bug-documents.md` and `docs/standards/bug-registry.md`.

---

## Purpose

Create structured, trackable bug reports that:

- Use a single, standardized bug report template (`assets/bug-report-template.md`)
- Follow sequential numbering (per-parent for story/task bugs; global for general bugs)
- Live in a predictable location (co-located with story/task, or under `docs/bugs/`)
- Track iterative fix cycles
- Link bidirectionally with the parent story/task (story/task modes only)
- Integrate with QA workflow (Happy Path vs Unhappy Path)

## Required Inputs

```yaml
required:
  - bug_description: Brief description of the bug
  - severity: 'Blocker | Major | Minor | Trivial'
  - priority: 'Critical | High | Medium | Low'
  - expected_behavior: What should happen
  - actual_behavior: What actually happens
  - reproduction_steps: List of steps to reproduce

conditionally_required:
  - story_id: '{epic}.{story}' # Story Bug mode only, e.g. "8.5.3"
  - task_id: '{id}'            # Task Bug mode only, e.g. "44"

optional:
  - screenshots: Links or paths to screenshots
  - logs: Relevant log output
  - ac_violation: Which AC / success criterion failed
  - environment: OS, browser, device details
```

> General Bug mode requires **no parent id** — it is not anchored to a story or task.

## The Shared Bug Report Template

All three modes create the file from the **same** template:

**Template**: `assets/bug-report-template.md` (bundled with this skill)

Populate it, then adjust these per-mode fields:

| Field / heading                     | Story bug                                            | Task bug                                       | General bug                                       |
| ----------------------------------- | --------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| `Bug ID`                            | `story.{epic}.{story}.bug.{n}.{name}`               | `task.{id}.bug.{n}.{name}`                     | `bug.{N}.{name}`                                  |
| `Related` line / frontmatter        | `[Story {Epic}-{N}: {Title}](./story.{e}.{s}.{name}.md)` | `[Task {id}: {Title}](./task.{id}.{name}.md)` | `None — cross-cutting bug (no single owner)`      |
| `## {Criteria Violation Heading}`   | `## Acceptance Criteria Violation`                  | `## Success Criteria Violation`                | `## Scope & Impact`                               |

Everything else in the template (Description, Reproduction, Evidence, Developer Fix Cycle, Status
History, Resolution Summary) is identical across modes. The bug lifecycle in frontmatter
(`new → in-progress → ready-for-qa → closed | reopened`) is **distinct** from the document status
lifecycle (`draft → … → accepted`); do not conflate them. OKF only mandates a non-empty `type` — the
template sets `type: bug`.

---

## Story Bug Report Workflow

### Step 1: Locate Story File

**Find Story File**:

- Pattern: `story.{epic}.{story}.*.md`
- Example: `story.8.5.3.cache-first-cleanup-testing.md`

**Extract Story Information**: story title, epic reference, story location (directory path).

**HALT if story not found**: "Story {epic}.{story} not found. Please provide correct story ID."

### Step 2: Determine Next Bug Number

1. Search the story directory for `story.{epic}.{story}.bug.*.md`.
2. Highest existing number + 1 (no bugs → 1).
3. Assign the number.

**Rules**: start at 1 per story, increment sequentially, never reuse, per-story namespace.

### Step 3: Generate Filename

`story.{epic}.{story}.bug.{bug-number}.{descriptive-name}.md` — `{descriptive-name}` = 2–4 words
from the bug description, lowercase with hyphens, no special characters (per `docs/standards/file-naming.md`).

Examples: `story.8.5.3.bug.1.cache-cleanup-memory-leak.md`, `story.2.1.1.bug.1.validation-error-handling.md`.

### Step 4: Create Bug Report File

Create the file from `assets/bug-report-template.md` in the **same directory as the story file**
(co-location). Set the story-mode fields per "The Shared Bug Report Template" (Related → story link;
heading → **Acceptance Criteria Violation**).

### Step 5: Update Story File Bug Reports Section

If a `## Bug Reports` section doesn't exist, add it after the "QA Report" section.

```markdown
## Bug Reports

### Open Bugs

- [Bug {epic}.{story}.{n}: {Description}](story.{epic}.{story}.bug.{n}.{name}.md) - 🆕 New - Priority: {Priority}

### In QA Verification

[No bugs in verification]

### Closed Bugs

[No closed bugs]
```

If bugs already exist, add the new bug to the appropriate subsection based on status.

### Step 6: Link in QA Report (if applicable)

If a QA report exists (`story.{epic}.{story}.qa.*.md`), reference the bug report:

```markdown
## Issues Found

### HIGH Severity Issues (1)

#### Issue 1: {Bug Description}

**Bug Report**: [Bug {epic}.{story}.{n}](story.{epic}.{story}.bug.{n}.{name}.md)

{Issue details from QA report}
```

### Step 7: Update Story Status (if first bug)

If this is the first bug for the story:

**Status Transition**: "Ready for QA" → "Reopened"

```markdown
**Status**: ⚠️ Reopened
**Last Updated**: {YYYY-MM-DD}
```

---

## Bug Severity Guidelines

Use these guidelines to classify severity:

**Blocker**:

- Prevents testing or deployment
- Complete feature failure
- System crashes
- Data loss or corruption
- Security vulnerability

**Major**:

- Core functionality broken
- Workaround exists but difficult
- Affects multiple users
- Performance degradation
- Integration failure

**Minor**:

- Cosmetic issues
- Low impact on users
- Easy workaround available
- Edge case failures
- Non-critical UI issues

**Trivial**:

- Typos
- Formatting issues
- Minor cosmetic problems
- Suggestions for improvement

---

## Bug Priority Guidelines

Use these guidelines to assign priority:

**Critical**:

- Must fix before deployment
- Blocker severity usually
- Affects production readiness
- Security issues

**High**:

- Fix in current sprint/cycle
- Major severity usually
- Important functionality affected
- User experience significantly impacted

**Medium**:

- Fix in next sprint
- Minor severity usually
- Moderate user impact
- Can be worked around

**Low**:

- Fix when time permits
- Trivial severity usually
- Minimal user impact
- Nice-to-have fixes

---

## Technical Task Bug Report Workflow

**Use this workflow when creating bug reports for technical tasks** (refactoring, infrastructure, technical debt).

### Step 1: Locate Task Document

- Pattern: `docs/tasks/task.{id}.{name}/task.{id}.{name}.md`
- Extract: task ID, task title, task subdirectory path.

**HALT if task not found**: "Task {id} not found. Please provide correct task ID."

### Step 2: Determine Next Bug Number

1. Search the task subdirectory (`docs/tasks/task.{id}.{name}/`) for `task.{id}.bug.*.md`.
2. Highest existing number + 1 (no bugs → 1).
3. Assign the number.

**Rules**: start at 1 per task, increment sequentially, never reuse, per-task namespace.

### Step 3: Generate Filename

`task.{id}.bug.{number}.{descriptive-name}.md` — descriptive name rule as above.

Examples: `task.1.bug.1.test-expects-l3-tier.md`, `task.2.bug.1.performance-regression.md`.

### Step 4: Create Bug Report File

Create the file from `assets/bug-report-template.md` in the **task subdirectory**
(`docs/tasks/task.{id}.{name}/task.{id}.bug.{number}.{name}.md`). Set the task-mode fields per "The
Shared Bug Report Template" (Related → task link; heading → **Success Criteria Violation**).

### Step 5: Update Task File Bug Reports Section

If a `## Bug Reports` section doesn't exist, add it in the QA & Quality Assurance section.

```markdown
### Bug Reports

- [task.{id}.bug.{n}.{description}.md](./task.{id}.bug.{n}.{description}.md) - 🆕 New - Priority: {Priority} - {Date}
```

If bugs already exist, add the new bug to the list.

### Step 6: Link in QA Report

If a QA report exists (`task.{id}.qa.{name}.md`), reference the bug report in the "Issues Found" section:

```markdown
## Issues Found

### HIGH Severity Issues (1)

**Issue 1: {Bug Description}**

- **Severity**: HIGH
- **Category**: {Functional/Performance/Security/Quality}
- **Bug Report**: [task.{id}.bug.{n}.{description}.md](./task.{id}.bug.{n}.{description}.md)
- **Observation**: {What was observed}
- **Impact**: {Impact on system/deployment}
- **Recommendation**: {How to fix}
- **Priority**: P0/P1
```

### Step 7: Update Task Status (if blocking bug)

If the bug is Critical/High severity and blocks deployment, note it in the task document's status
field / progress tracking. Technical tasks don't use the "Reopened" status like stories.

---

## General Bug Report Workflow

**Use this workflow for cross-cutting / sweep bugs with no single story or task owner.** General bugs
are first-class, globally-numbered documents living under `docs/bugs/`, each in its own self-named
subdirectory. There is **no parent** — none of the parent back-link / parent-status steps apply.

### Step 1: Locate (or Bootstrap) the Bug Registry

- Read `docs/bugs/bug-registry.md` — the single source of truth for general-bug numbering.
- **If it does not exist, bootstrap it**: create the `docs/bugs/` directory and write the registry
  skeleton (mirrors `docs/tasks/task-registry.md`):

  ```markdown
  # Bug Registry

  **Purpose:** Central tracking for all general (cross-cutting) bug numbers in this repo.
  **Last Updated:** {YYYY-MM-DD}
  **Next Available Bug Number:** **1**

  ## How to use

  ### Filing a new general bug
  1. Read **Next Available Bug Number** above — that's your `bug.{N}`.
  2. Run `/create-bug-report` (General Bug mode). It will create:
     - `docs/bugs/bug.{N}.{name}/bug.{N}.{name}.md`
  3. Add a row to the table below for the new bug.
  4. Increment **Next Available Bug Number**.
  5. Commit the registry update **in the same commit** as the new bug files (atomic).

  ### Rules
  - Bug numbers are globally unique. Never reuse a number, even for a closed/cancelled bug.
  - If a merge conflict on the next-number occurs, the higher number wins; the loser bumps to the next free slot.
  - General bugs have no parent story/task (that's what story/task bug reports are for).

  ---

  ## Registry

  | #   | Title | Status | Severity | Priority | Created | Area |
  | --- | ----- | ------ | -------- | -------- | ------- | ---- |

  ---

  ## Notes
  ```

### Step 2: Determine Next Bug Number

- `N` = **Next Available Bug Number** from the registry.
- Fallback (registry just bootstrapped or missing the field): highest existing `docs/bugs/bug.*`
  directory number + 1, else 1.

**Rules**: global namespace, sequential, never reused.

### Step 3: Generate Directory + Filename

- Directory: `docs/bugs/bug.{N}.{name}/`
- File: `docs/bugs/bug.{N}.{name}/bug.{N}.{name}.md`
- `{name}` = 2–4 words from the bug description, lowercase with hyphens, no special characters. The
  directory stem matches the filename stem exactly (per `docs/standards/file-naming.md`).

Examples: `docs/bugs/bug.1.login-timeout/bug.1.login-timeout.md`,
`docs/bugs/bug.7.stale-token-refresh/bug.7.stale-token-refresh.md`.

### Step 4: Create Bug Report File

Create the file from `assets/bug-report-template.md`. Set the general-mode fields per "The Shared Bug
Report Template":

- `Bug ID` → `bug.{N}.{name}`
- `Related` (line + frontmatter) → `None — cross-cutting bug (no single owner)`
- `## {Criteria Violation Heading}` → `## Scope & Impact` (record which areas the bug cuts across and
  why it has no single owner)

### Step 5: Update the Bug Registry

- Append a row to the `## Registry` table:

  ```markdown
  | {N} | [{Title}](bug.{N}.{name}/bug.{N}.{name}.md) | new | {Severity} | {Priority} | {YYYY-MM-DD} | {Area} |
  ```

- Increment **Next Available Bug Number** and update **Last Updated**.
- Commit the registry bump **in the same commit** as the new bug files (atomic). On a merge conflict
  over the next number, the higher number wins; the loser bumps to the next free slot.

### Step 6: (No Parent Back-link / No Parent Status)

General bugs have no parent story/task, so there is **no** parent Bug-Reports-section update and
**no** parent status transition. The registry row is the index entry.

### Step 7: Validate

Run `documentation-standards-validator` on the new `bug.{N}.{name}.md` (confirm `type: bug`
frontmatter present and DOTS-not-underscores naming), as `create-task` does.

---

## Integration with QA Workflow

### QA Testing Outcome Paths

**Happy Path (No Bugs)**:

1. QA tests story
2. All ACs pass
3. No bug reports created
4. Story moves to "Done"

**Unhappy Path (Bugs Found)**:

1. QA tests story and finds issues
2. **Use this skill** to create bug reports for HIGH/MEDIUM severity
3. Document LOW severity in QA report only
4. QA creates QA report linking to bug reports
5. Story status changes to "Reopened"
6. Iterative fix cycle begins

### Developer Fix Cycle

After bug reports are created:

1. **Developer Investigation** (New → In Progress) — read bug report, investigate root cause, document findings.
2. **Developer Fix** (In Progress → Ready for QA) — implement fix, update bug report, change status to "Ready for QA".
3. **QA Verification** (Ready for QA → Closed/Reopened) — retest; if fixed → close, if still failing → reopen and start a new iteration.
4. **Iteration** (if Reopened) — add a new "Iteration 2" section; repeat until closed.
5. **Re-test** — once all bugs closed, perform a full re-test; if pass → Done.

---

## Bug Report Best Practices

**Clear Descriptions**: be specific about what's broken; use concrete examples; avoid vague language; include exact error messages.

**Complete Reproduction Steps**: numbered, sequential steps; include all preconditions; specify exact data/inputs; note environment details.

**Evidence Quality**: annotated screenshots (highlight issues); relevant log excerpts only; stack traces with context; video for complex workflows.

**Criteria / Scope Clarity**: quote the specific AC or success criterion (story/task bugs); for general bugs, name the areas the bug cuts across and why no single story/task owns it.

---

## Completion Checklist

Before finalizing bug report creation:

- ✅ Correct mode chosen (story / task / general)
- ✅ Bug number sequentially assigned (per-parent for story/task; from `bug-registry.md` for general)
- ✅ Filename (and directory, for general bugs) follows the naming convention
- ✅ Bug report file created from `assets/bug-report-template.md` with all required sections
- ✅ `type: bug` frontmatter present; initial status "New"
- ✅ All required fields populated; reproduction steps complete; evidence attached
- ✅ Criteria/scope violation documented
- ✅ **Story/Task modes**: parent Bug Reports section updated, bug linked, parent status updated (if first/blocking), QA report references bug
- ✅ **General mode**: `bug-registry.md` row appended and **Next Available Bug Number** incremented (committed atomically)

---

## Example: General Bug Report

**Scenario**: A dependency-audit sweep finds that the auth token isn't refreshed before expiry across
several screens — no single story or task owns it.

**Workflow**:

1. **Registry**: read `docs/bugs/bug-registry.md` (bootstrap if missing) → Next Available Bug Number = 7.
2. **Filename/dir**: `docs/bugs/bug.7.stale-token-refresh/bug.7.stale-token-refresh.md`.
3. **Create file** from `assets/bug-report-template.md`; Related = `None — cross-cutting bug (no single owner)`; heading = `## Scope & Impact`.
4. **Registry**: append row `| 7 | [Stale token refresh across screens](bug.7.stale-token-refresh/bug.7.stale-token-refresh.md) | new | Major | High | {date} | auth |`; bump Next Available Bug Number → 8.
5. **Validate** with `documentation-standards-validator`.

**Result**: a self-contained general bug at `docs/bugs/bug.7.stale-token-refresh/`, indexed in the
registry, with no parent coupling.

---

## Related Skills

- **review-bug**: reviews a bug report for fix-readiness (completeness, reproducibility, duplicate/stale scans) — run it before fixing; also develop-bug's Step 2 gate
- **develop-bug**: end-to-end bug-fix orchestrator — consumes the file this skill creates and runs it from open to closed (review → research → fix → verify → Resolution Summary → close)
- **qa-story** / **qa-task**: reviews that create bug reports
- **qa-fix**: developer workflow for fixing bugs (also the fix engine inside develop-bug's verify loop)
- **create-task**: the structural model for global registry numbering + self-named directories
- **develop**: main development workflow

---

## Key Principles

1. **Type Decision**: choose story / task / general **before** proceeding.
2. **Sequential Numbering**: per-parent for story/task bugs (scan + 1); **global** for general bugs (via `bug-registry.md`, never reused).
3. **Location**:
   - Story bugs → same directory as the story file
   - Task bugs → task subdirectory (`docs/tasks/task.{id}.{name}/`)
   - General bugs → own self-named subdirectory under `docs/bugs/`
4. **One Template**: all modes use `assets/bug-report-template.md`.
5. **Bidirectional Links**: story/task modes link bug ↔ parent; general bugs are indexed by the registry only.
6. **Initial Status**: always start with "New".
7. **Severity-Driven**: HIGH/MEDIUM → create bug report; LOW → QA report only.
8. **Naming Convention** (per `docs/standards/file-naming.md`):
   - Story bugs: `story.{epic}.{story}.bug.{n}.{name}.md`
   - Task bugs: `task.{id}.bug.{n}.{name}.md`
   - General bugs: `bug.{N}.{name}.md` in `docs/bugs/bug.{N}.{name}/`

---

## Notes

**General**:

- Bug reports are only created for HIGH and MEDIUM severity issues; LOW severity goes in the QA report only.
- Once a bug number is assigned, it's never reused.
- Bug reports track iterative fix cycles in the same file.
- Bug status flow: New → In Progress → Ready for QA → Closed (or Reopened) — distinct from the document status lifecycle.

**Story Bugs**: `story.{epic}.{story}.bug.{number}.{name}.md`, co-located with the story; per-story numbering.

**Technical Task Bugs**: `task.{id}.bug.{number}.{name}.md`, co-located in the task subdirectory; per-task numbering. Quality gates are co-located in the task subdirectory (`task.{id}.gate.{number}.{name}.yml`).

**General Bugs**: `docs/bugs/bug.{N}.{name}/bug.{N}.{name}.md`; global numbering via `docs/bugs/bug-registry.md`; no parent. See `docs/standards/bug-documents.md` and `docs/standards/bug-registry.md`.
