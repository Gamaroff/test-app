# Testing Framework Guide

**Version**: 5.0 (Dual Testing Strategy)
**Date**: October 2025
**Status**: Production Ready

## Overview

This guide covers the standardized testing framework for NestJS/React Native projects, specifically designed to meet coverage requirements for critical operations while ensuring reliable cross-platform testing.

**New in v5.0**: Dual testing strategy with separate Node.js integration tests and React Native client tests, enabling full server-side crypto operations (password hashing, JWT signing, AES encryption) in test environments.

## Architecture

### Dual Testing Strategy

This project uses a **dual testing strategy** to maintain platform separation and security boundaries:

#### 1. Integration Tests (Node.js Environment)

- **Purpose**: Test server-side functionality with full crypto capabilities
- **Environment**: Node.js with `testEnvironment: 'node'`
- **Crypto Support**: Password hashing (bcrypt), JWT signing, AES encryption
- **File Pattern**: `*.integration.spec.ts`
- **Command**: `npx nx test <library-name>`

#### 2. Client Tests (React Native Preset)

- **Purpose**: Test client-side UI and device-specific functionality
- **Environment**: React Native with mocked native modules
- **Crypto Support**: Token parsing/validation only (no crypto operations)
- **File Pattern**: `*.spec.ts` (excluding `*.integration.spec.ts`)
- **Command**: `npx nx run <library-name>:test:client`

### Testing Infrastructure Components

1. **Integration Test Setup** (`src/integration-test-setup.ts`)
   - Sets `__SERVER_TEST_MODE__=true` before any imports
   - Validates Node.js environment
   - Enables server-side crypto operations

2. **Dual Jest Configurations**
   - `jest.integration.config.ts` - Node.js environment with ts-jest
   - `jest.config.ts` - React Native preset with babel-jest

3. **Standardized Test Utilities** (`libs/shared-types/src/test-utils/`)
   - Type-safe test fixtures
   - Performance measurement utilities
   - Error handling test patterns

4. **React Native Test Setup** (`test-utils/react-native-test-setup.ts`)
   - Consistent mock configuration
   - Platform-specific test patterns
   - Financial operations testing utilities

5. **Financial Operations Framework** (`test-utils/financial-operations-testing.ts`)
   - 95% coverage enforcement
   - Comprehensive edge case testing
   - Performance and compliance validation

## Quick Start

### Integration Test Setup (Server-Side)

**File**: `src/lib/auth-service.integration.spec.ts`

```typescript
/**
 * Server-side integration tests for auth-service
 * These tests require Node.js environment with full crypto capabilities
 * Environment setup is handled by integration-test-setup.ts
 */

import {
  hashPassword,
  comparePassword,
  generateTokenPair,
} from "@your-org/auth-lib";

describe("Authentication Service Integration Tests", () => {
  it("should hash and verify passwords", async () => {
    const plainPassword = "SecureP@ssw0rd123!";

    // Password hashing works in Node.js environment
    const hashedPassword = await hashPassword(plainPassword);
    expect(hashedPassword).toBeDefined();
    expect(hashedPassword).not.toBe(plainPassword);

    // Password comparison works
    const isMatch = await comparePassword(plainPassword, hashedPassword);
    expect(isMatch).toBe(true);
  });

  it("should generate valid JWT tokens", () => {
    const tokens = generateTokenPair(
      {
        sub: "user-123",
        email: "test@example.com",
        handle: "testuser",
      },
      {
        jwtSecret: "test-secret",
        jwtExpiresIn: "15m",
        refreshSecret: "refresh-secret",
        refreshExpiresIn: "7d",
        saltRounds: 10,
      },
    );

    expect(tokens.access_token).toBeDefined();
    expect(tokens.refresh_token).toBeDefined();
  });
});
```

**Run with**: `npx nx test auth-lib`

### Client Test Setup (React Native)

**File**: `src/components/login-form.spec.tsx`

```typescript
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginForm } from './login-form';
import { decodeToken } from '@your-org/auth-lib/client'; // Client-only import

describe('LoginForm Component', () => {
  it('should render and handle login', async () => {
    const mockLogin = jest.fn();
    const { getByTestId } = render(<LoginForm onLogin={mockLogin} />);

    fireEvent.changeText(getByTestId('email-input'), 'test@example.com');
    fireEvent.changeText(getByTestId('password-input'), 'password123');
    fireEvent.press(getByTestId('login-button'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
    });
  });

  it('should decode JWT tokens client-side', () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
    const payload = decodeToken(token); // Only parsing, no verification
    expect(payload).toBeDefined();
  });
});
```

**Run with**: `npx nx run auth-lib:test:client`

