---
name: nestjs-patterns
description: NestJS implementation patterns and anti-patterns guide. Use when creating or modifying NestJS modules, providers, or services; setting up PassportStrategy with dependency injection; using useFactory, forwardRef, or complex DI patterns; debugging "Cannot resolve dependencies" or "undefined service" errors; implementing authentication, authorization, or security modules; working with circular dependencies or module imports. Prevents common DI mistakes (dual-factory pattern, DI timing issues). Provides proven working patterns and implementation checklists.
---

# NestJS Patterns Skill

Proactive guidance for implementing NestJS code that avoids known anti-patterns and follows proven working patterns.

## When to Use This Skill

Activate this skill when you are:

1. **Creating or modifying NestJS modules** - New modules or updating existing module configuration
2. **Setting up providers** - Especially with `useFactory`, `useClass`, or `useValue`
3. **Working with PassportStrategy** - Any authentication strategy setup
4. **Using dependency injection** - Constructor injection, `@Inject()` decorators
5. **Dealing with circular dependencies** - Using `forwardRef()` or module import cycles
6. **Debugging DI errors** - "Cannot resolve dependencies", "undefined service", `null` injections
7. **Implementing authentication/authorization** - AuthModule, guards, strategies
8. **Complex provider configurations** - Multiple factories, dynamic modules, async configuration

## Critical Anti-Patterns (Task 38 Learnings)

These patterns cause dependency injection failures and should be avoided.

### ❌ Anti-Pattern 1: Dual-Factory Pattern

**Problem**: Creating two factories for the same service where the second depends on the first.

**DON'T DO THIS:**
```typescript
// auth.module.ts
providers: [
  // First factory with string token
  {
    provide: 'AuthService',
    useFactory: (usersService, jwtService) => new AuthService(usersService, jwtService),
    inject: [forwardRef(() => UsersService), JwtService]
  },
  // Second factory with class token depending on first
  {
    provide: AuthService,
    useFactory: (authService: AuthService) => authService,
    inject: ['AuthService']  // ❌ Depends on first factory
  }
]
```

**Why It Fails**: The first factory may never execute, causing the second factory to receive `null`. This creates a timing issue where strategies receive `null` when injecting `AuthService`.

**Task 38 Evidence**: First factory logs never appeared, strategies received `null` for `AuthService`.

---

### ❌ Anti-Pattern 2: String Token + Class Token Combo in PassportStrategy

**Problem**: Mixing string tokens and class tokens creates injection mismatches.

**DON'T DO THIS:**
```typescript
// auth.module.ts - Provides with string token
providers: [
  { provide: 'AuthService', useClass: AuthService }
]

// local.strategy.ts - Injects with class token
constructor(
  @Inject(forwardRef(() => AuthService)) private readonly authService: AuthService
) {
  super({ usernameField: 'email' });
}
```

**Why It Fails**: Provider uses string token `'AuthService'`, consumer uses class token `AuthService` with `forwardRef()`. This creates a circular reference that resolves to `null`.

**Task 38 Evidence**: Changed to `@Inject('AuthService')` and login functionality was restored.

---

### ❌ Anti-Pattern 3: Using forwardRef() for Timing Issues

**Problem**: `forwardRef()` defers token resolution but does NOT defer constructor execution.

**DON'T USE FOR:**
```typescript
// This won't fix timing issues
constructor(
  @Inject(forwardRef(() => AuthService)) private readonly authService: AuthService
) {
  super({ usernameField: 'email' });
}
```

**What forwardRef() Actually Does**: Defers when the dependency TOKEN is resolved, not when the constructor executes.

**When to Use forwardRef()**: Only for actual circular dependencies where two modules/services reference each other.

**Task 38 Evidence**: Three attempts with `forwardRef()` all failed with same "undefined dependencies" error.

---

### ❌ Anti-Pattern 4: Relying on Provider Order

**Problem**: Assuming providers instantiate in the order they're listed.

**DON'T RELY ON THIS:**
```typescript
providers: [
  SocialAccountService,  // ❌ Moving this first won't help
  AuthService,           // Even though AuthService depends on it
  LocalStrategy,
  GoogleStrategy
]
```

**Why It Fails**: NestJS initializes all providers within the same module concurrently with `Promise.all`, disregarding dependency relations.

**Task 38 Evidence**: Reordering providers had no effect on initialization timing.

