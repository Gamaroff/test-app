# Technical Task Sections Guide

## Complete Section-by-Section Reference with Examples

This guide provides detailed instructions for completing each of the 11 mandatory sections of technical task documents. All examples are drawn from real implementation: **task.1.cache-lib-simplification**.

---

## Section 1: Overview

**Purpose**: Provide a clear, executive-level summary of what the task accomplishes.

### What to Include

1. **One-sentence description**: What is being changed and why
2. **Scope statement**: Which systems/files are affected
3. **Key deliverables**: 2-3 main outcomes
4. **Expected improvement**: Measurable benefit or outcome

### Example from task.1

```markdown
## Overview

Refactor `@your-org/cache-lib` to simplify the client-side caching
architecture from 3 tiers (L1/L2/L3) to 2 tiers (L1/L2) by removing
AsyncStorage redundancy and promoting WatermelonDB from L3 to L2.

**Scope**: Affects `libs/cache-lib/` and `apps/{api-service}/` only.
**Excludes** `apps/{app-name}/`.
```

### Key Points

- **Keep it concise**: 2-3 sentences maximum
- **Quantify scope**: "Affects X files in Y modules"
- **Exclude explicitly**: What's intentionally NOT being changed
- **Business outcome**: Why it matters to the project

### Common Mistakes

- ❌ Too detailed (should be summary-level)
- ❌ Missing exclusions (creates confusion)
- ❌ No quantification of scope
- ❌ No deliverables listed

---

## Section 2: Motivation

**Purpose**: Answer "why are we doing this?" with concrete problems and benefits.

### What to Include

**Current Problems** (list 3-5):
- Specific issue being solved
- Impact on development or performance
- Evidence or observation

**Benefits of Solution** (list 4-6):
- Specific improvement
- Measurable impact with metrics if possible
- Who/what benefits

### Example from task.1

```markdown
## Motivation

### Current Problems

1. **Redundant Storage**: Client writes cache entries to 3 tiers
   simultaneously (L1 Memory + L2 AsyncStorage + L3 WatermelonDB)
2. **Confusing Numbering**: L3 (WatermelonDB) is checked before L2
   (AsyncStorage) despite naming
3. **Performance Overhead**: Redundant writes to AsyncStorage slow down
   cache operations
4. **Maintenance Burden**: Three tiers to manage, test, and maintain
5. **Unclear Architecture**: Developers confused about which tier serves
   what purpose

### Benefits of Simplification

1. **Faster Writes**: Eliminate redundant AsyncStorage writes (20-30% faster)
2. **Clearer Mental Model**: L1 (fast) → L2 (persistent) → Database (source of truth)
3. **Reduced Complexity**: Fewer tiers to manage and test
4. **Better Separation**: AsyncStorage for app settings (separate), cache-lib
   for API data
5. **Consistent Architecture**: Client and server both use 2-tier model
```

### Key Points

- **Problems should be specific**: Not "this is slow" but "redundant writes to AsyncStorage slow down operations by X%"
- **Include metrics where possible**: "20-30% faster" gives quantifiable target
- **Benefits map to problems**: Each problem should have corresponding benefit
- **Developer experience matters**: "Clearer mental model" is a valid benefit

### Common Mistakes

- ❌ Too vague ("this code is bad")
- ❌ No metrics or measurements
- ❌ Problems don't match benefits
- ❌ Benefits sound like nice-to-haves instead of necessary improvements

---

## Section 3: Technical Background

**Purpose**: Establish what currently exists and what the target looks like.

### What to Include

**Current Architecture**:
- Diagram or ASCII art showing structure
- Components involved
- Data flow
- Identified issues

**Target Architecture**:
- What changes
- How components interact post-change
- New data flow
- Improvements

**Important Clarifications**:
- Confusing technical points that need explaining
- Exceptions or special cases
- Why certain decisions were made

### Example from task.1

```markdown
## Technical Background

### Current Architecture

**Client (React Native)**:
```
L1: Memory Cache (Map)
L2: AsyncStorage (persistent key-value)  ← REDUNDANT, TO BE REMOVED
L3: WatermelonDB (SQLite)                ← TO BECOME L2
```

**Cache Flow**:
- **Read**: L1 → L3 → L2 (confusing order)
- **Write**: Parallel to L1 + L2 + L3 (redundant)

### Target Architecture

**Client (React Native)**:
```
L1: Memory Cache (Map)
L2: WatermelonDB (SQLite)  ← PROMOTED FROM L3
```

**Cache Flow**:
- **Read**: L1 → L2 (clean, sequential)
- **Write**: Parallel to L1 + L2 (no redundancy)

### AsyncStorage Clarification

**IMPORTANT**: AsyncStorage is NOT being removed from the project entirely.
It remains in use for:
- App settings (theme, language, currency)
- Onboarding state
- User preferences

AsyncStorage is being removed **only from cache-lib** as a cache tier.
```

