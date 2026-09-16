# Mock Patterns Reference

Correct and incorrect mock patterns for React Native testing in your project.

## Core Principles

1. **Mock declarations must come BEFORE imports** of the mocked module
2. **Mocks must export all used functions/components** from the mocked module
3. **Return types must match** how they're used in tests
4. **Async functions must return Promises**
5. **No duplicate mocks** for the same module
6. **Test setup.ts can handle global mocks** (only if truly global)

---

## Pattern 1: Mocking API Services

### Scenario
Service module with multiple async methods that fetch data from API.

```typescript
// services/api/user-service.ts
export class UserService {
  async fetchUser(id: string): Promise<User> {
    // Real API call
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    // Real API call
  }

  async deleteUser(id: string): Promise<void> {
    // Real API call
  }
}
```

### ❌ WRONG Pattern 1: Incomplete Mock

```typescript
// tests/user-service.spec.ts
jest.mock('../services/api/user-service'); // ❌ Mock only module

import { UserService } from '../services/api/user-service';

it('should fetch user', async () => {
  const service = new UserService();
  const user = await service.fetchUser('123');
  // ❌ FAILS: UserService is mocked but implementation missing
});
```

### ❌ WRONG Pattern 2: Mock After Import

```typescript
import { UserService } from '../services/api/user-service'; // ❌ Import before mock!

jest.mock('../services/api/user-service', () => ({ // ❌ Too late!
  UserService: jest.fn()
}));

it('should fetch user', async () => {
  // ❌ Mock not applied
});
```

### ❌ WRONG Pattern 3: Mock with Wrong Return Type

```typescript
jest.mock('../services/api/user-service', () => ({
  UserService: jest.fn().mockReturnValue({
    fetchUser: jest.fn(() => ({ id: '123', name: 'Test' })) // ❌ Returns value, not Promise!
  })
}));

it('should fetch user', async () => {
  const service = new UserService();
  const user = await service.fetchUser('123'); // ❌ FAILS: Can't await non-Promise
});
```

### ✅ CORRECT Pattern: Complete Mock with Promises

```typescript
// tests/user-service.spec.ts
jest.mock('../services/api/user-service', () => ({
  UserService: jest.fn().mockImplementation(() => ({
    fetchUser: jest.fn(
      (id: string) => Promise.resolve({
        id,
        name: 'Test User',
        email: 'test@example.com'
      })
    ),
    updateUser: jest.fn(
      (id: string, data: Partial<User>) => Promise.resolve({
        id,
        ...data,
        name: 'Test User'
      })
    ),
    deleteUser: jest.fn(
      (id: string) => Promise.resolve()
    )
  }))
}));

import { UserService } from '../services/api/user-service';

describe('UserService', () => {
  it('should fetch user', async () => {
    const service = new UserService();
    const user = await service.fetchUser('123');
    expect(user.id).toBe('123');
    expect(user.name).toBe('Test User');
  });

  it('should update user', async () => {
    const service = new UserService();
    const user = await service.updateUser('123', { name: 'Updated' });
    expect(user.name).toBe('Updated');
  });

  beforeEach(() => {
    jest.clearAllMocks(); // Reset for each test
  });
});
```

**Key Points**:
- ✅ Mock declared BEFORE import
- ✅ All methods exported
- ✅ Async methods return `Promise.resolve()`
- ✅ Return values match expected types
- ✅ `jest.clearAllMocks()` in `beforeEach`

---

## Pattern 2: Mocking React Context

### Scenario
Context provider that supplies theme and authentication data to components.

```typescript
// contexts/auth-context.tsx
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

### ❌ WRONG Pattern: Context Mock Missing Hook

```typescript
jest.mock('../contexts/auth-context', () => ({
  AuthContext: jest.fn(),
  // ❌ useAuth not mocked!
}));

it('should get auth context', () => {
  const { useAuth } = require('../contexts/auth-context');
  const auth = useAuth(); // ❌ FAILS: useAuth is not mocked
});
```

### ❌ WRONG Pattern: Hook Returns Wrong Type

```typescript
jest.mock('../contexts/auth-context', () => ({
  useAuth: jest.fn(() => null) // ❌ Returns null, should return object!
}));

it('should use auth hook', () => {
  const { useAuth } = require('../contexts/auth-context');
  const { user } = useAuth();
  expect(user).toBeDefined(); // ❌ FAILS: useAuth() is null
});
```

### ✅ CORRECT Pattern: Complete Context Mock

```typescript
jest.mock('../contexts/auth-context', () => ({
  AuthContext: jest.fn(),
  useAuth: jest.fn(() => ({
    user: {
      id: '123',
      handle: '@testuser',
      email: 'test@example.com'
    },
    isAuthenticated: true,
    login: jest.fn(() => Promise.resolve()),
    logout: jest.fn()
  }))
}));

