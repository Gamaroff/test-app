# React Native-Specific Test Patterns

This document supplements `references/code-vs-test-validation.md` with patterns specific to React Native testing.

**Reference the shared framework for core methodology.** This document adds React Native-specific context.

---

## Overview

React Native applications have unique testing challenges related to:
- Metro bundler and module resolution
- Platform separation (/client imports required for client code)
- Component rendering and React lifecycle
- Mock declarations and order (must come before imports)
- Async rendering with waitFor()

These can cause test failures that require platform-specific investigation techniques.

---

## React Native-Specific Error Pattern 1: Metro Module Resolution in Tests

### Symptom

```
Test Failure:
Cannot find module '@your-org/auth-lib'
OR
Module resolution failed for library export
```

### Root Cause Analysis

**Code Wrong:**
- Library not built to dist/
- Library index.ts missing exports
- Library package.json main field wrong

**Test Wrong:**
- Test importing from wrong path
- Test expecting old build artifacts
- Mock setup incorrect

### Evidence to Gather

```bash
# Check if library is built
ls dist/libs/@your-org/[library-name]/

# Check library exports
cat libs/[library-name]/src/index.ts

# Check package.json
cat libs/[library-name]/package.json | grep -A 5 '"main"'

# Check test import
grep "from '@{project}" test-file.spec.tsx
```

### Decision Tree

```
Does library dist/ directory exist?
├─ NO → Code wrong (library not built)
│   └─ Fix: npm run build:libraries
└─ YES → Does index.ts export the imported symbol?
    ├─ NO → Code wrong (missing export)
    │   └─ Fix: Add export to index.ts
    └─ YES → Does test import correct path?
        ├─ NO → Test wrong (wrong import)
        │   └─ Fix: Update import in test
        └─ YES → Is Metro cache stale?
            └─ Fix: npx nx start {app-name} --reset-cache
```

### Example: Library Not Exported

```typescript
// ❌ WRONG - Export missing from index.ts
// libs/auth-lib/src/index.ts
export * from './lib/auth.service';
// Missing: export * from './lib/token-decoder';

// ✅ CORRECT - All exports included
// libs/auth-lib/src/index.ts
export * from './lib/auth.service';
export * from './lib/token-decoder';
export * from './lib/types';

// Test now works
import { decodeToken } from '@your-org/auth-lib/client';
```

---

## React Native-Specific Error Pattern 2: Platform Separation Violations

### Symptom

```
Test Failure:
Cannot find module 'bcryptjs'
OR
Module not found: jsonwebtoken
OR
"Password hashing not available in mobile environment"
```

### Root Cause Analysis

**Code Wrong** (rarely):
- Client code attempting server-only operation
- Implementation in wrong place

**Test Wrong** (usually):
- Test importing from wrong library path (missing /client)
- Test using server-only functions in client test
- Mock not using correct import path

### Evidence to Gather

```bash
# Check all @{project} imports in test
grep "from '@{project}" test-file.spec.tsx

# Look for server-only packages
grep "bcryptjs\|jsonwebtoken\|winston" test-file.spec.tsx

# Check if /client suffix is used
grep "from '@{project}.*lib'" test-file.spec.tsx | grep -v "/client"

# Determine if integration or client test
ls -la test-file.spec.tsx  # .spec.tsx = client, .integration.spec.ts = integration
```

### Decision Tree

```
Is this a client test (.spec.tsx)?
├─ NO (integration test) → Use default imports, OK
└─ YES → Check imports for /client suffix
    ├─ NO /client suffix found → Test wrong (need /client)
    │   └─ Fix: Add /client to library imports
    └─ /client suffix found → Check for server packages
        ├─ Found bcryptjs/jsonwebtoken/winston → Test wrong
        │   └─ Fix: Remove server packages from client test
        └─ NOT found → Check code for server operations
            ├─ Code uses server operations → Code wrong
            └─ Code correct → Look elsewhere
```

### Example: Missing /client Suffix