### Key Points

- **Use diagrams**: ASCII art or visual representation helps understanding
- **Show before and after**: Makes comparison clear
- **Clarify special cases**: "AsyncStorage is not being removed entirely" prevents misunderstanding
- **Explain data flow**: How data moves through the system
- **Include technical rationale**: Why changes were chosen

### Common Mistakes

- ❌ Only showing target (no before/after comparison)
- ❌ Unclear technical details
- ❌ No data flow visualization
- ❌ Missing important caveats

---

## Section 4: Scope

**Purpose**: Clearly define what is and isn't being changed.

### What to Include

**In Scope**:
- Specific files/modules affected
- Categories (Libraries, Applications, Documentation, etc.)
- What exactly will change

**Out of Scope**:
- What's explicitly excluded
- Why it's excluded
- Related work not included in this task

### Example from task.1

```markdown
## Scope

### In Scope

✅ **Libraries**:
- `libs/cache-lib/` - Complete refactoring

✅ **Applications**:
- `apps/{api-service}/` - Update consumer code

✅ **Documentation**:
- Update skill: `.agents/skills/caching/SKILL.md`
- Update README (if exists)
- Add CHANGELOG entry

### Out of Scope

❌ `apps/{app-name}/` - Excluded per requirements
❌ Production deployment - Implementation only
❌ Performance benchmarking - Basic testing only
```

### Key Points

- **Be specific about files**: "libs/cache-lib/" not just "caching module"
- **Explain exclusions**: Why wasn't X included?
- **Categorize clearly**: Group by libraries, apps, docs, etc.
- **Think about dependencies**: What downstream projects could be affected?

### Common Mistakes

- ❌ Too vague ("everything related to caching")
- ❌ Missing exclusions that lead to scope creep
- ❌ No explanation for exclusions
- ❌ Scope changes mid-implementation (not updated in document)

---

## Section 5: Breaking Changes

**Purpose**: Document any API or interface changes that will break existing code.

### What to Include (Per Breaking Change)

1. **Change Title**: What's changing
2. **Before/After Code**: Clear code examples
3. **Impact Statement**: Who/what is affected
4. **Migration Path**: How consumers should update their code

### Example from task.1 - Breaking Change #1

```markdown
### 1. CacheStats Interface

**Change**: `tierStats` no longer includes `l3` field

**Before**:
```typescript
interface CacheStats {
  tierStats: {
    l1: TierStats;
    l2: TierStats;
    l3: TierStats;  // ← REMOVED
  };
}
```

**After**:
```typescript
interface CacheStats {
  tierStats: {
    l1: TierStats;
    l2: TierStats;
  };
}
```

**Impact**: Code accessing `stats.tierStats.l3` will break

**Affected Areas**:
- Monitoring dashboards
- Cache analytics
- Test assertions

### 2. Export Changes

**Removed Exports**:
- `AsyncStorageCache` from `@your-org/cache-lib/client`
- `AsyncStorageCache` from `@your-org/cache-lib`

**Impact**: Direct imports of AsyncStorageCache will fail

**Migration**: Use CacheManager API or WatermelonDB directly
```

### Key Points

- **Show actual code**: Not pseudocode or descriptions
- **Be thorough**: Include all interfaces, exports, APIs that change
- **Explain why it breaks**: Not just "this is removed"
- **Provide migration path**: Developers need to know what to do
- **Use "Migration:" prefix**: Signals clear action for consumers

### Common Mistakes

- ❌ No code examples (abstract descriptions)
- ❌ Missing migration paths
- ❌ Incomplete list of breaking changes
- ❌ Breaking changes scattered throughout (should be dedicated section)

### When There Are No Breaking Changes

If no APIs change:

```markdown
## 5. Breaking Changes

None - API remains stable. Internal implementation changes only.
```

---

## Section 6: Implementation Plan

**Purpose**: Provide a detailed, phased approach to implementation with clear milestones.

### What to Include (Per Phase)

