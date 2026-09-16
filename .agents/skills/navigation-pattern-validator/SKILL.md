---
name: navigation-pattern-validator
description: Enforce consistent Expo Router navigation patterns across React Native screens and headers. Use when creating new screens, implementing navigation flows, reviewing header components, debugging navigation stack mismatches, or auditing codebase for navigation consistency. Prevents mixed Expo Router/React Navigation paradigms that cause blank screens and navigation bugs.
---

# Navigation Pattern Validator

## Overview

This skill enforces consistent Expo Router navigation patterns across React Native applications, preventing navigation stack mismatches that cause blank screens, broken back buttons, and confusing user experiences. The skill validates import usage, navigation method calls, and stack consistency to ensure all header components follow the established "Expo Router First" pattern.

**Core Principle**: Expo Router provides file-based routing with built-in stack management. Mixing Expo Router and React Navigation in the same component creates navigation stack mismatches where forward navigation uses one system but back navigation uses another, resulting in undefined behavior.

**Common Problem**: A screen navigates forward using `router.push()` (Expo Router), but the destination screen's header uses `navigation.goBack()` (React Navigation). Since no React Navigation stack entry was created, `goBack()` fails silently or navigates to an unexpected screen, often showing a blank screen.

## When to Use This Skill

Use this skill when:
- Creating new screen headers or navigation components
- Implementing navigation flows (forward, back, replace patterns)
- Reviewing pull requests with header component changes
- Debugging blank screens, broken back buttons, or navigation issues
- Auditing codebase for navigation pattern consistency
- Migrating from React Navigation patterns to Expo Router
- Cleaning up redundant navigation imports

## Validation Workflow

### Step 1: Identify Component Type

Determine the component's navigation context:

**Standard Drawer Headers**: Screen headers inside drawer navigation
- Should use Expo Router exclusively
- Example: AccountsHeader, ShoppingHeader, ContactsHeader

**Drawer Layout Components**: Files managing drawer operations
- Require React Navigation for `DrawerActions.toggleDrawer()`
- Still use Expo Router for standard navigation
- Example: HomeHeader with menu toggle

**Nested Stack Screens**: Screens inside nested `Stack` layouts
- May use React Navigation for stack-specific operations
- Example: Security settings with `Stack` layout

**Custom Navigation Components**: Components with prop-based navigation
- Use callback props instead of navigation hooks
- Example: WizardHeader with `onExit` prop

### Step 2: Analyze Navigation Imports

Check which navigation hooks and utilities are imported:

**Expected Imports**:
```typescript
// ✅ Primary pattern
import { useRouter } from 'expo-router';

// ✅ Drawer context (when needed)
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
```

**Violation Patterns**:
```typescript
// ❌ Redundant - both imported but only useRouter used
import { useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';

// ❌ Missing Expo Router entirely
import { useNavigation } from '@react-navigation/native';
```

### Step 3: Validate Navigation Methods

Check that navigation method calls match the imported hooks:

**Preferred Methods** (Expo Router):
- `router.back()` - Stack-aware back navigation
- `router.push('/route-path')` - Forward navigation
- `router.replace('/route-path')` - Replace current route
- `router.canGoBack()` - Check if back navigation possible

**Conditional Methods** (React Navigation - only when needed):
- `navigation.dispatch(DrawerActions.toggleDrawer())` - Drawer operations only
- `navigation.navigate()` - Legacy pattern, prefer `router.push()`
- `navigation.goBack()` - Legacy pattern, prefer `router.back()`

**Violation Detection**:
```typescript
// ❌ Mixed usage without drawer context
const router = useRouter();
const navigation = useNavigation();
// ... only router.push() called, navigation never used

// ❌ React Navigation without Expo Router
navigation.goBack(); // No router imported or used

// ❌ Hardcoded route in back button
router.push('/home'); // Should use router.back() for back buttons
```

### Step 4: Check for Stack Mismatches

