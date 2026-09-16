---
name: react-native-debug
description: Iterative debugging for React Native apps. Handles Jest test failures and Metro bundler errors with an interactive approach to determine whether implementation or test is incorrect.
---

# React Native Debugging Skill

## Overview

The React Native Debugging skill helps you iteratively debug and fix React Native apps in your project, specifically for `@apps/{app-name}/`. This skill handles both Jest test failures and Metro bundler runtime errors, with special focus on the code vs test validation problem - tests may become outdated while code is correct, or vice versa.

## Critical Design Principles

1. **Interactive Approach**: Present findings and offer choices rather than auto-fixing everything
2. **Code vs Test Validation**: Intelligently determine whether code or test is wrong
3. **Automation Where Safe**: Auto-clear Metro cache, auto-rebuild libraries
4. **Confirmation for Changes**: Always confirm before modifying test files
5. **Platform Separation First**: Validate client/server import rules immediately

## Debugging Entry Points

This skill has two primary entry points:

### 1. Jest Test Failure Debugging
**When**: You encounter test failures, mock errors, or assertion failures
**Example**: "My test is failing: Expected mock to have been called 1 time, but it was called 0 times"

### 2. Metro Runtime Error Debugging
**When**: Metro bundler fails, app crashes on device, module resolution errors
**Example**: "Metro error: Unable to resolve module @your-org/auth-lib from..."

## Phase 1: Error Detection & Classification

### Input Processing

When you provide an error, the skill will:

1. **Parse the error output** - Extract error type, message, file path, line number
2. **Identify error category** - Classify into one of the debugging paths
3. **Extract context** - Determine which file(s) are involved

### Error Categories

#### A. Metro Bundler Errors
**Signatures**:
- "Unable to resolve module"
- "Cannot find module"
- Metro red screen on device
- "Module not found: Can't resolve"

**Root Causes**:
- Library not built to `dist/`
- Metro cache stale
- Incorrect workspace root configuration
- Missing `tsconfig.json` paths entry

**Debug Path**: Metro Resolution Debugging

#### B. Jest Test Configuration Errors
**Signatures**:
- "Test suite failed to run"
- "Cannot find module" in test
- "ReferenceError: expect is not defined"
- "TypeError: Cannot read property of undefined" (in setup)

**Root Causes**:
- Missing or incorrect `test-setup.ts`
- Jest configuration issue
- Incorrect transformer configuration
- Bad `tsconfig.json` path

**Debug Path**: Test Configuration Debugging

#### C. Mock Configuration Errors
**Signatures**:
- "Cannot read property 'X' of undefined"
- "Expected mock function to have been called"
- "TypeError: mockFunction is not a function"
- Mock not being applied

**Root Causes**:
- Mock declared after import (wrong order)
- Mock incomplete (missing exports)
- Duplicate mock declarations
- Mock return type mismatch

**Debug Path**: Mock Configuration Debugging

#### D. Platform Separation Violations
**Signatures**:
- "Password hashing not available in mobile environment"
- "Module not found: bcryptjs"
- "Module not found: jsonwebtoken"
- ESLint error "Don't import from server-only libraries in client code"

**Root Causes**:
- Importing from `@your-org/auth-lib` instead of `/client`
- Using server functions (hashPassword, verifyAccessToken, encryptData)
- Test file importing server utilities

**Debug Path**: Platform Separation Validation

#### E. Component Rendering Errors
**Signatures**:
- "Invariant Violation: React.createElement: type is invalid"
- "Unable to find element with testID"
- Element rendering warnings
- "Element type is invalid"

**Root Causes**:
- Missing required props
- Incorrect component import
- Theme provider not wrapping component
- Mock not returning correct component

**Debug Path**: Component Rendering Debugging

#### F. Async Timing Errors
**Signatures**:
- "Timeout - Async callback was not invoked"
- "Unable to find element" (flaky, sometimes passes)
- "Expected X but received undefined" (async state)
- Test timeout (> 5000ms)

**Root Causes**:
- Missing `await waitFor()`
- Insufficient timeout
- Race condition in test
- Async operation not triggering state update

**Debug Path**: Async Timing Debugging

### Classification Question