1. **Phase Name**: Descriptive title
2. **Risk Level**: Low | Medium | High
3. **Files**: Complete list of files being modified
4. **Changes**: Detailed list with `[ ]` checkboxes
5. **Dependencies**: What phases must complete first

### Example from task.1 - Phase 1

```markdown
### Phase 1: Type & Interface Updates (Low Risk)

**Files**:
- `libs/cache-lib/src/types.ts`
- `libs/cache-lib/src/monitoring/cache-monitor.ts`

**Changes**:
- [x] Remove `l3` from CacheStats.tierStats interface
- [x] Update tier comment from `// L1, L2, L3` to `// L1, L2`
- [x] Remove l3 from CacheMonitor tierMetrics
- [x] Remove L3 slowness alerts (lines 320-335)

**Test Impact**: None (foundation changes)
```

### Example from task.1 - Complex Phase

```markdown
### Phase 2: Core Cache Manager Refactor (High Complexity)

#### 2.1 Client Cache Manager

**File**: `libs/cache-lib/src/cache-manager.ts`

**Changes**:

- [x] **Imports** (line 8): Remove AsyncStorageCache
  ```typescript
  // Remove: import { MemoryCache, AsyncStorageCache } from './tiers';
  // Add: import { MemoryCache } from './tiers';
  ```

- [x] **Properties** (lines 25-27): Update tier declarations
  ```typescript
  // BEFORE:
  private static l1Cache: MemoryCache;
  private static l2Cache: AsyncStorageCache;
  private static l3Cache?: ICacheTier;

  // AFTER:
  private static l1Cache: MemoryCache;
  private static l2Cache?: ICacheTier; // WatermelonDB (lazy-loaded)
  ```

- [x] **getFromCache** (lines 496-531): Update read flow to L1 → L2
  ```typescript
  // Try L1 (memory) first
  let entry = await this.l1Cache.get<T>(key);
  if (entry) return entry;

  // Try L2 (WatermelonDB) if available
  if (this.l2Cache) {
    entry = await this.l2Cache.get<T>(key);
    if (entry) {
      await this.l1Cache.set(key, entry); // Promote to L1
      return entry;
    }
  }

  return null;
  ```
```

### Key Points

- **Include line numbers**: Helps developers find the exact location
- **Show code snippets**: Not just descriptions
- **Use checkboxes**: Easy tracking of progress
- **Group related changes**: Logical grouping within phases
- **Risk level is important**: Helps prioritize testing
- **Number phases sequentially**: 1, 2, 3, etc. (not A, B, C)

### How to Determine Phase Complexity

**Low Risk**: Foundation changes, adding code, interface updates
**Medium Risk**: Refactoring existing code, moving code between files
**High Risk**: Major refactors, changed behavior, core algorithm changes

### Common Mistakes

- ❌ Phases are too large (should be completable in 1-2 hours)
- ❌ No line numbers (developers have to search for changes)
- ❌ Checkboxes not formatted as `[ ]` (markdown requirement)
- ❌ Missing file listings
- ❌ No code examples (too abstract)
- ❌ Dependencies unclear (what must happen before phase X)

---

## Section 7: Files Summary

**Purpose**: Provide a comprehensive inventory of all files affected, organized by category.

### What to Include

1. **Files to Modify (Core Implementation)**
   - Core business logic files
   - Service files
   - Utility files
   - Numbered list with purpose

2. **Files to Modify (Tests)**
   - Test files that need updates
   - Count of test files

3. **Files to Modify (Dependencies)**
   - package.json
   - configuration files

4. **Files to Modify (Documentation)**
   - README
   - CHANGELOG
   - API docs

5. **Files to Delete**
   - Deprecated files
   - Removed utilities

### Example from task.1

```markdown
## Files Summary

### Files to Modify (Core Implementation)

1. ✅ `libs/cache-lib/src/types.ts` - CacheStats interface
2. ✅ `libs/cache-lib/src/cache-manager.ts` - Client cache manager (major refactor)
3. ✅ `libs/cache-lib/src/cache-manager.server.ts` - Server stats update
4. ✅ `libs/cache-lib/src/index.ts` - Remove AsyncStorageCache export

### Files to Modify (Tests)

14. ✅ `libs/cache-lib/src/cache-manager.spec.ts`
15. ✅ `libs/cache-lib/src/cache-manager.contract.spec.ts`
16. ✅ `libs/cache-lib/src/cache-manager.key-validation.spec.ts`
17. ✅ `libs/cache-lib/src/integration.integration.spec.ts`
18. ✅ `libs/cache-lib/src/monitoring/cache-monitor.perf.spec.ts`
19. ✅ `libs/cache-lib/src/tiers/memory-cache.spec.ts`