### Financial Operations Testing

```typescript
import {
  runFinancialOperationTests,
  FinancialTestUtils,
} from "../../test-utils/financial-operations-testing";

// Automatically generates comprehensive test suite
runFinancialOperationTests("PaymentProcessor", myPaymentModule, 0.95);

// Manual testing with utilities
describe("Custom Financial Tests", () => {
  it("should handle precision correctly", () => {
    const amount = 123.456;
    FinancialTestUtils.assertFinancialPrecision(amount, 2);
    FinancialTestUtils.assertCurrencyFormat(amount, "USD");
  });
});
```

## Testing Patterns

### 1. Type-Safe Test Data

```typescript
import {
  createTestUserProfile,
  createCompleteTestUserProfile,
} from "@your-org/shared-types/test-utils";

// Minimal valid profile
const user = createTestUserProfile({
  email: "test@example.com",
  role: "user",
});

// Complete profile with all optional fields
const completeUser = createCompleteTestUserProfile({
  firstName: "John",
  lastName: "Doe",
  kycStatus: "APPROVED",
});
```

### 2. React Native Component Testing

```typescript
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ReactNativeTestUtils } from '../../../test-utils/react-native-test-setup';

describe('PaymentForm', () => {
  const mockPaymentProcessor = ReactNativeTestUtils.mockPaymentProcessor();
  const mockBiometricAuth = ReactNativeTestUtils.mockBiometricAuth();

  it('should process payment with biometric auth', async () => {
    const { getByTestId } = render(<PaymentForm />);

    fireEvent.press(getByTestId('pay-button'));

    await waitFor(() => {
      expect(mockBiometricAuth.authenticate).toHaveBeenCalled();
    });

    expect(mockPaymentProcessor.processPayment).toHaveBeenCalledWith({
      amount: 100,
      currency: 'USD'
    });
  });
});
```

### 3. Performance Testing

```typescript
import {
  measurePerformance,
  measureAsyncPerformance,
} from "@your-org/shared-types/test-utils";

describe("Performance Tests", () => {
  it("should process transactions within time limits", () => {
    const result = measurePerformance(() => {
      return processTransaction({ amount: 100 });
    }, 100); // 100ms max

    expect(result.success).toBe(true);
  });

  it("should handle async operations efficiently", async () => {
    const result = await measureAsyncPerformance(async () => {
      return await processPayment({ amount: 100 });
    }, 2000); // 2s max for financial operations

    expect(result.success).toBe(true);
  });
});
```

### 4. Error Handling Testing

```typescript
import {
  expectValidationError,
  expectAsyncValidationError,
} from "@your-org/shared-types/test-utils";

describe("Error Handling", () => {
  it("should validate inputs correctly", () => {
    expectValidationError(() => {
      validateAmount(-100);
    }, "Amount must be positive");
  });

  it("should handle async errors", async () => {
    await expectAsyncValidationError(async () => {
      await processPayment({ amount: 0 });
    }, "Minimum amount required");
  });
});
```

## Financial Operations Requirements

### Coverage Standards

All financial operations must achieve **95% coverage** across:

- **Lines**: 95%+
- **Functions**: 95%+
- **Branches**: 95%+
- **Statements**: 95%+

### Required Test Categories

1. **Transaction Processing**
   - Valid transaction flows
   - All status progressions
   - Monetary precision validation
   - Currency conversion accuracy

2. **Payment Validation**
   - Payment method validation
   - Amount limits enforcement
   - Security checks

3. **Compliance Testing**
   - AML/KYC checks
   - Sanctions list validation
   - Risk assessment
   - Audit trail verification

4. **Security Testing**
   - Fraud detection patterns
   - Data encryption validation
   - Signature verification
   - Access control enforcement

5. **Performance Testing**
   - Transaction processing speed (<2s)
   - Concurrent operation handling
   - Load consistency validation
   - Memory usage optimization

6. **Error Handling**
   - Network failure recovery
   - Insufficient funds scenarios
   - Invalid input handling
   - System error responses

## Dual Testing Strategy Implementation

### When to Use Each Test Type

#### Use Integration Tests (Node.js) For:

- ✅ Password hashing and verification
- ✅ JWT token generation and verification
- ✅ AES encryption/decryption
- ✅ Server-side business logic
- ✅ Database operations (with real DB)
- ✅ API endpoint testing (with NestJS)
- ✅ File system operations
- ✅ Environment variable access

#### Use Client Tests (React Native) For:

- ✅ React Native component rendering
- ✅ User interface interactions
- ✅ Device-specific functionality
- ✅ Token parsing (without verification)
- ✅ Client-side validation
- ✅ Platform detection utilities
- ✅ Mock data for UI development

