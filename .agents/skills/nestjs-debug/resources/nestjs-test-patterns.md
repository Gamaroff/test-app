# NestJS-Specific Test Patterns

This document supplements `references/code-vs-test-validation.md` with patterns specific to NestJS testing.

**Reference the shared framework for core methodology.** This document adds NestJS-specific context.

---

## Overview

NestJS applications have unique testing challenges related to:
- Dependency Injection (DI) container resolution
- Module structure and imports/exports
- Decorators and metadata
- Service lifecycle hooks
- Provider registration

These can cause test failures that require platform-specific investigation techniques.

---

## NestJS-Specific Error Pattern 1: Mock Service Not in Provider Array

### Symptom

```
Test Failure:
Nest can't resolve dependencies of MyController (#0)
```

OR

```
TypeError: Cannot read property 'getUser' of undefined
Mock service not being injected into controller
```

### Root Cause Analysis

**Code Wrong:**
- Service not actually registered in module providers
- Test assumption about DI is incorrect
- Service has wrong name/export

**Test Wrong:**
- Mock not matching actual service interface
- Test assuming wrong dependency
- Mock not registered in test module

### Evidence to Gather

```bash
# Check if service is registered in module
grep -A 20 "@Module" apps/{app}/src/modules/*/module.ts | grep -A 10 "providers"

# Check if test creates module with mock
grep -A 10 "Test.createTestingModule" test-file.spec.ts

# Verify mock matches service interface
grep "class.*Service" apps/{app}/src/modules/*/service.ts
# Compare to mock in test
grep -A 10 "jest.mock" test-file.spec.ts
```

### Code vs Test Decision Tree

```
Does the real service exist in the module providers?
├─ NO → Code wrong (service not registered)
│   └─ Fix: Add service to providers array
└─ YES → Does test create module with mock?
    ├─ NO → Test wrong (not mocking properly)
    │   └─ Fix: Create test module with mock provider
    └─ YES → Does mock match service interface?
        ├─ NO → Test wrong (incomplete mock)
        │   └─ Fix: Add missing methods to mock
        └─ YES → Check DI resolution order
```

### Example: Mock Service Not in Test Module

```typescript
// ❌ WRONG - Mock not registered in test module
describe('MyController', () => {
  let controller: MyController;
  let service: MyService;

  beforeEach(async () => {
    // Service not provided to test module!
    const module = await Test.createTestingModule({
      controllers: [MyController]
      // Missing providers!
    }).compile();

    controller = module.get<MyController>(MyController);
    // FAILS: NestJS can't resolve MyService
  });
});

// ✅ CORRECT - Mock service in test module
describe('MyController', () => {
  let controller: MyController;
  let service: MyService;

  beforeEach(async () => {
    const mockService = {
      getUser: jest.fn(() => Promise.resolve({ id: '1', name: 'Test' }))
    };

    const module = await Test.createTestingModule({
      controllers: [MyController],
      providers: [
        {
          provide: MyService,
          useValue: mockService  // ← Mock service provided
        }
      ]
    }).compile();

    controller = module.get<MyController>(MyController);
    service = module.get<MyService>(MyService);
  });

  it('should get user', async () => {
    const result = await controller.getUser('1');
    expect(service.getUser).toHaveBeenCalledWith('1');
    expect(result).toEqual({ id: '1', name: 'Test' });
  });
});
```

### Investigation Steps

1. **Check Module Providers:**
   ```bash
   grep -A 30 "@Module({" apps/{api-service}/src/auth/auth.module.ts | grep providers
   ```

2. **Verify Service Exists:**
   ```bash
   grep "class.*Service" apps/{api-service}/src/auth/auth.service.ts
   ```

3. **Check Test Module Setup:**
   ```bash
   grep -A 15 "Test.createTestingModule" src/auth/auth.controller.spec.ts
   ```

4. **Validate Mock Matches Service:**
   ```typescript
   // Real service methods
   class MyService {
     getUser(id: string) { ... }
     updateUser(id: string, data: {}) { ... }
     deleteUser(id: string) { ... }
   }

   // Mock must have all three
   const mockService = {
     getUser: jest.fn(),
     updateUser: jest.fn(),
     deleteUser: jest.fn()
   };
   ```

---

## NestJS-Specific Error Pattern 2: Module Import/Export Mismatch

### Symptom

```
Test Failure:
Cannot inject ConfigService - not exported from ConfigModule
```

OR

```
TypeError: Cannot read property 'get' of undefined
Trying to access ConfigService that isn't exported
```

### Root Cause Analysis