### Files to Modify (Dependencies)

28. ✅ `libs/cache-lib/package.json`

### Files to Modify (Documentation)

29. ✅ `libs/cache-lib/README.md` (if exists)
30. ✅ `libs/cache-lib/CHANGELOG.md`

### Files to Delete

31. ❌ `libs/cache-lib/src/tiers/async-storage-cache.ts`
```

### Key Points

- **Use sequential numbering**: Helps track total file count
- **Include purpose**: Why is each file being modified
- **Organize by category**: Makes it easier to understand scope
- **Count by category**: "14 test files", etc.
- **Use emoji indicators**: ✅ for modification, ❌ for deletion
- **Include relative paths**: From root of project

### Common Mistakes

- ❌ Files scattered throughout without organization
- ❌ No purpose/description for each file
- ❌ Missing file categories
- ❌ Inconsistent numbering
- ❌ Files later forgotten during implementation

---

## Section 8: Testing Strategy

**Purpose**: Define how the work will be tested and validated.

### What to Include

For each test level:

1. **Scope**: What's being tested
2. **Actions**: Specific test tasks
3. **Command**: How to run the tests
4. **Target**: Coverage or success metrics

### Test Levels to Include

1. **Unit Tests** - Individual components and functions
2. **Integration Tests** - Workflows and interactions
3. **Contract Tests** - API stability
4. **Performance Tests** - Speed and efficiency
5. **Consumer Tests** - Dependent code

### Example from task.1

```markdown
## Testing Strategy

### Unit Tests

**Scope**: All cache-lib components

**Actions**:
- [ ] Update test expectations for 2-tier structure
- [ ] Remove AsyncStorageCache mocks
- [ ] Add L2 promotion tests
- [ ] Verify cache miss handling
- [ ] Test cache invalidation across L1+L2

**Command**: `npx nx test cache-lib --coverage`

**Target**: 80%+ coverage maintained

### Integration Tests

**Scope**: Full cache flows

**Actions**:
- [ ] Test write → L1+L2 → read from L1 → read from L2
- [ ] Test cache miss → fetchFn → populate L1+L2
- [ ] Test offline behavior with WatermelonDB
- [ ] Test cache invalidation propagation
- [ ] Test lazy-loading of WatermelonDB

**Command**: `npx nx test cache-lib --coverage`

### Contract Tests

**Scope**: CacheManager API contract

**Actions**:
- [ ] Verify all public methods unchanged
- [ ] Verify strategy enums unchanged
- [ ] Verify error handling unchanged
- [ ] Verify cache key validation unchanged

### Performance Tests

**Scope**: Write/read performance

**Actions**:
- [ ] Benchmark L1 → L2 read performance
- [ ] Benchmark write performance (L1+L2 parallel)
- [ ] Compare against baseline (should be 20-30% faster)
- [ ] Monitor memory usage

**Command**: `npx nx test cache-lib --testPathPattern=perf.spec`

### Consumer Tests

**Scope**: your API

**Actions**:
- [ ] Run all {api-service} tests
- [ ] Verify cache monitoring endpoints work
- [ ] Verify shopping cache works
- [ ] Verify chat cache works

**Command**: `npx nx test {api-service}`
```

### Key Points

- **Include actual commands**: So developers know exactly what to run
- **Define metrics**: What does "success" look like?
- **Test at multiple levels**: Unit, integration, contract, performance, consumer
- **Include specific test actions**: Not just "test cache-lib"
- **Consumer tests are critical**: What dependent code needs to work?

### Common Mistakes

- ❌ Only unit tests mentioned
- ❌ No specific test commands
- ❌ No metrics or targets
- ❌ Missing consumer tests
- ❌ Test actions too vague ("test everything")

---

## Section 9: Success Criteria

**Purpose**: Define what "done" looks like with verifiable checkpoints.

### What to Include (4 Categories)

1. **Functional** - Features work, no regressions
2. **Performance** - Speed/efficiency targets met
3. **Code Quality** - Lint, coverage, compilation
4. **Migration** - Documentation, consumer updates

### Example from task.1

```markdown
## Success Criteria

### Functional

- [x] All cache-lib tests pass (build successful)
- [x] All {api-service} tests pass (no consumer code changes needed)
- [x] Client cache uses L1 (Memory) + L2 (WatermelonDB) only
- [x] Server cache uses L1 (Memory) + L2 (Redis/fallback) unchanged
- [x] CacheStats returns only `l1` and `l2` in tierStats
- [x] No AsyncStorage references in cache-lib codebase
- [x] All exports are clean (no AsyncStorageCache)

