# Task 38: NestJS Dependency Injection Patterns

**Reference Documentation** - Extracted from Task 38 investigation

**Status**: ✅ RESOLVED
**Date**: 2025-12-05
**Severity**: Critical

---

## Quick Summary

**Problem**: All dependencies injected into AuthService constructor were `undefined` during instantiation, causing complete authentication failure.

**Root Cause**: Dual-factory pattern failure where:
- First factory provided `'AuthService'` (string token) via useFactory
- Second factory provided `AuthService` (class token) depending on `'AuthService'`
- First factory never executed (no factory logs ever appeared)
- Result: Strategies received `null` when injecting AuthService

**Solution**: Simplified to single factory pattern with standard injection.

---

## Resolution

### Applied Fix

**Files Modified**:
1. `apps/{api-service}/src/auth/auth.module.ts` - Simplified to single factory
2. `apps/{api-service}/src/auth/strategies/local.strategy.ts` - Standard injection
3. `apps/{api-service}/src/auth/strategies/google.strategy.ts` - Standard injection

### Before (Broken - Dual Factory)

```typescript
// auth.module.ts
providers: [
  {
    provide: 'AuthService',
    useFactory: (
      usersService: UsersService,
      jwtService: JwtService,
      configService: ConfigService,
      socialAccountService: SocialAccountService
    ) => {
      return new AuthService(
        usersService,
        jwtService,
        configService,
        socialAccountService
      );
    },
    inject: [forwardRef(() => UsersService), JwtService, ConfigService, SocialAccountService]
  },
  {
    provide: AuthService,
    useFactory: (authService: AuthService) => authService,
    inject: ['AuthService']  // ❌ Circular dependency on first factory
  }
]
```

```typescript
// local.strategy.ts
constructor(
  @Inject(forwardRef(() => AuthService)) private readonly authService: AuthService
) {
  super({ usernameField: 'email' });
}
```

**Result**: Login errors
```
"error": "Cannot read properties of null (reading 'validateUser')"
// Factory logs never appeared - first factory never executed
```

---

### After (Fixed - Single Factory)

```typescript
// auth.module.ts
providers: [
  {
    provide: AuthService,  // ✅ Single factory with class token
    useFactory: (
      usersService: UsersService,
      jwtService: JwtService,
      configService: ConfigService,
      socialAccountService: SocialAccountService
    ) => {
      return new AuthService(
        usersService,
        jwtService,
        configService,
        socialAccountService
      );
    },
    inject: [
      forwardRef(() => UsersService),
      JwtService,
      ConfigService,
      SocialAccountService
    ]
  }
]
```

```typescript
// local.strategy.ts
constructor(
  private readonly authService: AuthService  // ✅ Standard injection, no decorator
) {
  super({ usernameField: 'email' });
}
```

**Result**: ✅ Success
```
Factory logs appear: "🏭 [AuthService Factory] Creating AuthService..."
AuthService properly injected, login endpoint functional
```

---

## Why This Works

1. **Single factory** provides AuthService directly with class token (no string token needed)
2. **Standard injection** in strategies - no `@Inject()` decorator required for class tokens
3. **Factory executes** during module initialization - dependencies properly resolved
4. **No circular references** - clean dependency chain with explicit inject array

---

## What We Tried (and Failed)

### Attempt 1: forwardRef()

**Implementation**:
```typescript
// local.strategy.ts
constructor(
  @Inject(forwardRef(() => AuthService)) private readonly authService: AuthService
) {
  super({ usernameField: 'email' });
}
```

**Result**: ❌ FAILED
```
[AuthService] Constructor called with: {
  usersServiceDefined: false,
  usersServiceType: 'undefined',
  jwtServiceDefined: false,
  configServiceDefined: false,
  socialAccountServiceDefined: false
}
```

**Why It Failed**: `forwardRef()` defers token resolution, NOT constructor execution. Constructor still executed before InstanceLoader phase.

---

### Attempt 2: ModuleRef Lazy Injection

**Implementation**:
```typescript
// local.strategy.ts
import { ModuleRef } from '@nestjs/core';

constructor(private moduleRef: ModuleRef) {
  super({ usernameField: 'email' });
}

async validate(email: string, password: string): Promise<any> {
  const authService = this.moduleRef.get(AuthService, { strict: false });
  const user = await authService.validateUser(email, password);
  // ...
}
```

**Result**: ❌ FAILED
```
[AuthService] Constructor called with: {
  usersServiceDefined: false,
  // ...all still undefined...
}
```

**Why It Failed**: Lazy injection defers USAGE but does NOT prevent premature constructor execution.

---

### Attempt 3: Provider Reordering

**Implementation**:
```typescript
// auth.module.ts
providers: [
  SocialAccountService,  // Moved before AuthService
  AuthService,
  IntegratedAuthService,
  UnifiedJwtService,
  WsJwtGuard,
  JwtStrategy,
  LocalStrategy,
  GoogleStrategy
]
```

