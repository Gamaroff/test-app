# Navigation Architecture Guide

## Overview

A React Native app using Expo Router uses a hybrid navigation architecture combining **Expo Router** (file-based routing with built-in stack management) and **React Navigation** (for drawer functionality). This guide explains how both systems work together, when to use each, and how to maintain navigation pattern consistency.

### Navigation Stack Layers

```
┌─────────────────────────────────────────┐
│   Expo Router (File-Based Routing)     │  ← Primary navigation system
│   - app/_layout.tsx (root stack)       │
│   - app/(drawer)/_layout.tsx (drawer)  │
│   - app/(drawer)/*/index.tsx (screens) │
└─────────────────────────────────────────┘
              ↓ uses
┌─────────────────────────────────────────┐
│   React Navigation (Drawer Component)   │  ← Drawer-specific operations
│   - DrawerActions.toggleDrawer()       │
│   - Drawer.Screen registration          │
│   - Custom drawer content               │
└─────────────────────────────────────────┘
```

**Key Principle**: Expo Router provides the navigation stack. React Navigation provides the drawer UI component. Use Expo Router for all standard navigation (push, back, replace). Use React Navigation only for drawer-specific operations (toggle, open, close).

## File-Based Routing (Expo Router)

### How Expo Router Works

Expo Router uses the file system to define routes automatically. The directory structure in `app/` directly maps to navigation routes:

```
app/
├── _layout.tsx                    → Root Stack layout
├── (drawer)/
│   ├── _layout.tsx               → Drawer layout
│   ├── home/
│   │   └── index.tsx            → Route: /(drawer)/home
│   ├── accounts/
│   │   └── index.tsx            → Route: /(drawer)/accounts
│   ├── contacts/
│   │   └── index.tsx            → Route: /(drawer)/contacts
│   └── settings/
│       ├── index.tsx            → Route: /(drawer)/settings
│       └── security/
│           ├── _layout.tsx      → Nested Stack layout
│           └── index.tsx        → Route: /(drawer)/settings/security
```

### Route Conventions

**Folders** = Route segments:
- `home/` → `/home`
- `accounts/` → `/accounts`
- `settings/security/` → `/settings/security`

**Groups** = Organization without adding route segments:
- `(drawer)/home/` → `/home` (not `/drawer/home`)
- `(auth)/login/` → `/login` (not `/auth/login`)

**Layouts** = Navigation structure:
- `_layout.tsx` → Defines Stack, Drawer, or Tabs
- Applies to all routes in that directory

**Index** = Default route:
- `home/index.tsx` → Matches `/home` exactly
- `home/[id].tsx` → Dynamic route `/home/123`

### Navigation Methods

**Expo Router Hook**: `useRouter()`

```typescript
import { useRouter } from 'expo-router';

const router = useRouter();

// Push new screen onto stack
router.push('/accounts');                    // Adds to stack
router.push('/(drawer)/accounts');          // Full path

// Navigate back in stack
router.back();                              // Pop current screen

// Replace current screen (no back)
router.replace('/home');                    // Replace current screen

// Check if can go back
if (router.canGoBack()) {
  router.back();
} else {
  router.replace('/welcome');
}
```

### Stack Management

Expo Router maintains a navigation stack automatically:

**Stack Operations**:
1. **Push**: `router.push('/route')` → Adds new screen, can go back
2. **Back**: `router.back()` → Removes current screen, returns to previous
3. **Replace**: `router.replace('/route')` → Swaps current screen, can't go back

**Stack Example**:
```
User Flow:
1. router.push('/home')       → Stack: [Home]
2. router.push('/accounts')    → Stack: [Home, Accounts]
3. router.push('/settings')   → Stack: [Home, Accounts, Settings]
4. router.back()              → Stack: [Home, Accounts]
5. router.back()              → Stack: [Home]

User Flow (with replace):
1. router.push('/onboarding') → Stack: [Onboarding]
2. router.replace('/home')    → Stack: [Home]  (Onboarding removed)
3. router.back()              → No previous screen! (can't go back)
```

### Deep Linking

Expo Router supports deep linking automatically:

```typescript
// Routes are URL-safe
router.push('/contacts/123');              // contacts/:id
router.push('/transactions?status=pending'); // Query params

// Deep links work
{app-name}://accounts                          → opens Accounts screen
{app-name}://contacts/456                     → opens Contact detail
```

## Drawer Navigation (React Navigation)

### When React Navigation is Required

React Navigation is ONLY needed for drawer-specific operations:

**Drawer Operations**:
```typescript
import { DrawerActions, useNavigation } from '@react-navigation/native';

const navigation = useNavigation();

// Toggle drawer (open/close)
navigation.dispatch(DrawerActions.toggleDrawer());

// Open drawer explicitly
navigation.dispatch(DrawerActions.openDrawer());

// Close drawer explicitly
navigation.dispatch(DrawerActions.closeDrawer());
```

**DO NOT** use React Navigation for:
- ❌ Standard navigation (use `router.push()`)
- ❌ Back navigation (use `router.back()`)
- ❌ Route changes (use `router.replace()`)

### Drawer Layout Configuration

The drawer is configured in `app/(drawer)/_layout.tsx`:

```typescript
import { Drawer } from 'expo-router/drawer';
import CustomDrawerContent from '@/components/custom-drawer-content';

export default function DrawerLayout() {
  return (
    <Drawer
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front'
      }}
      initialRouteName="home/index"
    >
      <Drawer.Screen name="home/index" options={{ title: 'Home' }} />
      <Drawer.Screen name="accounts/index" options={{ title: 'Accounts' }} />
      <Drawer.Screen name="contacts/index" options={{ title: 'Contacts' }} />
      {/* etc. */}
    </Drawer>
  );
}
```

**Key Points**:
- Drawer component from `expo-router/drawer` (NOT `@react-navigation/drawer`)
- Screen registration via `<Drawer.Screen>` components
- Custom content via `drawerContent` prop
- `initialRouteName` sets default screen

### Drawer + Expo Router Integration

**Correct Pattern** (Drawer operations + Expo Router navigation):
```typescript
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';

export const HomeHeader = () => {
  const navigation = useNavigation();  // For drawer operations
  const router = useRouter();          // For standard navigation

  // Drawer operation - REQUIRES React Navigation
  const handleMenuPress = () => {
    navigation.dispatch(DrawerActions.toggleDrawer());
  };

  // Standard navigation - USE Expo Router
  const handleSettingsPress = () => {
    router.push('/settings');
  };

  return (
    <View>
      <TouchableOpacity onPress={handleMenuPress}>
        <Icon name="menu" />
      </TouchableOpacity>
      <TouchableOpacity onPress={handleSettingsPress}>
        <Icon name="settings" />
      </TouchableOpacity>
    </View>
  );
};
```

## Navigation Patterns Matrix

### When to Use Which Navigation Method

| Scenario | Navigation Method | Hook | Example |
|----------|------------------|------|---------|
| **Standard Navigation** |
| Navigate forward | `router.push('/route')` | `useRouter()` | Go to Accounts screen |
| Navigate back | `router.back()` | `useRouter()` | Back button in header |
| Replace screen | `router.replace('/route')` | `useRouter()` | Onboarding → Home |
| Check back ability | `router.canGoBack()` | `useRouter()` | Onboarding fallback |
| **Drawer Operations** |
| Toggle drawer | `navigation.dispatch(DrawerActions.toggleDrawer())` | `useNavigation()` | Menu button |
| Open drawer | `navigation.dispatch(DrawerActions.openDrawer())` | `useNavigation()` | Force drawer open |
| Close drawer | `navigation.dispatch(DrawerActions.closeDrawer())` | `useNavigation()` | Force drawer close |
| **Nested Stacks** |
| Navigate in nested stack | `router.push('/nested-route')` | `useRouter()` | Security settings screen |
| Back in nested stack | `router.back()` | `useRouter()` | Back from nested screen |

### Standard Header Pattern

```typescript
// Standard drawer screen header (NO drawer operations)
import { useRouter } from 'expo-router';

export const AccountsHeader = () => {
  const router = useRouter();

  return (
    <Header
      onBackPress={() => router.back()}
      onNavigate={(route) => router.push(route)}
    />
  );
};
```