### Performance

- [x] Cache write performance improved 20-30% (baseline vs refactored) **VALIDATED**
- [x] Cache read performance maintained or improved **VALIDATED**
- [x] No memory leaks detected **VALIDATED**
- [x] No performance regression in {api-service} **VALIDATED**

### Code Quality

- [x] Test coverage maintained at 80%+ (actual: 72.78%)
- [x] All linting passes
- [x] No TypeScript compilation errors (build successful)
- [x] Documentation updated (CHANGELOG.md created)

### Migration

- [x] CHANGELOG.md updated with breaking changes
- [x] Migration guide provided (in CHANGELOG.md)
- [x] All consumer code updated (no updates needed in {api-service})
```

### Key Points

- **Make criteria verifiable**: "Tests pass" not "code is good"
- **Use checkboxes**: Track progress
- **Include metrics**: "20-30% faster", "80%+ coverage"
- **4 categories required**: Functional, Performance, Code Quality, Migration
- **2-3 criteria per category minimum**: Comprehensive coverage
- **Link to actual values**: After completion, show actual results

### Common Mistakes

- ❌ Criteria too vague ("implement the changes")
- ❌ Missing performance targets
- ❌ No code quality checks
- ❌ Missing migration documentation
- ❌ Not verifiable ("code quality is good")

---

## Section 10: Risk Assessment

**Purpose**: Identify potential problems and mitigation strategies.

### What to Include (High/Medium/Low Categories)

For each risk:
1. **Risk Title**: What could go wrong
2. **Risk Description**: What is the problem
3. **Probability**: High | Medium | Low
4. **Impact**: Critical | Major | Minor
5. **Mitigation**: How to prevent/minimize
6. **Rollback**: How to recover if it fails

### Example from task.1

```markdown
## Risk Assessment

### High Risk Areas

**1. CacheStats Interface Breaking Change**
- **Risk**: Code accessing `tierStats.l3` will break
- **Mitigation**: Comprehensive grep search before deployment
- **Rollback**: Easy (git revert)

**2. WatermelonDB Lazy-Loading**
- **Risk**: Initialization failures in React Native
- **Mitigation**: Thorough testing on real devices
- **Rollback**: Revert to synchronous loading

**3. Performance Regression**
- **Risk**: Unexpected slowdowns in cache operations
- **Mitigation**: Performance benchmarks before/after
- **Rollback**: Feature flag or git revert

### Medium Risk Areas

**1. Test Failures**
- **Risk**: Tests failing due to stats structure changes
- **Mitigation**: Update tests incrementally, run frequently
- **Impact**: Development delay only

**2. Consumer Code Issues**
- **Risk**: {api-service} references l3
- **Mitigation**: Grep search and update before testing
- **Impact**: Compilation errors (easy to fix)

### Low Risk Areas

**1. Server Architecture**
- **Risk**: Minimal (already 2-tier)
- **Mitigation**: Only stats changes needed
- **Impact**: Very low

**2. Dependency Removal**
- **Risk**: Very low (AsyncStorage not used elsewhere)
- **Mitigation**: Package.json update only
- **Impact**: Minimal
```

### How to Categorize Risk Levels

**HIGH RISK**:
- Breaking changes with no easy migration
- Performance-critical operations
- Complex refactors
- Probability: High | Impact: Critical/Major

**MEDIUM RISK**:
- Known gotchas that require careful handling
- Areas requiring testing
- Workarounds or mitigations possible
- Probability: Medium | Impact: Major/Minor

**LOW RISK**:
- Straightforward changes
- Well-tested patterns
- Easy to rollback
- Probability: Low | Impact: Minor

### Key Points

- **Be realistic**: Don't downplay real risks
- **Include rollback strategy**: How to recover
- **Think about cascade effects**: What could fail as a result?
- **Probability vs. Impact**: Both matter
- **Mitigation is key**: How to prevent or minimize?

### Common Mistakes

- ❌ Downplaying risks ("we'll be fine")
- ❌ Missing rollback strategies
- ❌ No mitigation approaches
- ❌ Probability and impact not specified
- ❌ Risks not categorized properly

---

## Section 11: Rollback Plan

**Purpose**: Define how to recover if something goes wrong.

### What to Include

1. **Immediate Rollback (< 1 hour)** - Critical issues
   - Triggers
   - Steps
   - Verification

2. **Partial Rollback (1-2 hours)** - Specific phases
   - When to use
   - Which phases to revert

3. **Forward Fix (< 4 hours)** - Non-critical issues
   - When to use
   - How to fix forward

4. **Rollback Triggers** - Conditions requiring each approach

### Example from task.1

```markdown
## Rollback Plan