**Result**: ❌ FAILED (same undefined dependencies)

**Why It Failed**: Provider ordering has NO effect on when constructors execute. NestJS initializes all providers within the same module concurrently with `Promise.all`.

---

## Root Cause Analysis

### The Timing Problem

All service constructors execute during **Module Scanning Phase**, but dependency resolution happens during **InstanceLoader Phase**.

**Expected Behavior**:
```
1. Module Scanning → Discover providers
2. InstanceLoader → Resolve dependencies
3. Constructor Execution → Inject resolved dependencies
```

**Actual Behavior**:
```
1. Module Scanning → Discover providers + EXECUTE CONSTRUCTORS (deps undefined)
2. InstanceLoader → Resolve dependencies (TOO LATE)
3. Services remain broken with undefined dependencies
```

### Known NestJS Issue

**Matches**: [NestJS Issue #14773](https://github.com/nestjs/nest/issues/14773)

> "All providers within the same module are initialized concurrently with Promise.all, disregarding their dependency relations."

**Impact**:
- AuthService and its dependencies instantiate concurrently
- Constructor execution happens before dependency resolution completes
- All dependencies appear as `undefined` during construction

---

## Lessons Learned

### What Worked ✅

1. **Single Factory Pattern** - Direct class token provision with explicit dependency injection
2. **Standard DI** - No special decorators needed, NestJS handles class token injection automatically
3. **Explicit inject array** - Forces proper dependency resolution order

### What Didn't Work ❌

1. **Dual-factory pattern** - Second factory depending on first factory creates timing issues
2. **String token + class token combo** - Unnecessary complexity, factory never executed
3. **forwardRef() in strategies** - Only defers token resolution, not constructor execution
4. **ModuleRef lazy injection** - Defers usage but not instantiation
5. **Provider reordering** - No effect on concurrent initialization

---

## Best Practice for PassportStrategy

When using PassportStrategy with custom services:

### Rule 1: Use Single Factory
```typescript
{
  provide: AuthService,  // Use class token, NOT string token
  useFactory: (...deps) => new AuthService(...deps),
  inject: [forwardRef(() => Dep1), Dep2, ...]
}
```

### Rule 2: Inject Normally in Strategies
```typescript
constructor(private readonly service: ServiceClass) {
  super({ usernameField: 'email' });
}
```

### Rule 3: Explicit inject Array
```typescript
inject: [
  forwardRef(() => UsersService),  // Use forwardRef ONLY for circular deps
  JwtService,
  ConfigService
]
```

### Rule 4: Avoid Dual-Factory Patterns
```typescript
// ❌ DON'T DO THIS
{
  provide: 'ServiceName',
  useFactory: (...) => new Service(...),
  inject: [...]
},
{
  provide: ServiceClass,
  useFactory: (service) => service,
  inject: ['ServiceName']  // ❌ Circular dependency
}
```

---

## Additional Resources

### Internal Documentation

Full task documentation at `/docs/tasks/task.38.authservice-di-failure/`:
- `README.md` - Quick summary and resolution
- `task.38.authservice-di-failure.md` - Comprehensive bug report with full timeline
- `nestjs-research-findings.md` - Community solutions and known NestJS issues

### External Resources

**NestJS GitHub Issues**:
- [#14773](https://github.com/nestjs/nest/issues/14773) - Lifecycle hooks dependency ordering
- [#2433](https://github.com/nestjs/nest/issues/2433) - JWT Strategy dependency issues

**Stack Overflow Solutions**:
- [Why service not injected into passport strategy?](https://stackoverflow.com/questions/67955829/why-nestjs-service-is-not-injected-into-passport-strategy)
- [Injected service is undefined in constructor](https://stackoverflow.com/questions/50111330/nestjs-injected-service-is-undefined-in-the-constructor)

**Community Guides**:
- [DigitalOcean - Understanding Circular Dependencies in NestJS](https://www.digitalocean.com/community/tutorials/understanding-circular-dependency-in-nestjs)
- [Trilon - Avoiding Circular Dependencies in NestJS](https://trilon.io/blog/avoiding-circular-dependencies-in-nestjs)

---

## When to Reference This Document

Use this reference when:
1. Implementing new PassportStrategy services
2. Debugging "Cannot resolve dependencies" errors
3. Seeing `null` or `undefined` injected services
4. Setting up complex dependency injection
5. Encountering circular dependency issues
6. Working with useFactory patterns

**Skill File**: Return to [SKILL.md](../SKILL.md) for quick reference patterns.

---

**Task ID**: task.38.authservice-di-failure
**Resolution Date**: 2025-12-05
**Status**: ✅ RESOLVED - Login functionality restored
**Documentation Maintained By**: Development Team