**"Which debugging path applies to your error?"**

Present the 6 categories above and ask user to identify which matches their error. This helps narrow the debugging scope immediately.

---

## Phase 2: Automated Diagnostics

Before interactive debugging begins, run these automated checks:

### Check 1: Metro Cache Staleness
```
Run: npx nx start {app-name} --dry-run (check if it succeeds)
If fails: Metro cache likely stale
Action: Auto-clear cache without asking
```

### Check 2: Library Build Artifacts
```
Run: ls dist/libs/@your-org/*/
For each missing library:
  - Notify user
  - Offer auto-rebuild
```

### Check 3: Platform Separation
```
Scan: Test file for imports from:
  - @your-org/auth-lib (should be /client)
  - @your-org/logging-lib (should be /client)
  - @your-org/shared-utils/server
  - bcryptjs, jsonwebtoken, winston
If found: Flag as platform separation violation
```

### Check 4: Test Setup Validation
```
Verify: apps/{app-name}/src/test-setup.ts exists
If missing: Flag critical issue
If exists: Verify it contains:
  - @testing-library/jest-native/extend-expect
  - Global mock declarations
```

### Check 5: Mock Declaration Order
```
Scan: Test file for:
  - jest.mock() calls BEFORE any imports from that module
If violation: Flag mock ordering issue
```

### Check 6: Jest Configuration
```
Verify: jest.config.ts exists and contains:
  - preset: 'react-native'
  - setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts']
  - moduleNameMapper for SVG
  - Correct transform configuration
```

---

## Phase 3: Interactive Fix Workflows

Each debugging path below presents findings and offers 2-4 options. User selects preferred approach.

### Workflow A: Metro Resolution Debugging

**When**: "Unable to resolve module" or "Cannot find module"

**Automated Checks**:
1. Is library built? Check `dist/libs/@your-org/[library]/`
2. Is Metro cache fresh? Try clear if not
3. Is workspace root configured? Check `metro.config.js`

**Interactive Questions**:

**Question 1**: "Do the library build artifacts exist?"
- ✅ YES → Proceed to Question 2
- ❌ NO → Offer "Auto-rebuild libraries"

**Question 2**: "Which resolution path matches your error?"
- Path 1: "Module resolution path is wrong" → Verify tsconfig.json paths
- Path 2: "Metro cache is stale" → Clear cache (auto-run)
- Path 3: "Library isn't being built" → Rebuild libraries (auto-run)
- Path 4: "Project root is wrong" → Review metro.config.js

**Verification**:
```bash
# After fix
npx nx start {app-name} --reset-cache --clear
# Check: Does Metro bundler start without errors?
```

### Workflow B: Test Configuration Debugging

**When**: "Test suite failed to run" or jest setup errors

**Automated Checks**:
1. Does test-setup.ts exist?
2. Is jest.config.ts correct?
3. Are imports in test file valid?

**Interactive Questions**:

**Question 1**: "What's the exact error message in the Jest output?"
- User provides error details

**Question 2**: "Which issue matches?"
- Issue A: "test-setup.ts missing or empty" → Create/update file
- Issue B: "jest.config.ts misconfigured" → Review configuration
- Issue C: "Transformer not working" → Check babel config
- Issue D: "Module not found during setup" → Check imports

**Fix Options**:
1. **Minimal Fix**: Only address the immediate error
2. **Comprehensive Fix**: Update test setup globally
3. **Review Only**: Present changes for user approval

**Verification**:
```bash
# After fix
npx nx test {app-name} --testNamePattern="[test name]" --no-coverage
```

### Workflow C: Mock Configuration Debugging

**When**: "Cannot read property X of undefined" or mock-related errors

**Automated Checks**:
1. Is mock declared before imports?
2. Are all module exports mocked?
3. Are there duplicate mocks?

**Interactive Analysis**:

**Question 1**: "Show me the mock declaration and the error."
- User provides code context

**Question 2**: "Which issue matches?"
- Issue A: "Mock declared AFTER import" → Move jest.mock() to top
- Issue B: "Mock incomplete - missing exports" → Add missing exports
- Issue C: "Mock return type wrong" → Fix return value type
- Issue D: "Duplicate mocks - last one overwrites" → Consolidate mocks
- Issue E: "Mock not being applied" → Check for circular dependencies

