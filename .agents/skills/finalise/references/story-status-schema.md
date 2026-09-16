# Story/Task Status Schema

This document defines the valid status values and frontmatter structure for story and task documents in your project.

## Valid Status Values

Stories and tasks follow a standard workflow with these status values:

| Status | Description | When to Use |
|--------|-------------|-------------|
| `draft` | Initial planning, requirements gathering | Story/task created but not ready for implementation |
| `ready` | Ready for development | All acceptance criteria defined, dependencies resolved |
| `in_progress` | Actively being worked on | Developer has started implementation |
| `code_review` | Implementation complete, awaiting review | PR created and awaiting approval |
| `testing` | In QA testing phase | Code approved, being tested against acceptance criteria |
| `blocked` | Cannot proceed due to dependency | Waiting on another story, external dependency, or clarification |
| `accepted` | Meets all Definition of Done criteria | All acceptance criteria met, tests passed, documented, reviewed ✅ |
| `rejected` | Does not meet requirements | Failed QA, does not meet acceptance criteria |
| `cancelled` | No longer needed | Requirements changed, deprioritized, or made obsolete |

## Status Workflow

### Typical Forward Flow
```
draft → ready → in_progress → code_review → testing → accepted
```

### Alternative Flows
```
in_progress → blocked → in_progress (blocker resolved)
testing → in_progress (issues found, needs rework)
code_review → in_progress (changes requested)
testing → rejected (fundamental issues, start over)
any → cancelled (requirements changed)
```

## Frontmatter Structure

### Story Document Frontmatter

```yaml
---
title: Story Title
epic: epic.123.epic-name
story_number: story.123.4
status: in_progress
assigned_to: developer-name
created: 2025-01-15
updated: 2025-01-20
pr_number: 456
labels:
  - feature
  - api
  - high-priority
---
```

### Task Document Frontmatter

```yaml
---
title: Task Title
task_number: task.90
status: code_review
assigned_to: developer-name
created: 2025-01-10
updated: 2025-01-18
pr_number: 432
labels:
  - bug-fix
  - urgent
---
```

## Required Fields for Status Updates

When updating status to `accepted`, the following fields MUST be present:

| Field | Required for Accepted | Description |
|-------|----------------------|-------------|
| `status` | ✅ Yes | Must be set to `accepted` |
| `pr_number` | ✅ Yes | GitHub PR number for the implementation |
| `updated` | ✅ Yes | Date when status was changed |
| `completed_date` | ✅ Yes | Date when story was marked accepted (add if not present) |

### Example Frontmatter Update (In Progress → Accepted)

**Before:**
```yaml
---
title: Implement User Authentication
epic: epic.311.example-domain
story_number: story.311.1
status: in_progress
assigned_to: jane-doe
created: 2025-01-10
updated: 2025-01-15
pr_number: 789
---
```

**After (Marked Accepted):**
```yaml
---
title: Implement User Authentication
epic: epic.311.example-domain
story_number: story.311.1
status: accepted
assigned_to: jane-doe
created: 2025-01-10
updated: 2025-01-25
completed_date: 2025-01-25
pr_number: 789
---
```

## Frontmatter Update Rules

1. **Always update `updated` field** when changing status
2. **Add `completed_date`** when marking as `accepted` (use current date)
3. **Preserve all existing fields** - only modify status-related fields
4. **Use YAML date format**: `YYYY-MM-DD`
5. **Verify `pr_number` exists** before accepting (required for DoD)

## Document Status Section

In addition to frontmatter, story/task documents may include a status section in the body:

```markdown
## Status

**Current Status:** Accepted ✅

**Last Updated:** 2025-01-25

**Definition of Done:** PASSED

All acceptance criteria met, code reviewed and approved (PR #789), tests written, documentation updated, security and compliance reviews completed.
```

This section should be updated when marking the story as accepted to provide a human-readable summary.

## PR Number Format

The `pr_number` field can be specified in multiple ways in the document:

**Frontmatter (preferred):**
```yaml
pr_number: 789
```

**Body references (also valid):**
- `PR #789`
- `Pull Request: #789`
- `https://github.com/org/repo/pull/789`
- `See PR: 789`

When marking as accepted, if `pr_number` is found in the body but not in frontmatter, add it to frontmatter for consistency.
