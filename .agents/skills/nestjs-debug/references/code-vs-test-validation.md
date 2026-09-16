<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/code-vs-test-validation.md. Regenerate via `npm run bundle`. -->
# Code vs Test Validation Framework

A comprehensive guide for determining whether a test failure indicates a code problem or an outdated/incorrect test.

## Overview

When a test fails, it could be because:

1. **Code is Wrong** (65% of cases) - Implementation doesn't match requirements
2. **Test is Wrong** (30% of cases) - Test expectations are outdated or test setup is flawed
3. **Both are Wrong** (5% of cases) - Both code and test have issues

This framework helps you gather evidence and determine which case applies.

---

## Phase 1: Evidence Gathering

Before deciding what's wrong, collect information about both the test and the code.

### Information to Gather

**About the Test:**
```bash
# When was the test last modified?
git log --oneline -1 [test-file-path]

# What do similar passing tests look like?
grep -A 5 "it('should" [test-file-path] | grep -E "describe|it|expect"

# Is the test recently written or established?
git log --all --pretty=format:"%h %s" -- [test-file-path] | head -10
```

**About the Code:**
```bash
# When was the implementation last modified?
git log --oneline -1 [code-file-path]

# Have there been recent changes to the tested function?
git log --oneline -5 [code-file-path]

# Does the code have obvious logic errors?
# (Read through implementation carefully)
```

**About Test Infrastructure:**
```bash
# Are mocks complete and correct?
grep -A 10 "jest.mock\|beforeEach" [test-file-path]

# Are fixtures/test data valid?
grep -A 5 "const.*=" [test-file-path] | grep -E "mock|fixture|data"

# Is the test setup properly isolated?
grep -E "beforeEach|afterEach" [test-file-path]
```

### Key Questions to Ask

1. **Test Age**
   - ✅ Recently written (< 1 week)? → Test more likely correct
   - ✅ Established for months? → Code change might have broken it

2. **Code Changes**
   - ✅ Recent commits to this function? → Code change might be wrong
   - ✅ No changes in months? → Test might be outdated

3. **Test Coverage**
   - ✅ Does similar test pass? → This test might be wrong
   - ✅ Do most tests fail? → Code likely has systemic issue

4. **Logic Sense**
   - ✅ Does code make logical sense? → Likely correct
   - ✅ Does test expectation make sense? → Likely correct

5. **Mock Completeness**
   - ✅ Are all mocked dependencies provided? → Test setup likely OK
   - ✅ Do mocks match actual behavior? → Test expectations likely OK

---

## Phase 2: Error Pattern Analysis

Different types of test failures suggest different root causes.

### Pattern 1: Assertion Fails - "Expected X but Received Y"

```
Test Output:
expect(result).toBe('user-123')
Expected: 'user-123'
Received: 'undefined'
```

**Evidence to Gather:**

| Check | If True | Likelihood |
|-------|---------|-----------|
| Does the code assign/return a value? | Yes | Test more likely wrong |
| | No | Code more likely wrong |
| Is mock returning expected value? | Yes | Code more likely wrong |
| | No | Test setup more likely wrong |
| Does similar test pass with same code? | Yes | Test wrong, code OK |
| | No | Code wrong, test OK |
| Was code recently changed? | Yes | Code change wrong |
| | No | Test might be outdated |

**Analysis Method:**

```typescript
// Step 1: Check what code actually returns
// Look at the function implementation
function getUserId(userId: string): string {
  // TRACE through code to see what it returns
  if (!userId) return null;  // ← Returns null, not undefined!
  return formatUserId(userId);
}

// Step 2: Check what test expects
expect(result).toBe('user-123');  // ← Expects specific format

// Step 3: Determine who's wrong
// If code returns null, test expectations are impossible
// If code returns value but test expects different format, code is wrong

// Step 4: Trace the evidence
const result = getUserId(null);   // ← Code returns null
expect(result).toBe('user-123');  // ← Test expects formatted string
// VERDICT: Code is wrong (should not return null)
// OR: Test is wrong (shouldn't expect format for invalid input)
```

**Decision Tree:**