### File Naming Convention

```
src/lib/
├── auth-service.ts                          # Implementation
├── auth-service.integration.spec.ts         # Server-side integration tests
└── auth-service.spec.ts                     # Client-side unit tests (if needed)

src/components/
├── login-form.tsx                           # React Native component
└── login-form.spec.tsx                      # Client-side component tests
```

### Library Configuration Files

Every library in `/libs/` includes these configuration files:

1. **`jest.integration.config.ts`** - Node.js environment configuration

   ```typescript
   module.exports = {
     displayName: "@your-org/auth-lib (Integration)",
     preset: "../../jest.preset.js",
     testEnvironment: "node",
     setupFiles: ["<rootDir>/src/integration-test-setup.ts"],
     testMatch: ["**/*.integration.spec.ts"],
     transform: {
       "^.+\\.(ts|tsx)$": [
         "ts-jest",
         {
           tsconfig: "<rootDir>/tsconfig.spec.json",
         },
       ],
     },
   };
   ```

2. **`jest.config.ts`** - React Native preset configuration

   ```typescript
   module.exports = {
     displayName: "@your-org/auth-lib",
     preset: "react-native",
     testPathIgnorePatterns: [
       "/node_modules/",
       "\\.integration\\.spec\\.ts$", // Exclude integration tests
     ],
     // ... React Native configuration
   };
   ```

3. **`src/integration-test-setup.ts`** - Pre-import environment setup

   ```typescript
   // Enable server-side crypto operations
   process.env["__SERVER_TEST_MODE__"] = "true";

   // Ensure Node.js environment
   if (typeof window !== "undefined") {
     throw new Error("Integration tests must run in Node.js environment");
   }
   ```

4. **`package.json`** - npm scripts configuration
   ```json
   {
     "scripts": {
       "test": "jest --config jest.integration.config.ts",
       "test:client": "jest --config jest.config.ts"
     }
   }
   ```

### Running Tests

```bash
# Run integration tests (default, Node.js environment)
npx nx test auth-lib
npx nx test shared-utils
npx nx test logging-lib

# Run client tests (React Native preset)
npx nx run auth-lib:test:client
npx nx run shared-utils:test:client

# Run all tests for all libraries
npx nx run-many --target=test --all

# Run with coverage
npx nx test auth-lib --coverage
```

### Platform Separation Enforcement

The system enforces platform separation through environment detection:

```typescript
// In password.ts (server-side crypto)
function isMobileEnvironment(): boolean {
  // Check for React Native
  if (typeof navigator !== "undefined" && navigator.product === "ReactNative") {
    return true;
  }

  // Check for browser
  if (typeof window !== "undefined") {
    return true;
  }

  // Check for explicit server test mode
  if (process.env["__SERVER_TEST_MODE__"] === "true") {
    return false; // Allow in server-side tests
  }

  // Default to mobile in Jest unless explicitly server mode
  if (process.env["JEST_WORKER_ID"] && process.env["NODE_ENV"] === "test") {
    return true;
  }

  return false;
}

export async function hashPassword(plainPassword: string): Promise<string> {
  if (isMobileEnvironment()) {
    throw new Error("Password hashing not available in mobile environment");
  }
  return bcrypt.hash(plainPassword, saltRounds);
}
```

### Automated Setup Script

All 18 libraries were configured using an automated Python script:

```bash
# Run setup script for new libraries
python3 scripts/setup-integration-tests.py
```

The script creates all necessary configuration files and updates existing configurations to support the dual testing strategy.

## Configuration

### Jest Configuration Updates

The framework automatically configures Jest through base configurations:

- `jest.config.mobile.base.js` - React Native setup with mocks
- `jest.config.lib.base.js` - Library testing with financial requirements
- `jest.config.api.base.js` - API testing with enhanced coverage

### Coverage Thresholds

Financial operations automatically enforce these thresholds:

```javascript
coverageThreshold: {
  global: {
    branches: 95,
    functions: 95,
    lines: 95,
    statements: 95
  },
  'apps/{app-name}/services/api/*-service.ts': {
    branches: 95,
    functions: 95,
    lines: 95,
    statements: 95
  }
}
```

## Best Practices

### 1. Test Organization

```typescript
describe("Financial Service", () => {
  describe("Happy Path", () => {
    // Success scenarios
  });

  describe("Edge Cases", () => {
    // Boundary conditions
  });

  describe("Error Handling", () => {
    // Failure scenarios
  });

  describe("Performance", () => {
    // Speed and efficiency tests
  });
});
```

### 2. Mock Management

