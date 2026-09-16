# Navigation Pattern Violations - Real-World Examples

## Overview

This document contains common navigation violations with example patterns, debugging techniques and testing strategies to catch these issues early.

## Common Violations

### Case Study 1: AccountsHeader Blank Screen Bug

**Severity**: High (user-facing bug causing blank screen)
**Files Affected**: `src/components/accounts/accounts-header.tsx`

**Violation**:
```typescript
// src/components/accounts/accounts-header.tsx
import { useNavigation } from '@react-navigation/native';

export const AccountsHeader = ({ title }: AccountsHeaderProps) => {
  const navigation = useNavigation();

  const handleBackPress = () => {
    navigation.goBack();  // ❌ React Navigation
  };

  return (
    <TouchableOpacity onPress={handleBackPress}>
      <Ionicons name="arrow-back" size={24} />
    </TouchableOpacity>
  );
};

// src/screens/home/index.tsx
const handleButtonPress = (buttonId: string) => {
  switch (buttonId) {
    case 'accounts':
      router.push('/(drawer)/accounts');  // ✅ Expo Router
      break;
  }
};
```

**Problem**:
- Home screen navigates to Accounts using Expo Router (`router.push()`)
- AccountsHeader tries to navigate back using React Navigation (`navigation.goBack()`)
- No React Navigation stack entry exists from the `router.push()` call
- `navigation.goBack()` fails silently, showing a blank screen

**User Impact**:
- User taps "Accounts" button from home screen
- Accounts screen loads correctly
- User taps back button in AccountsHeader
- **Blank screen appears instead of returning to home**
- User stuck, must force close app or use drawer to navigate

**Root Cause**: Navigation stack mismatch - forward navigation using Expo Router, back navigation using React Navigation.

**Fix**:
```typescript
// src/components/accounts/accounts-header.tsx
import { useRouter } from 'expo-router';  // ✅ Changed from useNavigation

export const AccountsHeader = ({ title }: AccountsHeaderProps) => {
  const router = useRouter();  // ✅ Changed from navigation

  const handleBackPress = () => {
    router.back();  // ✅ Expo Router - consistent with forward navigation
  };

  return (
    <TouchableOpacity onPress={handleBackPress}>
      <Ionicons name="arrow-back" size={24} />
    </TouchableOpacity>
  );
};
```

**Lessons Learned**:
1. Always use the same navigation system for forward and back navigation
2. Blank screens are a common symptom of navigation stack mismatches
3. Manual testing from different entry points catches these issues
4. Navigation pattern validator would have prevented this bug proactively

---

### Case Study 2: Redundant Navigation Imports

**Severity**: Medium (code quality issue, potential confusion)
**Common files affected**: Screen header components importing both `useRouter` and `useNavigation` but only calling router methods

**Violation Pattern** (example from contacts-header.tsx):
```typescript
import { useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';  // ❌ Imported but unused

export const ContactsHeader = () => {
  const router = useRouter();
  const navigation = useNavigation();  // ❌ Initialized but never called

  const handleBackPress = () => {
    router.push('/home');  // Only router methods used
  };

  return (
    <TouchableOpacity onPress={handleBackPress}>
      <Ionicons name="arrow-back" size={24} />
    </TouchableOpacity>
  );
};
```

**Problems**:
1. **Unnecessary dependency**: Imports React Navigation when not needed
2. **Code confusion**: Future developers might think `navigation` is used
3. **Maintenance burden**: Two navigation systems imported for no reason
4. **Potential bugs**: Developer might accidentally use `navigation.goBack()` thinking it's valid

**Impact**:
- Bundle size: Minimal (React Navigation already in bundle for drawer)
- Code quality: Moderate (confusing, violates "import what you use" principle)
- Bug risk: High (easy to accidentally use wrong navigation method)

**Fix**:
```typescript
import { useRouter } from 'expo-router';
// ✅ Removed useNavigation import

export const ContactsHeader = () => {
  const router = useRouter();
  // ✅ Removed navigation hook

  const handleBackPress = () => {
    router.back();  // ✅ Also changed to router.back() for stack-aware navigation
  };

  return (
    <TouchableOpacity onPress={handleBackPress}>
      <Ionicons name="arrow-back" size={24} />
    </TouchableOpacity>
  );
};
```

**Automated Cleanup**:
```bash
# Step 1: Remove unused import
sed -i '' "/import { useNavigation } from '@react-navigation\/native';/d" contacts-header.tsx

# Step 2: Remove unused hook initialization
sed -i '' "/const navigation = useNavigation();/d" contacts-header.tsx

# Step 3: Replace router.push('/home') with router.back() in back buttons
# (Manual review recommended to distinguish back buttons from explicit home buttons)
```

