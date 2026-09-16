---
name: testing-setup-react-native
description: Guide developers through React Native specific testing patterns including component testing, screen testing, hooks, native module mocking, and user interaction patterns with React Native Testing Library
---

# Testing Setup - React Native

## When to Use This Skill

Invoke this skill when you need to test:
- React Native components (buttons, forms, custom UI)
- Screens and navigation (Expo Router screens, drawer navigation)
- Custom hooks (state management, side effects)
- Context providers and state
- User interactions (tap, swipe, input)
- Native module integrations (AsyncStorage, Expo Router, Reanimated)

**Prerequisites**: First review `testing-setup-shared` skill for common testing infrastructure

---

## Overview

React Native testing in {app-name} uses:
- **Framework**: React Native Testing Library 13.3.3
- **Test Runner**: Jest 30.2.0
- **Preset**: `jest-expo` (Expo SDK 54)
- **Environment**: React Native with mocked native modules
- **File Pattern**: `*.spec.ts` (co-located with source files)

---

## Step 1: Component Testing Setup

### 1.1 Basic Component Test Structure

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ComponentName } from './component-name';

describe('ComponentName', () => {
  // === Setup ===
  beforeEach(() => {
    // Clear mocks before each test
    jest.clearAllMocks();
  });

  // === Tests ===
  it('should render correctly', () => {
    // Arrange
    const props = { title: 'Test Title' };

    // Act
    render(<ComponentName {...props} />);

    // Assert
    expect(screen.getByText('Test Title')).toBeTruthy();
  });
});
```

### 1.2 React Native Testing Library Queries

**Query Priority** (use in this order):

1. **getByRole**: Semantic queries (accessibility)
   ```typescript
   const button = screen.getByRole('button', { name: 'Submit' });
   ```

2. **getByLabelText**: Form inputs with labels
   ```typescript
   const input = screen.getByLabelText('Email');
   ```

3. **getByPlaceholderText**: Input placeholders
   ```typescript
   const search = screen.getByPlaceholderText('Search contacts...');
   ```

4. **getByText**: Visible text content
   ```typescript
   const heading = screen.getByText('Dashboard');
   ```

5. **getByTestId**: Last resort (when semantic queries don't work)
   ```typescript
   const element = screen.getByTestId('custom-component');
   ```

**Query Variants**:
- `getBy*`: Throws error if not found (use for assertions)
- `queryBy*`: Returns null if not found (use for negation)
- `findBy*`: Async query, waits for element (use for delayed rendering)

---

## Step 2: Component Testing Patterns

### 2.1 Simple Component Test

**Example**: Button component

```typescript
import { render, screen, fireEvent } from '@testing-library/react-native';
import { CustomButton } from './custom-button';

describe('CustomButton', () => {
  it('should render with correct text', () => {
    render(<CustomButton title="Click Me" onPress={() => {}} />);
    expect(screen.getByText('Click Me')).toBeTruthy();
  });

  it('should call onPress when tapped', () => {
    const mockOnPress = jest.fn();
    render(<CustomButton title="Click Me" onPress={mockOnPress} />);

    fireEvent.press(screen.getByText('Click Me'));
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when loading', () => {
    render(<CustomButton title="Click Me" onPress={() => {}} loading={true} />);

    const button = screen.getByRole('button');
    expect(button.props.accessibilityState.disabled).toBe(true);
  });
});
```

### 2.2 Interactive Component Test

**Example**: Form input component

```typescript
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TextInputField } from './text-input-field';

describe('TextInputField', () => {
  it('should update value on text change', () => {
    const mockOnChange = jest.fn();
    render(
      <TextInputField
        label="Email"
        value=""
        onChangeText={mockOnChange}
        placeholder="Enter email"
      />
    );

    const input = screen.getByPlaceholderText('Enter email');
    fireEvent.changeText(input, 'test@example.com');

    expect(mockOnChange).toHaveBeenCalledWith('test@example.com');
  });

  it('should show error message when invalid', () => {
    render(
      <TextInputField
        label="Email"
        value="invalid"
        onChangeText={() => {}}
        error="Invalid email format"
      />
    );

    expect(screen.getByText('Invalid email format')).toBeTruthy();
  });
});
```

### 2.3 Component with API Integration Test

**Example**: Component that fetches data

```typescript
import { render, screen, waitFor } from '@testing-library/react-native';
import { UserProfile } from './user-profile';
import * as apiService from '../services/api-service';

// Mock the API service
jest.mock('../services/api-service', () => ({
  fetchUserProfile: jest.fn()
}));