```
Does code execute without throwing?
├─ YES → Check return value
│   ├─ Returns undefined? → Code wrong (forgot return statement)
│   ├─ Returns null? → Code wrong (returns falsy value)
│   ├─ Returns different value? → Code wrong (wrong logic)
│   └─ Returns expected value? → Test wrong (mock incomplete)
└─ NO → Exception thrown
    ├─ Expected exception? → Test should catch it
    └─ Unexpected exception? → Code wrong
```

### Pattern 2: Mock Function Not Called

```
Test Output:
Expected mock function to have been called 1 time, but it was called 0 times
```

**Evidence to Gather:**

| Check | If True | Likelihood |
|-------|---------|-----------|
| Is mock declared before import? | No | Test setup wrong |
| | Yes | Continue investigating |
| Are all functions exported from mock? | No | Test setup wrong |
| | Yes | Continue investigating |
| Does code path actually reach mock call? | No | Code logic wrong |
| | Yes | Mock not working |
| Is mock returning expected type? | No | Code path skipped mock |
| | Yes | Mock declaration wrong |

**Analysis Method:**

```typescript
// Step 1: Verify mock declaration
// ❌ WRONG - Declared after import
import { myService } from './service';
jest.mock('./service');

// ✅ CORRECT - Declared before import
jest.mock('./service');
import { myService } from './service';

// Step 2: Verify mock is complete
jest.mock('./service', () => ({
  calledFunction: jest.fn()  // ✅ Has the function
}));

// Step 3: Verify code path reaches mock
function callService() {
  if (someCondition) {
    return;  // ← If condition false, never calls service!
  }
  myService.calledFunction();  // ← Mock call is here
}

// Step 4: Determine issue
// Issue: Test doesn't set up condition correctly
// OR: Code has logic error that skips the call
```

**Decision Tree:**

```
Is mock declared BEFORE import?
├─ NO → Fix: Move jest.mock() to top
└─ YES → Does mock export the called function?
    ├─ NO → Fix: Add function to mock
    └─ YES → Does code path reach the call?
        ├─ NO (code skips it) → Code wrong (logic error)
        └─ YES → Does mock return expected type?
            ├─ NO → Test wrong (mock incomplete)
            └─ YES → Mock not connected properly
```

### Pattern 3: Timeout

```
Test Output:
Error: Timeout - Async callback was not invoked within the 5000 ms timeout
```

**Evidence to Gather:**

| Check | If True | Likelihood |
|-------|---------|-----------|
| Is there an await in the test? | No | Test wrong |
| | Yes | Continue investigating |
| Does mocked async fn return Promise? | No | Test wrong |
| | Yes | Continue investigating |
| Does code actually await the call? | No | Code wrong |
| | Yes | Continue investigating |
| Is there an infinite loop? | Yes | Code wrong |
| | No | Timeout threshold too short |

**Analysis Method:**

```typescript
// Step 1: Check test for await
it('should handle async', async () => {
  // ❌ WRONG - No await
  myAsyncFunction();
  expect(result).toBe(expected);  // Runs before promise resolves!

  // ✅ CORRECT - With await
  await myAsyncFunction();
  expect(result).toBe(expected);

  // ✅ Also correct - With waitFor
  await waitFor(() => {
    expect(result).toBe(expected);
  });
});

// Step 2: Check mock returns Promise
jest.mock('service', () => ({
  // ❌ WRONG - Returns value, not Promise
  asyncFn: jest.fn(() => ({ data: 'value' }))

  // ✅ CORRECT - Returns Promise
  asyncFn: jest.fn(() => Promise.resolve({ data: 'value' }))
}));

// Step 3: Check code awaits the call
async function getData() {
  // ❌ WRONG - Not awaited
  const result = this.service.asyncFn();
  return result;  // Returns Promise, not data

  // ✅ CORRECT - Awaited
  const result = await this.service.asyncFn();
  return result;
}

// Step 4: Determine issue
// Most common: Test missing await
// Second: Mock not returning Promise
// Third: Code not awaiting
```

**Decision Tree:**

```
Does test have await or waitFor?
├─ NO → Fix: Add await/waitFor
└─ YES → Does mocked async function return Promise?
    ├─ NO → Fix: Update mock to return Promise
    └─ YES → Does code await the call?
        ├─ NO → Code wrong
        └─ YES → Is there infinite loop?
            ├─ YES → Code wrong
            └─ NO → Increase timeout (code is slow)
```