Validate that forward and back navigation use consistent systems:

**Stack Consistency Rules**:
1. If forward navigation uses `router.push()` → Back navigation MUST use `router.back()`
2. If forward navigation uses `navigation.navigate()` → Back navigation can use `navigation.goBack()` (but router is preferred)
3. Don't mix patterns in the same navigation flow

**Mismatch Examples**:
```typescript
// Home screen navigates forward
router.push('/(drawer)/accounts');

// AccountsHeader navigates back (DIFFERENT SYSTEM)
navigation.goBack(); // ❌ Stack mismatch - no React Navigation stack exists
```

**Correct Pattern**:
```typescript
// Home screen navigates forward
router.push('/(drawer)/accounts');

// AccountsHeader navigates back (SAME SYSTEM)
router.back(); // ✅ Consistent - uses Expo Router stack
```

### Step 5: Suggest Automated Fixes

For each violation type, provide specific automated fix suggestions:

**Redundant Import Fix**:
1. Remove unused `import { useNavigation } from '@react-navigation/native'`
2. Remove unused `const navigation = useNavigation()` hook call
3. Keep only the used navigation system

**Navigation Method Fix**:
1. Replace `navigation.goBack()` with `router.back()`
2. Replace `navigation.navigate('/path')` with `router.push('/path')`
3. For back buttons, replace `router.push('/home')` with `router.back()`

**Import Addition Fix**:
1. Add `import { useRouter } from 'expo-router'` when missing
2. Add `const router = useRouter()` hook call
3. Update navigation method calls to use `router`

## Code Patterns

### ✅ CORRECT - Standard Header Pattern

```typescript
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export const StandardHeader = ({ title }: { title: string }) => {
  const router = useRouter();

  const handleBackPress = () => {
    router.back();  // ✅ Stack-aware back navigation
  };

  const handleNavigate = () => {
    router.push('/target-route');  // ✅ Expo Router forward navigation
  };

  return (
    <View>
      <TouchableOpacity onPress={handleBackPress}>
        <Ionicons name="arrow-back" size={24} />
      </TouchableOpacity>
      <Text>{title}</Text>
    </View>
  );
};
```

**Why this is correct**:
- Only imports `useRouter`, no redundant imports
- Uses `router.back()` for back button (respects navigation stack)
- Uses `router.push()` for forward navigation
- No navigation stack mismatch possible

### ✅ CORRECT - Drawer Context Exception

```typescript
import React from 'react';
import { TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';

export const HomeHeader = ({ title }: { title: string }) => {
  const navigation = useNavigation();
  const router = useRouter();

  const handleMenuPress = () => {
    navigation.dispatch(DrawerActions.toggleDrawer());  // ✅ Drawer-specific operation
  };

  const handleNavigate = () => {
    router.push('/settings');  // ✅ Still use router for normal navigation
  };

  return (
    <View>
      <TouchableOpacity onPress={handleMenuPress}>
        <Ionicons name="menu" size={24} />
      </TouchableOpacity>
      <Text>{title}</Text>
    </View>
  );
};
```

**Why this is correct**:
- Imports both hooks because both are needed
- Uses `navigation.dispatch(DrawerActions.toggleDrawer())` for drawer operation (no Expo Router equivalent)
- Still uses `router.push()` for standard navigation
- Both hooks are actively used, no redundancy

### ✅ CORRECT - Onboarding with Fallback Logic

```typescript
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export const OnboardingHeader = () => {
  const router = useRouter();

  const handleBackPress = () => {
    if (router.canGoBack()) {
      router.back();  // ✅ Smart fallback - check stack first
    } else {
      router.replace('/(drawer)/onboarding/welcome');  // ✅ Clear history when no stack
    }
  };

  return (
    <TouchableOpacity onPress={handleBackPress}>
      <Ionicons name="arrow-back" size={24} />
    </TouchableOpacity>
  );
};
```