**Fix Options**:
1. **Auto-fix simple issue** (ordering, duplication)
2. **Manual review** (requires code inspection)
3. **Create new test mock** (if pattern is wrong)

**Verification**:
```bash
# After fix - check just the mock
npx nx test {app-name} --testNamePattern="[test name]" --no-coverage
```

### Workflow D: Platform Separation Validation

**When**: "Not available in mobile environment" or server import in client

**Automated Checks**:
1. Scan test file for all @{project} imports
2. Flag any imports WITHOUT `/client` suffix
3. Check for Node.js-only packages (bcryptjs, jsonwebtoken, winston)

**Interactive Analysis**:

**Question 1**: "Is this a client test or integration test?"
- Client test (.spec.tsx/.spec.ts) → Use /client imports
- Integration test (.integration.spec.ts) → Use default imports

**Question 2**: "Which imports need fixing?"
- Show list of violations
- Offer auto-fix mapping:
  ```
  @your-org/auth-lib → @your-org/auth-lib/client
  @your-org/logging-lib → @your-org/logging-lib/client
  @your-org/shared-utils/server → Remove or use /client
  ```

**Fix Options**:
1. **Auto-fix all imports** (recommended for client tests)
2. **Review each import** (for integration tests)
3. **Move to integration test** (if really needs server code)

**Verification**:
```bash
# After fix - check imports resolve
npx nx test {app-name} --testNamePattern="[test name]" --no-coverage
```

### Workflow E: Component Rendering Debugging

**When**: "Invariant Violation" or "Unable to find element"

**Automated Checks**:
1. Does component exist at import path?
2. Are all required props provided in test?
3. Is component being mocked? Check for mock declarations

**Interactive Analysis**:

**Question 1**: "What element are you trying to render or find?"
- User describes component/element

**Question 2**: "Which issue matches?"
- Issue A: "Component mock not complete" → Add all exports
- Issue B: "Missing required props" → Add props
- Issue C: "Wrong component imported" → Verify import path
- Issue D: "Element not in DOM yet" → Add waitFor
- Issue E: "Theme provider required" → Wrap in provider

**Fix Options**:
1. **Update test** (add props, wait for element)
2. **Update component mock** (return correct structure)
3. **Debug component** (render and inspect tree)

**Verification**:
```bash
# After fix
npx nx test {app-name} --testNamePattern="[test name]" --no-coverage
# Or with debug output
console.log(debug()); // Print component tree
```

### Workflow F: Async Timing Debugging

**When**: "Timeout" or "Unable to find element" (flaky)

**Automated Checks**:
1. Are there await/waitFor calls in test?
2. Is timeout sufficient (>= 1000ms)?
3. Is async operation triggering state update?

**Interactive Analysis**:

**Question 1**: "What's the exact timeout value and operation?"
- User provides timeout context

**Question 2**: "Which pattern matches?"
- Pattern A: "Missing await waitFor()" → Wrap expectation in waitFor
- Pattern B: "Timeout too short" → Increase timeout
- Pattern C: "Async op not triggering update" → Verify mock returns promise
- Pattern D: "Race condition" → Add proper cleanup

**Fix Options**:
1. **Add waitFor** (if missing)
2. **Increase timeout** (if too short)
3. **Fix async mock** (if not returning promise)
4. **Add cleanup** (if race condition)

**Verification**:
```bash
# After fix - run multiple times
npx nx test {app-name} --testNamePattern="[test name]" --no-coverage
npx nx test {app-name} --testNamePattern="[test name]" --no-coverage
# Should not be flaky
```

---

## Phase 4: Code vs Test Validation

This is the critical skill feature - determining whether code or test is incorrect.

### Decision Matrix