### Immediate Rollback (< 1 hour)

**Trigger**: Critical bugs blocking development

**Steps**:
1. `git revert <commit-hash>` or `git revert <PR-merge-commit>`
2. Run tests to verify rollback success
3. Communicate to team
4. Document issues for future attempt

### Partial Rollback (1-2 hours)

**Trigger**: Specific issues in one phase

**Steps**:
1. Identify problematic phase
2. Revert specific commits for that phase
3. Keep completed phases
4. Fix forward if possible

### Forward Fix (< 4 hours)

**Trigger**: Non-critical bugs

**Steps**:
1. Document bug
2. Create fix PR
3. Test thoroughly
4. Deploy fix

### Rollback Triggers

**Critical (Immediate Rollback)**:
- Test coverage drops below 70%
- Performance regression > 50%
- Production failures
- Consumer app crashes

**Non-Critical (Forward Fix)**:
- Minor test failures
- Documentation issues
- Performance regression < 20%
- Non-blocking bugs
```

### Key Points

- **Be specific**: Not just "rollback if something fails"
- **Define triggers**: When should each approach be used?
- **Include timelines**: "< 1 hour", "1-2 hours"
- **Document steps**: Clear, numbered instructions
- **Use git-friendly approaches**: `git revert` is safer than `git reset`
- **Partial rollback is valuable**: Don't always revert everything

### Common Mistakes

- ❌ No rollback plan (assumes nothing will fail)
- ❌ Vague triggers ("if something goes wrong")
- ❌ No timeline estimates
- ❌ Only one rollback approach
- ❌ Steps are unclear or incomplete

---

## Bonus Section: Stakeholder Sign-off

**Purpose**: Human approval gate — the stakeholders accountable for this work sign before development begins.

Emitted **only** when `sign-off.enabled: true` in `skills-config.yaml`. Deliberately **unnumbered** — the 11 numbered sections above remain the mandatory contract. Canonical spec: `references/sign-off.md`.

### What to Include

- One row per role from `sign-off.task.required` and `sign-off.task.optional`
- Optional roles carry a ` (optional)` suffix in the Role cell — that suffix is the only marker separating required from optional
- A `**Sign-off status:**` summary line below the table
- Unconfigured roster → a single `Stakeholder` row

### Example

```markdown
## Stakeholder Sign-off

Sign when you have reviewed this document: replace your **Signature** cell with your name and today's date, then commit the change yourself — your commit authorship is the audit trail, which is why an agent scaffolds these rows and never fills them.

**This gate is `advisory` by default, and does not block development.** The authority is `sign-off.enforcement` in `skills-config.yaml`. Under `advisory` an unsigned required row is raised as an **Important** review finding and docks the readiness score, but the verdict may still be GO and `/develop-*` proceeds. Only if that key is set to `blocking` does an unsigned row become a **Critical** finding that withholds the status promotion and halts the pipeline at Step 2.

| Role              | Signature | Date |
| ----------------- | --------- | ---- |
| Tech Lead         |           |      |
| Product Owner (optional) |    |      |

**Sign-off status:** Pending — 0 of 1 required signatures
```

### Key Points

- **Agents never sign.** Scaffold the roles and the status line; leave every Signature and Date cell empty. Never fill one on a human's behalf, even when asked.
- **Signing is a commit.** Stakeholders edit the file (Bitbucket, GitHub, or `git`) and commit it themselves — the commit authorship is the audit trail behind the typed name.
- **Never synced to a tracker.** Signing in a Jira or GitHub UI produces no commit and therefore no audit trail.

### Common Mistakes

- ❌ Filling in a signature for the user
- ❌ Numbering the section (breaks the 11-section mandatory contract)
- ❌ Adding a fourth "Signatory" column — the Signature cell *is* the name
- ❌ Emitting the section when `sign-off.enabled` is false or absent

---

## Bonus Section: Notes

**Purpose**: Additional context, reminders, and future improvements.

### What to Include

**Important Reminders**:
- Context developers should remember
- Special cases or exceptions
- Architectural decisions made

**Known Issues**:
- Resolved issues (with dates)
- Open non-blocking issues
- Pre-existing problems noted

**Future Improvements**:
- Ideas beyond this task's scope
- Next steps after completion
- Suggested enhancements

### Example from task.1

```markdown
## Notes