**Code Wrong:**
- Service not exported from module
- Module not imported in dependent module
- Circular dependency between modules

**Test Wrong:**
- Test doesn't import necessary modules
- Test module setup incomplete
- Using wrong service name

### Evidence to Gather

```bash
# Check if service is exported from module
grep -A 10 "exports:" apps/{app}/src/config/config.module.ts

# Check if dependent module imports it
grep -B 5 "imports:" apps/{app}/src/app.module.ts | grep -i config

# Check for circular imports
grep "import.*from.*auth" apps/{app}/src/config/*
grep "import.*from.*config" apps/{app}/src/auth/*
```

### Decision Tree

```
Is the service exported from its module?
├─ NO → Code wrong (service not exported)
│   └─ Fix: Add service to exports array
└─ YES → Is the module imported in dependent module?
    ├─ NO → Code wrong (module not imported)
    │   └─ Fix: Add module to imports
    └─ YES → Does test module import required modules?
        ├─ NO → Test wrong (incomplete module setup)
        │   └─ Fix: Add module to test imports
        └─ YES → Check for circular dependencies
```

### Example: Service Not Exported

```typescript
// ❌ WRONG - ConfigService not exported
@Module({
  imports: [ConfigModule.forRoot()],
  providers: [ConfigService],
  // Missing exports!
})
export class ConfigModule {}

// ✅ CORRECT - ConfigService exported
@Module({
  imports: [ConfigModule.forRoot()],
  providers: [ConfigService],
  exports: [ConfigService]  // ← Added
})
export class ConfigModule {}

// ✅ Test module must import it
const module = await Test.createTestingModule({
  imports: [ConfigModule],  // ← Must import module
  controllers: [MyController]
}).compile();
```

---

## NestJS-Specific Error Pattern 3: Missing @Injectable() Decorator

### Symptom

```
Test Failure:
Nest can't resolve dependencies of AuthService
Error: Cannot read property 'constructor' of undefined
```

### Root Cause Analysis

**Code Wrong** (95% of cases):
- Service missing @Injectable() decorator
- NestJS can't introspect service to build DI

**Test Wrong** (5% of cases):
- Test using wrong service class
- Mock class also missing decorator

### Decision Tree

```
Does the service have @Injectable() decorator?
├─ NO → Code wrong (missing decorator)
│   └─ Fix: Add @Injectable() to service class
└─ YES → Is test using correct service class?
    ├─ NO → Test wrong (wrong import)
    └─ YES → Check for typos/references
```

### Example: Missing @Injectable()

```typescript
// ❌ WRONG - No @Injectable() decorator
export class AuthService {
  constructor(private configService: ConfigService) {}
}

// ✅ CORRECT - Has @Injectable() decorator
import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor(private configService: ConfigService) {}
}
```

---

## NestJS-Specific Error Pattern 4: Async Module Initialization Timing

### Symptom

```
Test Failure:
Cannot read property 'get' of undefined
ConfigService accessed before module initialized
```

OR

```
Timeout - Async callback not invoked within 5000ms
Module initialization hanging
```

### Root Cause Analysis

**Code Wrong:**
- forRootAsync() configuration error
- Service accessing config in constructor (before initialization)
- Async dependencies not awaited

**Test Wrong:**
- Test not awaiting module compilation
- Test module.compile() not awaited
- Mock async provider not returning Promise

### Decision Tree

```
Does test await module.compile()?
├─ NO → Test wrong (missing await)
│   └─ Fix: Add await before module.compile()
└─ YES → Does module use forRootAsync()?
    ├─ YES → Check async provider configuration
    │   ├─ Is provider returning Promise? → Code/Test
    │   └─ Is configuration valid? → Code/Test
    └─ NO → Check service constructor access
        └─ Is service accessing config in constructor? → Code wrong
```

### Example: Missing Await

```typescript
// ❌ WRONG - Not awaiting module.compile()
describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {  // No async!
    const module = Test.createTestingModule({
      providers: [MyService, ConfigService]
    }).compile();  // Not awaited!

    service = module.get(MyService);
    // FAILS: Module not compiled yet
  });
});

// ✅ CORRECT - Awaiting module.compile()
describe('MyService', () => {
  let service: MyService;

  beforeEach(async () => {  // async
    const module = await Test.createTestingModule({  // await
      providers: [MyService, ConfigService]
    }).compile();

    service = module.get(MyService);
    // PASSES: Module compiled before use
  });
});
```

---

## NestJS Test Module Setup: Common Mistakes

### Mistake 1: Not Resetting Mocks Between Tests

