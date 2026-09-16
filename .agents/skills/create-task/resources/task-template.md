---
id: task.[ID]
title: "[TASK_TITLE]"
type: task
description: "[One-sentence summary of what this task accomplishes]"
tags: []
category: refactoring # refactoring | infrastructure | documentation | testing | other
status: planned
priority: Medium # Critical | High | Medium | Low
created: YYYY-MM-DD
updated: YYYY-MM-DD
assignee: # optional — a Jira accountId, never a name or team. Blank = use jira.defaultAssignee from skills-config.yaml; blank + unset = leave Jira's assignee untouched. Never a placeholder like TBD: Jira rejects it with HTTP 400.
estimated_effort_hours: 0
---

# Technical Task Template: [TASK_TITLE]

**Status:** Planned

---

## 1. Overview

[2-3 sentence description of what this task accomplishes]

**Scope**: [What's included in this task]

---

## 2. Motivation

### Current Problems

[List 3-5 specific problems being solved]

1. **Problem 1**: [Specific issue and impact]
2. **Problem 2**: [Specific issue and impact]
3. **Problem 3**: [Specific issue and impact]

### Benefits of [Solution Name]

[List 4-6 benefits with metrics where possible]

1. **Benefit 1**: [Specific improvement] - 20-30% faster
2. **Benefit 2**: [Specific improvement]
3. **Benefit 3**: [Specific improvement]
4. **Benefit 4**: [Specific improvement]

---

## 3. Technical Background

### Current Architecture

[Describe current system with code blocks if helpful]

**Components**:
- Component 1: [Description]
- Component 2: [Description]
- Component 3: [Description]

```typescript
// Current implementation example
```

### Target Architecture

[Describe desired state after task completion]

**Components**:
- Component 1: [How it changes]
- Component 2: [How it changes]
- Component 3: [How it changes]

```typescript
// Target implementation example
```

### Important Clarifications

[Any confusing technical points that need explanation]

---

## 4. Scope

### In Scope

✅ **[Category 1]**: [Specific items]
✅ **[Category 2]**: [Specific items]
✅ **[Category 3]**: [Specific items]

### Out of Scope

❌ **[What's excluded and why]**
❌ **[What's excluded and why]**

---

## 5. Breaking Changes

[If no breaking changes: "None - API remains stable"]

### Breaking Change 1: [Title]

**What Changed**: [Description of change]

**Before**:
```typescript
// Previous implementation
```

**After**:
```typescript
// New implementation
```

**Impact**: [Who/what is affected, scope of impact]

**Migration Path**: [How consumers should update their code]

### Breaking Change 2: [Title]

[Same structure...]

---

## 6. Implementation Plan

### Phase 1: [Phase Name]

**Risk Level**: Low | Medium | High

**Files**:
- `path/to/file1.ts`
- `path/to/file2.ts`

**Changes**:
- [ ] Change 1: [Description with rationale]
- [ ] Change 2: [Description with rationale]
- [ ] Change 3: [Description with rationale]

**Dependencies**: [Other phases or prerequisites]

---

### Phase 2: [Phase Name]

**Risk Level**: Low | Medium | High

**Files**:
- `path/to/file3.ts`

**Changes**:
- [ ] Change 1: [Description]
- [ ] Change 2: [Description]

**Dependencies**: Depends on Phase 1

---

[Continue for all phases...]

---

## 7. Files Summary

### Files to Modify (Core Implementation)

1. ✅ `path/to/file1.ts` - [Purpose of changes]
2. ✅ `path/to/file2.ts` - [Purpose of changes]
3. ✅ `path/to/file3.ts` - [Purpose of changes]

### Files to Modify (Tests)

[Test file count]. ✅ `path/to/test1.spec.ts` - [Test coverage updates]

### Files to Modify (Dependencies)

[Number]. ✅ `package.json` - [Dependency updates]

### Files to Modify (Documentation)

[Number]. ✅ `CHANGELOG.md` - [Documentation updates]
[Number]. ✅ `README.md` - [If applicable]

### Files to Delete

[Number]. ❌ `path/to/deprecated-file.ts` - [Reason for deletion]

---

## 8. Testing Strategy

### Unit Tests

**Scope**: Test individual components and functions

**Actions**:
- [ ] Test [specific functionality]
- [ ] Test [specific edge case]
- [ ] Test [error handling]

**Command**: `npx nx test [project] --coverage`

**Target**: 80%+ coverage maintained

---

### Integration Tests

**Scope**: Test workflows and interactions between components

**Actions**:
- [ ] Test [complete workflow]
- [ ] Test [integration point]

**Command**: `npx nx test [project] --coverage`

---

### Contract Tests

**Scope**: Ensure public API contracts remain stable

**Actions**:
- [ ] Verify method signatures unchanged
- [ ] Verify return types stable

---

### Performance Tests

**Scope**: Validate performance improvements

**Metrics to Measure**:
- [Metric 1]
- [Metric 2]

**Baselines**: [Current performance]

**Expectations**: [Target improvements]

---

### Consumer Tests

**Scope**: Test dependent code still works

**Files to Test**:
- `apps/{api-service}/src/[consumer-code]`

**Command**: `npx nx test {api-service}`

---

## 9. Success Criteria

### Functional

- [ ] All [project] tests pass
- [ ] No regressions detected
- [ ] All breaking changes documented
- [ ] Migration paths tested with consumers
- [ ] [Project] builds successfully

### Performance

- [ ] [Metric] improved by [X]%
- [ ] [Metric] maintained or improved
- [ ] No memory leaks detected
- [ ] No unexpected slowdowns

### Code Quality

- [ ] Test coverage maintained at 80%+
- [ ] All linting passes
- [ ] No TypeScript compilation errors
- [ ] Code follows project conventions

### Migration

- [ ] CHANGELOG.md updated with breaking changes
- [ ] Migration guide provided
- [ ] Consumer code updated (if needed)
- [ ] Documentation complete

---

## 10. Risk Assessment

### High Risk Areas

**1. [Risk Title]**
- **Risk**: [What could go wrong]
- **Probability**: High | Medium | Low
- **Impact**: Critical | Major | Minor
- **Mitigation**: [How to prevent or minimize]
- **Rollback**: [What to do if it fails]

**2. [Risk Title]**

[Same structure...]

### Medium Risk Areas

**1. [Risk Title]**

[Same structure...]

### Low Risk Areas

**1. [Risk Title]**

[Same structure...]

---

## 11. Rollback Plan

### Immediate Rollback (< 1 hour)

**Triggers**:
- [Condition 1 requiring rollback]
- [Condition 2 requiring rollback]

**Steps**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Verification**: [How to verify rollback was successful]

---

### Partial Rollback (1-2 hours)

**When to Use**: [Specific scenarios for partial rollback]

**Steps**:
1. [Which phases to revert]
2. [How to verify partial state]

---

### Forward Fix (< 4 hours)

**When to Use**: [Non-critical issues suitable for forward fixes]

**Approach**: [How to fix rather than revert]

---

### Rollback Triggers

**Critical (Immediate Rollback)**:
- [Issue that requires immediate rollback]
- [Issue that requires immediate rollback]

**Non-Critical (Forward Fix)**:
- [Issue that can be fixed forward]

---

<!--
  Emitted only when `sign-off.enabled: true` in skills-config.yaml.
  Roles come from `sign-off.task.required` / `sign-off.task.optional`; optional roles
  carry a " (optional)" suffix. Unconfigured roster → a single "Stakeholder" row.
  Deliberately UNNUMBERED — the 11 numbered sections above are the mandatory contract.
  Canonical spec: references/sign-off.md
  AGENTS NEVER FILL A SIGNATURE OR DATE CELL.
-->

## Stakeholder Sign-off

Sign when you have reviewed this document: replace your **Signature** cell with your name and today's date, then commit the change yourself — your commit authorship is the audit trail, which is why an agent scaffolds these rows and never fills them.

**This gate is `advisory` by default, and does not block development.** The authority is `sign-off.enforcement` in `skills-config.yaml`. Under `advisory` an unsigned required row is raised as an **Important** review finding and docks the readiness score, but the verdict may still be GO and `/develop-*` proceeds. Only if that key is set to `blocking` does an unsigned row become a **Critical** finding that withholds the status promotion and halts the pipeline at Step 2.

| Role                | Signature | Date |
| ------------------- | --------- | ---- |
| [Required Role]     |           |      |
| [Role] (optional)   |           |      |

**Sign-off status:** Pending — 0 of [N] required signatures

---

<!--
  Append-only. Newest row LAST. Four columns, exactly as below.
  Deliberately UNNUMBERED — the 11 numbered sections above are the mandatory contract.
  Canonical spec: references/document-change-log.md
  Authoring/review/edit skills bump Version; machine writers leave it blank.
  EVERY new row bumps frontmatter `updated:` in the same edit.
-->

## Change Log

| Date       | Version | Description   | Author      |
| ---------- | ------- | ------------- | ----------- |
| YYYY-MM-DD | 1.0     | Initial draft | create-task |

---

## Progress Tracking

### Phase 1: [Phase Name]
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

### Phase 2: [Phase Name]
- [ ] Task 1
- [ ] Task 2

[Continue for all phases...]

---

## References

- **Related Skill**: `.agents/skills/[skill-name]/`
- **Related Documentation**: `docs/[path]/`
- **Related Epic** (if applicable): Epic [N] - [Name]

---

## Notes

### Important Reminders

[Specific context developers should remember during implementation]

### Known Issues

**Resolved** (Date):
- ✅ [Issue] - Fixed

**Open** (Non-blocking):
- ⚠️ [Issue] - [Status]

### Future Improvements

[Ideas for improvements beyond this task's scope]

---

**Status:** Planned

**Next Steps**:
1. Implement according to implementation plan
2. Mark checkboxes as completed
3. Hand off to QA when complete
4. QA will create:
   - QA Report: `task.[ID].qa.[name].md`
   - Bug Reports (if needed): `task.[ID].bug.[N].[name].md`
   - Quality Gate: `task.[ID].gate.[number].[name].yml` (co-located in task directory)