### Pattern 4: Cannot Read Property (Incomplete Mock)

```
Test Output:
TypeError: Cannot read property 'getUserId' of undefined
```

**Evidence to Gather:**

| Check | If True | Likelihood |
|-------|---------|-----------|
| Is the function in the mock? | No | Test setup wrong |
| | Yes | Mock import wrong |
| Does mock return object/component? | No | Test setup wrong |
| | Yes | Code wrong |
| Is mock declared before use? | No | Test setup wrong |
| | Yes | Look elsewhere |

**Analysis Method:**

```typescript
// Step 1: Check if function exists in mock
jest.mock('service', () => ({
  UserService: {
    // ❌ WRONG - Missing getUserId
    getUsers: jest.fn()
  }

  // ✅ CORRECT - Includes all used methods
  UserService: {
    getUsers: jest.fn(),
    getUserId: jest.fn(),
    updateUser: jest.fn()
  }
}));

// Step 2: Check what test is accessing
const { UserService } = require('service');
const id = UserService.getUserId('123');  // ← Looking for this

// Step 3: Check code behavior
class ServiceUser {
  getUserId(userId: string) {
    return `user-${userId}`;  // ← Real code does this
  }
}

// Step 4: Determine issue
// Issue: Mock is incomplete (missing getUserId)
// Fix: Add all methods to mock
```

**Decision Tree:**

```
Does the property exist in mock?
├─ NO → Fix: Add property to mock
└─ YES → Is mock returning correct type?
    ├─ NO (undefined) → Mock factory wrong
    └─ YES → Check code path
        ├─ Accesses property on undefined → Code logic wrong
        └─ Property exists → Something else undefined
```

### Pattern 5: Unexpected Exception

```
Test Output:
Error: Unexpected exception thrown
```

**Evidence to Gather:**

| Check | If True | Likelihood |
|-------|---------|-----------|
| Is exception type expected? | Yes | Test should handle it |
| | No | Code wrong |
| Was exception thrown in code? | Yes | Code likely wrong |
| | No | Test setup wrong |
| Did recent code change throw this? | Yes | New code wrong |
| | No | Old code bug exposed by test |

**Analysis Method:**

```typescript
// Step 1: Check if test expects this exception
it('should handle invalid input', () => {
  // ❌ WRONG - Not expecting thrown exception
  const result = myFunction(invalid);
  expect(result).toBe(null);

  // ✅ CORRECT - Catching expected exception
  expect(() => myFunction(invalid)).toThrow(ValidationError);
});

// Step 2: Check if code throws intentionally
function myFunction(input: string): string {
  if (!input) {
    throw new ValidationError('Input required');  // Intentional
  }
  return process(input);
}

// Step 3: Trace recent changes
git log --oneline [code-file] | head -5
// If recent change added throw statement, code change wrong

// Step 4: Determine issue
// If code intentionally throws and test doesn't expect it → Test wrong
// If code recently started throwing → Code change wrong
// If code throws unexpectedly → Code bug
```

**Decision Tree:**

```
Is the exception intentional/expected?
├─ YES → Test should expect it (try/catch or toThrow)
│   ├─ Test expects it? → Test correct
│   └─ Test doesn't expect it? → Test wrong
└─ NO → Is it a bug in code?
    ├─ YES → Code wrong
    └─ NO → Check setup (mocks, fixtures)
```

### Pattern 6: Test Passes Alone but Fails in Suite

```
Test Output:
✓ Test passes when run alone with --testNamePattern
✗ Test fails when run with other tests
```