```typescript
// ❌ WRONG - Client test without /client imports
// This is a client test (.spec.tsx)
import { decodeToken, hashPassword } from '@your-org/auth-lib';
import { logger } from '@your-org/logging-lib';

it('should decode token', () => {
  // FAILS: hashPassword not available in client
  const hashed = hashPassword('password');
});

// ✅ CORRECT - Client test with /client imports
import { decodeToken } from '@your-org/auth-lib/client';
import { logger } from '@your-org/logging-lib/client';

it('should decode token', () => {
  const decoded = decodeToken('jwt-token');
  expect(decoded.userId).toBeDefined();
});
```

### Correct Import Mapping

| Function | Client Test | Integration Test |
|----------|------------|-----------------|
| `decodeToken` | `/client` | default |
| `hashPassword` | ❌ Never | default |
| `logger.info()` | `/client` | default |
| `validateEmail` | `/client` | default |
| `getDeviceInfo` | `/client` | default |
| `encryptData` | ❌ Never | `/server` |

---

## React Native-Specific Error Pattern 3: Mock Declaration Order

### Symptom

```
Test Failure:
Cannot read property 'mockFn' of undefined
OR
Mock not being applied
```

### Root Cause Analysis

**Test Wrong** (99% of cases):
- jest.mock() declared AFTER import statement
- Mock cannot be hoisted above import
- Module already loaded before mock applied

**Code Wrong** (1% of cases):
- Module structure prevents mocking (rare)

### Evidence to Gather

```bash
# Check mock declaration order
grep -n "jest.mock\|import.*from" test-file.spec.tsx | head -20

# jest.mock line numbers should be LOWER (earlier in file)
```

### Decision Tree

```
Is jest.mock() BEFORE the import?
├─ NO → Test wrong (wrong order)
│   └─ Fix: Move jest.mock() to top of file
└─ YES → Are all exported functions in mock?
    ├─ NO → Test wrong (incomplete mock)
    │   └─ Fix: Add missing exports
    └─ YES → Check for circular dependency
```

### Example: Mock After Import

```typescript
// ❌ WRONG - jest.mock() after import
import { myFunction } from './{module-name}';  // Module loaded!

jest.mock('./{module-name}', () => ({  // Too late - mock not applied
  myFunction: jest.fn()
}));

it('test', () => {
  expect(myFunction).toBeUndefined();  // Fails!
});

// ✅ CORRECT - jest.mock() before import
jest.mock('./{module-name}', () => ({  // Before import
  myFunction: jest.fn(() => 'mocked')
}));

import { myFunction } from './{module-name}';  // Uses mocked version

it('test', () => {
  expect(myFunction()).toBe('mocked');  // Passes
});
```

---

## React Native-Specific Error Pattern 4: Async Rendering with Components

### Symptom

```
Test Failure:
Unable to find element with testID 'user-name'
OR
Expected mock to be called, but it wasn't
OR
Timeout - Async callback not invoked within 5000ms
```

### Root Cause Analysis

**Code Wrong:**
- Component not rendering element (conditional rendering wrong)
- Event handler not calling expected function
- Effect not running when expected

**Test Wrong:**
- Not awaiting async operations (waitFor)
- Not providing required props
- Element hidden or not rendered due to state

### Evidence to Gather

```bash
# Check for await/waitFor in test
grep -n "await\|waitFor" test-file.spec.tsx

# Check for useEffect or other async logic
grep "useEffect\|Promise\|async" component-file.tsx

# Debug - use debug() to see rendered tree
grep "debug()" test-file.spec.tsx
```

### Decision Tree

```
Does test have await/waitFor?
├─ NO → Test wrong (missing wait)
│   └─ Fix: Add await waitFor(() => { ... })
└─ YES → Is element rendered in component?
    ├─ (Use debug() to check)
    ├─ YES → Does it have correct testID?
    │   ├─ NO → Code wrong (wrong testID in component)
    │   └─ YES → Increase timeout if needed
    └─ NO → Component doesn't render element
        ├─ Conditional rendering wrong? → Code wrong
        └─ Props not provided? → Test wrong
```

### Example: Missing waitFor

