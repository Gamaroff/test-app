# Debugging Workflows

Step-by-step guides for each debugging workflow in the React Native Debug skill.

## Workflow A: Metro Resolution Debugging

**When to Use**: "Unable to resolve module" or "Cannot find module" errors

### Step 1: Verify Library Build Artifacts

```bash
# Check if the library exists in dist/
ls -la dist/libs/@your-org/[library-name]/

# If not found:
echo "❌ Library not built"

# If found:
echo "✅ Library exists, check if up to date"
ls -lt dist/libs/@your-org/[library-name]/ | head -5
```

### Step 2: Run Automated Checks

```bash
# Check Metro cache freshness
npx nx start {app-name} --dry-run

# Check tsconfig paths
grep -A 20 '"paths"' tsconfig.json | grep "@{project}"

# Check metro.config.js setup
grep -A 5 "projectRoot\|cacheVersion" metro.config.js
```

### Step 3: Interactive Decision

**Question**: "Do the library build artifacts exist?"

- **YES**: Proceed to Step 4
- **NO**: Offer auto-rebuild
  ```bash
  npm run build:libraries
  # Or rebuild specific library
  npx nx build @your-org/[library-name]
  ```

### Step 4: Clear Metro Cache

**Auto-run this**:
```bash
npx nx start {app-name} --reset-cache --clear
```

Metro cache is often stale after rebuilds. This is safe to run automatically.

### Step 5: Verify Resolution

```bash
# Try starting Metro again
npx nx start {app-name} --reset-cache --clear

# If still failing, check exact error path
# Metro terminal shows: "from /path/to/file"
# Check if library path is correct
```

### Step 6: Troubleshooting Specific Issues

**Issue A**: "Module name mapped to different path"
```bash
# Check if library export path matches tsconfig
cat dist/libs/@your-org/[lib]/package.json
# Check "main" field matches

cat tsconfig.json
# Check path points to correct location
```

**Issue B**: "Metro resolver can't find module"
```bash
# Check sourceExts in metro.config.js
grep sourceExts metro.config.js
# Should include: ts, tsx, js, jsx, cjs, mjs

# Verify workspace resolution
grep nodeModulesPaths metro.config.js
```

**Issue C**: "Wrong projectRoot configured"
```bash
# Verify metro.config.js has correct root
grep "projectRoot:" metro.config.js
# Should point to workspace root, not app directory
```

---

## Workflow B: Test Configuration Debugging

**When to Use**: "Test suite failed to run" errors

### Step 1: Capture Error Details

Ask user: **"What's the exact error message from Jest?"**

Common errors:
- "Cannot find module 'X'"
- "ReferenceError: expect is not defined"
- "TypeError: Cannot read property of undefined"

### Step 2: Verify Jest Configuration

```bash
# Check jest.config.ts exists
ls apps/{app-name}/jest.config.ts

# Check required fields
grep -E "preset|setupFilesAfterEnv|transform|moduleNameMapper" apps/{app-name}/jest.config.ts
```

**Required jest.config.ts fields**:
```javascript
{
  preset: 'react-native',                          // ✅ REQUIRED
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'], // ✅ REQUIRED
  transform: {
    '^.+.(js|ts|tsx)$': ['babel-jest', {...}]     // ✅ REQUIRED
  },
  moduleNameMapper: {
    '\\.svg$': '@nx/react-native/plugins/jest/svg-mock' // ✅ For SVG files
  }
}
```

### Step 3: Verify Test Setup File

```bash
# Check if test-setup.ts exists
ls apps/{app-name}/src/test-setup.ts

# Check if referenced in jest.config.ts
grep "test-setup.ts" apps/{app-name}/jest.config.ts
```

**test-setup.ts should contain**:
```typescript
import '@testing-library/jest-native/extend-expect';
// Global mocks for Expo modules
jest.mock('expo-secure-store');
jest.mock('@react-native-async-storage/async-storage');
// ... other global mocks
```

### Step 4: Verify Babel Configuration

```bash
# Check .babelrc.js exists
ls apps/{app-name}/.babelrc.js

# Check required presets
grep -E "@babel/preset-react|@babel/preset-typescript" apps/{app-name}/.babelrc.js
```

**Required .babelrc.js presets**:
```javascript
module.exports = {
  presets: [
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
    'expo'
  ],
  plugins: [
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    '@babel/plugin-proposal-class-properties'
  ]
}
```

### Step 5: Fix Configuration Issues

**Issue A**: test-setup.ts missing
```bash
# Create minimal test-setup.ts
cat > apps/{app-name}/src/test-setup.ts << 'EOF'
import '@testing-library/jest-native/extend-expect';
EOF
```

**Issue B**: jest.config.ts missing setupFilesAfterEnv
```bash
# Update jest.config.ts to include:
setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts']
```