**This indicates a test isolation issue (usually test's problem):**

| Check | If True | Likelihood |
|-------|---------|-----------|
| beforeEach not resetting mocks? | True | Test wrong |
| Global state leaking? | True | Test wrong |
| Both tests modify same object? | True | Test wrong |
| Code has race condition? | True | Code wrong |

**Analysis Method:**

```typescript
// ❌ WRONG - No cleanup between tests
jest.mock('service');

it('test 1', () => {
  const mockFn = require('service').myFn;
  mockFn.mockReturnValue('value1');
  // State leaks to next test!
});

it('test 2', () => {
  const mockFn = require('service').myFn;
  // mockFn still returns 'value1' from previous test!
  expect(mockFn()).toBe('value2');  // Fails!
});

// ✅ CORRECT - With cleanup
jest.mock('service');

describe('Service tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();  // Reset state
  });

  it('test 1', () => {
    const mockFn = require('service').myFn;
    mockFn.mockReturnValue('value1');
  });

  it('test 2', () => {
    const mockFn = require('service').myFn;
    mockFn.mockReturnValue('value2');  // Fresh state
    expect(mockFn()).toBe('value2');   // Passes!
  });
});
```

**Decision Tree:**

```
Does test pass when run alone?
├─ YES, FAILS IN SUITE → Test isolation issue
│   ├─ Missing beforeEach/afterEach? → Fix test
│   ├─ Not clearing mocks? → Fix test
│   └─ Modifying global state? → Fix test
└─ NO, FAILS ALWAYS → Not isolation issue
    ├─ Check previous patterns above
```

---

## Phase 3: Confidence Scoring

Assess how confident you are that code or test is the problem.

### Scoring Methodology

Assign points to evidence:

| Evidence | Suggests Code Wrong | Suggests Test Wrong |
|----------|-------------------|-------------------|
| Code has obvious logic error | +10 | 0 |
| Test has obvious setup error | 0 | +10 |
| Code recently changed | +5 | 0 |
| Test recently changed | 0 | +5 |
| Similar test passes with same code | 0 | +10 |
| All tests fail for this code | +8 | 0 |
| Only this test fails | 0 | +8 |
| Code returns obviously wrong value | +7 | 0 |
| Test expectation seems unrealistic | 0 | +7 |
| Mock incomplete/invalid | 0 | +9 |
| Code path never reaches assertion | +6 | 0 |

**Example Scoring:**

```
Scenario: Test fails with "Expected 'active' but got 'inactive'"

Evidence gathered:
- Code recently changed status logic (+5 code wrong)
- Other tests still pass (+8 code specific)
- Test not modified in 3 months (0)
- Mock returns correct type (+0)
- Code logic review shows incomplete condition check (+7 code wrong)

Total: 20 points → Code Wrong
Confidence: HIGH (Code wrong is likely)

---

Scenario: Mock function not called

Evidence gathered:
- jest.mock() declared in wrong location (0, already caught)
- Mock doesn't export the function (0, already caught)
- Code path should reach it (0)
- Test passes alone, fails in suite (+8 test wrong)
- No beforeEach clearing mocks (+9 test wrong)
- Same code, other tests pass (+8 test wrong)

Total: 25 points → Test Wrong
Confidence: HIGH (Test is definitely wrong)
```

### Confidence Levels

| Threshold | Interpretation |
|-----------|-----------------|
| 15+ points one direction | Very High Confidence |
| 10-14 points one direction | High Confidence |
| 5-9 points one direction | Medium Confidence |
| Within 5 points | Low Confidence (Both could be wrong) |

---

## Phase 4: Root Cause Determination

Once you have evidence and confidence scoring, determine the most likely root cause.

### Decision Framework

```
HIGH CONFIDENCE → Code Wrong?
├─ YES → Code has implementation issue
│   └─ Fix the code
├─ NO, Test Wrong? → Test has setup/expectation issue
│   └─ Update the test
└─ NEITHER (Both) → Both need fixing
    ├─ Fix code first (more fundamental)
    └─ Update test after code fix

MEDIUM CONFIDENCE → Need more investigation
├─ Review code logic step-by-step
├─ Check test assumptions
├─ Run code in isolation
└─ Then decide

LOW CONFIDENCE → Could be either
├─ Ask these clarifying questions:
│   ├─ "Is this a new feature?" → Test more likely correct
│   ├─ "Was code recently changed?" → Code change likely wrong
│   ├─ "Is test well-established?" → Code likely wrong
│   └─ "Do other similar tests pass?" → This test likely wrong
├─ Make educated guess based on patterns
└─ Fix the most likely, re-run to validate
```

---

## Phase 5: Resolution Strategies

How to fix each type of problem.

### When Code is Wrong

**Strategy: Fix the implementation**

```typescript
// Example: Code returns wrong value
// BEFORE (Test fails with "Expected 'ACTIVE' but got 'PENDING'")
export class StatusService {
  getUserStatus(userId: string): string {
    return 'PENDING';  // ← Always returns same value!
  }
}

// AFTER (Test passes)
export class StatusService {
  constructor(private db: DatabaseService) {}

  async getUserStatus(userId: string): string {
    const user = await this.db.getUser(userId);
    return user.status;  // ← Returns actual user status
  }
}
```

**Process:**
1. Understand what test expects
2. Trace code to see where it diverges
3. Fix code logic
4. Re-run test to validate
5. Check for side effects (other tests still pass)

### When Test is Wrong

**Strategy 1: Update test expectations**

```typescript
// Example: Test expects outdated format
// BEFORE (Test fails)
it('should return formatted user id', () => {
  const userId = service.getUserId('123');
  expect(userId).toBe('user-123');  // ← Outdated format
});

// AFTER (Code hasn't changed, test updated)
it('should return user id', () => {
  const userId = service.getUserId('123');
  expect(userId).toBe('123');  // ← Correct current format
});
```

**Process:**
1. Verify code behavior is correct
2. Check if test expectation is outdated
3. Update test to match current code
4. Re-run test to validate
5. Verify this matches actual requirements

**Strategy 2: Fix test setup**

```typescript
// Example: Mock incomplete
// BEFORE (Test fails with "Cannot read property 'getUser' of undefined")
jest.mock('service', () => ({
  UserService: {
    getById: jest.fn()
    // Missing getUser!
  }
}));

// AFTER (Mock complete)
jest.mock('service', () => ({
  UserService: {
    getById: jest.fn(),
    getUser: jest.fn()  // ← Added
  }
}));
```

**Process:**
1. Identify what's missing/wrong in test setup
2. Fix mock declarations, fixtures, or stubs
3. Ensure mocks match actual module exports
4. Re-run test to validate
5. Check that mock behavior matches real behavior

### When Both are Wrong

**Strategy: Fix code first, then test**

```typescript
// Step 1: Fix code (it has the bug)
// Code was: return 'PENDING' always
// Fix to: return user.status

// Step 2: Update test (expectations were unrealistic)
// Test was: expect('user-123') format
// Fix to: expect('123') format

// Step 3: Re-run both changes together
// Test now passes with corrected code and expectations
```

**Process:**
1. Identify code issue
2. Identify test expectation issue
3. Fix code first (more fundamental fix)
4. Update test to match fixed code
5. Re-run to validate both fixes work together
6. Verify against original requirements

---

## Real-World Examples from Codebase

### Example 1: Outdated Test (Test Wrong)

**Scenario**: Auth service test fails after refactoring token structure

```typescript
// Test (src/auth/auth.service.spec.ts) - OUTDATED
it('should decode JWT token', () => {
  const token = 'valid-jwt';
  const decoded = service.decodeToken(token);
  expect(decoded.userId).toBeDefined();
  expect(decoded.handle).toBeDefined();
  expect(decoded.exp).toBeDefined();
});

// Code (src/auth/auth.service.ts) - CORRECT
decodeToken(token: string): JWTPayload {
  const decoded = jwt.decode(token);
  return {
    id: decoded.sub,  // ← Changed from 'userId' to 'id'
    handle: decoded.handle,
    exp: decoded.exp
  };
}

// VERDICT: Test wrong - test expects old field names
// FIX: Update test to expect 'id' instead of 'userId'
```

**Evidence:**
- ✅ Code explicitly changed field names (+5)
- ✅ Code change is recent (+5)
- ✅ Field names in code make sense (+3)
- ✅ Test uses outdated field names (0 points)
- **Total: 13 → Code change is right, test is outdated**

### Example 2: Code Bug (Code Wrong)

**Scenario**: User service test fails after recent change

```typescript
// Test (src/users/user.service.spec.ts) - CORRECT
it('should get user by ID', async () => {
  const user = await service.getUserById('123');
  expect(user.id).toBe('123');
  expect(user.name).toBeDefined();
});

// Code (src/users/user.service.ts) - BUG INTRODUCED
async getUserById(userId: string): Promise<User> {
  // ❌ BUG: Copy-paste error from another method
  return await this.db.getAllUsers();  // Returns all instead of one!
}

// VERDICT: Code wrong - introduced bug in recent change
// FIX: Change getAllUsers() to getUserById(userId)
```

**Evidence:**
- ✅ Code recently changed (+5)
- ✅ Method should return one user, code returns all (+7)
- ✅ Test expectation is reasonable (+3)
- ✅ Other tests still pass (+8)
- **Total: 23 → Code bug is likely**

### Example 3: Test Isolation Issue (Test Wrong)

**Scenario**: Test passes alone but fails in suite

```typescript
// Test (src/cache/cache.service.spec.ts) - ISOLATION ISSUE
describe('CacheService', () => {
  // ❌ No beforeEach/afterEach

  it('should set cache value', () => {
    const cache = require('cache');
    cache.mockSet('key1', 'value1');
  });

  it('should get cache value', () => {
    const cache = require('cache');
    const value = cache.mockGet('key1');
    expect(value).toBe('value2');  // Expected different value
  });
  // ❌ Gets 'value1' from previous test!
});

// Code (src/cache/cache.service.ts) - CORRECT
export class CacheService {
  private cache = new Map();
  setValue(key: string, value: string) {
    this.cache.set(key, value);
  }
  getValue(key: string) {
    return this.cache.get(key);
  }
}

// VERDICT: Test wrong - no isolation between tests
// FIX: Add beforeEach(() => jest.clearAllMocks())
```

**Evidence:**
- ✅ Test passes alone (+10)
- ✅ Fails in suite (+10)
- ✅ No beforeEach/afterEach (+9)
- ✅ Code doesn't have race condition (0)
- **Total: 29 → Test isolation issue (test wrong)**

---

## Validation Checklist

After you decide what's wrong and apply a fix:

### If You Fixed Code

- [ ] Test now passes
- [ ] Code change is logically correct
- [ ] Other related tests still pass
- [ ] No new compilation errors
- [ ] Code follows existing patterns

### If You Fixed Test

- [ ] Test now passes
- [ ] Test expectations match actual code behavior
- [ ] Code change isn't required
- [ ] Similar tests follow same pattern
- [ ] Test setup is complete and correct

### If You Fixed Both

- [ ] All tests pass
- [ ] Code change makes logical sense
- [ ] Test expectations match requirements
- [ ] No new errors introduced
- [ ] Original requirements are met

---

## Quick Reference: Error to Root Cause

| Error Pattern | Most Likely | Confidence |
|--------------|------------|-----------|
| "Expected X but got Y" | Code wrong | High |
| "Mock not called" | Test setup wrong | High |
| "Timeout" | Test missing await | Very High |
| "Cannot read property" | Test mock incomplete | Very High |
| "Unexpected exception" | Depends on exception type | Medium |
| "Passes alone, fails in suite" | Test isolation wrong | Very High |
| "Type mismatch" | Could be either | Medium |
| "Connection refused" | Test setup (mock) wrong | High |

---

## Summary: Decision Framework

```
1. GATHER EVIDENCE
   ├─ When was test last changed?
   ├─ When was code last changed?
   ├─ Do similar tests pass?
   └─ Does code logic make sense?

2. ANALYZE PATTERN
   ├─ Classify the error type
   ├─ Check decision tree for that pattern
   └─ Identify most likely cause

3. SCORE CONFIDENCE
   ├─ Assign evidence points
   ├─ Total points → confidence level
   └─ Adjust for ambiguity

4. DETERMINE ROOT CAUSE
   ├─ Code wrong → Fix implementation
   ├─ Test wrong → Update test
   └─ Both wrong → Fix code first, then test

5. VALIDATE FIX
   ├─ Re-run test
   ├─ Check related tests
   └─ Verify against requirements
```

Most failures are:
- **65%** code wrong (implement the fix)
- **30%** test wrong (update the expectations)
- **5%** both wrong (fix code, then test)

The framework above helps you identify which case you have.
