# [Story [Epic].N] [Story Name]

**Epic**: [[Epic N] Epic Name](../epics/epic.[n].[name].md)
**Story ID**: [Story [Epic].N]
**Branch Name**: `feature/story.[epic].[story].[name]`
**Status**: ❌ Not Started | 🔄 In Progress | ✅ Complete | ⚠️ Blocked
**Priority**: Critical | High | Medium | Low
**Estimated Effort**: [Story Points or Hours]
**Actual Effort**: [Tracked hours - update when complete]
**Assigned To**: [Developer/Team]
**Dependencies**: [Story IDs or "None"]
**Parallel-safe**: True | False
**Last Updated**: YYYY-MM-DD

---

## Story Statement

**As a** [user type - e.g., "mobile account user", "system administrator", "developer"]
**I want** [capability - what the user wants to do]
**So that** [benefit - why the user wants this capability]

**Example**:
**As a** mobile account user
**I want** to access action bar customization from the main Settings screen
**So that** I can easily configure my preferred bottom actions without searching through menus

---

## Acceptance Criteria

### AC1: [Criterion Name - e.g., "Settings Screen Integration"]

- [ ] [Specific, testable requirement 1]
- [ ] [Specific, testable requirement 2]
- [ ] [Specific, testable requirement 3]

**Verification Method**: [How to verify this criterion is met]

### AC2: [Next Criterion Name]

- [ ] [Specific, testable requirement 1]
- [ ] [Specific, testable requirement 2]
- [ ] [Specific, testable requirement 3]

**Verification Method**: [How to verify this criterion is met]

### AC3: [Next Criterion Name]

- [ ] [Specific, testable requirement 1]
- [ ] [Specific, testable requirement 2]

**Verification Method**: [How to verify this criterion is met]

---

## Technical Requirements

### Component Directory Structure

```
[Root Directory]/
├── [Main Directory]/
│   ├── [Subdirectory 1]/
│   │   ├── index.tsx                    # [Purpose] - ❌ CREATE
│   │   ├── [component1].tsx             # [Purpose] - ❌ CREATE
│   │   ├── [component2].tsx             # [Purpose] - ❌ CREATE
│   │   └── components/
│   │       ├── [subcomponent1].tsx      # [Purpose] - ❌ CREATE
│   │       └── [subcomponent2].tsx      # [Purpose] - ❌ CREATE
│   └── [Subdirectory 2]/
│       ├── [existing-file].tsx          # [Purpose] - ⚠️ MODIFY
│       └── [new-file].tsx               # [Purpose] - ❌ CREATE
└── [Library Directory]/
    └── [Subdirectory]/
        ├── [service].ts                 # [Purpose] - ❌ CREATE
        ├── [types].ts                   # [Purpose] - ⚠️ MODIFY
        └── [service].spec.ts            # [Purpose] - ❌ CREATE
```

**Legend**:

- ❌ CREATE - New file to be created
- ⚠️ MODIFY - Existing file to be modified
- ✅ EXISTS - Existing file, no changes needed

### Key Interfaces/Types

```typescript
// [Library]/src/types/[feature].types.ts

/**
 * [Type description]
 */
export interface [TypeName] {
  [property1]: [Type];
  [property2]: [Type];
  [property3]: [Type];
}

/**
 * [Another type description]
 */
export interface [AnotherTypeName] {
  [property1]: [Type];
  [property2]: [Type];
}

/**
 * [Enum description]
 */
export enum [EnumName] {
  [VALUE1] = '[value1]',
  [VALUE2] = '[value2]',
  [VALUE3] = '[value3]'
}
```

### Core Implementation

#### Main Component Implementation

**File**: `path/to/main-component.tsx`

**Purpose**: [What this component does]

**Key Features**:

- [Feature 1]
- [Feature 2]
- [Feature 3]

**Code Structure**:

```typescript
import React from 'react';
import { View, Text } from 'react-native';
import { useCustomHook } from '@/hooks/useCustomHook';
import { useTheme } from '@your-org/theme';

export default function ComponentName() {
  const { data, loading } = useCustomHook();
  const theme = useTheme();

  // Implementation

  return <View>{/* JSX */}</View>;
}
```

#### Service/Utility Implementation

**File**: `path/to/service.ts`

**Purpose**: [What this service does]