**Issue C**: Babel presets missing
```bash
# Install missing presets
npm install --save-dev @babel/preset-react @babel/preset-typescript

# Update .babelrc.js with presets
```

### Step 6: Re-run Test

```bash
npx nx test {app-name} --testNamePattern="[test name]" --no-coverage
```

### Step 7: If Still Failing

Ask user: **"Can you run this and show me the error?"**
```bash
npx nx test {app-name} --no-coverage --verbose
```

Check for:
- TypeScript compilation errors
- Import resolution errors
- Missing babel plugins

---

## Workflow C: Mock Configuration Debugging

**When to Use**: Mock-related errors like "Cannot read property of undefined"

### Step 1: Locate Mock Declaration

Ask user: **"Show me the mock declaration in your test file"**

Look for:
```typescript
jest.mock('module-path', () => ({
  // mock implementation
}));
```

### Step 2: Verify Mock Order

```bash
# Check if jest.mock appears BEFORE imports
grep -n "jest.mock\|import.*from" test-file.spec.tsx | head -10

# jest.mock line numbers should be LOWER than import line numbers
# If jest.mock comes after import, that's the problem!
```

**Example WRONG order**:
```typescript
// ❌ WRONG
import { myFunction } from './{module-name}';
jest.mock('./{module-name}', () => ({ myFunction: jest.fn() }));
```

**Example CORRECT order**:
```typescript
// ✅ CORRECT
jest.mock('./{module-name}', () => ({ myFunction: jest.fn() }));
import { myFunction } from './{module-name}';
```

### Step 3: Verify Mock Completeness

```typescript
// Identify what the test uses from the module
grep "mockFunction\|mockValue\|mockComponent" test-file.spec.tsx

// Check if mock provides all these
grep -A 20 "jest.mock" test-file.spec.tsx | grep "mockFunction\|mockValue\|mockComponent"
```

**Common Incomplete Mock**:
```typescript
// ❌ INCOMPLETE - only exports one function
jest.mock('api', () => ({
  fetchUser: jest.fn()
}));

// ✅ COMPLETE - exports all used functions
jest.mock('api', () => ({
  fetchUser: jest.fn(() => Promise.resolve({ id: 1, name: 'Test' })),
  updateUser: jest.fn(() => Promise.resolve({})),
  deleteUser: jest.fn(() => Promise.resolve({}))
}));
```

### Step 4: Check for Duplicate Mocks

```bash
# Find all mocks for the same module
grep -r "jest.mock.*api" apps/{app-name}/

# If found in multiple places, consolidate into one
```

**Issue: Duplicate mocks**:
```typescript
// ❌ WRONG - Multiple mocks for same module (last one wins!)
jest.mock('api', () => ({ fetchUser: jest.fn() }));
jest.mock('api', () => ({ updateUser: jest.fn() })); // This overwrites first!

// ✅ CORRECT - Single comprehensive mock
jest.mock('api', () => ({
  fetchUser: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn()
}));
```

### Step 5: Verify Mock Return Type

```typescript
// For each function in the mock, verify return type matches usage

// If function is async, mock must return Promise:
jest.mock('api', () => ({
  fetchUser: jest.fn(() => Promise.resolve({ id: 1 })) // ✅ Returns Promise
}));

// If function returns object, mock must return that object:
jest.mock('context', () => ({
  useTheme: jest.fn(() => ({ theme: 'light', toggle: jest.fn() })) // ✅ Returns object
}));

// If function returns React component, mock must return component:
jest.mock('components/Button', () =>
  jest.fn(({ children }) => <div testID="button">{children}</div>) // ✅ Returns JSX
);
```

### Step 6: Check for Circular Dependencies

```typescript
// The mock file shouldn't import from the test file
// The test file shouldn't import from the mocked module's internals

// Common issue:
jest.mock('./{service-name}', () => {
  const { SomeClass } = require('./{service-name}'); // ❌ Creates circular dependency!
  return { myFunction: jest.fn() };
});
```

**Fix**:
```typescript
jest.mock('./{service-name}', () => ({
  myFunction: jest.fn(() => 'mocked'), // ✅ No circular dependency
  SomeClass: class MockClass {}
}));
```

### Step 7: Test Mock Works

Create a minimal test to verify mock:
```typescript
it('should verify mock works', () => {
  const mockFn = jest.fn(() => 'mocked');
  expect(mockFn()).toBe('mocked');
  expect(mockFn).toHaveBeenCalled();
});
```

If this test fails, mock itself is broken.

### Step 8: Verify Mock Reset Between Tests

```typescript
beforeEach(() => {
  jest.clearAllMocks(); // Reset call counts
});
```

Without this, mock state from one test affects the next.

---

## Workflow D: Platform Separation Validation

**When to Use**: "Not available in mobile environment" or server import in client