describe('UserProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display user data when loaded', async () => {
    // Arrange
    const mockUser = { handle: '@alice', name: 'Alice Smith' };
    (apiService.fetchUserProfile as jest.Mock).mockResolvedValue(mockUser);

    // Act
    render(<UserProfile userId="123" />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('@alice')).toBeTruthy();
      expect(screen.getByText('Alice Smith')).toBeTruthy();
    });
  });

  it('should show error message when fetch fails', async () => {
    // Arrange
    (apiService.fetchUserProfile as jest.Mock).mockRejectedValue(
      new Error('Network error')
    );

    // Act
    render(<UserProfile userId="123" />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeTruthy();
    });
  });
});
```

### 2.4 Mock Isolation and Reset Patterns

**Problem**: `jest.clearAllMocks()` only clears call history, not mock implementations. This causes tests to pass individually but fail in suite due to shared mock state.

**Solution**: Reset ALL mock implementations in `beforeEach`:

```typescript
describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Clear call history

    // CRITICAL: Reset implementations to clean defaults
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    mockSecureStore.setItemAsync.mockResolvedValue();
    mockSecureStore.deleteItemAsync.mockResolvedValue();

    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
    mockAsyncStorage.multiRemove.mockResolvedValue();

    // Reset ALL service mocks to clean defaults
    mockAuthService.logout.mockResolvedValue({ success: true });
    mockAuthService.refreshToken.mockResolvedValue({
      success: true,
      data: { accessToken: 'new-token', refreshToken: 'new-refresh' }
    });

    mockProfileCache.hydrateAuthenticatedProfile.mockResolvedValue();
    mockAccountCache.refreshAuthenticatedBalances.mockResolvedValue();
    mockTransactionCache.clearGuestCache.mockResolvedValue();
    // ... reset all mocks used in tests
  });

  // Tests...
});
```

**When to use**:
- Tests pass individually but fail in suite
- Flaky test behavior across multiple runs
- Unexpected mock call counts
- "Number of calls: 0" when expecting calls

**Impact**: Can improve pass rate by 20-30% when isolation issues exist.

**Example from {app-name}**: auth-context tests went from 67% to 90% pass rate by adding comprehensive beforeEach mock resets for 85+ methods across 15 services.

---

### 2.5 Mock Setup Timing

**Critical Rule**: Set up ALL mocks BEFORE rendering components.

**Problem**: React hooks execute during render. If mocks aren't ready, they use stale/default values from `beforeEach`.

**Wrong** (sets mocks after render starts):
```typescript
mockSecureStore.getItemAsync.mockImplementation(...);
const { getByTestId } = render(<Component />); // Render uses default mocks!
mockIsTokenExpired.mockReturnValue(true); // TOO LATE - component already initialized
```

**Correct** (mocks ready before render):
```typescript
// 1. Set up ALL mocks first
mockIsTokenExpired.mockReturnValue(true);
mockAuthService.refreshToken.mockResolvedValue({
  success: false,
  message: 'Token expired'
});
mockSecureStore.getItemAsync.mockImplementation(key => {
  if (key === 'access_token') return Promise.resolve('expired.token');
  if (key === 'user_data') return Promise.resolve(JSON.stringify(mockUser));
  return Promise.resolve(null);
});

// 2. Then render (now uses correct mocks)
const { getByTestId } = render(<Component />);

// 3. Then assert
await waitFor(() => {
  expect(getByTestId('isAuthenticated').children[0]).toBe('false');
});
```

**Test Execution Order**: Mock Setup → Render → Assertions

**Common Timing Mistakes**:
- Setting mocks inside `useEffect` callbacks (too late)
- Relying on mock setup that happens after first render
- Assuming `beforeEach` runs between render and assertions

---

### 2.6 Context-Aware Mocks

**Problem**: Global `mockReturnValue()` affects all invocations, causing unintended side effects.

**Use Case**: Testing scenarios where different inputs should produce different outputs (e.g., expired vs valid tokens).

**Wrong** (global return value):
```typescript
mockIsTokenExpired.mockReturnValue(true);
// Now ALL tokens appear expired, including refresh tokens!

// This causes valid refresh tokens to fail:
// - Access token: expired ✓ (correct)
// - Refresh token: expired ✗ (wrong - should be valid)
```

**Correct** (context-aware implementation):
```typescript
const expiredAccessToken = 'expired.access.token';
const validRefreshToken = 'valid.refresh.token';

mockIsTokenExpired.mockImplementation(token => {
  return token === expiredAccessToken; // Only specific token is expired
});