```typescript
// Use standardized mocks
const mockProcessor = ReactNativeTestUtils.mockPaymentProcessor();

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  expect(mockProcessor.processPayment).toHaveBeenCalledWith(
    expect.objectContaining({
      amount: expect.any(Number),
      currency: expect.stringMatching(/^[A-Z]{3}$/),
    }),
  );
});
```

### 3. Mocking Patterns & Strategy

**CRITICAL**: Understanding when to use hoisted mocking vs runtime mocking is essential for reliable test execution. This is a fundamental limitation of Jest's mocking mechanism, not a shortcoming of either pattern.

#### When to Use Hoisted Mocking (jest.mock())

**✅ Best for:** Standalone exported functions

**Why Required:** Standalone functions cannot be spied on with `jest.spyOn()` due to Jest's limitations. When you export a function directly, it's not an object property that can be intercepted.

**Pattern:**

```typescript
// ✅ CORRECT: Hoisted mock for standalone function
jest.mock("@your-org/shared-utils", () => ({
  formatCurrency: jest.fn((amount, currency) => `${currency} ${amount}`),
  calculateFee: jest.fn((amount) => amount * 0.01),
  validateHandle: jest.fn((handle) => true),
}));

describe("Payment Component", () => {
  it("should format currency correctly", () => {
    const { formatCurrency } = require("@your-org/shared-utils");
    const result = formatCurrency(100, "USD");
    expect(result).toBe("USD 100");
    expect(formatCurrency).toHaveBeenCalledWith(100, "USD");
  });
});
```

**Common Use Cases:**

- Utility functions (`formatCurrency`, `validateEmail`, `parseDate`)
- Pure transformation functions
- Validation functions (`validateHandle`, `isValidAmount`)
- Third-party package mocks

**Limitations:**

- ⚠️ **Fails with subpath exports** (`/client`, `/server`) - use runtime mocking instead
- ⚠️ **Less flexible** - Mock applies to entire test suite unless reset
- ⚠️ **Cannot restore** real implementation easily

---

#### When to Use Runtime Mocking (jest.spyOn())

**✅ Best for:** Object methods, getter properties, and subpath exports

**Why Preferred:** Provides better test isolation, lifecycle control, and works with all module types including subpath exports.

**Pattern:**

```typescript
// ✅ CORRECT: Runtime spy for object method
import * as loggingLib from "@your-org/logging-lib/client";

describe("User Service", () => {
  let loggerSpy: jest.SpyInstance;

  beforeAll(() => {
    // Create spy once for entire test suite
    loggerSpy = jest.spyOn(loggingLib, "logger", "get").mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      audit: jest.fn(),
    });
  });

  afterAll(() => {
    // Restore original implementation after all tests
    loggerSpy.mockRestore();
  });

  beforeEach(() => {
    // Clear call history before each test
    loggerSpy.mockClear();
  });

  it("should log user creation", () => {
    const service = new UserService();
    service.createUser({ handle: "@alice" });

    expect(loggingLib.logger.info).toHaveBeenCalledWith(
      "User created",
      expect.objectContaining({ handle: "@alice" }),
    );
  });
});
```

**Common Use Cases:**

- Logger mocking (`logger.info`, `logger.error`)
- Service method mocking (`userService.findById`)
- Object property mocking (getters, setters)
- Subpath export mocking (`/client`, `/server`) - **REQUIRED**

**Benefits:**

- ✅ **Better test isolation** with lifecycle hooks
- ✅ **More reliable** - no hoisting timing issues
- ✅ **Flexible** - can restore real implementation
- ✅ **Works with all module types** including subpath exports

---

#### Decision Tree: Which Mocking Approach?

| Export Type                                               | Hoisted (jest.mock)     | Runtime (jest.spyOn)       | Recommended |
| --------------------------------------------------------- | ----------------------- | -------------------------- | ----------- |
| **Standalone function** <br/> `export function foo()`     | ✅ Works well           | ❌ Cannot spy on functions | **Hoisted** |
| **Object method** <br/> `export const obj = { foo() {} }` | ⚠️ Works but inflexible | ✅ Full control            | **Runtime** |
| **Getter property** <br/> `export const logger = ...`     | ❌ Fails to intercept   | ✅ Required                | **Runtime** |
| **Subpath export** <br/> `/client`, `/server`             | ❌ Timing issues        | ✅ Required                | **Runtime** |
| **Third-party package** <br/> `react-native-uuid`         | ✅ Standard approach    | ⚠️ Rarely needed           | **Hoisted** |
| **Regular library import** <br/> No subpath               | ✅ Works fine           | ✅ Also works              | **Either**  |

---

#### Common Anti-Patterns