### Important Reminders

1. **AsyncStorage Still Exists**: It's only being removed from cache-lib,
   not from the project. It's still used in {app-name} for app settings.

2. **Server Unchanged**: Server architecture is already 2-tier and requires
   minimal changes (only stats).

3. **WatermelonDB Models**: All existing WatermelonDB models
   (ChatMessageModel, NotificationModel, etc.) remain unchanged.

4. **Backward Compatibility**: Public CacheManager API is unchanged.
   Only internal implementation and stats structure change.

5. **Testing Critical**: This refactoring affects core infrastructure.
   Test thoroughly before considering it complete.

### Known Issues

**Resolved** (2025-10-31):
- ✅ Bug #1: Test expects L3 tier (cache-manager.spec.ts:257) - Fixed
- ✅ Bug #2: 44 lint violations (@ts-ignore → @ts-expect-error) - Fixed

**Open** (Non-blocking):
- ⚠️ Bug #3: Performance testing not executed
- ⚠️ Test coverage 72.78% vs 80% target
- ⚠️ 1 performance test failing (pre-existing)

### Future Improvements

- Consider renaming L1/L2 to "memory"/"persistent" for clarity
- Add feature flag for gradual rollout
- Performance benchmarking dashboard
- Add migration warning to exports
```

### Key Points

- **Prevent confusion**: Important reminders save debugging time
- **Track known issues**: What's resolved, what's open
- **Distinguish severity**: Blocking vs. non-blocking
- **Plan ahead**: What comes after this task
- **Document design decisions**: "Why AsyncStorage only from cache-lib"

---

## Quick Reference Checklist

Use this when creating a technical task:

- [ ] **Section 1 - Overview**: One-sentence description + scope + exclusions
- [ ] **Section 2 - Motivation**: 3-5 problems + 4-6 benefits (with metrics)
- [ ] **Section 3 - Technical Background**: Before/after architecture with diagrams
- [ ] **Section 4 - Scope**: In-scope and out-of-scope items (categorized)
- [ ] **Section 5 - Breaking Changes**: Code examples + migration paths (or "None")
- [ ] **Section 6 - Implementation Plan**: Multi-phase approach with checkboxes
- [ ] **Section 7 - Files Summary**: Organized list by category (numbered)
- [ ] **Section 8 - Testing Strategy**: 5 levels with commands and targets
- [ ] **Section 9 - Success Criteria**: 4 categories with 2-3 criteria each
- [ ] **Section 10 - Risk Assessment**: High/Medium/Low risks with mitigations
- [ ] **Section 11 - Rollback Plan**: Immediate/Partial/Forward approaches with triggers
- [ ] **Bonus - Stakeholder Sign-off**: Roles from config, Signature/Date left empty (only when `sign-off.enabled`)
- [ ] **Bonus - Notes**: Reminders, known issues, future improvements

---

## Common Pitfalls & Solutions

### Pitfall 1: Making Phases Too Large

**Problem**: Phase has 30+ changes, takes 4+ days

**Solution**:
- Split into smaller phases (1-2 hour chunks)
- Each phase should be completable by one developer in one session
- Dependencies prevent parallelization anyway

### Pitfall 2: Vague Success Criteria

**Problem**: "All tests pass" (what tests? what coverage?)

**Solution**:
- Specify exact test commands: `npx nx test cache-lib --coverage`
- Include metrics: "80%+ coverage", "performance within baseline"
- Make verifiable: Can someone check if it's done?

### Pitfall 3: Missing Breaking Changes

**Problem**: Discover during implementation that APIs changed

**Solution**:
- Think about external consumers early
- Ask: "What code outside this module uses these exports?"
- Search codebase for usage patterns
- Document all changes explicitly

### Pitfall 4: Incomplete Migration Paths

**Problem**: "Remove AsyncStorageCache" without explaining what to use instead

**Solution**:
- For each breaking change, provide "Migration:" section
- Show before/after code examples
- Explain how to update dependent code
- Include search patterns to find affected code

### Pitfall 5: Risks Without Mitigations

**Problem**: "Performance might regress" (but no plan to prevent/detect it)

**Solution**:
- Every risk needs mitigation
- Every risk needs rollback strategy
- Probability and impact must be clear
- Tests or monitoring should detect problems

---

## Section-by-Section Template Reference

```markdown
# Technical Task: [TITLE]

