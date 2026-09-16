---
name: testing-setup-shared
description: Guide developers through common testing infrastructure setup for a workspace/monorepo, including dual testing strategy, test co-location, mocking strategies for subpath exports, platform separation validation, and troubleshooting common test failures
---

# Testing Setup - Shared Infrastructure

## When to Use This Skill

Invoke this skill when you need to:
- Understand the dual testing strategy (integration vs client)
- Set up proper test co-location
- Determine mocking strategy (hoisted vs runtime)
- Handle subpath export mocking (`/client`, `/server`)
- Validate platform separation (server-only vs client-only operations)
- Configure test execution and coverage
- Troubleshoot common test failures

**For platform-specific testing**:
- React Native components/screens → Use `testing-setup-react-native` skill
- NestJS services/controllers → Use `testing-setup-nestjs` skill

## Overview

This workspace uses a **dual testing strategy** with strict platform separation:

- **Integration Tests** (Node.js): Server-side operations, crypto, JWT, database
- **Client Tests** (React Native): UI components, device operations, client-side logic

This skill guides you through the common testing infrastructure that applies to both strategies.

---

## Step 1: Identify Source File and Test Type

### 1.1 Locate the Source File

Ask the user:
- "Which file needs testing?" (get the full path)
- Read the source file to understand its purpose

### 1.2 Determine Test Type

**Decision Logic**:

```
Does the file contain server-only operations?
├─ YES → Integration Test (*.integration.spec.ts)
│   Server-only operations:
│   - Password hashing (bcrypt)
│   - JWT signing/verification
│   - AES encryption/decryption
│   - File system operations
│   - Environment variable access
│   - Prisma database operations
│   - Redis operations
│
└─ NO → Client Test (*.spec.ts)
    Client operations:
    - UI components (React Native)
    - Token parsing (no verification)
    - Device detection
    - Platform utilities
    - Mock data operations
```

**Critical Rule**: If the file imports from `/server` subpaths, it MUST be an integration test.

---

## Step 2: Enforce Test Co-Location

### 2.1 Co-Location Requirements (MANDATORY)

**✅ CORRECT Pattern**:
```
libs/example-lib/src/lib/
├── user-service.ts
├── user-service.spec.ts        # ✅ Co-located with source
├── payment-handler.ts
└── payment-handler.spec.ts     # ✅ Co-located with source
```

**❌ FORBIDDEN Pattern**:
```
libs/example-lib/src/
├── lib/
│   ├── user-service.ts
│   └── payment-handler.ts
└── __tests__/                  # ❌ Separate test directory FORBIDDEN
    ├── user-service.spec.ts
    └── payment-handler.spec.ts
```

### 2.2 Test File Naming

**Integration Tests**: `<source-file-name>.integration.spec.ts`
- Example: `auth.service.ts` → `auth.service.integration.spec.ts`
- Runs in Node.js environment
- Has access to server-side modules

**Client Tests**: `<source-file-name>.spec.ts`
- Example: `user-profile.tsx` → `user-profile.spec.ts`
- Runs in React Native environment
- Native modules are mocked

### 2.3 Create Test File

If the test file doesn't exist, create it in the same directory as the source file:

```bash
# Example for integration test
touch libs/auth-lib/src/lib/auth.service.integration.spec.ts

# Example for client test
touch libs/auth-lib/src/lib/token-parser.spec.ts
```

---

## Step 3: Determine Mocking Strategy

### 3.1 Mocking Strategy Decision Tree

**CRITICAL**: Understanding which mocking pattern to use is essential for reliable tests.

```
What are you mocking?
│
├─ Subpath export (/client or /server)?
│  └─ YES → Runtime Mocking (jest.spyOn) - ALWAYS REQUIRED
│
├─ Standalone exported function?
│  └─ YES → Hoisted Mocking (jest.mock) - REQUIRED (Jest limitation)
│
├─ Object method or getter property?
│  └─ YES → Runtime Mocking (jest.spyOn) - PREFERRED
│
└─ Third-party package?
   └─ YES → Hoisted Mocking (jest.mock) - STANDARD
```

### 3.2 Runtime Mocking (jest.spyOn) - Pattern A

**Use When**:
- ✅ Mocking subpath exports (`/client`, `/server`) - **ALWAYS REQUIRED**
- ✅ Mocking object methods (`logger.info`, `service.method`)
- ✅ Mocking getter properties
- ✅ Need to restore real implementation