**Lessons Learned**:
1. Regularly audit imports for unused navigation hooks
2. Establish clear import patterns (Expo Router first, React Navigation only when needed)
3. Code review should flag redundant navigation imports
4. Automated linting could catch this pattern

---

### Case Study 3: Hardcoded Home Route in Back Buttons

**Date Discovered**: December 31, 2025
**Severity**: Medium (broken navigation context, confusing UX)
**Files Affected**: Multiple headers (contacts, transactions, shopping, etc.)

**Violation**:
```typescript
const handleBackPress = () => {
  router.push('/home');  // ❌ Always goes to home, ignores navigation stack
};

return (
  <TouchableOpacity onPress={handleBackPress} accessibilityLabel="Go back">
    <Ionicons name="arrow-back" size={24} />
  </TouchableOpacity>
);
```

**Problem Scenario**:
```
User journey:
1. User on Home screen
2. Navigates to Contacts (router.push('/contacts'))
3. Navigates to Contact Detail (router.push('/contacts/123'))
4. Navigates to Transactions (router.push('/transactions'))
5. Presses back button

Expected: Return to Contact Detail (/contacts/123)
Actual: Goes to Home (/) - WRONG!
```

**Why This is Wrong**:
- **Breaks navigation context**: User expects back button to return to previous screen
- **Confusing UX**: Back button behavior becomes unpredictable
- **Lost navigation state**: User loses their place in the app
- **Doesn't respect stack**: Ignores the navigation history

**User Impact**:
- Frustration: "Why did I go to home? I was looking at a contact!"
- Lost work: User might have been in the middle of a multi-step flow
- Trust erosion: Back button becomes unreliable

**Fix**:
```typescript
const handleBackPress = () => {
  router.back();  // ✅ Stack-aware - returns to previous screen
};

return (
  <TouchableOpacity onPress={handleBackPress} accessibilityLabel="Go back">
    <Ionicons name="arrow-back" size={24} />
  </TouchableOpacity>
);
```

**Exception - Explicit Home Button** (NOT a violation):
```typescript
// ✅ ACCEPTABLE - User explicitly wants to go home
const handleHomePress = () => {
  router.push('/home');  // Intentional home navigation
};

return (
  <TouchableOpacity onPress={handleHomePress}>
    <Ionicons name="home" size={24} />
    <Text>Home</Text>
  </TouchableOpacity>
);
```

**Lessons Learned**:
1. Back buttons should ALWAYS use `router.back()` (stack-aware)
2. Hardcoded routes are acceptable for explicit navigation (home button, menu items)
3. Distinguish back buttons (arrow-back icon) from home buttons (home icon)
4. Test navigation from different entry points to catch hardcoded routes

---

### Case Study 4: Header Using Only React Navigation

**Severity**: Medium (inconsistent with codebase patterns)
**File Affected**: Any screen header using only `useNavigation` / `navigation.goBack()` without `useRouter`

**Violation**:
```typescript
import { useNavigation } from '@react-navigation/native';  // ❌ Only React Navigation

export const HelpHeader = () => {
  const navigation = useNavigation();

  const handleBackPress = () => {
    navigation.goBack();  // ❌ React Navigation method
  };

  return (
    <TouchableOpacity onPress={handleBackPress}>
      <Ionicons name="arrow-back" size={24} />
    </TouchableOpacity>
  );
};
```

**Problems**:
1. **Inconsistent pattern**: All other headers use Expo Router, but HelpHeader uses React Navigation
2. **Fragile navigation**: Relies on React Navigation stack state, which might not exist
3. **Potential bug**: If help screen is reached via Expo Router (which it is), `navigation.goBack()` might fail

**Why It Hasn't Failed Yet**:
- Help screen is typically accessed from drawer
- Drawer navigation might create React Navigation stack entries
- However, this is fragile and could break if navigation flow changes

**Fix**:
```typescript
import { useRouter } from 'expo-router';  // ✅ Expo Router

export const HelpHeader = () => {
  const router = useRouter();

  const handleBackPress = () => {
    router.back();  // ✅ Expo Router - consistent with rest of app
  };

  return (
    <TouchableOpacity onPress={handleBackPress}>
      <Ionicons name="arrow-back" size={24} />
    </TouchableOpacity>
  );
};
```

**Lessons Learned**:
1. Establish and enforce consistent navigation patterns across all headers
2. Don't rely on "it works now" - fragile code breaks when flows change
3. Standardize on one navigation system for similar components
4. Code review should catch pattern inconsistencies