// Now:
// - Access token: expired ✓
// - Refresh token: valid ✓
```

**Additional Patterns**:

```typescript
// Different responses based on user ID
mockFetchUser.mockImplementation(userId => {
  if (userId === 'admin-123') return Promise.resolve(adminUser);
  if (userId === 'guest-456') return Promise.resolve(guestUser);
  return Promise.reject(new Error('User not found'));
});

// Different behavior based on API endpoint
mockApiCall.mockImplementation(endpoint => {
  if (endpoint.includes('/error')) return Promise.reject(new Error('API error'));
  return Promise.resolve({ success: true, data: {} });
});

// Conditional responses based on parameters
mockValidateToken.mockImplementation((token, options) => {
  if (options.strict && token.length < 10) return false;
  return token.startsWith('valid-');
});
```

**When to use context-aware mocks**:
- Testing token expiration flows (access vs refresh tokens)
- Different behavior for different users/roles
- Conditional API responses based on parameters
- Testing error handling with specific inputs

---

## Step 3: Screen Testing Patterns

### 3.1 Expo Router Screen Test

**Example**: Dashboard screen

```typescript
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import DashboardScreen from './home';

// Mock Expo Router
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  Stack: ({ children }: any) => children,
  Tabs: ({ children }: any) => children
}));

// Mock logger
import * as loggingLib from '@your-org/logging-lib/client';
jest.spyOn(loggingLib, 'logger', 'get').mockReturnValue({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  audit: jest.fn()
});

describe('DashboardScreen', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      back: jest.fn(),
      replace: jest.fn()
    });
  });

  it('should render main sections', () => {
    render(<DashboardScreen />);

    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Recent Transactions')).toBeTruthy();
    expect(screen.getByText('Quick Actions')).toBeTruthy();
  });

  it('should navigate to transactions when button tapped', () => {
    render(<DashboardScreen />);

    fireEvent.press(screen.getByText('View All Transactions'));
    expect(mockPush).toHaveBeenCalledWith('/transactions');
  });
});
```

### 3.2 Screen with Mock Data Test

**Example**: Using mock data library

```typescript
import { render, screen } from '@testing-library/react-native';
import { generateMockUser, generateMockTransaction } from '@your-org/mock-data-lib/client';
import TransactionListScreen from './transaction-list';

describe('TransactionListScreen', () => {
  it('should display transactions', () => {
    // Arrange
    const mockUser = generateMockUser();
    const mockTransactions = [
      generateMockTransaction({ from: mockUser.id, amount: 100 }),
      generateMockTransaction({ to: mockUser.id, amount: 50 })
    ];

    // Act
    render(<TransactionListScreen transactions={mockTransactions} />);

    // Assert
    expect(screen.getByText('$100.00')).toBeTruthy();
    expect(screen.getByText('$50.00')).toBeTruthy();
  });
});
```

---

## Step 4: Native Module Mocking

### 4.1 AsyncStorage Mock

**Setup** (already configured in `apps/{app-name}/test-setup.ts`):

```typescript
// Test usage
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('Storage Service', () => {
  beforeEach(() => {
    AsyncStorage.clear();
  });

  it('should store and retrieve data', async () => {
    await AsyncStorage.setItem('key', 'value');
    const result = await AsyncStorage.getItem('key');
    expect(result).toBe('value');
  });
});
```

### 4.2 Expo Router Mock

**Pattern for navigation testing**:

```typescript
import { useRouter, useLocalSearchParams } from 'expo-router';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
  Stack: ({ children }: any) => children,
  Link: ({ children }: any) => children
}));

describe('Screen with Navigation', () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn()
    });

    (useLocalSearchParams as jest.Mock).mockReturnValue({
      id: '123'
    });
  });

  // Tests...
});
```

### 4.3 Reanimated Mock

**Setup** (already configured in `apps/{app-name}/jest-pre-setup.js`):

```typescript
// Mock is global, no additional setup needed in tests

describe('Animated Component', () => {
  it('should render animated view', () => {
    // Reanimated components work in tests automatically
    render(<AnimatedComponent />);
    expect(screen.getByTestId('animated-view')).toBeTruthy();
  });
});
```

### 4.4 NetInfo Mock

**Pattern for network status testing**:

```typescript
import NetInfo from '@react-native-community/netinfo';

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
  addEventListener: jest.fn()
}));