**Why this is correct**:
- Only imports `useRouter`
- Uses `router.canGoBack()` to check stack before navigating
- Handles edge case where `router.replace()` cleared history
- Provides sensible fallback (navigate to welcome screen)

### ❌ VIOLATION 1 - Redundant Import

```typescript
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';  // ❌ Imported but never used

export const ShoppingHeader = () => {
  const router = useRouter();
  const navigation = useNavigation();  // ❌ Hook called but never used

  const handleBackPress = () => {
    router.push('/home');  // Only router methods are called
  };

  return (
    <TouchableOpacity onPress={handleBackPress}>
      Back
    </TouchableOpacity>
  );
};
```

**Problems**:
1. `useNavigation` imported but never called
2. `navigation` hook initialized but never used
3. Creates unnecessary dependency on React Navigation
4. Adds confusion for future developers

**Automated Fix**:
```typescript
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
// ✅ Removed useNavigation import

export const ShoppingHeader = () => {
  const router = useRouter();
  // ✅ Removed navigation hook

  const handleBackPress = () => {
    router.back();  // ✅ Also changed to router.back() for stack-aware navigation
  };

  return (
    <TouchableOpacity onPress={handleBackPress}>
      Back
    </TouchableOpacity>
  );
};
```

### ❌ VIOLATION 2 - Navigation Stack Mismatch

```typescript
// Home screen (forward navigation)
const handleAccountsPress = () => {
  router.push('/(drawer)/accounts');  // ✅ Expo Router
};

// AccountsHeader component (back navigation)
const handleBackPress = () => {
  navigation.goBack();  // ❌ React Navigation - MISMATCH!
};
```

**Problem**: Forward navigation uses Expo Router (`router.push()`), but back navigation uses React Navigation (`navigation.goBack()`). Since `router.push()` doesn't create a React Navigation stack entry, `navigation.goBack()` has nothing to go back to, resulting in a blank screen.

**Automated Fix**:
```typescript
// Home screen (forward navigation) - no change needed
const handleAccountsPress = () => {
  router.push('/(drawer)/accounts');  // ✅ Expo Router
};

// AccountsHeader component (back navigation) - FIX
const router = useRouter();  // ✅ Added router hook

const handleBackPress = () => {
  router.back();  // ✅ Expo Router - CONSISTENT!
};
```

### ❌ VIOLATION 3 - Hardcoded Route in Back Button

```typescript
const handleBackPress = () => {
  router.push('/home');  // ❌ Hardcoded destination, not stack-aware
};
```

**Problem**: Hardcoding the destination route (`/home`) assumes the user always came from the home screen. This breaks navigation context - if the user came from a different screen, they should return there, not forcibly to home.

**Automated Fix**:
```typescript
const handleBackPress = () => {
  router.back();  // ✅ Stack-aware - returns to wherever user came from
};
```

**Exception**: Hardcoded routes are acceptable for explicit navigation (e.g., a "Home" button in a menu), but NOT for back buttons with back arrow icons.

## Common Violations & Fixes

### Violation 1: Mixed Navigation Hooks (Redundant Imports)

**Description**: Component imports both `useRouter` and `useNavigation` but only uses one of them.

**Common files affected**:
- Screen header components in drawer routes
- Any header importing both `useRouter` and `useNavigation` but only using one

**Detection Pattern**:
1. Both `import { useRouter } from 'expo-router'` and `import { useNavigation } from '@react-navigation/native'` present
2. Both hooks initialized: `const router = useRouter(); const navigation = useNavigation();`
3. Only `router.*` methods called in component body (no `navigation.*` calls)

**Automated Fix Steps**:
1. Remove line: `import { useNavigation } from '@react-navigation/native'`
2. Remove line: `const navigation = useNavigation();`
3. Keep only `useRouter` import and hook initialization