**❌ WRONG: Trying to spy on standalone function**

```typescript
// This will NOT work - Jest limitation
import * as utils from "@your-org/shared-utils";

const spy = jest.spyOn(utils, "formatCurrency"); // ❌ Error: Cannot spy on function
```

**Why it fails:** Standalone exported functions are not object properties, so `jest.spyOn()` cannot intercept them.

**✅ Solution:** Use hoisted mock

```typescript
jest.mock("@your-org/shared-utils", () => ({
  formatCurrency: jest.fn((amount, currency) => `${currency} ${amount}`),
}));
```

---

**❌ WRONG: Hoisted mock for subpath export**

```typescript
// This will fail due to module resolution timing
jest.mock("@your-org/logging-lib/client", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));
```

**Why it fails:** Subpath exports resolve at runtime, but `jest.mock()` is hoisted before module resolution.

**✅ Solution:** Use runtime mocking (see `jest-subpath-export-resolution-guide.md` for details)

```typescript
import * as loggingLib from "@your-org/logging-lib/client";

beforeAll(() => {
  jest.spyOn(loggingLib, "logger", "get").mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
  });
});
```

---

**❌ WRONG: Creating spy in beforeEach instead of beforeAll**

```typescript
beforeEach(() => {
  const loggerSpy = jest.spyOn(loggingLib, "logger", "get"); // ❌ Creates new spy every test
});
```

**Why it fails:** Each test tries to redefine the same property, causing "Cannot redefine property" error.

**✅ Solution:** Create spy in `beforeAll`, clear in `beforeEach`

```typescript
let loggerSpy: jest.SpyInstance;

beforeAll(() => {
  loggerSpy = jest.spyOn(loggingLib, "logger", "get").mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
  });
});

beforeEach(() => {
  loggerSpy.mockClear(); // Only clear call history
});
```

---

**❌ WRONG: Using mockRestore() in beforeEach**

```typescript
beforeEach(() => {
  loggerSpy.mockRestore(); // ❌ Removes spy entirely
  loggerSpy = jest.spyOn(...); // Has to recreate spy
});
```

**Why it's wrong:** `mockRestore()` removes the spy completely, requiring recreation every test. Use `mockClear()` to only clear call history.

**✅ Solution:** Use `mockClear()` in `beforeEach`, `mockRestore()` in `afterAll`

```typescript
beforeEach(() => {
  loggerSpy.mockClear(); // Clear call history only
});

afterAll(() => {
  loggerSpy.mockRestore(); // Restore original implementation once
});
```

---

#### Quick Reference Guide

**Use hoisted mocking (jest.mock()) when:**

- Mocking standalone exported functions (`formatCurrency`, `validateHandle`)
- Mocking third-party packages (`react-native-uuid`)
- Simple module replacements without lifecycle needs

**Use runtime mocking (jest.spyOn()) when:**

- Mocking object methods (`logger.info`, `service.method`)
- Mocking getter properties
- Working with subpath exports (`/client`, `/server`) - **ALWAYS REQUIRED**
- Need to restore real implementation
- Need different mocks per test

**For more details on subpath export mocking:**

- See Task 10 documentation for real-world conversion examples

---

### 4. Test Data Management

```typescript
// Use test fixtures instead of inline data
const testUser = TestFixtures.user.minimal();
const testTransaction = FinancialTestUtils.generateTransaction({
  from: testUser.id,
  amount: 100.5,
});
```

### 5. Async Testing Patterns

```typescript
describe("Async Operations", () => {
  it("should handle promises correctly", async () => {
    const result = await processPayment(validPayment);

    await waitFor(() => {
      expect(result.status).toBe("COMPLETED");
    });
  });

  it("should handle timeout scenarios", async () => {
    jest.setTimeout(10000); // Extend for long operations

    const result = await processLongTransaction();
    expect(result).toBeDefined();
  });
});
```

## Troubleshooting

### Common Issues

1. **Module Resolution Errors**
   - Verify test-utils paths in jest.config.js
   - Check that all required modules are installed
   - Use conditional mocking for optional dependencies

2. **Coverage Not Meeting Requirements**
   - Run `npx nx test <project> --coverage` to see detailed report
   - Add missing test cases for uncovered branches
   - Verify financial operations have dedicated tests

3. **React Native Mock Issues**
   - Ensure test setup files are properly configured
   - Check that native modules are mocked appropriately
   - Verify expo modules are conditionally mocked

4. **Performance Test Failures**
   - Increase timeout for complex operations
   - Mock external dependencies that cause delays
   - Use performance measurement utilities correctly

### Debug Commands