---

## Stack Mismatch Debugging

### Symptoms of Navigation Stack Mismatches

**Blank Screen**:
- Most common symptom
- User taps back button, screen goes blank
- No error message, just empty view
- Caused by: `navigation.goBack()` with no React Navigation stack entry

**Unexpected Navigation Destination**:
- User taps back, goes to wrong screen
- Example: From Accounts → Transactions instead of Home
- Caused by: Mixed navigation systems, confusing stack state

**Back Button Does Nothing**:
- User taps back, nothing happens
- Screen stays the same
- Caused by: Empty navigation stack, no previous screen

**App Crash / Error**:
- Rare, but possible with invalid navigation state
- Error: "Cannot read property 'goBack' of undefined"
- Caused by: Navigation context not available

### Debugging Techniques

**Technique 1: Console Log Navigation Stack**

```typescript
import { useRouter } from 'expo-router';

const router = useRouter();

// Log current route and stack state
console.log('Current route:', router.pathname);
console.log('Can go back?', router.canGoBack());

const handleBackPress = () => {
  console.log('Before back - pathname:', router.pathname);
  router.back();
  console.log('After back - pathname:', router.pathname);
};
```

**Technique 2: React Navigation Stack Inspection**

```typescript
import { useNavigation } from '@react-navigation/native';

const navigation = useNavigation();

// Log React Navigation state
console.log('Navigation state:', navigation.getState());
console.log('Can go back?', navigation.canGoBack());

const handleBackPress = () => {
  if (navigation.canGoBack()) {
    console.log('React Navigation stack exists');
    navigation.goBack();
  } else {
    console.log('React Navigation stack empty!');
    // Fall back to Expo Router
    router.back();
  }
};
```

**Technique 3: Navigation Event Listeners**

```typescript
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

const router = useRouter();

useEffect(() => {
  // Log navigation events
  const unsubscribe = router.addListener('state', (e) => {
    console.log('Navigation state changed:', e.data.state);
  });

  return unsubscribe;
}, []);
```

**Technique 4: Breakpoint Debugging**

```typescript
const handleBackPress = () => {
  debugger;  // Pause execution here

  // Inspect:
  // - router.pathname
  // - router.canGoBack()
  // - navigation.getState()

  router.back();
};
```

### Common Debugging Scenarios

**Scenario 1: Blank Screen After Back Button**

```
Steps to debug:
1. Add console.log in back button handler
2. Check if router.canGoBack() returns true
3. Check router.pathname before and after router.back()
4. If pathname doesn't change, stack mismatch detected

Fix: Use router.back() instead of navigation.goBack()
```

**Scenario 2: Back Button Goes to Wrong Screen**

```
Steps to debug:
1. Log navigation stack before back button press
2. Log expected vs. actual destination
3. Check if router.back() or navigation.goBack() is used
4. Verify forward navigation used same system

Fix: Ensure consistent navigation system (both Expo Router or both React Navigation)
```

**Scenario 3: Back Button Does Nothing**

```
Steps to debug:
1. Check router.canGoBack() - if false, empty stack
2. Check if router.replace() was used (clears stack)
3. Add fallback for empty stack scenarios

Fix: Add canGoBack() check before back() call, provide fallback
```

---

## Testing Strategies

### Manual Testing Checklist

For each header with a back button:

**Test 1: Basic Back Navigation**
- [ ] Navigate to screen from home
- [ ] Press back button
- [ ] Verify returns to home screen
- [ ] Verify home screen state preserved

**Test 2: Multi-Screen Stack**
- [ ] Navigate: Home → Screen A → Screen B → Screen C
- [ ] Press back from Screen C → should go to Screen B
- [ ] Press back from Screen B → should go to Screen A
- [ ] Press back from Screen A → should go to Home

**Test 3: Different Entry Points**
- [ ] Navigate to screen from drawer
- [ ] Press back button → verify returns to previous screen (NOT always home)
- [ ] Navigate to screen from another screen (not home)
- [ ] Press back button → verify returns to that screen

**Test 4: Edge Cases**
- [ ] Navigate using router.replace() → press back → verify fallback works
- [ ] Deep link to screen → press back → verify graceful handling
- [ ] Navigate after drawer toggle → press back → verify correct destination

**Test 5: Accessibility**
- [ ] Use screen reader to navigate
- [ ] Verify back button has "Go back" or similar label
- [ ] Verify back button is keyboard accessible

### Automated Testing

**Test 1: Standard Back Navigation**