**Pattern**:
```typescript
import * as loggingLib from '@your-org/logging-lib/client';

describe('MyService', () => {
  let loggerSpy: jest.SpyInstance;

  beforeAll(() => {
    // Create spy ONCE for entire test suite
    loggerSpy = jest.spyOn(loggingLib, 'logger', 'get').mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      audit: jest.fn()
    });
  });

  afterAll(() => {
    // Restore original implementation ONCE after all tests
    loggerSpy.mockRestore();
  });

  beforeEach(() => {
    // Clear call history before EACH test
    loggerSpy.mockClear();
  });

  it('should log user creation', () => {
    const service = new MyService();
    service.createUser({ handle: '@alice' });

    expect(loggingLib.logger.info).toHaveBeenCalledWith(
      'User created',
      expect.objectContaining({ handle: '@alice' })
    );
  });
});
```

**Why Runtime Mocking?**
- ✅ Better test isolation with lifecycle hooks
- ✅ Works with subpath exports (hoisted mocks fail)
- ✅ Can restore real implementation
- ✅ More reliable (no hoisting timing issues)

### 3.3 Hoisted Mocking (jest.mock) - Pattern B

**Use When**:
- ✅ Mocking standalone exported functions - **REQUIRED (Jest limitation)**
- ✅ Mocking third-party packages
- ✅ Simple module replacements

**Pattern**:
```typescript
// ✅ CORRECT: Hoisted mock for standalone functions
jest.mock('@your-org/shared-utils', () => ({
  formatCurrency: jest.fn((amount, currency) => `${currency} ${amount}`),
  calculateFee: jest.fn((amount) => amount * 0.01),
  validateHandle: jest.fn((handle) => true)
}));

describe('Payment Component', () => {
  it('should format currency correctly', () => {
    const { formatCurrency } = require('@your-org/shared-utils');
    const result = formatCurrency(100, 'USD');

    expect(result).toBe('USD 100');
    expect(formatCurrency).toHaveBeenCalledWith(100, 'USD');
  });
});
```

**Why Hoisted Mocking?**
- ✅ **Required** for standalone functions (cannot use jest.spyOn on functions)
- ✅ Standard approach for third-party packages
- ⚠️ **Fails** with subpath exports (use runtime mocking instead)

### 3.4 Common Mocking Anti-Patterns

**❌ WRONG: Trying to spy on standalone function**
```typescript
import * as utils from '@your-org/shared-utils';
const spy = jest.spyOn(utils, 'formatCurrency'); // ❌ Error: Cannot spy on function
```
**Why it fails**: Standalone functions are not object properties.
**✅ Solution**: Use hoisted mock (jest.mock).

---

**❌ WRONG: Hoisted mock for subpath export**
```typescript
jest.mock('@your-org/logging-lib/client', () => ({
  logger: { info: jest.fn() }
}));
```
**Why it fails**: Module resolution timing issue (jest.mock hoists before moduleNameMapper).
**✅ Solution**: Use runtime mocking (jest.spyOn).

---

**❌ WRONG: Creating spy in beforeEach**
```typescript
beforeEach(() => {
  const loggerSpy = jest.spyOn(loggingLib, 'logger', 'get'); // ❌ Redefines property
});
```
**Why it fails**: Each test tries to redefine the same property → "Cannot redefine property" error.
**✅ Solution**: Create spy in beforeAll, clear in beforeEach.

---

**❌ WRONG: Using mockRestore() in beforeEach**
```typescript
beforeEach(() => {
  loggerSpy.mockRestore(); // ❌ Removes spy entirely
  loggerSpy = jest.spyOn(...); // Has to recreate
});
```
**Why it's wrong**: mockRestore() removes the spy, requiring recreation.
**✅ Solution**: Use mockClear() in beforeEach (clears call history only), mockRestore() in afterAll.

---

## Step 4: Platform Separation Validation

### 4.1 Server-Only Operations (Never Client-Side)

**Critical Security Rule**: These operations MUST only exist in integration tests (Node.js):

- Password hashing (bcrypt)
- JWT signing/verification
- AES encryption/decryption
- File system operations
- Environment variable access (`process.env`)
- Direct database operations (Prisma)
- Redis operations

**Validation Check**:
```typescript
// ❌ NEVER in client tests (*.spec.ts)
import { hashPassword } from '@your-org/auth-lib'; // Server-only!

// ✅ CORRECT: Use /client subpath for client tests
import { decodeToken } from '@your-org/auth-lib/client'; // Safe for client
```