```bash
# Run tests with detailed output
npx nx test <project> --verbose

# Generate coverage report
npx nx test <project> --coverage

# Run specific test pattern
npx nx test <project> --testNamePattern="financial"

# Run with debugging
npx nx test <project> --runInBand --detectOpenHandles
```

## Migration Guide

### From Existing Tests to Dual Strategy

#### Step 1: Identify Test Type

Determine if your existing tests should be integration tests or client tests:

```typescript
// These need integration tests (server-side crypto):
import { hashPassword } from "@your-org/auth-lib"; // ❌ Won't work in React Native
await hashPassword("password"); // Needs Node.js environment

// These can use client tests:
import { decodeToken } from "@your-org/auth-lib/client"; // ✅ Works in React Native
decodeToken(token); // Parsing only, no crypto
```

#### Step 2: Rename Test Files

```bash
# Server-side tests with crypto operations
mv src/lib/auth-service.spec.ts src/lib/auth-service.integration.spec.ts

# Client-side UI component tests (keep as-is)
# src/components/login-form.spec.tsx remains unchanged
```

#### Step 3: Update Imports for Server-Side Tests

```typescript
// Before (caused "Password hashing not available" errors)
import { hashPassword } from "@your-org/auth-lib";

describe("Auth Tests", () => {
  it("should hash password", async () => {
    const hash = await hashPassword("test"); // ❌ Failed in React Native preset
  });
});

// After (works with integration tests)
/**
 * Server-side integration tests
 * Environment setup is handled by integration-test-setup.ts
 */
import { hashPassword } from "@your-org/auth-lib";

describe("Auth Integration Tests", () => {
  it("should hash password", async () => {
    const hash = await hashPassword("test"); // ✅ Works in Node.js environment
    expect(hash).toBeDefined();
  });
});
```

#### Step 4: Update Client-Side Tests

```typescript
// Before (tried to use server-side functions)
import { hashPassword } from "@your-org/auth-lib"; // ❌ Wrong import

// After (use client-side functions only)
import { decodeToken, validateEmail } from "@your-org/auth-lib/client"; // ✅ Correct

describe("Login Form Tests", () => {
  it("should validate email", () => {
    const result = validateEmail("test@example.com");
    expect(result.valid).toBe(true);
  });
});
```

#### Step 5: Verify Test Configuration

All libraries already have the dual configuration. Verify with:

```bash
# Check integration config exists
ls libs/auth-lib/jest.integration.config.ts

# Check package.json scripts
cat libs/auth-lib/package.json | grep "test"

# Should show:
#   "test": "jest --config jest.integration.config.ts",
#   "test:client": "jest --config jest.config.ts"
```

### Common Migration Scenarios

#### Scenario 1: Password Testing

```typescript
// ❌ Old way (fails in React Native preset)
describe("Password Tests", () => {
  it("should hash password", async () => {
    const hash = await hashPassword("test");
    expect(hash).toBeDefined();
  });
});

// ✅ New way (integration test)
// File: password.integration.spec.ts
describe("Password Integration Tests", () => {
  it("should hash password", async () => {
    const hash = await hashPassword("test");
    expect(hash).toBeDefined();
    expect(hash).not.toBe("test");
  });

  it("should compare passwords", async () => {
    const hash = await hashPassword("test");
    const match = await comparePassword("test", hash);
    expect(match).toBe(true);
  });
});
```

#### Scenario 2: JWT Token Testing

```typescript
// ❌ Old way (server-side verification in wrong environment)
import { verifyAccessToken } from "@your-org/auth-lib";

// ✅ Integration test (server-side verification)
// File: token.integration.spec.ts
import { generateTokenPair, verifyAccessToken } from "@your-org/auth-lib";

describe("Token Integration Tests", () => {
  it("should generate and verify tokens", () => {
    const tokens = generateTokenPair({ sub: "123" }, config);
    const result = verifyAccessToken(tokens.access_token, config);
    expect(result.valid).toBe(true);
  });
});

// ✅ Client test (token parsing only)
// File: token-display.spec.tsx
import { decodeToken, isTokenExpired } from "@your-org/auth-lib/client";

describe("Token Display Tests", () => {
  it("should decode token for display", () => {
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
    const payload = decodeToken(token);
    expect(payload).toBeDefined();
  });
});
```

#### Scenario 3: Mixed Testing Needs

Some modules may need both integration and client tests:

```
libs/auth-lib/src/lib/
├── auth.ts                          # Implementation
├── auth.integration.spec.ts         # Server-side crypto tests
└── auth-validators.spec.ts          # Client-side validation tests
```