### Drawer Header Pattern

```typescript
// Home screen header (WITH drawer operations)
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';

export const HomeHeader = () => {
  const navigation = useNavigation();
  const router = useRouter();

  return (
    <Header
      onMenuPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
      onNavigate={(route) => router.push(route)}
    />
  );
};
```

### Onboarding Header Pattern

```typescript
// Onboarding header (with fallback logic)
import { useRouter } from 'expo-router';

export const OnboardingHeader = () => {
  const router = useRouter();

  const handleBackPress = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(drawer)/onboarding/welcome');
    }
  };

  return (
    <Header onBackPress={handleBackPress} />
  );
};
```

## Migration Guide

### From React Navigation to Expo Router

**Step 1: Replace Navigation Hook**
```typescript
// Before
import { useNavigation } from '@react-navigation/native';
const navigation = useNavigation();

// After
import { useRouter } from 'expo-router';
const router = useRouter();
```

**Step 2: Replace Navigation Methods**
```typescript
// Before
navigation.navigate('Accounts');     // String-based route name
navigation.goBack();                // Back navigation

// After
router.push('/accounts');           // Path-based route
router.back();                     // Back navigation
```

**Step 3: Replace Screen Registration**
```typescript
// Before (React Navigation Stack)
<Stack.Navigator>
  <Stack.Screen name="Accounts" component={AccountsScreen} />
</Stack.Navigator>

// After (Expo Router - file-based)
// Just create: app/(drawer)/accounts/index.tsx
// Route automatically registered as /(drawer)/accounts
```

**Step 4: Update Navigation Calls**
```typescript
// Before
router.push('/home');              // Hardcoded route in back button

// After
router.back();                     // Stack-aware back navigation
```

### Migration Checklist

For each header component:

- [ ] Replace `useNavigation` with `useRouter` (unless drawer operations needed)
- [ ] Replace `navigation.navigate()` with `router.push()`
- [ ] Replace `navigation.goBack()` with `router.back()`
- [ ] Replace hardcoded routes in back buttons with `router.back()`
- [ ] Remove redundant navigation imports
- [ ] Verify accessibility labels present
- [ ] Test navigation flow (forward and back)

## Edge Cases

### Onboarding Flows

Onboarding uses `router.replace()` to clear history, preventing users from going back to onboarding screens after completing setup.

**Problem**: After `router.replace()`, `router.back()` fails because there's no previous screen.

**Solution**: Check `router.canGoBack()` before calling `router.back()`:

```typescript
const handleBackPress = () => {
  if (router.canGoBack()) {
    router.back();  // Normal back navigation
  } else {
    router.replace('/onboarding/welcome');  // Fallback for empty stack
  }
};
```

### Auth Flows

Similar to onboarding, auth flows use `router.replace()` to prevent users from returning to login screens after authentication.

```typescript
// Login success
router.replace('/(drawer)/home');  // Can't go back to login

// Logout
router.replace('/(auth)/login');   // Can't go back to authenticated screens
```

### Modal Screens

Modals can be implemented using Expo Router's presentation modes:

```typescript
// app/modals/payment.tsx
export default function PaymentModal() {
  const router = useRouter();

  const handleClose = () => {
    router.back();  // Dismiss modal
  };

  return <Modal onClose={handleClose} />;
}

// Trigger modal
router.push('/modals/payment');  // Opens as modal
```

### Nested Stacks

Nested stacks (like security settings) have their own navigation context:

```
app/
└── (drawer)/
    └── settings/
        └── security/
            ├── _layout.tsx       ← Nested Stack layout
            ├── index.tsx         ← Security settings main
            ├── pin-setup.tsx     ← Pin setup screen
            └── recovery-phrase.tsx  ← Recovery phrase screen
```

**Navigation in Nested Stacks**:
```typescript
// In security settings screens, router.back() works correctly
const handleBackPress = () => {
  router.back();  // Returns to previous screen in security stack
};

// Navigate within security stack
router.push('/settings/security/pin-setup');
```

## Common Pitfalls

### Pitfall 1: Navigation Stack Mismatch

