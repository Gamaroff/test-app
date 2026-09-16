# Error Patterns Reference

A comprehensive guide to identifying and debugging common React Native errors in your project.

## Metro Bundler Errors

### Pattern: Module Resolution Failure

**Error Messages**:
```
Unable to resolve module @your-org/auth-lib from /path/to/app
Metro bundler failed: Cannot find module '@your-org/auth-lib'
Module not found: Can't resolve '@your-org/auth-lib'
```

**Root Causes**:
- Library not built to `dist/` directory
- Metro cache stale (still pointing to old build)
- `metro.config.js` projectRoot incorrect
- `tsconfig.json` paths not updated
- Library build failed silently

**Quick Diagnosis**:
```bash
# Check if library built
ls dist/libs/@your-org/[library-name]/

# Check metro config
grep projectRoot metro.config.js

# Check tsconfig paths
grep "@{project}" tsconfig.json
```

**Solution Priority**:
1. Auto-clear Metro cache: `--reset-cache`
2. Rebuild libraries: `npm run build:libraries`
3. Verify tsconfig.json paths
4. Check metro.config.js configuration

---

### Pattern: SVG Module Not Found

**Error Messages**:
```
Unable to resolve module 'components/icon.svg'
Cannot resolve extension .svg
```

**Root Cause**:
- SVG transformer not configured in metro.config.js
- SVG transformer not installed

**Quick Diagnosis**:
```bash
# Check metro config has SVG transformer
grep "svg-transformer" metro.config.js

# Check babel/svg plugin installed
npm list react-native-svg-transformer
```

**Solution**:
1. Ensure `metro.config.js` includes SVG transformer config
2. Verify `transformer: { babelTransformerPath: ... }`
3. Clear Metro cache if recently added

---

## Jest Test Configuration Errors

### Pattern: Test Suite Failed to Run

**Error Messages**:
```
Test suite failed to run
TypeError: Cannot read property 'X' of undefined (in setup)
ReferenceError: expect is not defined
Transform failed for module
```

**Root Causes**:
- `test-setup.ts` missing or not referenced in jest.config.ts
- Jest configuration missing required fields
- Babel transformer not configured
- TypeScript compilation failing

**Quick Diagnosis**:
```bash
# Check test-setup.ts exists
ls apps/{app-name}/src/test-setup.ts

# Check jest.config.ts setupFilesAfterEnv
grep setupFilesAfterEnv apps/{app-name}/jest.config.ts

# Check jest preset
grep preset apps/{app-name}/jest.config.ts
```

**Solution Priority**:
1. Verify `jest.config.ts` has `preset: 'react-native'`
2. Verify `setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts']`
3. Create/update `test-setup.ts` if missing
4. Verify `transform` configuration includes babel-jest
5. Check `.babelrc.js` exists and is valid

---

### Pattern: Module Transform Failed

**Error Messages**:
```
Transform failed for module
SyntaxError: Unexpected token ...
Could not find babel config
```

**Root Cause**:
- `.babelrc.js` missing or misconfigured
- Babel plugins not installed
- TypeScript preset missing
- React preset missing

**Quick Diagnosis**:
```bash
# Check babel config exists
ls -la apps/{app-name}/.babelrc.js

# Check presets installed
npm list @babel/preset-react @babel/preset-typescript

# Check config syntax
node -c apps/{app-name}/.babelrc.js
```

**Solution**:
1. Verify `.babelrc.js` exists with correct presets
2. Ensure babel plugins installed:
   - `@babel/preset-react`
   - `@babel/preset-typescript`
   - `@babel/plugin-proposal-decorators`
3. Rebuild Metro cache

---

## Mock Configuration Errors

### Pattern: Mock Not Applied / Undefined Property

**Error Messages**:
```
Cannot read property 'mockFunction' of undefined
TypeError: mockValue is not a function
Mock is undefined
```

**Root Cause**:
- `jest.mock()` declared AFTER the import it's trying to mock
- Mock factory doesn't export the required function
- Circular dependency between mock and source
- Module aliasing issue