```typescript
// auth.integration.spec.ts (Node.js)
import { hashPassword, generateTokenPair } from "./auth";

describe("Auth Integration Tests", () => {
  it("should perform server operations", async () => {
    const hash = await hashPassword("test");
    expect(hash).toBeDefined();
  });
});

// auth-validators.spec.ts (React Native)
import { validateEmail, validatePassword } from "./auth-validators";

describe("Auth Validation Tests", () => {
  it("should validate email format", () => {
    expect(validateEmail("test@example.com").valid).toBe(true);
  });
});
```

### From Existing Test Framework

1. **Update Imports**:

   ```typescript
   // Old
   import { mockUser } from "../__mocks__/user";

   // New
   import { TestFixtures } from "@your-org/shared-types/test-utils";
   const user = TestFixtures.user.minimal();
   ```

2. **Standardize Setup**:

   ```typescript
   // Old
   beforeEach(() => {
     // Custom setup
   });

   // New
   setupFinancialOperationTests(); // Automatic setup
   ```

3. **Use Financial Framework**:

   ```typescript
   // Old
   describe("Payment Tests", () => {
     // Manual test cases
   });

   // New
   runFinancialOperationTests("PaymentService", paymentModule);
   ```

## Next Steps

With the dual testing framework in place, development teams can:

1. **Write Server-Side Tests**: Use integration tests for crypto operations and business logic
2. **Write Client-Side Tests**: Use React Native tests for UI components and device functionality
3. **Maintain Coverage**: Ensure 95% coverage for all financial operations
4. **Performance Monitoring**: Track test performance metrics across both test types
5. **Quality Assurance**: Use automated validation for code quality

---

## Jest Setup File Execution Order

**CRITICAL**: Understanding Jest's execution order is essential for reliable test infrastructure, especially when mocking global APIs or working with third-party libraries that initialize during module loading.

### Execution Timeline

Jest executes setup code in this specific order:

```
1. setupFiles (jest-pre-setup.js)
   ├─ Runs BEFORE any module loading
   ├─ NO TypeScript transformation yet
   ├─ NO test files loaded
   └─ ONLY global state and native Node.js APIs available

2. Module Loading Phase
   ├─ TypeScript files transformed to JavaScript
   ├─ All import statements execute
   ├─ Module initialization code runs (side effects)
   └─ Third-party libraries may capture global API references

3. setupFilesAfterEnv (test-setup.ts)
   ├─ All modules already loaded
   ├─ Can import from test files
   ├─ Can use jest.mock() for module mocks
   └─ Test framework extensions applied

4. Test Execution
   └─ Individual test files run
```

### When to Use Each Setup File

**Use `setupFiles` (jest-pre-setup.js) for:**

- ✅ **Global API mocks** (Response, fetch, localStorage, etc.)
  ```javascript
  // jest-pre-setup.js
  global.Response = class Response {
    clone() { return new Response(...); }
    // ... other methods
  };
  ```
- ✅ **Polyfills** for missing Node.js features
- ✅ **Global variables** needed during module loading
- ✅ **Environment configuration** that modules need during initialization

**Use `setupFilesAfterEnv` (test-setup.ts) for:**

- ✅ **jest.mock()** declarations for modules
- ✅ **Test framework extensions** (custom matchers)
- ✅ **Test lifecycle hooks** (beforeAll, afterEach, etc.)
- ✅ **Importing test utilities** and helpers

### Critical Timing Issue: Import Side Effects

**Problem**: Import statements execute immediately when a module is loaded, **before** the rest of the file:

```typescript
// test-setup.ts - WRONG APPROACH
import { server } from './src/mocks/server';  // ← Executes FIRST
                                               // ← setupServer() runs NOW
                                               // ← Captures global.Response

// ... 110 lines later ...

global.Response = class Response { ... };      // ← Executes SECOND (too late!)
```

**Why This Fails**:

1. When `import { server }` executes, it loads `./src/mocks/server.ts`
2. That file has `export const server = setupServer(...)` at top level
3. `setupServer()` executes immediately and captures reference to native `global.Response`
4. Later, your `global.Response =` assignment runs
5. But the library already has the old reference - your mock is never used

**Correct Solution**:

```javascript
// jest-pre-setup.js - Runs BEFORE any imports
global.Response = class Response {
  clone() { return new Response(...); }
  // ...
};

// Now when test-setup.ts imports MSW...
import { server } from './src/mocks/server';  // ← Sees your mocked Response!
```

### Real-World Example: MSW Response.clone() Issue

**Symptom**: `TypeError: originalResponse.clone is not a function` (293 occurrences in Task 11 Session 6)

**Root Cause**: MSW's `setupServer()` captured native Response (without clone()) during import, before our Response mock applied.