### 4.2 Client-Only Operations

**React Native Specific** (only in client tests):
- AsyncStorage operations
- Expo Router navigation
- Reanimated animations
- Device detection
- Platform utilities
- UI component rendering

**Validation Check**:
```typescript
// ❌ NEVER in integration tests (*.integration.spec.ts)
import { render } from '@testing-library/react-native'; // Client-only!

// ✅ CORRECT: Integration tests use Node.js operations
import { PrismaService } from '@nestjs/prisma'; // Server-only
```

---

## Step 5: Configure Jest Test Files

### 5.1 Verify Jest Configuration Exists

**For Libraries**: Each library should have TWO Jest configs:

**Client Tests**: `jest.config.ts`
```typescript
export default {
  displayName: 'example-lib',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': '@swc/jest'
  },
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: '../../test-output/jest/coverage/libs/example-lib',
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: ['.*\\.integration\\.spec\\.ts$'], // Exclude integration tests
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts']
};
```

**Integration Tests**: `jest.integration.config.ts`
```typescript
export default {
  displayName: 'example-lib-integration',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': '@swc/jest'
  },
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: '../../test-output/jest/coverage/libs/example-lib-integration',
  testMatch: ['**/*.integration.spec.ts'], // Only integration tests
  setupFilesAfterEnv: ['<rootDir>/src/integration-test-setup.ts']
};
```

### 5.2 Create Test Setup Files

**Client Test Setup**: `src/test-setup.ts`
```typescript
// Client test setup - React Native environment
// Mock native modules if needed
```

**Integration Test Setup**: `src/integration-test-setup.ts`
```typescript
// Integration test setup - Node.js environment
// Set server test mode flag
(global as any).__SERVER_TEST_MODE__ = true;
```

---

## Step 6: Write Test Structure

### 6.1 Basic Test Template

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

describe('ModuleName', () => {
  // === Setup ===
  beforeAll(() => {
    // One-time setup (create spies, open connections)
  });

  afterAll(() => {
    // One-time cleanup (restore spies, close connections)
  });

  beforeEach(() => {
    // Per-test setup (clear mocks, reset state)
  });

  // === Tests ===
  describe('functionName', () => {
    it('should handle successful case', () => {
      // Arrange
      const input = { /* test data */ };

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toEqual(expectedOutput);
    });

    it('should handle error case', () => {
      // Arrange
      const invalidInput = { /* bad data */ };

      // Act & Assert
      expect(() => functionName(invalidInput)).toThrow('Expected error');
    });
  });
});
```

### 6.2 AAA Pattern (Arrange-Act-Assert)

**Always structure tests with AAA**:

```typescript
it('should process payment correctly', () => {
  // Arrange - Set up test data and mocks
  const payment = { amount: 100, currency: 'USD', to: '@alice' };
  const mockProcessor = jest.fn().mockResolvedValue({ success: true });

  // Act - Execute the code under test
  const result = await processPayment(payment, mockProcessor);

  // Assert - Verify the results
  expect(result.success).toBe(true);
  expect(mockProcessor).toHaveBeenCalledWith(
    expect.objectContaining({ amount: 100, currency: 'USD' })
  );
});
```

---

## Step 7: Execute Tests and Verify

### 7.1 Test Execution Commands

**Run client tests**:
```bash
npx nx test <library-name> --no-cache
npx nx test <library-name> --coverage
npx nx test <library-name> --watch
```

**Run integration tests**:
```bash
npx nx test <library-name> --no-cache
# Uses jest.integration.config.ts automatically for *.integration.spec.ts files
```

**Run specific test file**:
```bash
npx nx test <library-name> --testFile=path/to/file.spec.ts
```

**Run all tests**:
```bash
npx nx run-many --target=test --all
```

### 7.2 Coverage Requirements

**Standard Coverage**: 80%+ (branches, functions, lines, statements)

**Financial Operations**: 95%+ coverage REQUIRED
- Payment processing
- Transaction handling
- Account operations
- Fee calculations

**Verify Coverage**:
```bash
npx nx test <library-name> --coverage