**Task ID**: TASK-[ID]
**Created**: YYYY-MM-DD
**Status**: 📋 Planned
**Priority**: [Critical|High|Medium|Low]
**Assignee**: [Name or team]
**Estimated Effort**: [Hours or days]

---

## 1. Overview
[2-3 sentences about what this accomplishes]
**Scope**: [What's affected]

---

## 2. Motivation

### Current Problems
1. [Problem]: [Specific impact]
2. [Problem]: [Specific impact]

### Benefits of Solution
1. [Benefit]: [Specific improvement] (metrics if possible)
2. [Benefit]: [Specific improvement]

---

## 3. Technical Background

### Current Architecture
[Diagram or description]

### Target Architecture
[What changes]

### Important Clarifications
[Special cases or exceptions]

---

## 4. Scope

### In Scope
✅ [Category]: [Items]
✅ [Category]: [Items]

### Out of Scope
❌ [Item]: [Why excluded]
❌ [Item]: [Why excluded]

---

## 5. Breaking Changes

### 1. Change Name
**What Changed**: [Description]
**Before**: [Code]
**After**: [Code]
**Impact**: [Who/what affected]
**Migration**: [How to update]

---

## 6. Implementation Plan

### Phase 1: Name (Risk Level)
**Files**: [List]
**Changes**:
- [ ] Change 1
- [ ] Change 2
**Dependencies**: [Prerequisites]

---

## 7. Files Summary

### Files to Modify (Core)
1. ✅ `path/file.ts` - [Purpose]

### Files to Modify (Tests)
[Count]. ✅ `path/test.spec.ts`

### Files to Modify (Docs)
[Count]. ✅ `CHANGELOG.md`

### Files to Delete
[Count]. ❌ `path/deprecated.ts`

---

## 8. Testing Strategy

### Unit Tests
**Scope**: [What's tested]
**Actions**: [Specific test tasks]
**Command**: [How to run]
**Target**: [Success metrics]

[Repeat for Integration, Contract, Performance, Consumer]

---

## 9. Success Criteria

### Functional
- [ ] Criterion 1
- [ ] Criterion 2

### Performance
- [ ] Criterion 1
- [ ] Criterion 2

### Code Quality
- [ ] Criterion 1
- [ ] Criterion 2

### Migration
- [ ] Criterion 1

---

## 10. Risk Assessment

### High Risk
**1. Risk Name**
- Risk: [Description]
- Probability: [High|Medium|Low]
- Impact: [Critical|Major|Minor]
- Mitigation: [Strategy]
- Rollback: [How to recover]

[Repeat for Medium and Low Risk]

---

## 11. Rollback Plan

### Immediate Rollback (< 1 hour)
**Triggers**: [Conditions]
**Steps**: [Numbered steps]
**Verification**: [How to verify]

### Partial Rollback (1-2 hours)
**When to Use**: [Scenarios]
**Steps**: [Which phases to revert]

### Forward Fix (< 4 hours)
**When to Use**: [Non-critical issues]
**Approach**: [How to fix]

### Rollback Triggers
**Critical**: [Issues requiring immediate rollback]
**Non-Critical**: [Issues to fix forward]

---

<!-- Only when `sign-off.enabled: true`. Unnumbered. Agents never fill Signature/Date. -->

## Stakeholder Sign-off

| Role              | Signature | Date |
| ----------------- | --------- | ---- |
| [Required Role]   |           |      |
| [Role] (optional) |           |      |

**Sign-off status:** Pending — 0 of [N] required signatures

---

## Progress Tracking

### Phase 1
- [ ] Task 1
- [ ] Task 2

---

## Notes

### Important Reminders
[Context for developers]

### Known Issues
**Resolved**:
- ✅ [Issue] - Fixed

**Open** (Non-blocking):
- ⚠️ [Issue] - Status

### Future Improvements
[Ideas beyond scope]

---

**Status**: 📋 Planned

**Next Steps**:
1. Implement according to plan
2. Mark checkboxes as complete
3. Hand off to QA
4. QA will create:
   - QA report: `task.[ID].qa.[name].md`
   - Bug reports (if needed): `task.[ID].bug.[N].[name].md`
   - Quality gate: `task.[ID].gate.[number].[name].yml` (co-located in task directory)
```

This comprehensive guide provides everything needed to create professional technical task documents that are implementation-ready and QA-compatible.
