---
type: bug
status: new # bug lifecycle: new → in-progress → ready-for-qa → closed | reopened
severity: '{Blocker | Major | Minor | Trivial}'
priority: '{Critical | High | Medium | Low}'
created: '{YYYY-MM-DD}'
related: '{story 8.5.3 | task 44 | none — cross-cutting (no single owner)}'
description: '{1-line summary of the bug}'
---

**Bug ID**: {bug-id}
**Related**: {related-link}
**Status**: 🆕 New
**Priority**: {Critical | High | Medium | Low}
**Severity**: {Blocker | Major | Minor | Trivial}
**Created**: {YYYY-MM-DD}
**Assigned To**: {Developer Name}
**QA Engineer**: {QA Engineer Name}

---

## Bug Description

**Summary**: {1-2 sentence description}

**Expected Behavior**: {What should happen}

**Actual Behavior**: {What actually happens}

**Impact**: {How this affects users/system/business/quality}

---

## Reproduction Steps

**Environment**: {OS, browser, device, Node version, test environment, etc.}

**Steps to Reproduce**:

1. {Step 1}
2. {Step 2}
3. {Step 3}

**Frequency**: {Always | Sometimes | Rarely}
**Reproducible**: {Yes | No | Intermittent}

---

## Evidence

**Screenshots/Videos/Test Output**: {Link, embed, or command output showing failure}

**Logs and Stack Traces**:

```
{Paste relevant logs}
```

**Related Files**: {List files involved}

---

## {Criteria Violation Heading}

<!--
Choose the heading that matches the bug mode:
  - Story bug   → "Acceptance Criteria Violation"  (AC{N} - {AC description})
  - Task bug    → "Success Criteria Violation"      (which success criterion failed)
  - General bug → "Scope & Impact"                  (what area(s) this cuts across; why it has no single owner)
-->

**Reference**: {AC{N} / success criterion / affected area}

**How It Failed**: {Specific explanation}

---

## Developer Fix Cycle

[This section will be filled by developer during fix process]

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

---

## Status History

| Date           | Status | Changed By | Notes        |
| -------------- | ------ | ---------- | ------------ |
| {created_date} | New    | {QA Name}  | Bug created  |

---

## Resolution Summary

[Will be completed when bug is closed]

**Final Status**: [Closed status]
**Total Iterations**: [Number]
**Time to Resolution**: [Duration]
**Final Fix Details**: [Summary]
**Lessons Learned**: [Key takeaways]