**Solution**: Move Response mock to `setupFiles` which runs before ANY imports:

```javascript
// apps/{app-name}/jest-pre-setup.js
global.Response = class Response {
  constructor(body, init) {
    this.body = body;
    this.init = init || {};
  }
  clone() {
    return new Response(this.body, this.init);
  }
  json() {
    return Promise.resolve(
      typeof this.body === "string" ? JSON.parse(this.body) : this.body,
    );
  }
  // ... other Response methods
};

console.log("[PRE-SETUP] Response.clone() mock installed");
```

**Impact**: Eliminated 293 test errors by ensuring MSW saw our mocked Response during initialization.

### Decision Tree: Which Setup File?

**Ask yourself**: "Does any imported module need this during its initialization?"

```
Need to mock a global API (Response, fetch, etc.)?
├─ Does a third-party library use it during import?
│  ├─ YES → setupFiles (runs before imports)
│  └─ NO → setupFilesAfterEnv is fine
└─ Not sure? → Use setupFiles (safer)

Need to mock a module import?
└─ Use jest.mock() in setupFilesAfterEnv

Need to add test lifecycle hooks?
└─ Use setupFilesAfterEnv

Need to configure environment variables?
├─ Used during module loading? → setupFiles
└─ Used during test execution? → setupFilesAfterEnv
```

### Verification and Debugging

**Add debug logging to confirm execution order**:

```javascript
// jest-pre-setup.js
console.log("[PRE-SETUP] Starting at:", new Date().toISOString());
global.SomeAPI = yourMock;
console.log("[PRE-SETUP] SomeAPI mock installed");
```

**Verify your mock is applied**:

```bash
# Check logs to confirm setup ran
grep "\[PRE-SETUP\]" test-results.log

# Verify specific mock loaded
grep "SomeAPI mock installed" test-results.log
```

**Common debugging pattern**:

```javascript
// In jest-pre-setup.js
global.Response = class Response {
  clone() {
    console.log('MOCK Response.clone() called!');  // Debug log
    return new Response(...);
  }
};

// If you don't see this log during tests → timing issue
```

### Key Lessons Learned

1. **setupFiles runs before imports** - Use for global API mocks that libraries need during initialization
2. **Imports execute immediately** - Top-level code in imported modules runs during import
3. **Verify every fix** - Count errors before/after to confirm fix worked
4. **Debug logging is essential** - Add logs to confirm execution order
5. **Third-party libraries are black boxes** - They may capture references during initialization
6. **Test infrastructure = production critical** - Broken tests block development

**Reference**: These lessons come from Task 11 Session 6 where we debugged originalResponse.clone() issues for 3 hours before discovering the timing problem. Complete details in Task 11 documentation.

---

## Summary: Dual Testing Strategy Benefits

### ✅ What We Achieved

1. **Full Crypto Support in Tests**
   - Password hashing with bcrypt ✅
   - JWT token signing and verification ✅
   - AES encryption/decryption ✅
   - No more "Password hashing not available" errors ✅

2. **Platform Separation Enforcement**
   - Server-side crypto operations stay server-side ✅
   - Client-side code can't accidentally use server functions ✅
   - Clear boundary between Node.js and React Native ✅

3. **Zero Configuration for Developers**
   - All 18 libraries pre-configured ✅
   - Automated setup script available ✅
   - Consistent patterns across entire codebase ✅

4. **Simple Command Structure**
   - `npx nx test <lib>` - Integration tests (default) ✅
   - `npx nx run <lib>:test:client` - Client tests ✅
   - No complex flags or environment setup required ✅

5. **Backward Compatible**
   - Existing tests continue to work ✅
   - Migration path is clear and documented ✅
   - No breaking changes to test utilities ✅

### 📊 Configured Libraries (18/18)

All libraries in `/libs/` are ready for dual testing:

- auth-lib, cache-lib, compliance-lib, contact-lib
- groups-lib, help-lib, localization-lib, logging-lib
- mock-data-lib, notifications-lib, requests-lib, rewards-lib
- shared-types, shared-utils, shopping-lib, transactions-lib
- user-lib, account-lib

### 🎯 Key Technical Decisions

1. **Environment Detection**: `__SERVER_TEST_MODE__` environment variable set before imports
2. **File Naming**: `*.integration.spec.ts` for Node.js tests, `*.spec.ts` for React Native tests
3. **Default Behavior**: Integration tests are default (`npm test`), client tests are explicit
4. **Separation Method**: `testPathIgnorePatterns` excludes integration tests from React Native runs

The framework provides the foundation for reliable, maintainable testing that meets financial services compliance requirements while supporting rapid development of the 138+ epics in the roadmap.