import { useAuth } from '../contexts/auth-context';

describe('useAuth hook', () => {
  it('should return authenticated user', () => {
    const { user, isAuthenticated } = useAuth();
    expect(user.id).toBe('123');
    expect(isAuthenticated).toBe(true);
  });

  it('should have login function', () => {
    const { login } = useAuth();
    expect(typeof login).toBe('function');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });
});
```

**Key Points**:
- ✅ Mock both context AND hook
- ✅ Hook returns complete object with all properties
- ✅ Async functions return Promises
- ✅ Mock can be overridden per test if needed:
  ```typescript
  it('should handle logged out state', () => {
    const { useAuth } = require('../contexts/auth-context');
    useAuth.mockReturnValue({
      user: null,
      isAuthenticated: false
    });
  });
  ```

---

## Pattern 3: Mocking React Components

### Scenario
Component that's complex and slows down tests, or has platform-specific rendering.

```typescript
// components/Button.tsx
interface ButtonProps {
  onPress: () => void;
  title: string;
  disabled?: boolean;
}

export function Button({ onPress, title, disabled }: ButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
}
```

### ❌ WRONG Pattern: Component Mock Not Callable

```typescript
jest.mock('../components/Button', () => ({
  Button: { /* just an object */ }
}));

it('should render button', () => {
  const { render } = require('@testing-library/react-native');
  render(<Button onPress={jest.fn()} title="Click" />); // ❌ FAILS: Button not a component
});
```

### ❌ WRONG Pattern: Component Mock Missing Props

```typescript
jest.mock('../components/Button', () => ({
  Button: jest.fn(() => <div>Mocked Button</div>)
  // ❌ Not capturing or using props!
}));

it('should pass props to button', () => {
  const mockOnPress = jest.fn();
  const { getByText } = render(<Button onPress={mockOnPress} title="Click" />);

  fireEvent.press(getByText('Click'));
  expect(mockOnPress).not.toHaveBeenCalled(); // ❌ FAILS: Mock didn't use props
});
```

### ✅ CORRECT Pattern: Component Mock with Props

```typescript
jest.mock('../components/Button', () =>
  jest.fn(({ onPress, title, disabled }: ButtonProps) => (
    <TouchableOpacity
      testID="mock-button"
      onPress={onPress}
      disabled={disabled}
    >
      <Text>{title}</Text>
    </TouchableOpacity>
  ))
);

import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '../components/Button';

describe('Button component', () => {
  it('should call onPress when clicked', () => {
    const mockOnPress = jest.fn();
    const { getByTestId } = render(
      <Button onPress={mockOnPress} title="Click Me" />
    );

    fireEvent.press(getByTestId('mock-button'));
    expect(mockOnPress).toHaveBeenCalled();
  });

  it('should be disabled when disabled prop true', () => {
    const { getByTestId } = render(
      <Button onPress={jest.fn()} title="Click" disabled={true} />
    );

    const button = getByTestId('mock-button');
    expect(button.props.disabled).toBe(true);
  });

  it('should render title text', () => {
    const { getByText } = render(
      <Button onPress={jest.fn()} title="Custom Title" />
    );

    expect(getByText('Custom Title')).toBeTruthy();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });
});
```

**Key Points**:
- ✅ Component is a jest.fn() that returns JSX
- ✅ Component captures and uses props
- ✅ Handlers (onPress, etc.) are called through the mock
- ✅ Test verifies handler was called and props passed
- ✅ Mock behavior can be overridden per test

**For Complex Components**:
```typescript
jest.mock('../components/UserProfile', () =>
  jest.fn(({ userId }: UserProfileProps) => (
    <View testID={`profile-${userId}`}>
      <Text>User {userId}</Text>
    </View>
  ))
);