```typescript
import { renderRouter, screen } from 'expo-router/testing-library';

describe('ContactsHeader back navigation', () => {
  it('should return to home when navigated from home', async () => {
    // Arrange
    const { router } = renderRouter('/home');
    await router.push('/contacts');

    // Act
    const backButton = screen.getByLabelText('Go back');
    await backButton.press();

    // Assert
    expect(router.pathname).toBe('/home');
  });

  it('should return to previous screen when navigated from elsewhere', async () => {
    // Arrange
    const { router } = renderRouter('/transactions');
    await router.push('/contacts');

    // Act
    const backButton = screen.getByLabelText('Go back');
    await backButton.press();

    // Assert
    expect(router.pathname).toBe('/transactions');
  });
});
```

**Test 2: Multi-Screen Stack**

```typescript
describe('Multi-screen navigation stack', () => {
  it('should unwind stack correctly with multiple backs', async () => {
    const { router } = renderRouter('/home');

    // Build stack: Home → Contacts → Profile → Settings
    await router.push('/contacts');
    await router.push('/profile');
    await router.push('/settings');

    // Verify stack state
    expect(router.pathname).toBe('/settings');

    // Back to Profile
    await router.back();
    expect(router.pathname).toBe('/profile');

    // Back to Contacts
    await router.back();
    expect(router.pathname).toBe('/contacts');

    // Back to Home
    await router.back();
    expect(router.pathname).toBe('/home');
  });
});
```

**Test 3: Empty Stack Handling**

```typescript
describe('Empty stack handling', () => {
  it('should handle back when no previous screen', async () => {
    // Arrange: Direct navigation to contacts (no previous screen)
    const { router } = renderRouter('/contacts');

    // Act & Assert: Should stay on contacts or navigate to fallback
    const backButton = screen.getByLabelText('Go back');
    await backButton.press();

    // Either stays on contacts (if canGoBack() check present)
    // Or navigates to fallback (if fallback implemented)
    expect(['/contacts', '/home']).toContain(router.pathname);
  });
});
```

**Test 4: Stack Mismatch Detection**

```typescript
describe('Navigation stack mismatch detection', () => {
  it('should detect Expo Router vs React Navigation mismatch', async () => {
    const { router } = renderRouter('/home');

    // Forward navigation using Expo Router
    await router.push('/accounts');

    // Get header component
    const accountsHeader = screen.getByTestId('accounts-header');

    // Check if useRouter is used (not useNavigation)
    expect(accountsHeader).toHaveNavigationMethod('router.back');
    expect(accountsHeader).not.toHaveNavigationMethod('navigation.goBack');
  });
});
```

### Integration Testing

**Test End-to-End Navigation Flows**:

```typescript
import { testNavigationFlow } from '@/test-utils/navigation';

describe('Accounts navigation flow', () => {
  it('should navigate through complete accounts flow', async () => {
    const flow = testNavigationFlow();

    // Step 1: Start at home
    await flow.assertScreen('/home');

    // Step 2: Navigate to accounts
    await flow.press('Accounts button');
    await flow.assertScreen('/accounts');

    // Step 3: Press back
    await flow.press('Back button');
    await flow.assertScreen('/home');

    // Step 4: Verify home state preserved
    await flow.assertElementPresent('example-component');
    await flow.assertElementPresent('in-app-notifications');
  });
});
```

---

## Summary

### Key Takeaways

1. **Navigation stack mismatches cause blank screens** - Always use consistent navigation system (Expo Router)
2. **Redundant imports create confusion** - Import only what you use, remove unused navigation hooks
3. **Hardcoded routes break navigation context** - Use `router.back()` for back buttons, not `router.push('/home')`
4. **Manual testing from multiple entry points** catches navigation bugs early
5. **Automated testing prevents regressions** - Test navigation flows, not just component rendering

### Prevention Checklist

- [ ] Use Expo Router for all standard navigation
- [ ] Use React Navigation only for drawer operations
- [ ] Never mix navigation systems in same component
- [ ] Always use `router.back()` for back buttons
- [ ] Remove redundant navigation imports
- [ ] Test navigation from multiple entry points
- [ ] Add automated navigation tests
- [ ] Use navigation-pattern-validator skill proactively

### Resources

- **Navigation Architecture Guide**: Comprehensive guide to Expo Router + React Navigation patterns
- **Claude Skill**: navigation-pattern-validator for proactive validation
- **Testing Utils**: `expo-router/testing-library` for automated navigation tests
- **Debugging Tools**: React DevTools, Expo Dev Tools for navigation state inspection