**Key Methods**:

- `method1()` - [Description]
- `method2()` - [Description]
- `method3()` - [Description]

**Code Structure**:

```typescript
export class ServiceName {
  static method1(): ReturnType {
    // Implementation
  }

  static async method2(): Promise<ReturnType> {
    // Implementation
  }
}
```

### Implementation Details

**Key Technical Considerations**:

1. [Consideration 1 - e.g., "Use React.memo for performance optimization"]
2. [Consideration 2 - e.g., "Implement error boundaries for graceful failure"]
3. [Consideration 3 - e.g., "Follow existing navigation patterns"]

**State Management**:

- [State approach - e.g., "Use useState for local UI state"]
- [State approach - e.g., "Use custom hook for shared logic"]
- [State approach - e.g., "Persist to AsyncStorage for offline access"]

**Error Handling**:

```typescript
try {
  const result = await operation();
  // Success handling
} catch (error) {
  logger.error('Operation failed', { error, context });
  // User-facing error handling
}
```

**Performance Considerations**:

- [Optimization 1]
- [Optimization 2]
- [Optimization 3]

---

## Integration Points

### Component Integration

- **[Component/System 1]**: [How this story integrates]

  - Integration method: [API call, prop passing, event, etc.]
  - Data flow: [Direction and format]
  - Error handling: [Strategy]

- **[Component/System 2]**: [How this story integrates]
  - Integration method: [Method]
  - Data flow: [Direction and format]
  - Error handling: [Strategy]

### Navigation Integration

```typescript
// Navigation setup
import type { NavigationProp } from '@react-navigation/native';
import type { SettingsStackParamList } from '@/types/navigation';

// Navigation usage
navigation.navigate('[ScreenName]', { param: value });
```

### API Integration

**Endpoints Used**:

- `GET /api/[resource]` - [Purpose]
- `POST /api/[resource]` - [Purpose]

**Request/Response**:

```typescript
interface [Resource]Request {
  // Request schema
}

interface [Resource]Response {
  // Response schema
}
```

### Storage Integration

**AsyncStorage Keys**:

- `@your-org/[feature]-[data]` - [What's stored]

**Storage Operations**:

```typescript
// Save
await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));

// Load
const jsonString = await AsyncStorage.getItem(STORAGE_KEY);
const data = jsonString ? JSON.parse(jsonString) : defaults;
```

---

## Module/Area of Codebase

### Primary Module

**Location**: `[primary-directory-path]`
**Purpose**: [What this module handles]
**Changes**:

- Create: [List of files to create]
- Modify: [List of files to modify]

### Secondary Modules

**Location**: `[secondary-directory-path]`
**Purpose**: [What this module handles]
**Changes**:

- [Changes needed]

### Integration Modules

**Location**: `[integration-directory-path]`
**Purpose**: [Integration purpose]
**Changes**:

- [Integration changes needed]

---

## Testing Strategy

### Unit Tests

**Coverage Target**: 80%+ overall, 95%+ for critical business logic

**Test File**: `[component].spec.tsx` (co-located with source)

**Test Scenarios**:

1. **[Test Scenario 1 - e.g., "Component renders correctly"]**

   ```typescript
   it('should render with correct initial state', () => {
     const { getByText } = render(<Component />);
     expect(getByText('Expected Text')).toBeTruthy();
   });
   ```

2. **[Test Scenario 2 - e.g., "Handles user interaction"]**

   ```typescript
   it('should handle button press', async () => {
     const { getByText } = render(<Component />);
     fireEvent.press(getByText('Button'));

     await waitFor(() => {
       expect(getByText('Result')).toBeTruthy();
     });
   });
   ```

3. **[Test Scenario 3 - e.g., "Handles error state"]**

   ```typescript
   it('should display error message on failure', async () => {
     jest.spyOn(Service, 'method').mockRejectedValue(new Error('Test error'));

     const { getByText } = render(<Component />);

     await waitFor(() => {
       expect(getByText(/error/i)).toBeTruthy();
     });
   });
   ```

4. **[Test Scenario 4 - e.g., "Loading state"]**
   ```typescript
   it('should show loading indicator', () => {
     const { getByText } = render(<Component />);
     expect(getByText('Loading...')).toBeTruthy();
   });
   ```

### Integration Tests

**Test Scenarios**:

1. **[Integration Scenario 1 - e.g., "Complete user flow"]**

   - **Setup**: [Initial state]
   - **Action**: [User action]
   - **Verification**: [Expected outcome]

   ```typescript
   it('should complete full user flow', async () => {
     // Test implementation
   });
   ```

2. **[Integration Scenario 2 - e.g., "Storage persistence"]**
   - **Setup**: [Initial state]
   - **Action**: [User action]
   - **Verification**: [Data persisted correctly]

### Manual Testing

**Test Cases**:

- [ ] **Test Case 1**: [Test name]

  - **Steps**:
    1. [Step 1]
    2. [Step 2]
    3. [Step 3]
  - **Expected Result**: [What should happen]
  - **Actual Result**: [To be filled during testing]

- [ ] **Test Case 2**: [Test name]
  - **Steps**:
    1. [Step 1]
    2. [Step 2]
  - **Expected Result**: [What should happen]
  - **Actual Result**: [To be filled during testing]

### Edge Cases & Error Scenarios

- [ ] **Edge Case 1**: [Scenario]

  - **Expected Behavior**: [How system should handle]

- [ ] **Error Scenario 1**: [Scenario]
  - **Expected Behavior**: [How system should handle]

### Accessibility Testing

- [ ] Screen reader announces all interactive elements
- [ ] Keyboard navigation works correctly
- [ ] Color contrast meets WCAG 2.1 AA standards
- [ ] Touch targets are minimum 44x44 pixels
- [ ] Reduce motion preference respected

---

## Definition of Done

[Story [Epic].N] is complete when:

### Implementation

- [ ] All acceptance criteria met
- [ ] Code implemented following project standards
- [ ] TypeScript strict mode compliance
- [ ] No ESLint errors or warnings
- [ ] All imports correctly resolved

### Testing

- [ ] Unit tests written and passing
- [ ] Integration tests passing
- [ ] Manual testing completed
- [ ] Edge cases tested
- [ ] Accessibility verified
- [ ] Coverage target achieved ([X]%)

### Code Review

- [ ] Code reviewed by [N]+ team members
- [ ] All review comments addressed
- [ ] No unresolved discussions
- [ ] Approved by tech lead

### Integration

- [ ] Components integrated correctly
- [ ] Navigation working as expected
- [ ] State management verified
- [ ] No regressions in existing features
- [ ] Performance benchmarks met

### Documentation

- [ ] Code comments added for complex logic
- [ ] README updated (if applicable)
- [ ] Type definitions documented
- [ ] API changes documented

### Deployment

- [ ] Branch merged to main/develop
- [ ] CI/CD pipeline passing
- [ ] Feature flag configured (if applicable)
- [ ] Ready for next story

---

## Development Notes

### Implementation Priority

1. **First**: [Highest priority item - e.g., "Create base component structure"]

   - [Why this is first]
   - [What it enables]

2. **Second**: [Next priority item - e.g., "Implement core business logic"]

   - [Why this comes second]
   - [Dependencies on first step]

3. **Third**: [Next priority item - e.g., "Add error handling and edge cases"]

   - [Why this comes third]
   - [Dependencies on previous steps]

4. **Final**: [Final items - e.g., "Polish UI and add accessibility"]
   - [Why this is last]
   - [Depends on everything else]

### Key Considerations

**Performance**:

- [Performance consideration 1]
- [Performance consideration 2]

**Security**:

- [Security consideration 1]
- [Security consideration 2]

**Accessibility**:

- [Accessibility consideration 1]
- [Accessibility consideration 2]

**User Experience**:

- [UX consideration 1]
- [UX consideration 2]

### Common Pitfalls to Avoid

1. [Pitfall 1 - e.g., "Don't forget to handle loading states"]
2. [Pitfall 2 - e.g., "Remember to clear AsyncStorage in tests"]
3. [Pitfall 3 - e.g., "Ensure proper cleanup in useEffect"]

### Resources & References

**Code Examples**:

- [Similar component]: `path/to/similar-component.tsx`
- [Similar pattern]: `path/to/pattern-example.ts`

**Documentation**:

- [Related doc 1]
- [Related doc 2]

---

## Dependencies & Blockers

### Story Dependencies

**Depends On** (must complete first):

- [ ] [Story [Epic].N-1] [Story Name]
  - **Reason**: [Why this is a dependency]
  - **Status**: [Status]

**Blocks** (this story blocks):

- [ ] [Story [Epic].N+1] [Story Name]
  - **Reason**: [Why this story blocks it]

### External Dependencies

- [ ] [External Dependency 1]
  - **Owner**: [Team/Person]
  - **Status**: [Status]
  - **Impact if not ready**: [Impact]

### Technical Dependencies

- [ ] [Library/Package 1] - Version [X.Y.Z]
- [ ] [Library/Package 2] - Version [X.Y.Z]
- [ ] [System/Service] - [Requirement]

---

## Progress Tracking

### Subtasks

- [ ] **Setup**: Create files and directory structure
- [ ] **Types**: Define TypeScript interfaces and types
- [ ] **Core Logic**: Implement main business logic
- [ ] **UI Components**: Build React Native components
- [ ] **Integration**: Connect to services and navigation
- [ ] **Error Handling**: Add error boundaries and handling
- [ ] **Testing**: Write and run all tests
- [ ] **Accessibility**: Implement accessibility features
- [ ] **Polish**: Final refinements and optimizations
- [ ] **Documentation**: Update docs and comments
- [ ] **Review**: Code review and approval

### Time Tracking

- **Estimated**: [X hours/points]
- **Actual**: [Track actual time spent]
- **Variance**: [Calculate when complete]

### Blockers Log

**[Date]**: [Blocker description]

- **Impact**: [How it affects the story]
- **Resolution**: [How it was/will be resolved]

---

## Related Documentation

### Epic Documentation

- [[Epic N] Name](../epics/epic-[n]-[name].md) - Parent epic
- [Epic [N] Roadmap](../epics/EPIC-[N]-ROADMAP.md) - Weekly plan

### Related Stories

- [[Story [Epic].N-1] Name](./[epic]-[n-1].story.[name].md) - Previous story
- [[Story [Epic].N+1] Name](./[epic]-[n+1].story.[name].md) - Next story

### Technical Documentation

- [Technical Implementation]({DOCS_ROOT}/technical-implementation.md) - Architecture
- [Developer Quick Start]({DOCS_ROOT}/DEVELOPER-QUICK-START.md) - Dev guide
- [API Specification]({DOCS_ROOT}/api-specification.md) - API contracts

### Project Resources

- [Implementation Status]({DOCS_ROOT}/IMPLEMENTATION-STATUS.md) - Current status
- [Cross-Reference Guide]({DOCS_ROOT}/CROSS-REFERENCE-GUIDE.md) - Navigation

---

## QA Handoff Notes

**Status**: ⚠️ Not Yet Ready for QA

> **For Developers**: When your implementation is complete, update this section before changing the story status to "Ready for QA". See [Developer QA Handoff Process]({DOCS_ROOT}/development/development-guide.md#developer-to-qa-handoff-process) for complete instructions.

### Implementation Summary

**Completed**: [Date]
**Developer**: [Your Name]
**Branch**: `feature/story.[epic].[story].[name]`
**PR**: #[PR Number] - [PR Title]

### Summary of Changes

- [Brief description of what was implemented]
- [Key technical decisions made]
- [Any architectural changes]

### Testing Instructions for QA

1. **Setup**:

   - [Environment configuration needed]
   - [Test data required]
   - [Device/platform requirements]

2. **Test Steps**:

   1. [Specific step-by-step instructions]
   2. [How to verify each acceptance criterion]
   3. [Any non-obvious testing procedures]

3. **Verification**:
   - AC1: [How to verify acceptance criterion 1]
   - AC2: [How to verify acceptance criterion 2]
   - AC3: [How to verify acceptance criterion 3]

### Areas Requiring Special Attention

- **[Area 1]**: [Why it needs special attention]
- **[Area 2]**: [Potential edge cases to verify]
- **[Area 3]**: [Integration points to test]
- **[Area 4]**: [Performance considerations]

### Known Limitations (if any)

- [Limitation 1]: [Explanation and workaround if applicable]
- [Limitation 2]: [Technical constraints]

### Files Changed

**Created**:

- `path/to/new-file.tsx`
- `path/to/another-file.ts`

**Modified**:

- `path/to/existing-file.tsx`
- `path/to/another-existing.ts`

### QA Prerequisites Checklist

Before marking this story as "Ready for QA", verify:

- [ ] All acceptance criteria implemented
- [ ] Unit tests written and passing
- [ ] Integration tests passing (if applicable)
- [ ] Code review completed and approved
- [ ] PR merged to develop branch
- [ ] No console.log statements or debugging code
- [ ] Documentation updated (README, inline comments)
- [ ] CI/CD pipeline passing
- [ ] QA handoff notes completed above

---

## Notes & Updates

### Questions & Decisions

**Open Questions**:

- [ ] [Question 1] - Owner: [Person]
- [ ] [Question 2] - Owner: [Person]

**Decisions Made**:

- **[Date]**: [Decision]
  - **Rationale**: [Why this decision]

---

**Quick Links**:
[Acceptance Criteria](#acceptance-criteria) | [Technical Requirements](#technical-requirements) | [Testing](#testing-strategy) | [Definition of Done](#definition-of-done)

---

<!--
  Append-only. Newest row LAST. Four columns, exactly as below.
  Canonical spec: shared/resources/document-change-log.md
    — inside a bundled skill the same file sits at references/document-change-log.md
  Authoring/review/edit skills bump Version; machine writers leave it blank.
  This legacy template carries no YAML frontmatter, so there is no `updated:` field
  to bump — keep the `**Last Updated**:` line at the top of the document in step with
  the newest row instead. (story-template.yaml, the authoritative template, does use
  frontmatter `updated:`.)
  Placed here to match story-template.yaml's ordering — the log sits with the
  document-lifecycle tail, immediately before the QA/dev record sections.
-->

## Change Log

| Date       | Version | Description   | Author       |
| ---------- | ------- | ------------- | ------------ |
| YYYY-MM-DD | 1.0     | Initial draft | create-story |

---

## QA Testing Results

**QA Status**: ⚠️ Not Yet Tested

### Happy Path: No Issues Found ✅

> **When QA finds no bugs**: This section remains empty. QA updates story status to "Done" and adds completion notes to "QA Handoff Notes" section above.

### Unhappy Path: Issues Found 🔄

**Bug Reports Created**: [Number of bugs found]

#### Linked Bug Reports

| Bug ID                                                    | Title                     | Status   | Priority | Created    | Closed     |
| --------------------------------------------------------- | ------------------------- | -------- | -------- | ---------- | ---------- |
| [bug.8.5.3.1](./bug.{epic}.{story}.1.cache-cleanup-memory-leak.md) | Cache cleanup memory leak | Closed   | High     | 2025-10-18 | 2025-10-19 |
| [bug.8.5.3.2](./bug.{epic}.{story}.2.offline-mode-regression.md)   | Offline mode regression   | Reopened | Medium   | 2025-10-18 | -          |

#### QA Testing Notes

**Initial Testing Date**: [Date]
**QA Engineer**: [Name]

**Issues Found**:

1. [Brief description of issue 1] - See [bug.8.5.3.1](./bug.{epic}.{story}.1.cache-cleanup-memory-leak.md)
2. [Brief description of issue 2] - See [bug.8.5.3.2](./bug.{epic}.{story}.2.offline-mode-regression.md)

**Story Status History**:

- [Date]: Moved to "Reopened" - 2 bugs found
- [Date]: Bug.1 fixed and verified (Closed)
- [Date]: Bug.2 fix failed verification (Reopened)
- [Date]: Bug.2 fixed and verified (Closed)
- [Date]: Full story re-test passed - Moved to "Done"

---

## QA Completion Summary

> **Completed when all bugs closed and final re-test passed**

**Final QA Status**: ⚠️ Pending / ✅ Passed / ❌ Failed
**QA Engineer**: [Name]
**Final Testing Date**: [Date]

### Test Results Summary

- **All Acceptance Criteria Met**: Yes / No
- **Bug Reports Created**: [Number]
- **Bug Reports Closed**: [Number]
- **Regression Tests**: Passed / Failed
- **Performance**: Acceptable / Issues Found
- **Ready for Deployment**: Yes / No

### Final Notes

[Any final observations, recommendations, or notes for future reference]

---

**Status**: Last updated YYYY-MM-DD | **Assigned**: [Developer] | **Epic**: [Epic [N]]