// Test can now verify which user ID was rendered
```

---

## Pattern 4: Mocking Hooks

### Scenario
Custom hook that manages complex state or side effects.

```typescript
// hooks/useUser.ts
interface UseUserResult {
  user: User | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useUser(userId: string): UseUserResult {
  // Real implementation
}
```

### ❌ WRONG Pattern: Hook Mock Not Complete

```typescript
jest.mock('../hooks/useUser', () => ({
  useUser: jest.fn(() => ({
    user: null,
    loading: true
    // ❌ Missing error and refetch!
  }))
}));

it('should have refetch function', () => {
  const { useUser } = require('../hooks/useUser');
  const { refetch } = useUser('123');
  expect(typeof refetch).toBe('function'); // ❌ FAILS: refetch undefined
});
```

### ✅ CORRECT Pattern: Complete Hook Mock

```typescript
jest.mock('../hooks/useUser', () => ({
  useUser: jest.fn((userId: string) => ({
    user: {
      id: userId,
      name: 'Test User',
      email: 'test@example.com'
    },
    loading: false,
    error: null,
    refetch: jest.fn(() => Promise.resolve())
  }))
}));

import { useUser } from '../hooks/useUser';

describe('useUser hook', () => {
  it('should return user data', () => {
    const { user, loading, error } = useUser('123');
    expect(user.id).toBe('123');
    expect(loading).toBe(false);
    expect(error).toBeNull();
  });

  it('should have refetch function', () => {
    const { refetch } = useUser('123');
    expect(typeof refetch).toBe('function');
  });

  it('should allow overriding per test', () => {
    const { useUser: mockUseUser } = require('../hooks/useUser');
    mockUseUser.mockReturnValue({
      user: null,
      loading: true,
      error: null,
      refetch: jest.fn()
    });

    const { loading } = useUser('123');
    expect(loading).toBe(true);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });
});
```

**Key Points**:
- ✅ Mock returns complete object with all properties
- ✅ Can override per test with `mockReturnValue()`
- ✅ Async functions (refetch) return Promises
- ✅ Clear mocks in beforeEach to prevent state leakage

---

## Pattern 5: Mocking Platform-Specific Imports

### Scenario
Code that uses platform-specific modules (AsyncStorage, SecureStore, NetInfo).

```typescript
// services/storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem('auth_token', token);
}
```

### ❌ WRONG Pattern: Not Mocking Platform Module

```typescript
jest.mock('../services/storage'); // ❌ Wrong - storage uses AsyncStorage internally

it('should save token', async () => {
  const result = await saveToken('token123'); // ❌ FAILS: AsyncStorage not mocked
});
```

### ✅ CORRECT Pattern: Mock Platform Module First

```typescript
// Mock platform modules FIRST
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve('stored-value')),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve())
}));

// Then mock the service
jest.mock('../services/storage');

import { saveToken } from '../services/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('Storage service', () => {
  it('should save token using AsyncStorage', async () => {
    await saveToken('token123');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('auth_token', 'token123');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });
});
```

**Mock Order is CRITICAL**:
```typescript
// 1. Mock platform modules first (AsyncStorage, SecureStore, etc.)
jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-secure-store');

// 2. Then mock services that use them
jest.mock('../services/storage');

// 3. Then import what you need to test
import { saveToken } from '../services/storage';
```

---

## Pattern 6: Mocking Shared Library Exports

### Scenario
Using functions from shared libraries (auth-lib, shared-utils, etc.).

```typescript
// components/LoginForm.tsx
import { decodeToken } from '@your-org/auth-lib/client';
import { validateEmail } from '@your-org/shared-utils';

export function LoginForm() {
  // Uses decodeToken and validateEmail
}
```

### ❌ WRONG Pattern: Wrong Library Path

```typescript
jest.mock('@your-org/auth-lib', () => ({ // ❌ Wrong! Should use /client
  decodeToken: jest.fn()
}));
```

### ✅ CORRECT Pattern: Use /client Path

```typescript
jest.mock('@your-org/auth-lib/client', () => ({
  decodeToken: jest.fn((token: string) => ({
    userId: '123',
    handle: '@testuser',
    exp: Math.floor(Date.now() / 1000) + 3600
  }))
}));

jest.mock('@your-org/shared-utils', () => ({
  validateEmail: jest.fn((email: string) => ({
    valid: email.includes('@'),
    errors: []
  }))
}));

import { render, fireEvent } from '@testing-library/react-native';
import { LoginForm } from '../components/LoginForm';
import { decodeToken } from '@your-org/auth-lib/client';
import { validateEmail } from '@your-org/shared-utils';

describe('LoginForm', () => {
  it('should validate email using shared util', () => {
    const { getByTestId } = render(<LoginForm />);

    fireEvent.changeText(getByTestId('email-input'), 'test@example.com');

    expect(validateEmail).toHaveBeenCalledWith('test@example.com');
  });

  it('should decode token on successful login', async () => {
    // Test depends on decodeToken mock
    // ...
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });
});
```

**Library Import Rules**:
```typescript
// Client code (.spec.tsx, .spec.ts for client tests)
✅ @your-org/auth-lib/client
✅ @your-org/logging-lib/client
✅ @your-org/shared-utils/client (for device/ui)
❌ @your-org/auth-lib (missing /client)
❌ @your-org/shared-utils/server (server-only)

// Integration code (.integration.spec.ts)
✅ @your-org/auth-lib (default = server)
✅ @your-org/logging-lib (default = server)
✅ @your-org/shared-utils/server
```

---

## Pattern 7: Global Mocks in test-setup.ts

### Scenario
Mocks that are needed by MANY tests (platform modules, global utilities).

```typescript
// apps/{app-name}/src/test-setup.ts
import '@testing-library/jest-native/extend-expect';