```typescript
// ❌ WRONG - No waiting for async update
it('should show user name', () => {
  const { getByTestId } = render(<UserProfile userId="123" />);
  expect(getByTestId('user-name')).toBeTruthy();  // Fails - not rendered yet
});

// ✅ CORRECT - Wait for async update
it('should show user name', async () => {
  const { getByTestId } = render(<UserProfile userId="123" />);

  await waitFor(() => {
    expect(getByTestId('user-name')).toBeTruthy();  // Wait for render
  });
});
```

---

## React Native-Specific Error Pattern 5: Component Mock Doesn't Use Props

### Symptom

```
Test Failure:
Expected mock function to be called with 'expectedValue', but got something else
OR
Expected element text to be 'value', but element not updated
```

### Root Cause Analysis

**Test Wrong** (usually):
- Component mock doesn't capture/use props
- Mock doesn't pass props to children
- Mock doesn't trigger handlers

**Code Wrong:**
- Component logic expects prop but gets different value
- Handler not wired correctly

### Evidence to Gather

```bash
# Check component mock definition
grep -A 10 "jest.mock.*component" test-file.spec.tsx

# Check if mock uses props
grep "{children\|onClick\|title\|name}" mock-definition

# Check actual component props
grep "interface.*Props\|type.*Props" component-file.tsx
```

### Decision Tree

```
Does component mock accept props?
├─ NO → Test wrong (mock doesn't take props)
│   └─ Fix: Add ({ prop1, prop2 }) => to mock
└─ YES → Does mock use the props?
    ├─ NO → Test wrong (props not used)
    │   └─ Fix: Use props in mock JSX
    └─ YES → Check if all props used
        ├─ Missing prop → Test wrong (incomplete props)
        └─ All props used → Look elsewhere
```

### Example: Component Mock Not Using Props

```typescript
// ❌ WRONG - Mock doesn't use props
jest.mock('./Button', () =>
  jest.fn(() => <TouchableOpacity testID="button" />)  // Props ignored!
);

it('should call onPress', () => {
  const mockOnPress = jest.fn();
  render(<Button onPress={mockOnPress} title="Click" />);
  fireEvent.press(screen.getByTestId('button'));
  expect(mockOnPress).not.toHaveBeenCalled();  // FAILS - handler never called
});

// ✅ CORRECT - Mock uses props
jest.mock('./Button', () =>
  jest.fn(({ onPress, title, disabled }) => (
    <TouchableOpacity
      testID="button"
      onPress={onPress}  // Props used!
      disabled={disabled}
    >
      <Text>{title}</Text>
    </TouchableOpacity>
  ))
);

it('should call onPress', () => {
  const mockOnPress = jest.fn();
  render(<Button onPress={mockOnPress} title="Click" />);
  fireEvent.press(screen.getByTestId('button'));
  expect(mockOnPress).toHaveBeenCalled();  // PASSES
});
```

---

## React Native-Specific Error Pattern 6: Metro Cache Affecting Tests

### Symptom

```
Test Failure:
Metro error: Cannot find module (intermittent)
Test passes after clearing cache
OR
Code changes don't reflect in tests
```

### Root Cause Analysis

**Code Wrong** (sometimes):
- Actually built wrong, cache shows old version

**Test Wrong** (sometimes):
- Metro cache stale from previous builds
- Library rebuild didn't clear cache

**Environment** (usually):
- Metro cache stale from development
- Build artifacts cached incorrectly

### Decision Tree

```
Do tests pass after clearing Metro cache?
├─ YES → Not code or test problem
│   └─ Metro cache was stale
│   └─ Prevention: Use --reset-cache when rebuilding
└─ NO → Continue with other investigation
```

### Evidence to Gather

```bash
# Check if library built
ls dist/libs/@your-org/[lib]/

# Check Metro cache status
npx nx start {app-name} --dry-run

# Look for old Metro cache
rm -rf node_modules/.cache

# Clear and rebuild
npx nx start {app-name} --reset-cache --clear
npm run build:libraries
```

---

## Common React Native Test Setup Mistakes

### Mistake 1: Missing Test Setup File

```typescript
// ❌ WRONG - No jest.config.ts or test-setup.ts
// Tests fail with "expect is not defined"

// ✅ CORRECT - Proper configuration
// jest.config.ts exists with:
{
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts']
}

// src/test-setup.ts exists with:
import '@testing-library/jest-native/extend-expect';
jest.mock('expo-secure-store');
jest.mock('@react-native-async-storage/async-storage');
```