**Problem**:
```typescript
// Home screen
router.push('/accounts');  // Expo Router

// AccountsHeader
navigation.goBack();  // React Navigation - WRONG!
```

**Why it fails**: `router.push()` creates an Expo Router stack entry. `navigation.goBack()` looks for a React Navigation stack entry. No entry exists, so navigation fails.

**Fix**:
```typescript
// Home screen
router.push('/accounts');  // Expo Router

// AccountsHeader
router.back();  // Expo Router - CORRECT!
```

### Pitfall 2: Hardcoded Route in Back Button

**Problem**:
```typescript
const handleBackPress = () => {
  router.push('/home');  // Always goes to home
};
```

**Why it's wrong**: User might have come from Contacts, Transactions, or Settings. Forcing them to Home breaks expected behavior.

**Fix**:
```typescript
const handleBackPress = () => {
  router.back();  // Returns to wherever user came from
};
```

### Pitfall 3: Redundant Navigation Imports

**Problem**:
```typescript
import { useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';

// ... only router.push() and router.back() used
```

**Why it's wasteful**: Importing `useNavigation` adds unnecessary React Navigation dependency. Future developers might mistakenly use `navigation` methods.

**Fix**:
```typescript
import { useRouter } from 'expo-router';

// Only import what you use
```

### Pitfall 4: Missing Fallback in Replace Flows

**Problem**:
```typescript
// Onboarding completion
router.replace('/home');

// Later, in some screen
router.back();  // Fails! No previous screen after replace
```

**Why it fails**: `router.replace()` removes the previous screen from the stack. `router.back()` has nowhere to go.

**Fix**:
```typescript
const handleBackPress = () => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/home');  // Fallback for empty stack
  }
};
```

## Testing Navigation

### Manual Testing Checklist

For each header component:

- [ ] Navigate TO the screen from different sources (home, drawer, other screens)
- [ ] Press back button - verify returns to previous screen (NOT always home)
- [ ] Press back button multiple times - verify stack unwinds correctly
- [ ] Navigate away and back - verify screen state preserved
- [ ] Test edge case: Navigate after `router.replace()` (onboarding, auth flows)
- [ ] Test deep link navigation - verify back button works
- [ ] Test modal dismissal - verify modal closes and returns to previous screen

### Automated Testing

```typescript
import { renderRouter, screen } from 'expo-router/testing-library';

describe('AccountsHeader navigation', () => {
  it('should navigate back correctly', () => {
    // Arrange: Navigate to accounts from home
    const { router } = renderRouter('/home');
    router.push('/accounts');

    // Act: Press back button
    const backButton = screen.getByLabelText('Go back');
    backButton.press();

    // Assert: Should return to home
    expect(router.pathname).toBe('/home');
  });

  it('should handle empty stack gracefully', () => {
    // Arrange: Direct navigation to accounts (no previous screen)
    const { router } = renderRouter('/accounts');

    // Act: Press back button
    const backButton = screen.getByLabelText('Go back');
    backButton.press();

    // Assert: Should handle gracefully (fallback or stay)
    expect(router.pathname).toBe('/accounts'); // or fallback route
  });
});
```

## Summary

**Golden Rules**:
1. **Use Expo Router for all standard navigation** (`router.push()`, `router.back()`, `router.replace()`)
2. **Use React Navigation ONLY for drawer operations** (`DrawerActions.toggleDrawer()`)
3. **Never mix navigation systems** (forward Expo Router → back React Navigation)
4. **Always use `router.back()`** for back buttons (not hardcoded routes)
5. **Check `router.canGoBack()`** in flows that use `router.replace()`

**Quick Reference**:
- ✅ Back button → `router.back()`
- ✅ Forward navigation → `router.push('/route')`
- ✅ Replace screen → `router.replace('/route')`
- ✅ Drawer toggle → `navigation.dispatch(DrawerActions.toggleDrawer())`
- ❌ Back button → `router.push('/home')`
- ❌ Back button → `navigation.goBack()`
- ❌ Mixed systems in same component (without drawer context)

For additional examples and debugging guidance, see `violation-examples.md`.