// Global mocks for platform modules
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  clear: jest.fn(() => Promise.resolve())
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve())
}));

// Only put global mocks here!
// Individual test mocks belong in the .spec.ts files
```

### ❌ WRONG Pattern: Too Many Mocks in test-setup.ts

```typescript
// test-setup.ts
// ❌ DON'T put test-specific mocks here
jest.mock('../services/user-service');
jest.mock('../contexts/auth-context');
jest.mock('../components/Button');

// This makes tests interdependent and hard to debug
```

### ✅ CORRECT Pattern: Only Global Platform Mocks

```typescript
// test-setup.ts - ONLY global platform modules
jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-secure-store');
jest.mock('react-native-netinfo');

// Per-test mocks stay in .spec.ts files
// This keeps tests isolated and independent
```

---

## Pattern 8: Testing with Mock Side Effects

### Scenario
Mock needs to behave differently on consecutive calls.

```typescript
// For testing retry logic or state changes
```

### ❌ WRONG Pattern: Static Mock Response

```typescript
jest.mock('api', () => ({
  fetchData: jest.fn(() => Promise.resolve({ data: 'value' }))
  // ❌ Always returns same value - can't test retry/failure scenarios
}));
```

### ✅ CORRECT Pattern: Dynamic Mock with Side Effects

```typescript
jest.mock('api', () => {
  let callCount = 0;
  return {
    fetchData: jest.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({ data: 'success' });
    })
  };
});

import { fetchData } from 'api';

describe('Retry logic', () => {
  it('should retry on failure', async () => {
    // First call fails
    await expect(fetchData()).rejects.toThrow('Network error');

    // Second call succeeds
    const result = await fetchData();
    expect(result.data).toBe('success');
  });

  beforeEach(() => {
    jest.clearAllMocks(); // Reset callCount
  });
});
```

Or use `mockImplementationOnce` for specific test:

```typescript
jest.mock('api', () => ({
  fetchData: jest.fn(() => Promise.resolve({ data: 'default' }))
}));

import { fetchData } from 'api';

describe('Error handling', () => {
  it('should handle fetch error', async () => {
    const { fetchData: mockFetch } = require('api');

    // Override for this test only
    mockFetch.mockRejectedValueOnce(new Error('API unavailable'));

    await expect(fetchData()).rejects.toThrow('API unavailable');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });
});
```

---

## Mock Checklist

Before submitting a test with mocks, verify:

- [ ] All `jest.mock()` calls are at top of file (before imports)
- [ ] Mock exports match what the component/test actually uses
- [ ] Async functions return `Promise.resolve()` or `Promise.reject()`
- [ ] Component mocks accept and use their props
- [ ] Hook mocks return complete object with all properties
- [ ] Platform modules (@react-native/*, expo/*, react-native) are mocked
- [ ] Library imports use correct path (`/client` for client tests)
- [ ] No duplicate mocks for the same module
- [ ] `jest.clearAllMocks()` in `beforeEach()`
- [ ] Test can be run in isolation without affecting others

---

## Common Mock Testing Commands

```bash
# Test just your file to verify mocks work
npx nx test {app-name} --testPathPattern="my-test.spec.tsx" --no-coverage

# Test with verbose output to see mock calls
npx nx test {app-name} --testPathPattern="my-test.spec.tsx" --verbose --no-coverage

# Run multiple times to catch flakiness
for i in {1..5}; do npx nx test {app-name} --testPathPattern="my-test.spec.tsx" --no-coverage; done

# Clear and rebuild mocks
jest.clearAllMocks() // In beforeEach
jest.restoreAllMocks() // In afterEach (restore original implementations)
jest.resetAllMocks() // Clear + reset to original implementation
```

---

## Debugging Mock Issues

### Mock not being applied
```bash
# Check mock declaration location
grep -n "jest.mock\|import.*from" your-test.spec.tsx
# jest.mock should appear FIRST (lower line numbers)
```

### Mock return value wrong type
```typescript
// Log actual type to debug
jest.mock('module', () => ({
  fn: jest.fn(() => {
    const result = expectedValue;
    console.log('Mock returning:', typeof result, result);
    return result;
  })
}));
```

### Mock not called as expected
```typescript
// Use toHaveBeenCalledWith to see actual calls
expect(mockFn).toHaveBeenCalledWith('expected-arg');
// Error will show: "Expected mock to have been called with ('expected-arg') but was called with ('actual-arg')"
```

### Circular dependency in mock
```typescript
// If mock imports from source that imports the mock:
jest.mock('module', () => ({
  // ❌ DON'T require the module you're mocking
  fn: require('module').fn // Creates circular dependency!
}));

// ✅ DO define mock without requiring source
jest.mock('module', () => ({
  fn: jest.fn()
}));
```