describe('Offline Mode Handler', () => {
  it('should detect offline state', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: false,
      isInternetReachable: false
    });

    // Test offline behavior
  });
});
```

---

## Step 5: Custom Hook Testing

### 5.1 Hook Test Setup

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useCounter } from './use-counter';

describe('useCounter', () => {
  it('should increment counter', () => {
    // Arrange
    const { result } = renderHook(() => useCounter());

    // Act
    act(() => {
      result.current.increment();
    });

    // Assert
    expect(result.current.count).toBe(1);
  });

  it('should decrement counter', () => {
    const { result } = renderHook(() => useCounter({ initialValue: 5 }));

    act(() => {
      result.current.decrement();
    });

    expect(result.current.count).toBe(4);
  });
});
```

### 5.2 Hook with Async Operations

```typescript
import { renderHook, waitFor } from '@testing-library/react-native';
import { useFetchUser } from './use-fetch-user';
import * as apiService from '../services/api-service';

jest.mock('../services/api-service', () => ({
  fetchUser: jest.fn()
}));

describe('useFetchUser', () => {
  it('should fetch user data', async () => {
    // Arrange
    const mockUser = { id: '123', handle: '@alice' };
    (apiService.fetchUser as jest.Mock).mockResolvedValue(mockUser);

    // Act
    const { result } = renderHook(() => useFetchUser('123'));

    // Assert
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual(mockUser);
    });
  });
});
```

---

## Step 6: Context and State Testing

### 6.1 Context Provider Test

```typescript
import { render, screen, fireEvent } from '@testing-library/react-native';
import { UserContext, UserProvider } from './user-context';
import { useContext } from 'react';

// Test component that uses context
const TestComponent = () => {
  const { user, setUser } = useContext(UserContext);
  return (
    <>
      <Text>{user?.handle || 'No user'}</Text>
      <Button
        title="Set User"
        onPress={() => setUser({ id: '1', handle: '@alice' })}
      />
    </>
  );
};

describe('UserContext', () => {
  it('should provide user state', () => {
    render(
      <UserProvider>
        <TestComponent />
      </UserProvider>
    );

    expect(screen.getByText('No user')).toBeTruthy();

    fireEvent.press(screen.getByText('Set User'));

    expect(screen.getByText('@alice')).toBeTruthy();
  });
});
```

---

## Step 7: User Interaction Testing

### 7.1 Tap/Press Interactions

```typescript
import { render, screen, fireEvent } from '@testing-library/react-native';

it('should handle button press', () => {
  const mockOnPress = jest.fn();
  render(<Button title="Submit" onPress={mockOnPress} />);

  fireEvent.press(screen.getByText('Submit'));

  expect(mockOnPress).toHaveBeenCalled();
});
```

### 7.2 Text Input Interactions

```typescript
it('should handle text input', () => {
  const mockOnChange = jest.fn();
  render(<TextInput onChangeText={mockOnChange} placeholder="Enter text" />);

  const input = screen.getByPlaceholderText('Enter text');
  fireEvent.changeText(input, 'Hello World');

  expect(mockOnChange).toHaveBeenCalledWith('Hello World');
});
```

### 7.3 Form Submission

```typescript
it('should submit form with valid data', async () => {
  const mockOnSubmit = jest.fn();
  render(<LoginForm onSubmit={mockOnSubmit} />);

  // Fill form
  fireEvent.changeText(screen.getByPlaceholderText('Email'), 'test@example.com');
  fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');

  // Submit
  fireEvent.press(screen.getByText('Login'));

  await waitFor(() => {
    expect(mockOnSubmit).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123'
    });
  });
});
```

---

## Step 8: Async Testing Patterns

### 8.1 Using waitFor

```typescript
import { render, screen, waitFor } from '@testing-library/react-native';

it('should load data asynchronously', async () => {
  render(<DataComponent />);

  // Wait for loading to complete
  await waitFor(() => {
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.getByText('Data loaded')).toBeTruthy();
  });
});
```

### 8.2 Using findBy Queries

```typescript
it('should display error after failed request', async () => {
  render(<UserProfile userId="invalid" />);

  // findBy waits automatically (timeout: 1000ms by default)
  const errorMessage = await screen.findByText(/error/i);
  expect(errorMessage).toBeTruthy();
});
```

### 8.3 Custom Timeout

```typescript
it('should wait for slow operation', async () => {
  render(<SlowComponent />);

  await waitFor(
    () => {
      expect(screen.getByText('Complete')).toBeTruthy();
    },
    { timeout: 5000 } // Wait up to 5 seconds
  );
});
```

---

## Step 9: Common React Native Test Patterns

### 9.1 Testing with Mock Data Library

```typescript
import { generateMockUser, generateMockAccount } from '@your-org/mock-data-lib/client';

describe('Account Screen', () => {
  it('should display account balance', () => {
    const mockUser = generateMockUser();
    const mockAccount = generateMockAccount({ userId: mockUser.id, balance: 1000 });

    render(<AccountScreen account={mockAccount} />);

    expect(screen.getByText('$1,000.00')).toBeTruthy();
  });
});
```