---

## Working Patterns (Proven Solutions)

### ✅ Pattern 1: Single Factory with Explicit Dependencies

**Use When**: You need custom instantiation logic or must handle circular dependencies.

**DO THIS:**
```typescript
// auth.module.ts
providers: [
  {
    provide: AuthService,  // ✅ Use class token directly
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
      forwardRef(() => UsersService),  // Use forwardRef ONLY for circular deps
      JwtService,
      ConfigService,
      SocialAccountService
    ]
  }
]
```

**Why It Works**:
- Single factory provides `AuthService` directly with class token
- Explicit `inject` array forces NestJS to resolve dependencies before calling factory
- No string token confusion
- Clean dependency chain

**Task 38 Evidence**: This pattern resolved the authentication failure.

---

### ✅ Pattern 2: Standard Class Token Injection in Strategies

**Use When**: Injecting services into PassportStrategy classes.

**DO THIS:**
```typescript
// local.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService  // ✅ Standard injection
  ) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string): Promise<any> {
    return this.authService.validateUser(email, password);
  }
}
```

**Why It Works**:
- No `@Inject()` decorator needed for class tokens
- NestJS automatically resolves class token dependencies
- Clean, simple code

**When to Use `@Inject()`**: ONLY when using string tokens or custom injection tokens.

---

### ✅ Pattern 3: String Token Injection (Alternative)

**Use When**: You specifically need string token providers (rare).

**DO THIS:**
```typescript
// auth.module.ts
providers: [
  { provide: 'AuthService', useClass: AuthService }
]

// local.strategy.ts
constructor(
  @Inject('AuthService') private readonly authService: AuthService  // ✅ Match token type
) {
  super({ usernameField: 'email' });
}
```

**Why It Works**: Provider and consumer use the same token type (string token).

**Recommendation**: Prefer class tokens (Pattern 2) over string tokens for better type safety.

---

### ✅ Pattern 4: Module Import/Export Verification

**Use When**: Setting up module dependencies.

**DO THIS:**
```typescript
// users.module.ts
@Module({
  providers: [UsersService, PrismaService],
  exports: [UsersService]  // ✅ Export what other modules need
})
export class UsersModule {}

// auth.module.ts
@Module({
  imports: [
    UsersModule,      // ✅ Import module that provides UsersService
    JwtModule.registerAsync({...}),
    PassportModule
  ],
  providers: [
    {
      provide: AuthService,
      useFactory: (usersService: UsersService, ...) => {...},
      inject: [forwardRef(() => UsersService), ...]  // ✅ Inject from imported module
    }
  ]
})
export class AuthModule {}
```

**Why It Works**:
- Proper module imports establish dependency graph
- Exports make services available to importing modules
- NestJS can resolve dependencies correctly

**Common Mistake**: Forgetting to export service from providing module.

---

## Implementation Checklist

Before implementing NestJS DI code, verify:

### Pre-Flight Checks

- [ ] **No dual-factory patterns** - Only one factory per service
- [ ] **Token consistency** - Provider and consumer use same token type (class or string)
- [ ] **Explicit inject arrays** - All factory dependencies listed in `inject: [...]`
- [ ] **Module imports** - Importing module that provides the dependency
- [ ] **Module exports** - Exporting service from providing module
- [ ] **forwardRef() usage** - Only for actual circular dependencies, not timing issues
- [ ] **Global modules** - ConfigModule, DatabaseModule set to `isGlobal: true` if needed

### Questions to Ask

1. **Am I using two factories for the same service?** → Use single factory
2. **Am I mixing string tokens and class tokens?** → Use consistent token type
3. **Am I using forwardRef() to fix timing?** → Won't work, use factory pattern instead
4. **Did I export the service from its module?** → Add to `exports: []`
5. **Did I import the providing module?** → Add to `imports: []`
6. **Is this a circular dependency?** → Consider architectural refactor or use `forwardRef()`

### Verification Steps

After implementation:

1. **Check startup logs** - Verify factory executes (add temporary log)
2. **Test endpoint** - Verify service methods work correctly
3. **Check for nulls** - Services should not be `undefined` or `null`
4. **Review module structure** - Verify imports/exports chain correctly

---

## NestJS DI Troubleshooting Guide

### Error: "Cannot resolve dependencies of X"