**Quick Diagnosis**:
```bash
# Check mock order in test file
grep -n "jest.mock\|import.*from" test-file.spec.tsx
# jest.mock should appear BEFORE any imports from mocked module

# Check mock export
grep -A 5 "jest.mock" test-file.spec.tsx
# Verify all used exports are in the mock
```

**Solution Priority**:
1. Move `jest.mock()` calls to top of file (before imports)
2. Ensure mock factory returns all required exports
3. Check for circular dependency between test and module
4. Verify mock factory function is correct

---

### Pattern: Duplicate or Conflicting Mocks

**Error Messages**:
```
Mock is being overwritten
Mock implementation doesn't match expectations
Unexpected mock call
```

**Root Cause**:
- Multiple `jest.mock()` for same module (last one wins)
- Mock declared in both test file and test-setup.ts
- Mock factory returns incomplete object

**Quick Diagnosis**:
```bash
# Find all mocks for this module
grep -r "jest.mock.*module-name" apps/{app-name}/
# Check if declared in multiple places

# Check test-setup.ts
grep "jest.mock" apps/{app-name}/src/test-setup.ts
```

**Solution**:
1. Find all mock declarations for the module
2. Consolidate into single comprehensive mock
3. Remove duplicates
4. Verify mock is complete (all exports)

---

### Pattern: Mock Return Type Mismatch

**Error Messages**:
```
Expected to be called with ReactNode but got undefined
TypeError: Cannot read property 'map' of undefined
Mock returned wrong type
```

**Root Cause**:
- Mock return value doesn't match expected type
- Async function mock not returning Promise
- Object mock missing required properties
- Component mock not returning React.ReactElement

**Quick Diagnosis**:
```typescript
// In test, check mock return type
const mockFn = jest.fn(() => mockValue);
console.log(typeof mockValue, mockValue); // Verify type and structure

// Compare to expected
expect(mockFn()).toEqual(expectedType); // Type assertion
```

**Solution**:
1. Verify mock return type matches usage
2. For async mocks: ensure return Promise
3. For component mocks: ensure return ReactElement
4. For object mocks: include all required properties

---

## Platform Separation Errors

### Pattern: Server Import in Client Code

**Error Messages**:
```
Cannot find module 'bcryptjs'
Cannot find module 'jsonwebtoken'
Cannot find module 'winston'
Cannot find module '@your-org/auth-lib' (should use /client)
```

**Root Cause**:
- Importing from wrong library path (missing `/client`)
- Using server-only functions (hashPassword, verifyAccessToken, encryptData)
- Test importing server utilities instead of client
- Direct Node.js package import in React Native code

**Quick Diagnosis**:
```bash
# Find problematic imports
grep -n "from '@your-org/" test-file.spec.tsx
# Should see /client suffix for client imports

grep -n "hashPassword\|verifyAccessToken\|encryptData\|bcryptjs\|jsonwebtoken\|winston" test-file.spec.tsx
# These should not appear in client tests
```

**Correct Import Mapping**:
```typescript
// ❌ WRONG (client test)
import { hashPassword, verifyAccessToken } from '@your-org/auth-lib';
import { logger } from '@your-org/logging-lib';

// ✅ CORRECT (client test)
import { decodeToken } from '@your-org/auth-lib/client';
import { logger } from '@your-org/logging-lib/client';
import { isTokenExpired } from '@your-org/auth-lib/client';

// ✅ OK (integration test)
import { hashPassword, verifyAccessToken } from '@your-org/auth-lib';
import { logger } from '@your-org/logging-lib';
```

**Solution**:
1. Identify if test is client (.spec.tsx) or integration (.integration.spec.ts)
2. For client tests: Change all imports to `/client` suffix
3. For integration tests: Use default imports
4. Remove server-only function calls from client tests

---

## Component Rendering Errors

### Pattern: Invariant Violation

**Error Messages**:
```
Invariant Violation: React.createElement: type is invalid
Element type is invalid: expected a string (for built-in components) or a class/function
```