| Error Type | Symptom | Most Likely | Validation Method |
|-----------|---------|------------|-------------------|
| Assertion fails | "Expected X but got Y" | Code wrong (80%) | Check implementation logic |
| Mock not called | "Expected to have been called 1 time but 0" | Test setup (70%) | Verify mock configuration |
| Missing property | "Cannot read property X of undefined" | Mock incomplete (75%) | Check mock structure |
| Timeout | "Async callback not invoked" | Unclear (50/50) | Check both code and test |
| Type mismatch | "X is not a function" | Mock wrong type (80%) | Verify mock return type |
| Element not found | "Unable to find element" | Test setup (65%) | Check waitFor/queries |

### Validation Steps

**Step 1**: Classify the error using the matrix above

**Step 2**: Ask clarifying questions
```
Q1: "Is this a NEW test or EXISTING code?"
    - New test → Suspect test (even if code looks right)
    - Existing code → Could be either

Q2: "When was this last working?"
    - Recently → Likely recent code change caused it
    - Unknown → Harder to determine

Q3: "Do similar tests pass?"
    - Yes → This test may be wrong
    - No → Code may be wrong
```

**Step 3**: Suggest validation approach
```
FOR CODE VALIDATION:
- Check implementation logic matches test expectations
- Add console.log() to verify runtime behavior
- Compare to similar working code

FOR TEST VALIDATION:
- Check mock declarations and return values
- Verify async/await patterns
- Compare to passing tests in same file
```

**Step 4**: Interactive decision
```
"Based on analysis:
 - 70% confidence: Test is wrong (mock incomplete)
 - 25% confidence: Code is wrong (logic error)
 - 5% confidence: Both have issues

Which would you like to investigate first?"
```

### Automated Code vs Test Analysis

When user provides code snippet, skill will:

1. **Syntax check**: Verify code is valid TypeScript
2. **Type check**: Verify types match expectations
3. **Logic check**: Trace through code path
4. **Dependency check**: Verify mocks match dependencies
5. **Test pattern check**: Compare to known patterns

---

## Phase 5: Verification & Next Steps

### Post-Fix Verification

After applying a fix:

1. **Re-run the test/Metro**
   ```bash
   npx nx test {app-name} --testNamePattern="[test name]" --no-coverage
   ```

2. **Confirm success**
   - ✅ Test passes → Proceed to next steps
   - ❌ Still failing → Analyze remaining error
   - ⚠️ Different error → Classify new error and restart

3. **Check for side effects**
   ```bash
   # Run related tests
   npx nx test {app-name} --testNamePattern="[related tests]" --no-coverage
   ```

### Suggested Next Steps

After successful fix:

1. **Related Issues**
   - Are there similar issues in other tests?
   - Should the fix be applied globally?

2. **Coverage**
   - Has code coverage changed?
   - Should additional tests be added?

3. **Documentation**
   - Should this pattern be documented?
   - Is test-setup.ts up to date?

4. **Prevention**
   - Could ESLint catch this issue?
   - Should there be a lint rule?

---

## Integration with NestJS Debug Skill

This skill complements the existing `nestjs-debug` skill:

| Aspect | React Native Debug | NestJS Debug |
|--------|-------------------|--------------|
| Environment | React Native preset | Node.js environment |
| Module System | Metro bundler | TypeScript compilation |
| Key Issues | Mocks, Metro cache, platform separation | Dependency injection, modules |
| Test Patterns | Component/service mocks | Module mocks |
| Runtime | Device/emulator crashes | Server errors |

Both skills share:
- Code vs test validation approach
- Interactive fix selection
- Automated verification
- Reference documentation

---

## Key Resources

See accompanying documentation files:

1. **references/code-vs-test-validation.md** - Shared framework for determining if code or test is wrong
2. **react-native-test-patterns.md** - React Native-specific test failure patterns
3. **error-patterns.md** - Comprehensive error message reference
4. **debugging-workflows.md** - Step-by-step guides for each workflow
5. **mock-patterns.md** - Correct mock configurations and examples

---

## Summary

This skill provides a structured, interactive approach to debugging React Native apps:

1. **Error Classification** - Identify which debugging path to take
2. **Automated Checks** - Run diagnostics before manual debugging
3. **Interactive Workflows** - Present options and let user choose
4. **Code vs Test Validation** - Intelligently determine root cause
5. **Verification** - Confirm fix worked and suggest next steps

The goal is to make debugging more efficient and educational, helping you understand not just the fix, but why the error occurred.