### Step 1: Identify Test Type

Ask user: **"Is this a client test or integration test?"**

- **Client test**: `.spec.tsx` or `.spec.ts` in component/service directory
- **Integration test**: `.integration.spec.ts` in special test directory

### Step 2: Scan for Problematic Imports

```bash
# Find all @{project} imports
grep -n "@{project}" test-file.spec.tsx

# Check each one for /client suffix or server-only packages
```

**Correct Client Imports**:
```typescript
// ✅ Client tests must use /client imports
import { decodeToken, isTokenExpired } from '@your-org/auth-lib/client';
import { logger } from '@your-org/logging-lib/client';
import { validateEmail } from '@your-org/shared-utils/client';
import { getDeviceInfo } from '@your-org/shared-utils/client';
```

**Wrong Client Imports**:
```typescript
// ❌ Client tests CANNOT use these
import { hashPassword, generateTokenPair } from '@your-org/auth-lib'; // Missing /client
import { logger } from '@your-org/logging-lib'; // Missing /client
import bcryptjs from 'bcryptjs'; // ❌ Node.js only
import jwt from 'jsonwebtoken'; // ❌ Node.js only
```

### Step 3: Check for Server-Only Functions

```bash
# Look for dangerous function names
grep -n "hashPassword\|verifyAccessToken\|generateTokenPair\|encryptData\|decryptData" test-file.spec.tsx
```

These NEVER appear in client code:
- `hashPassword()` - bcryptjs based
- `generateTokenPair()` - JWT signing
- `verifyAccessToken()` - JWT verification
- `encryptData()` - AES encryption
- `decryptData()` - AES decryption

### Step 4: Create Import Fix Mapping

Build a table of fixes needed:
```
Current Import                 → Correct Import
────────────────────────────────────────────────────
@your-org/auth-lib       → @your-org/auth-lib/client
@your-org/logging-lib    → @your-org/logging-lib/client
@your-org/shared-utils   → @your-org/shared-utils/client (if device/ui functions)
bcryptjs                       → Remove (server-only)
jsonwebtoken                   → Remove (server-only)
```

### Step 5: Apply Fixes

**For automated fixing** (ask confirmation):
```typescript
// Find and replace in test file
// OLD: import { func } from '@your-org/auth-lib'
// NEW: import { decodeToken } from '@your-org/auth-lib/client'
```

**For manual review** (if uncertain):
```
Ask user: "Should function X be removed (server-only) or changed to /client import?"
```

### Step 6: Verify Imports Work

```bash
# Run TypeScript type check
npx tsc --noEmit

# Run test to verify imports resolve
npx nx test {app-name} --testNamePattern="[test name]" --no-coverage
```

### Step 7: Check ESLint Enforcement

If this happens repeatedly, ESLint should catch it:
```bash
# Run ESLint on test file
npx nx lint {app-name} --files="test-file.spec.tsx"

# Should show error like:
# "Don't import from server-only library in client code"
```

---

## Workflow E: Component Rendering Debugging

**When to Use**: "Invariant Violation" or rendering-related errors

### Step 1: Understand the Component

Ask user: **"What component are you trying to render/test?"**

Get:
- Component file path
- Component name
- Expected props

### Step 2: Verify Component Import

```typescript
// Check import path is correct
import { MyComponent } from './{component-name}';

// Verify file exists
ls [path-to-component]/{component-name}.tsx

// Verify component is exported
grep "export.*MyComponent" [path-to-component]/{component-name}.tsx
```

### Step 3: Check for Component Mock

```bash
# Search for mock in test file
grep -n "jest.mock.*{component-name}" test-file.spec.tsx

# If found, verify mock returns valid React element:
jest.mock('./{component-name}', () => ({
  MyComponent: jest.fn(({ children }) => <div>{children}</div>) // ✅ Valid
}));
```

### Step 4: Verify Required Props

```typescript
// Check component signature
function MyComponent({ prop1, prop2 }: Props) { ... }

// Verify test provides all required props
const component = render(<MyComponent prop1="value" prop2="value" />);
// If prop2 missing and it's required → test will fail
```

**Common Issues**:
```typescript
// ❌ WRONG - Missing required prop
render(<MyComponent prop1="value" />);

// ✅ CORRECT - All required props provided
render(<MyComponent prop1="value" prop2="value" />);
```

### Step 5: Test Basic Rendering

```typescript
it('should render component', () => {
  const { debug } = render(
    <MyComponent prop1="value" prop2="value" />
  );

  // Print component tree to inspect
  debug();

  // Check component rendered without error
  expect(debug()).toBeDefined();
});
```

This tells you if component renders at all.

### Step 6: Check for Theme Provider

Some components need to be wrapped in ThemeProvider:

```typescript
// ❌ WRONG - Component needs provider but not provided
render(<MyComponent />);

// ✅ CORRECT - Component wrapped in required provider
render(
  <ThemeProvider>
    <MyComponent />
  </ThemeProvider>
);
```

**Check if needed**:
```bash
# Look for useTheme in component
grep "useTheme\|useThemeContext" [component-path]

# If found, provider is required
```

### Step 7: Check Mock Factory Return

If component is mocked, verify mock factory:

```typescript
// ❌ WRONG - Mock doesn't return component
jest.mock('./{component-name}', () => ({
  MyComponent: { /* plain object, not component */ }
}));

// ✅ CORRECT - Mock returns React component (function)
jest.mock('./{component-name}', () => ({
  MyComponent: jest.fn(({ children, ...props }) => (
    <div data-testid="mock-component" {...props}>{children}</div>
  ))
}));
```

### Step 8: Use Debug Output

```typescript
const { debug, UNSAFE_getByType } = render(<MyComponent />);

// Print entire component tree
console.log(debug());

// Get specific elements by type (React Native)
const text = UNSAFE_getByType('Text');
expect(text).toBeTruthy();
```

---

## Workflow F: Async Timing Debugging

**When to Use**: Timeout errors or flaky tests

### Step 1: Identify Async Operations

Ask user: **"What async operation is the test waiting for?"**

Examples:
- API call (fetch, service method)
- State update (hook, context)
- Animation (completion)
- Promise resolution

### Step 2: Check for await/waitFor

```bash
# Find async operations in test
grep -n "fetchData\|updateUser\|setState\|dispatch" test-file.spec.tsx

# Check if they're awaited
grep -B 5 "fetchData" test-file.spec.tsx | grep "await\|waitFor"
```

**Wrong - No wait**:
```typescript
// ❌ WRONG - API call made but not awaited
render(<Component />);
expect(getByTestId('result')).toBe('loaded'); // Fails! Data not loaded yet
```

**Right - With wait**:
```typescript
// ✅ CORRECT - Wait for element to appear after async update
render(<Component />);
await waitFor(() => {
  expect(getByTestId('result')).toBe('loaded');
});
```

### Step 3: Check Timeout Value

```typescript
// Default timeout is 1000ms
await waitFor(() => { ... });

// Can increase timeout for slower operations
await waitFor(() => { ... }, { timeout: 5000 });

// For very slow operations
await waitFor(() => { ... }, { timeout: 10000 });
```

### Step 4: Verify Mock Promise

If mocking async function, verify it returns Promise:

```typescript
// ❌ WRONG - Returns value, not Promise
jest.mock('api', () => ({
  fetchUser: jest.fn(() => ({ id: 1, name: 'Test' }))
}));

// ✅ CORRECT - Returns Promise
jest.mock('api', () => ({
  fetchUser: jest.fn(() => Promise.resolve({ id: 1, name: 'Test' }))
}));
```

### Step 5: Check State Update Trigger

```typescript
// Verify component updates state after async operation
function Component() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchData().then(result => {
      setData(result); // Must call setData!
    });
  }, []);

  return data ? <div>{data}</div> : <div>Loading...</div>;
}
```

If component never calls `setData()`, state won't update.

### Step 6: Add Test Cleanup

Prevent race conditions and flakiness:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});
```

### Step 7: Test Flakiness

If test is flaky (sometimes passes, sometimes fails):

```bash
# Run test multiple times
for i in {1..5}; do
  npx nx test {app-name} --testNamePattern="flaky-test" --no-coverage
done

# If sometimes fails, it's a timing issue
```

**Common Flakiness Fixes**:
1. Add `jest.clearAllMocks()` in `beforeEach`
2. Increase timeout
3. Add `await waitFor()` around assertions
4. Ensure proper cleanup in `afterEach`

### Step 8: Debug Async Flow

```typescript
// Add debug logs to understand flow
it('should handle async operation', async () => {
  console.log('1. Before render');
  const { getByTestId } = render(<Component />);

  console.log('2. After render, before waitFor');
  await waitFor(() => {
    console.log('3. Inside waitFor');
    expect(getByTestId('result')).toBeTruthy();
  });

  console.log('4. After waitFor');
});

// Run with: npx nx test {app-name} --testNamePattern="..." --no-coverage
```

Check console output to see where delay occurs.

---

## Summary: When to Use Each Workflow

| Error Type | Workflow | First Step |
|-----------|----------|-----------|
| Unable to resolve module | Workflow A | Check if library built |
| Test suite failed to run | Workflow B | Verify jest.config.ts |
| Cannot read property of undefined | Workflow C | Check mock order |
| Not available in mobile | Workflow D | Check for /client imports |
| Invariant Violation | Workflow E | Verify component mock |
| Timeout / Unable to find element | Workflow F | Check for await/waitFor |

Most issues are solved by the first 2-3 steps in each workflow.