**Example**:
```typescript
// Before
import { useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';

export const ContactsHeader = () => {
  const router = useRouter();
  const navigation = useNavigation();

  return <Button onPress={() => router.push('/home')}>Back</Button>;
};

// After
import { useRouter } from 'expo-router';

export const ContactsHeader = () => {
  const router = useRouter();

  return <Button onPress={() => router.back()}>Back</Button>;
};
```

### Violation 2: React Navigation goBack() Without Expo Router

**Description**: Component uses `navigation.goBack()` without importing or using `useRouter`, creating fragile navigation that depends on React Navigation stack state.

**Common files affected**:
- Screen headers that use `navigation.goBack()` without `useRouter`

**Detection Pattern**:
1. `import { useNavigation } from '@react-navigation/native'` present
2. No `import { useRouter } from 'expo-router'`
3. `navigation.goBack()` called in component

**Automated Fix Steps**:
1. Add import: `import { useRouter } from 'expo-router'`
2. Replace hook: Change `const navigation = useNavigation()` to `const router = useRouter()`
3. Replace method: Change `navigation.goBack()` to `router.back()`
4. Remove unused import: Remove `import { useNavigation } from '@react-navigation/native'` if no longer needed

**Example**:
```typescript
// Before
import { useNavigation } from '@react-navigation/native';

export const HelpHeader = () => {
  const navigation = useNavigation();

  return <Button onPress={() => navigation.goBack()}>Back</Button>;
};

// After
import { useRouter } from 'expo-router';

export const HelpHeader = () => {
  const router = useRouter();

  return <Button onPress={() => router.back()}>Back</Button>;
};
```

### Violation 3: Hardcoded Home Route in Back Buttons

**Description**: Back button uses `router.push('/home')` instead of `router.back()`, breaking navigation context by always forcing navigation to home screen.

**Detection Pattern**:
1. TouchableOpacity or Button with accessibility role "button" and "back" or "arrow-back" icon
2. `onPress` handler calls `router.push('/home')` or `router.push('/(drawer)/home')`
3. No conditional logic checking navigation source

**Automated Fix Steps**:
1. Identify back button handlers (look for arrow-back icons, "back" text, or accessibility labels)
2. Replace `router.push('/home')` with `router.back()`
3. Preserve `router.push('/home')` for explicit "Home" buttons (menu items, navigation tabs)

**Example**:
```typescript
// Before - VIOLATION
const handleBackPress = () => {
  router.push('/home'); // ❌ Always goes to home, ignores navigation stack
};

return (
  <TouchableOpacity onPress={handleBackPress} accessibilityLabel="Go back">
    <Ionicons name="arrow-back" size={24} />
  </TouchableOpacity>
);

// After - FIXED
const handleBackPress = () => {
  router.back(); // ✅ Returns to previous screen in stack
};

return (
  <TouchableOpacity onPress={handleBackPress} accessibilityLabel="Go back">
    <Ionicons name="arrow-back" size={24} />
  </TouchableOpacity>
);
```

**Exception - Explicit Home Navigation** (NOT a violation):
```typescript
// ✅ ACCEPTABLE - Explicit home button in menu
const handleHomePress = () => {
  router.push('/home'); // ✅ User explicitly wants to go home
};

return (
  <TouchableOpacity onPress={handleHomePress}>
    <Ionicons name="home" size={24} />
    <Text>Home</Text>
  </TouchableOpacity>
);
```

## Compliance Checklist

Before marking navigation code as compliant, verify all items:

### Import Compliance

- [ ] Headers use `useRouter` from 'expo-router' as primary navigation hook
- [ ] No redundant navigation imports (both `useRouter` and `useNavigation` imported but only one used)
- [ ] `useNavigation` only imported when drawer operations (`DrawerActions`) or nested stack navigation explicitly require it
- [ ] `DrawerActions` imported only for drawer toggle operations (not for standard navigation)
- [ ] All navigation-related imports actively used in component (no unused imports)

### Navigation Method Compliance