### 9.2 Testing with Logger Mock

```typescript
import * as loggingLib from '@your-org/logging-lib/client';

describe('Component with Logging', () => {
  let loggerSpy: jest.SpyInstance;

  beforeAll(() => {
    loggerSpy = jest.spyOn(loggingLib, 'logger', 'get').mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      audit: jest.fn()
    });
  });

  afterAll(() => {
    loggerSpy.mockRestore();
  });

  beforeEach(() => {
    loggerSpy.mockClear();
  });

  it('should log user action', () => {
    render(<ActionButton onPress={() => {}} />);
    fireEvent.press(screen.getByRole('button'));

    expect(loggingLib.logger.info).toHaveBeenCalledWith(
      'Button pressed',
      expect.any(Object)
    );
  });
});
```

### 9.3 Testing Navigation Flow

```typescript
import { useRouter } from 'expo-router';

jest.mock('expo-router');

describe('Multi-Screen Flow', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  });

  it('should navigate through payment flow', () => {
    render(<PaymentInitiationScreen />);

    // Select contact
    fireEvent.press(screen.getByText('@alice'));

    // Enter amount
    fireEvent.changeText(screen.getByPlaceholderText('Amount'), '100');

    // Submit
    fireEvent.press(screen.getByText('Continue'));

    expect(mockPush).toHaveBeenCalledWith('/payment-confirm', {
      to: '@alice',
      amount: 100
    });
  });
});
```

---

## Step 10: Test Execution and Verification

### 10.1 Run React Native Tests

```bash
# Run all client tests for {app-name}
npx nx test {app-name} --no-cache

# Run with coverage
npx nx test {app-name} --coverage

# Run specific test file
npx nx test {app-name} --testFile=components/button.spec.ts

# Watch mode
npx nx test {app-name} --watch
```

### 10.2 Coverage Requirements

- **General Components**: 80%+ coverage
- **Financial Components**: 95%+ coverage (payment forms, transaction displays)
- **Critical User Flows**: 95%+ coverage (authentication, payments, transfers)

### 10.3 Verify Test Output

**Success Indicators**:
- ✅ All tests pass
- ✅ No console warnings
- ✅ Mocks are properly cleaned up
- ✅ Coverage meets requirements

**Check Coverage Report**:
```bash
open test-output/jest/coverage/apps/{app-name}/index.html
```

---

## Step 11: Troubleshooting React Native Tests

### 11.1 "Cannot find module" Errors

**Cause**: Missing mock for native module

**Solution**: Add mock in `apps/{app-name}/test-setup.ts`:
```typescript
jest.mock('react-native-module-name', () => ({
  // Mock implementation
}));
```

### 11.2 "Invariant Violation" Errors

**Cause**: React Native component not properly mocked

**Solution**: Ensure `jest-expo` preset is used in `jest.config.ts`

### 11.3 Navigation Test Failures

**Cause**: Expo Router hooks not mocked

**Solution**: Mock Expo Router as shown in Step 4.2

### 11.4 Async Test Timeouts

**Cause**: Test doesn't wait for async operations

**Solution**: Use `waitFor` or `findBy` queries with appropriate timeout

---

## React Native Testing Checklist

Before completing, verify:

- [ ] ✅ Test file co-located with source file
- [ ] ✅ Using React Native Testing Library queries (not Enzyme)
- [ ] ✅ Semantic queries preferred (getByRole, getByLabelText)
- [ ] ✅ testID only as last resort
- [ ] ✅ Async operations use waitFor or findBy
- [ ] ✅ Native modules properly mocked
- [ ] ✅ Navigation mocked (Expo Router)
- [ ] ✅ Logger mocked using runtime pattern
- [ ] ✅ AAA pattern (Arrange-Act-Assert)
- [ ] ✅ Mocks cleaned up in beforeEach
- [ ] ✅ Mock implementations reset in beforeEach (not just clearAllMocks)
- [ ] ✅ All mocks set up BEFORE rendering components
- [ ] ✅ Context-aware mocks used for conditional behavior (mockImplementation vs mockReturnValue)
- [ ] ✅ Coverage meets requirements (80% or 95%)

---

## Related Skills

- **testing-setup-shared**: Common testing infrastructure and mocking patterns
- **testing-setup-nestjs**: NestJS service/controller testing patterns

---

## References

- `apps/{app-name}/test-setup.ts` - Global React Native test configuration
- React Native Testing Library: https://callstack.github.io/react-native-testing-library/