# Check coverage report
open test-output/jest/coverage/libs/<library-name>/index.html
```

### 7.3 Success Criteria

✅ All tests pass
✅ Coverage meets requirements (e.g. 80% baseline, higher for sensitive paths)
✅ No console warnings or errors
✅ Mocks are properly cleaned up (no leaks between tests)

---

## Step 8: Troubleshooting Common Issues

### 8.1 Module Resolution Errors

**Error**: `Cannot find module '@your-org/library-name/client'`

**Cause**: Subpath export not configured in moduleNameMapper

**Solution**:
1. Verify `jest.config.ts` has moduleNameMapper for subpath exports
2. Use runtime mocking (jest.spyOn) instead of hoisted mocking

---

### 8.2 "Cannot redefine property" Error

**Error**: `TypeError: Cannot redefine property: logger`

**Cause**: Creating spy in `beforeEach` instead of `beforeAll`

**Solution**:
```typescript
// ✅ CORRECT
let loggerSpy: jest.SpyInstance;

beforeAll(() => {
  loggerSpy = jest.spyOn(loggingLib, 'logger', 'get').mockReturnValue({...});
});

beforeEach(() => {
  loggerSpy.mockClear(); // Only clear call history
});
```

---

### 8.3 Hoisted Mock Variable Scope Error

**Error**: `ReferenceError: mockLogger is not defined`

**Cause**: Variable used in jest.mock() doesn't have "mock" prefix

**Solution**:
```typescript
// ❌ WRONG
const logger = { info: jest.fn() };
jest.mock('@your-org/logging-lib', () => ({ logger })); // Error!

// ✅ CORRECT (prefix with "mock")
const mockLogger = { info: jest.fn() };
jest.mock('@your-org/logging-lib', () => ({ logger: mockLogger }));
```

---

### 8.4 Platform Separation Violation

**Error**: ESLint error or runtime error for server-only imports in client code

**Cause**: Importing server-side modules in client tests

**Solution**:
```typescript
// ❌ WRONG (client test importing server code)
import { hashPassword } from '@your-org/auth-lib';

// ✅ CORRECT (use /client subpath)
import { decodeToken } from '@your-org/auth-lib/client';
```

---

### 8.5 Test Passes Locally but Fails in CI

**Possible Causes**:
1. **Cache issues**: Run `npx nx test <project> --no-cache`
2. **Environment variables**: Check if test depends on local .env
3. **Timing issues**: Add proper `waitFor` for async operations
4. **Mock cleanup**: Ensure `mockClear()` or `mockRestore()` in lifecycle hooks

**Reference**: See Task 10 documentation for common failure patterns

---

## Step 9: Anti-Pattern Checklist

Before completing, verify these anti-patterns are NOT present:

- [ ] ❌ Test files in separate `__tests__/` directory
- [ ] ❌ Hoisted mock for subpath export (`/client`, `/server`)
- [ ] ❌ Runtime mocking (jest.spyOn) for standalone function
- [ ] ❌ Creating spy in `beforeEach` instead of `beforeAll`
- [ ] ❌ Using `mockRestore()` in `beforeEach`
- [ ] ❌ Server-only imports in client tests
- [ ] ❌ Client-only imports in integration tests
- [ ] ❌ Using `any` type for sensitive data (money, identity, security)
- [ ] ❌ Hardcoded secrets or credentials
- [ ] ❌ Inconsistent enum casing (pick one — UPPERCASE or lowercase — and stick to it)
- [ ] ❌ Missing test coverage for sensitive operations (apply higher threshold)

---

## Quick Reference

### When to Use Each Mocking Pattern

| What to Mock | Pattern | Why |
|--------------|---------|-----|
| Subpath export (`/client`, `/server`) | Runtime (jest.spyOn) | **REQUIRED** (hoisting fails) |
| Standalone function | Hoisted (jest.mock) | **REQUIRED** (cannot spy on functions) |
| Object method | Runtime (jest.spyOn) | **PREFERRED** (better isolation) |
| Getter property | Runtime (jest.spyOn) | **REQUIRED** (cannot mock with jest.mock) |
| Third-party package | Hoisted (jest.mock) | **STANDARD** approach |

### Test Type Decision

| File Contains | Test Type | File Name |
|---------------|-----------|-----------|
| Server-only ops (crypto, JWT, Prisma) | Integration | `*.integration.spec.ts` |
| Client ops (UI, device, platform) | Client | `*.spec.ts` |
| Both (hybrid) | Split into two files | Both naming patterns |

---

## Related Skills

- **testing-setup-react-native**: React Native component/screen testing patterns
- **testing-setup-nestjs**: NestJS service/controller/E2E testing patterns

---

## References

- `docs/tasks/task.10.jest-test-infrastructure-fixes/` - Common failure patterns and fixes