- [ ] Back buttons use `router.back()` (not `navigation.goBack()` or `router.push('/home')`)
- [ ] Forward navigation uses `router.push('/route-path')`
- [ ] Stack replacements use `router.replace('/route-path')` (for auth flows, onboarding)
- [ ] Drawer operations use `navigation.dispatch(DrawerActions.toggleDrawer())`
- [ ] No hardcoded route paths in back button handlers (except explicit "Home" buttons)

### Stack Consistency Compliance

- [ ] No mixed navigation paradigms in same component (unless drawer/nested context explicitly requires it)
- [ ] Forward and back navigation use same navigation system (both Expo Router or both React Navigation)
- [ ] Smart fallbacks for onboarding/auth flows (check `router.canGoBack()` before calling `router.back()`)
- [ ] Modal dismissal and stack clearing use appropriate methods (`router.replace()` or `router.back()`)

### Code Quality Compliance

- [ ] Accessibility labels present on all navigation buttons (`accessibilityLabel`, `accessibilityRole`)
- [ ] Navigation handlers properly handle edge cases (empty stack, modal dismissal, auth state changes)
- [ ] Back buttons have consistent visual treatment (arrow-back icon, clear "Back" or "Go back" label)
- [ ] Navigation code is clear and maintainable (no complex nested conditions for simple back navigation)

## Anti-Patterns

### NEVER

- ❌ **NEVER** import both `useRouter` and `useNavigation` without using both hooks
- ❌ **NEVER** use `navigation.goBack()` when forward navigation used `router.push()`
- ❌ **NEVER** use `router.push('/home')` in back button handlers (breaks navigation context)
- ❌ **NEVER** mix Expo Router and React Navigation for standard navigation in same component
- ❌ **NEVER** use React Navigation methods without checking stack state
- ❌ **NEVER** hardcode navigation destinations in back buttons (use `router.back()`)
- ❌ **NEVER** skip accessibility labels on navigation buttons

### ALWAYS

- ✅ **ALWAYS** prefer `useRouter` from Expo Router for standard navigation
- ✅ **ALWAYS** use `router.back()` for back button navigation (stack-aware)
- ✅ **ALWAYS** use `router.push()` for forward navigation
- ✅ **ALWAYS** use `router.replace()` when intentionally clearing navigation stack
- ✅ **ALWAYS** use `DrawerActions` for drawer-specific operations (toggling, opening, closing)
- ✅ **ALWAYS** check `router.canGoBack()` before calling `router.back()` in flows that use `router.replace()`
- ✅ **ALWAYS** add accessibility labels to navigation buttons
- ✅ **ALWAYS** maintain stack consistency (same navigation system for forward and back)

## Resources

### Reference Documentation

**navigation-architecture-guide.md** - Comprehensive guide to Expo Router + React Navigation architecture, including file-based routing conventions, drawer navigation patterns, when to use each navigation method, migration guide from React Navigation to Expo Router, and edge case handling.

**violation-examples.md** - Common navigation violations with context, stack mismatch debugging techniques, and testing strategies for navigation flows.

## Success Criteria

Code is compliant with navigation patterns when:

1. **Import Hygiene**: Only necessary navigation hooks imported, no redundant imports
2. **Method Consistency**: All navigation methods match the imported hooks (router.* with useRouter, navigation.* with useNavigation)
3. **Stack Integrity**: Forward and back navigation use same system (no Expo Router → React Navigation mismatches)
4. **Back Button Compliance**: All back buttons use `router.back()` (not hardcoded routes)
5. **Exception Handling**: Legitimate exceptions (drawer operations, nested stacks) properly documented and justified
6. **Accessibility**: All navigation buttons have proper accessibility labels
7. **Edge Cases**: Onboarding flows, auth flows, and modal screens handle stack state correctly

Refer to references for detailed patterns, migration guides, and debugging techniques.

---

**Skill Version**: 1.0.0
**Last Updated**: 2025-12-31
**Maintains Compatibility With**: Expo Router (expo-router), React Navigation (Drawer from expo-router/drawer)