**Root Cause**:
- Component mock returns invalid value (undefined, null, plain object)
- Component not imported correctly
- Component mock factory doesn't return React component
- Circular import between component and mock

**Quick Diagnosis**:
```typescript
// Check mock return value
jest.mock('./{component-name}', () => ({
  MyComponent: /* what does this return? Should be React component */
}));

// Verify it's a valid React element
const component = MyComponent;
console.log(typeof component); // Should be 'function' or React.ReactElement
```

**Solution**:
1. Ensure mock returns valid React component (function)
2. For functional components: return function that accepts props
3. For hooks: wrap in function that returns JSX
4. Verify component is properly imported

---

### Pattern: Element Not Found in DOM

**Error Messages**:
```
Unable to find element with testID 'submit-button'
Unable to find an element matching selector
getByTestId: Unable to find element
```

**Root Cause**:
- Element not rendered (conditional rendering, state not updated)
- Wrong testID name
- Element rendered in different component
- Async rendering not awaited
- Wrong query function used

**Quick Diagnosis**:
```typescript
// Use debug to see rendered DOM
const { debug } = render(<Component />);
debug(); // Print entire component tree

// Check if element exists
const { queryByTestId } = render(<Component />); // Returns null if not found
expect(queryByTestId('submit-button')).toBeNull(); // Verify it's not there
```

**Solution**:
1. Render component and use `debug()` to inspect DOM
2. Verify correct testID is used
3. If conditional: ensure condition is met
4. If async: wrap in `waitFor()` before querying
5. Verify element is in expected parent component

---

### Pattern: Wrong Query Function

**Error Messages**:
```
getByRole: Unable to find accessible element
queryByText: Unable to find element
findByTestId: Element not found (timeout)
```

**Root Cause**:
- Using wrong query function for element type
- Wrong text/role specified
- Element not accessible (hidden, aria-hidden)
- Element rendered in different DOM tree (portal)

**Correct Query Patterns**:
```typescript
// By Test ID (most reliable for React Native)
getByTestId('button-id') // Throws if not found
queryByTestId('button-id') // Returns null if not found
findByTestId('button-id') // Async, waits for element

// By Text
getByText('Click me') // Exact text match
getByText(/click/i) // Regex match (case-insensitive)

// By Role (accessibility-based)
getByRole('button', { name: 'Submit' })
getByRole('heading', { name: 'Title' })

// By Placeholder
getByPlaceholderText('Enter name')
```

**Solution**:
1. Use appropriate query function for element type
2. Verify query parameters (testID, text, role) match actual element
3. Use regex for partial matches
4. Use async queries (`findBy`) for elements that appear after render

---

## Async Timing Errors

### Pattern: Timeout - Async Callback Not Invoked

**Error Messages**:
```
Timeout - Async callback was not invoked within the 5000 ms timeout specified
Expected mock function to have been called after timeout
Element not found after waiting (timeout)
```

**Root Cause**:
- Missing `await` before async operation
- Async operation doesn't complete within 5000ms
- Mock promise never resolves
- Async state update doesn't trigger
- Wrong expectation timing (checking too early)

**Quick Diagnosis**:
```bash
# Check for await statements in test
grep -n "await\|waitFor\|findBy" test-file.spec.tsx
# Look for async operations without await

# Check setTimeout or delays
grep -n "setTimeout\|delay" test-file.spec.tsx
# May need longer timeout
```

**Solution Priority**:
1. Add `await waitFor()` around assertions that depend on async updates
2. Increase timeout if operation takes longer:
   ```typescript
   await waitFor(() => {
     expect(element).toBeTruthy();
   }, { timeout: 10000 }); // 10 second timeout
   ```
3. Verify mock promise resolves:
   ```typescript
   jest.mock('api', () => ({
     fetchData: jest.fn(() => Promise.resolve(data)) // Must return Promise
   }));
   ```