**Likely Causes**:
1. Missing module import (importing module doesn't import providing module)
2. Service not exported from providing module
3. Circular dependency between modules

**Fix**:
1. Verify `imports: [ProvidingModule]` in consuming module
2. Verify `exports: [ServiceName]` in providing module
3. Use `forwardRef()` in module imports if circular

---

### Error: "undefined is not a function" or "Cannot read properties of null"

**Likely Causes**:
1. Dual-factory pattern (Task 38 issue)
2. Token mismatch (string vs class)
3. Provider order dependency (doesn't work)

**Fix**:
1. Use single factory with explicit dependencies (Pattern 1)
2. Match token types between provider and consumer
3. Don't rely on provider order

---

### PassportStrategy receives null/undefined service

**Likely Causes**:
1. Token type mismatch (most common - Task 38)
2. Dual-factory pattern
3. Missing module import

**Fix**:
1. Use standard class token injection (Pattern 2)
2. Use single factory pattern (Pattern 1)
3. Verify module imports/exports

---

## Progressive Disclosure

### Detailed Documentation

For comprehensive investigation details, root cause analysis, and research findings from Task 38:

**See**: [task-38-di-patterns.md](references/task-38-di-patterns.md)

**Includes**:
- Full investigation timeline
- Multiple solution attempts and why they failed
- NestJS GitHub issues and community solutions
- Evidence and diagnostic logs
- Links to Stack Overflow and NestJS documentation

### Original Task 38 Files

**Location**: `/docs/tasks/task.38.authservice-di-failure/`

**Files**:
- `README.md` - Quick summary and resolution
- `task.38.authservice-di-failure.md` - Comprehensive bug report
- `nestjs-research-findings.md` - Community solutions and known NestJS issues

---

## Future NestJS Patterns

This section is a placeholder for future patterns discovered during development.

### Template for Adding New Patterns

```markdown
### Pattern Name

**When to Use**: [Scenario where this pattern applies]

**Context**: [Background on why this pattern exists]

**Anti-Pattern (❌ Don't do this)**:
```typescript
// BAD CODE
```

**Working Pattern (✅ Do this)**:
```typescript
// GOOD CODE
```

**Why**: [Explanation of why the pattern works]

**Reference**: [Link to task/issue if applicable]
```

### Potential Future Topics

As NestJS patterns emerge in your codebase, add sections for:

- **Testing Patterns**
  - TestingModule setup
  - Mocking Prisma in tests
  - E2E test configuration

- **Exception Handling**
  - Global exception filters
  - Custom exception classes
  - Error response formatting

- **Guards & Interceptors**
  - Authentication guards
  - Authorization guards
  - Logging interceptors
  - Transform interceptors

- **WebSocket Patterns**
  - Gateway setup
  - Room management
  - Authentication in WebSocket

- **Microservice Patterns**
  - Message patterns
  - Event patterns
  - Service communication

- **Database Patterns**
  - Prisma transaction handling
  - Connection pooling
  - Migration strategies

---

## Summary

### Key Takeaways from Task 38

1. **Use single factory pattern** - One factory per service, no dual-factory chains
2. **Standard class token injection** - No decorators needed for class tokens
3. **Explicit inject arrays** - Always specify dependencies in `inject: [...]`
4. **Token consistency** - Provider and consumer must use same token type
5. **forwardRef() for circular deps only** - Won't fix timing issues
6. **Don't rely on provider order** - NestJS initializes concurrently

### Best Practice for PassportStrategy

When using PassportStrategy with custom services:

```typescript
// Module - Single factory with class token
{
  provide: AuthService,
  useFactory: (...deps) => new AuthService(...deps),
  inject: [forwardRef(() => UsersService), JwtService, ConfigService]
}

// Strategy - Standard injection
constructor(private readonly authService: AuthService) {
  super({ usernameField: 'email' });
}
```

### When in Doubt

1. Check this skill for anti-patterns
2. Review [task-38-di-patterns.md](references/task-38-di-patterns.md) for detailed examples
3. Verify module imports/exports chain
4. Add diagnostic logs to verify dependencies resolve correctly
5. Test with actual API calls, not just compilation

---

**Skill Version**: 1.0.0
**Last Updated**: 2025-12-31
**Primary Source**: Task 38 - AuthService Dependency Injection Failure
**Maintained By**: Your Development Team