### Mistake 2: Not Mocking Platform Modules

```typescript
// ❌ WRONG - No mocks for Expo modules
// Test fails: "SecureStore is not available"

// ✅ CORRECT - Platform modules mocked globally
// src/test-setup.ts
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve())
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null))
}));
```

### Mistake 3: Component Mock Missing Children

```typescript
// ❌ WRONG - Mock doesn't pass children through
jest.mock('./Container', () =>
  jest.fn(() => <View testID="container" />) // Children lost!
);

render(
  <Container>
    <Text>Child content</Text>  // Not rendered!
  </Container>
);
// Test fails: Can't find "Child content"

// ✅ CORRECT - Mock renders children
jest.mock('./Container', () =>
  jest.fn(({ children }) => (  // children as prop
    <View testID="container">
      {children}  // Pass children through
    </View>
  ))
);

render(
  <Container>
    <Text>Child content</Text>  // Renders!
  </Container>
);
// Test passes: Finds "Child content"
```

---

## Evidence Gathering Commands (React Native)

```bash
# Check library build
ls -la dist/libs/@your-org/[lib]/

# Check test configuration
cat apps/{app-name}/jest.config.ts

# Check test setup file
cat apps/{app-name}/src/test-setup.ts

# Find all mocks
grep -r "jest.mock" apps/{app-name}/**/*.spec.tsx

# Find Metro cache
du -sh node_modules/.cache 2>/dev/null

# Check metro config
cat apps/{app-name}/metro.config.js | grep -A 5 "projectRoot\|nodeModulesPaths"

# Find async operations in tests
grep -r "await\|waitFor" apps/{app-name}/**/*.spec.tsx

# Find component mocks
grep -A 5 "jest.mock.*components" apps/{app-name}/**/*.spec.tsx
```

---

## Real-World React Native Example: {app-name}

### Scenario: AuthContext Test Fails with "Cannot find module"

```
Error: Cannot find module '@your-org/auth-lib/client'
```

### Investigation Process

1. **Check import in test:**
   ```bash
   grep "from '@your-org/auth-lib" auth-context.spec.tsx
   # Found: import from '@your-org/auth-lib' (missing /client!)
   ```

2. **Check if /client is required:**
   ```bash
   grep "client\|server" apps/{app-name}/contexts/auth-context.tsx
   # Found: Used in client component - needs /client import
   ```

3. **Verdict:** Test wrong
   - Missing /client suffix on auth-lib import
   - Fix: Change to `@your-org/auth-lib/client`

4. **Update test imports:**
   ```typescript
   import { decodeToken } from '@your-org/auth-lib/client';  // Added /client
   ```

---

## Validation Checklist: React Native Tests

Before submitting a React Native test:

- [ ] jest.mock() calls come BEFORE imports
- [ ] All @{project} imports have /client suffix (for client tests)
- [ ] No server-only packages (bcryptjs, jsonwebtoken, winston)
- [ ] Component mocks accept and use props
- [ ] Component mocks render children if needed
- [ ] Async operations wrapped in await waitFor()
- [ ] Platform modules mocked (AsyncStorage, SecureStore, etc.)
- [ ] jest.clearAllMocks() in beforeEach()
- [ ] test-setup.ts exists and is referenced in jest.config.ts
- [ ] Required mocks are in test-setup.ts (not duplicated per test)
- [ ] Metro cache cleared if tests previously failed after code changes

---

## Summary

React Native tests fail for platform-specific reasons:
1. **Library not exported** - Code build issue or index.ts
2. **Missing /client suffix** - Platform separation violation
3. **jest.mock() after import** - Wrong declaration order
4. **waitFor() missing** - Async rendering not awaited
5. **Component mock doesn't use props** - Mock incomplete
6. **Platform module not mocked** - Test infrastructure issue
7. **Metro cache stale** - Development environment issue

**Use the `references/code-vs-test-validation.md` framework to decide code vs test,** then use this supplement to understand React Native-specific patterns.