4. Trigger state update in mock:
   ```typescript
   jest.mock('hook', () => ({
     useData: () => ({ data, loading: false }) // Don't leave loading=true
   }));
   ```

---

### Pattern: Flaky Tests (Sometimes Pass, Sometimes Fail)

**Error Messages**:
```
Expected X but got undefined (inconsistent)
Unable to find element (occasionally)
Test passes when run alone, fails in suite
```

**Root Cause**:
- Race condition between test and state update
- Insufficient timeout for async operation
- Test cleanup not isolating tests
- Global state leaking between tests
- Mock not reset between tests

**Quick Diagnosis**:
```bash
# Run test multiple times
for i in {1..5}; do npx nx test {app-name} --testNamePattern="flaky-test"; done
# If sometimes pass, it's flaky

# Run in isolation
npx nx test {app-name} --testNamePattern="flaky-test"
# vs with other tests
npx nx test {app-name}
```

**Solution**:
1. Add `beforeEach(() => jest.clearAllMocks())`
2. Increase timeout for flaky async operations
3. Ensure cleanup in `afterEach`:
   ```typescript
   afterEach(() => {
     jest.clearAllMocks();
     jest.restoreAllMocks();
   });
   ```
4. Verify no global state persists between tests
5. Check for unresolved promises

---

### Pattern: Test Takes Too Long

**Error Messages**:
```
SLOW TEST: [...test name...] took 45678 ms
Test timeout exceeded
```

**Root Cause**:
- Timeout set too high (waiting for event that never comes)
- Infinite loop or race condition
- Multiple timeouts stacking
- Slow mock implementation

**Solution**:
1. Investigate what operation is slow
2. Use faster alternatives (mocks instead of real operations)
3. Remove unnecessary `waitFor` if element renders immediately
4. Check for infinite loops in component logic
5. Profile mock implementation (no expensive operations)

---

## Type Errors

### Pattern: Type Mismatch in Mock

**Error Messages**:
```
Argument of type 'undefined' is not assignable to parameter of type 'string'
Expected mock to return X but got Y
Property 'X' does not exist on type
```

**Root Cause**:
- Mock return type doesn't match function signature
- TypeScript not catching invalid mock
- Generic type parameters not specified
- Async mock not properly typed

**Quick Diagnosis**:
```typescript
// Check mock type matches usage
const mockFn = jest.fn<ReturnType>((arg: ParamType) => mockValue);
// TypeScript should catch type mismatch

// Check mock return type
jest.mock('module', () => ({
  fn: jest.fn(() => expectedType) // TypeScript validates this
}));
```

**Solution**:
1. Add explicit return type to mock:
   ```typescript
   jest.fn<Promise<UserData>>(() => Promise.resolve(mockData))
   ```
2. Match mock return type to function signature
3. Verify generic type parameters in mock
4. Use `as const` for type-safe mock data

---

## Summary Table: Quick Reference

| Symptom | Category | First Check | Quick Fix |
|---------|----------|------------|-----------|
| "Unable to resolve module" | Metro | Library built? | Auto-rebuild + clear cache |
| "Test suite failed to run" | Config | jest.config.ts valid? | Verify test-setup.ts |
| "Cannot read X of undefined" | Mock | Mock declared before import? | Move jest.mock() to top |
| "Password hashing not available" | Platform | Using `/client` import? | Change to /client suffix |
| "Element type is invalid" | Component | Mock returns React element? | Fix mock return value |
| "Unable to find element" | Rendering | Element rendered? | Add waitFor() |
| "Timeout - async callback" | Async | Have await/waitFor? | Add await/waitFor |
| "Test flaky" | Timing | Cleanup between tests? | Add beforeEach/afterEach |

---

## How to Use This Reference

1. **Copy error message** from test output
2. **Find matching pattern** in this document
3. **Read "Root Causes"** to understand why it happened
4. **Try "Quick Diagnosis"** to verify root cause
5. **Apply "Solution Priority"** in order
6. **Verify fix** by re-running test

Most errors can be fixed by addressing the top 2-3 solutions in the priority list.