```typescript
// ❌ WRONG - No cleanup
jest.mock('./config.service');

describe('MyService', () => {
  it('test 1', () => {
    const mockConfig = require('./config.service');
    mockConfig.get.mockReturnValue('value1');
    // Mock state leaks to test 2!
  });

  it('test 2', () => {
    const mockConfig = require('./config.service');
    expect(mockConfig.get()).toBe('value2');  // Gets 'value1'!
  });
});

// ✅ CORRECT - With cleanup
jest.mock('./config.service');

describe('MyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();  // Reset between tests
  });

  it('test 1', () => {
    const mockConfig = require('./config.service');
    mockConfig.get.mockReturnValue('value1');
  });

  it('test 2', () => {
    const mockConfig = require('./config.service');
    mockConfig.get.mockReturnValue('value2');
    expect(mockConfig.get()).toBe('value2');
  });
});
```

### Mistake 2: Mock Not Matching Service Interface

```typescript
// ❌ WRONG - Mock incomplete
jest.mock('auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    login: jest.fn()  // Missing other methods!
  }))
}));

// Code calls service.validateToken()
// FAILS: Method doesn't exist in mock

// ✅ CORRECT - Mock complete
jest.mock('auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    login: jest.fn(() => Promise.resolve({ token: 'xyz' })),
    validateToken: jest.fn(() => Promise.resolve(true)),
    refreshToken: jest.fn(() => Promise.resolve({ token: 'abc' }))
  }))
}));
```

### Mistake 3: Test Module Missing forRoot()

```typescript
// ❌ WRONG - ConfigModule not initialized
const module = await Test.createTestingModule({
  imports: [
    ConfigModule  // forRoot() not called!
  ]
}).compile();

// ✅ CORRECT - ConfigModule initialized
const module = await Test.createTestingModule({
  imports: [
    ConfigModule.forRoot()  // ← Added forRoot()
  ]
}).compile();
```

---

## Evidence Gathering Commands (NestJS)

```bash
# Find module providers
grep -A 20 "@Module({" apps/{api-service}/src/auth/auth.module.ts

# Check exports
grep -A 5 "exports:" apps/{api-service}/src/auth/auth.module.ts

# Find service decorators
grep -B 2 "class.*Service" apps/{api-service}/src/auth/auth.service.ts

# Check test module setup
grep -A 20 "Test.createTestingModule" src/**/*.spec.ts

# Check for circular dependencies
grep "import.*auth" apps/{api-service}/src/config/*.ts
grep "import.*config" apps/{api-service}/src/auth/*.ts

# Find mock declarations
grep -n "jest.mock" src/**/*.spec.ts

# Check for missing awaits
grep -n "beforeEach()" src/**/*.spec.ts | head -20
```

---

## Real-World NestJS Example: {api-service}

### Scenario: Auth Service Test Fails

```
Error: Nest can't resolve dependencies of AuthService
```

### Investigation Process

1. **Check module structure:**
   ```bash
   grep -A 10 "@Module" apps/{api-service}/src/auth/auth.module.ts
   # Find: AuthService in providers, but not in test module
   ```

2. **Check exports:**
   ```bash
   grep "exports:" apps/{api-service}/src/auth/auth.module.ts
   # Find: AuthService not exported!
   ```

3. **Verdict:** Code wrong
   - Service not exported from AuthModule
   - Fix: Add exports: [AuthService]

4. **Update test module:**
   ```typescript
   const module = await Test.createTestingModule({
     imports: [AuthModule],  // Now has exported service
     // ... other config
   }).compile();
   ```

---

## Validation Checklist: NestJS Tests

Before submitting an NestJS test:

- [ ] All services used are in test module providers or imports
- [ ] All services have @Injectable() decorator
- [ ] Mock services match real service interface (all methods present)
- [ ] Test module calls module.compile() and it's awaited
- [ ] Test module imports any modules whose services are used
- [ ] jest.clearAllMocks() in beforeEach
- [ ] Async operations are awaited (async/await or Promise.then)
- [ ] Module.forRoot() or forRootAsync() called if needed
- [ ] Services are exported from their modules if used elsewhere
- [ ] No circular dependencies between modules

---

## Summary

NestJS tests fail for platform-specific reasons:
1. **Service not in providers** - Test module setup wrong
2. **Service not exported** - Module configuration wrong
3. **Missing @Injectable()** - Code missing decorator
4. **Async initialization** - Test not awaiting module.compile()
5. **Mock incomplete** - Test mock doesn't match service
6. **Module not imported** - Test module setup wrong

**Use the `references/code-vs-test-validation.md` framework to decide code vs test,** then use this supplement to understand NestJS-specific patterns.
