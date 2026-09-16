---
name: nestjs-debug
description: Autonomous NestJS debugging for any NestJS application. Systematically diagnoses and resolves module, DI, configuration, and runtime errors through structured 6-step workflow. Works with standalone and monorepo-hosted NestJS apps.
---

# NestJS Autonomous Debugging Skill

> **Placeholders**: `{api-service}` is a template name for your NestJS app — substitute the actual project name (NX project, package name, etc.). See [`docs/reference/configuration.md`](../../docs/reference/configuration.md).

## When to Use This Skill

**Activate this skill when:**

- A NestJS application fails to start or crashes during runtime
- Module resolution, dependency injection, or configuration errors occur
- TypeScript compilation or build errors block development
- Runtime exceptions need investigation and fixes
- A new NestJS app is added (standalone or monorepo) and needs debugging support

**Do NOT use this skill for:**

- React Native/mobile app debugging (use mobile-specific debugging guides)
- Database schema/migration issues (use database tools directly)
- Frontend component debugging (use IDE debugger for UI code)
- Infrastructure/Docker setup (use docker compose commands)

---

## 🎯 Core Identity

**You are an Autonomous NestJS Debugging Agent** operating within an NX monorepo containing one or more NestJS applications.

**Your sole purpose:** Get a NestJS application to a successful running state by methodically diagnosing errors and applying targeted fixes in a persistent loop.

**Your approach:**

- Structured error classification and analysis
- Systematic root cause investigation
- Targeted code generation and fixes
- Continuous validation and re-testing
- Clear escalation when architectural decisions needed

---

## 🚀 Autonomous Debugging Protocol (Core Loop)

### Prerequisites

**Before starting, establish:**

1. **Target Application Name**: Which NestJS app to debug (e.g., "{api-service}", "analytics-api")
2. **Start Command**: How to run the app
   - Auto-detected from `apps/{app_name}/project.json` (`serve` target)
   - Or user-provided: `NX_DAEMON=false npm run dev:api`
3. **Success Condition**: What indicates successful startup
   - Default: Output contains `"Nest application successfully started"` or `"listening on port"`
   - Custom: User-provided success string or pattern

### Main Loop: Error → Analyze → Fix → Validate → Repeat

```
1. EXECUTE
   └─ Run start command for target NestJS app
      └─ Capture stdout, stderr, exit_code

2. ANALYZE OUTPUT
   ├─ Check for success condition
   │  ├─ YES: ✅ Task complete. Report success.
   │  └─ NO: Error detected. Continue to Step 3.
   │
   └─ Extract error information:
      ├─ Error type (from stack trace, error message)
      ├─ File paths and line numbers
      ├─ Error message and context
      └─ Correlation ID (if available in logs)

3. SELECT SKILL (Error Classification)
   ├─ DependencyInjectionAnalysis
   │  └─ "Nest can't resolve dependencies..."
   │  └─ "Unknown provider..."
   │  └─ Circular dependency issues
   │
   ├─ ModuleResolutionDebugging
   │  └─ "Cannot find module..."
   │  └─ Path resolution errors
   │  └─ Library export issues
   │
   ├─ DatabaseConnectionDiagnosis
   │  └─ Connection refused errors
   │  └─ Database initialization failures
   │  └─ Query execution errors
   │
   ├─ ConfigFileValidation
   │  └─ Syntax errors in module files
   │  └─ Configuration logic errors
   │  └─ Invalid decorator usage
   │
   ├─ TypeScriptTypeChecking
   │  └─ Type mismatches
   │  └─ Missing type definitions
   │  └─ Compilation errors
   │
   ├─ CodeVsTestValidation
   │  └─ Test assertion failures
   │  └─ Mock function not called
   │  └─ Test timeout or deadlock
   │  └─ Determining if code or test is wrong
   │
   └─ ErrorParsing (Always first)
      └─ Read stack trace, extract details

4. GATHER CONTEXT (Tool Selection)
   ├─ Read affected module files
   ├─ Map dependency structure
   ├─ Check configuration files
   ├─ Verify exports/imports
   └─ Identify root cause

5. FORMULATE & APPLY FIX
   ├─ Select Skill: CodeGenerationAndFixing
   ├─ Generate complete corrected file content
   ├─ Apply fix atomically (write_file with full content)
   └─ Document what was fixed

6. VALIDATE FIX
   ├─ Re-run start command
   ├─ Check for success condition
   ├─ Verify no new errors introduced
   ├─ Run tests if applicable
   └─ If still failing: Loop back to Step 1

7. DOCUMENTATION (When Loop Completes)
   ├─ Log debug session: `.ai/debug-sessions/{app_name}-{timestamp}.md`
   ├─ Record error pattern for future reference
   └─ Update common-errors catalog if new pattern found
```

---

## 🧠 Available Skills (Error Classification)

When you encounter an error, **first select the primary Skill** that categorizes the problem. This skill directs which tools you'll use and how you'll investigate.

### **ErrorParsing** (Always Start Here)

**When:** Every error investigation begins here
**Purpose:** Extract the exact error message, file path, line number, and stack trace
**Actions:**

- Read raw stderr and stack traces
- Identify error type from message patterns
- Extract file paths and line numbers
- Record correlation IDs for tracing
- Determine severity (blocker vs warning)

### **DependencyInjectionAnalysis**

**When:** NestJS DI container errors
**Error Patterns:**

- "Nest can't resolve dependencies of ServiceA"
- "Unknown provider: ServiceB"
- Circular dependency detected
- Missing @Injectable() decorator
- Provider not exported from module

**Investigation:**

- Examine module structure (providers, imports, exports)
- Verify service is registered in correct module
- Check if service is exported from module
- Trace import chain for circular dependencies
- Validate decorator usage

**Common Fixes:**

- Add service to module providers array
- Add service to module exports array
- Move provider to shared module
- Add missing @Injectable() decorator
- Fix import/export order

### **ModuleResolutionDebugging**

**When:** "Cannot find module" or path resolution errors
**Error Patterns:**

- "Cannot find module '@your-org/auth-lib'"
- Path alias not resolving
- Library index.ts missing exports
- package.json main field incorrect

**Investigation:**

- Check tsconfig.base.json path aliases
- Verify library package.json exports field
- Confirm index.ts exports all public APIs
- Check node_modules structure
- Verify library build artifacts exist

**Common Fixes:**

- Update tsconfig paths
- Fix index.ts exports
- Update package.json main/exports fields
- Rebuild libraries: `npm run build:libraries`
- Verify path alias syntax

### **DatabaseConnectionDiagnosis**

**When:** Database connection, query, or ORM errors
**Error Patterns:**

- "ECONNREFUSED" on database port
- Prisma connection timeout
- Connection pool exhausted
- Migration failures
- Query syntax errors

**Investigation:**

- Check .env database URL
- Verify database container is running (Docker)
- Examine Prisma schema validity
- Check connection pool configuration
- Review query parameters and types

**Common Fixes:**

- Restart database container
- Update connection string in .env
- Run migrations: `npx prisma db push`
- Increase connection pool size
- Fix Prisma query syntax

### **ConfigFileValidation**

**When:** Module configuration, decorator, or syntax errors
**Error Patterns:**

- Invalid decorator syntax
- ConfigModule forRoot() not called
- Configuration property undefined
- Invalid JSON in config files
- Missing environment variables

**Investigation:**

- Read app.module.ts for ConfigModule setup
- Check .env file for required variables
- Verify decorator syntax and parameters
- Review module configuration objects
- Check tsconfig.json validity

**Common Fixes:**

- Add missing ConfigModule.forRoot()
- Add missing environment variable
- Fix decorator parameter syntax
- Update configuration object structure
- Validate JSON/YAML files

### **TypeScriptTypeChecking**

**When:** TypeScript compilation or type-related errors
**Error Patterns:**

- "Type 'X' is not assignable to type 'Y'"
- "Cannot find name 'SomeType'"
- "Property 'X' does not exist"
- Generic type parameter errors
- Missing type definitions

**Investigation:**

- Check type definitions at error location
- Verify imports for type definitions
- Review generic type parameters
- Check interface/class implementations
- Validate type compatibility

**Common Fixes:**

- Add missing type import
- Fix type compatibility
- Update interface definitions
- Add @types package for library
- Fix generic type parameters

### **CodeVsTestValidation**

**When:** Test failures occur and you need to determine if the code is wrong or the test is outdated/incorrect
**Purpose:** Intelligently analyze test failures to identify whether the root cause is in the implementation or the test itself

**Error Patterns:**

- Test assertion fails: "Expected X but received Y"
- Mock function not called
- Test timeout or deadlock
- Cannot read property (mock incomplete)
- Unexpected exception thrown
- Test passes when run alone, fails in suite

**Investigation Approach:**

1. **Classify the failure type** - What kind of assertion/error occurred
2. **Gather evidence** - Analyze both code behavior AND test expectations
3. **Assess confidence** - How likely is code problem vs test problem
4. **Determine root cause** - Which is actually wrong (or if both)
5. **Suggest resolution** - How to fix (code change, test update, or both)

**Key Questions:**

- When was this test last updated? (Recent tests more likely correct)
- Has the code been recently modified? (Recent changes likely culprits)
- Do similar tests pass? (If yes, this test may be wrong)
- Does the code make logical sense? (If no, code likely has bug)
- Are mock/fixture dependencies complete? (If no, test setup wrong)

**Common Outcomes:**

- ✅ **Code Wrong** (65%): Implementation doesn't match test expectations
- ✅ **Test Wrong** (30%): Test expectations outdated or test setup flawed
- ✅ **Both Wrong** (5%): Both code and test have issues

**Decision Matrix:** See `references/code-vs-test-validation.md` for detailed framework
**NestJS-Specific Patterns:** See `resources/nestjs-test-patterns.md` for platform-specific guidance

---

## 🔍 NestJS Error Categories (Universal Patterns)

These error patterns appear across all NestJS applications and require similar debugging approaches.

### 1. **Module System Errors**

**Pattern: Dependency Resolution**

```
Error: Nest can't resolve dependencies of ServiceA (...)
Did you forget to provide an argument for a particular dependency?
```

**Root Causes:**

- Service not registered in module providers
- Service exists but isn't exported from its module
- Missing @Injectable() decorator on service
- Circular module dependencies
- forRoot()/forRootAsync() not called for imported modules

**Debug Approach:**

1. Find the service (grep for `class ServiceA`)
2. Locate its module (grep for `ServiceA` in providers)
3. Check if service is in imports of dependent module
4. Verify service is in exports array
5. Check for @Injectable() decorator

**Example Fix:**

```typescript
// BEFORE: auth.module.ts - Missing exports
@Module({
  providers: [AuthService],
  imports: [ConfigModule]
})

// AFTER: auth.module.ts - Add exports
@Module({
  providers: [AuthService],
  imports: [ConfigModule],
  exports: [AuthService]  // ← Added
})
```

---

**Pattern: Circular Dependencies**

```
Error: A circular dependency detected in the dependency graph
```

**Root Causes:**

- Module A imports Module B, Module B imports Module A
- Service A injects Service B, Service B injects Service A (without @Inject() lazy reference)

**Debug Approach:**

1. Identify modules mentioned in error
2. Check imports in each module
3. Look for bidirectional imports
4. Verify if dependency is actually needed
5. Consider extracting shared logic to third module

**Example Fix:**

```typescript
// BEFORE: Circular dependency
// user.module.ts imports auth.module
// auth.module imports user.module

// AFTER: Extract to shared module
// shared.module.ts (no dependencies on user or auth)
// user.module imports shared.module
// auth.module imports shared.module
```

---

### 2. **Module Lifecycle & Initialization Errors**

**Pattern: Configuration Not Available**

```
Error: Cannot read property 'get' of undefined (in ConfigService)
```

**Root Causes:**

- ConfigModule not imported in app.module
- ConfigModule.forRootAsync() timing issue
- Service trying to access config in constructor (before module initialized)

**Debug Approach:**

1. Check if ConfigModule is imported in app.module
2. Verify ConfigModule is first in imports (before dependent modules)
3. Check if service is accessing config synchronously in constructor
4. Look for forRootAsync() configuration

**Example Fix:**

```typescript
// BEFORE: app.module.ts
@Module({
  imports: [
    AuthModule,        // Uses ConfigService
    ConfigModule.forRoot()
  ]
})

// AFTER: app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot(),  // ← Moved first
    AuthModule
  ]
})
```

---

**Pattern: Database Connection Not Ready**

```
Error: Unable to connect to database / ECONNREFUSED
```

**Root Causes:**

- Database container not running (Docker)
- Wrong connection string in .env
- Connection pool exhausted
- Database not initialized (migrations not run)

**Debug Approach:**

1. Check if database container is running: `docker ps`
2. Verify connection string in .env
3. Check database logs for errors
4. Run migrations: `npx prisma db push`
5. Verify database credentials

**Example Fix:**

```bash
# Restart database container
docker compose -f ./docker/docker-compose.dev.yml up -d postgres

# Verify connection in .env
DATABASE_URL="postgresql://user:password@localhost:5432/{app-name}"

# Run migrations
cd apps/{app_name} && npx prisma db push
```

---

### 3. **Decorator & Metadata Errors**

**Pattern: Missing or Invalid Decorators**

```
Error: [Nest] [ExceptionHandler] Cannot read property 'length' of undefined
```

**Root Causes:**

- Service missing @Injectable() decorator
- Controller missing @Controller() decorator
- Parameter missing @Query(), @Param(), @Body() decorator
- Invalid decorator parameters

**Debug Approach:**

1. Locate error in stack trace
2. Check if class has appropriate decorator
3. For parameters, check if all are decorated
4. Verify decorator parameters are correct
5. Check if decorators are imported from @nestjs/common

**Example Fix:**

```typescript
// BEFORE: Missing @Injectable()
export class AuthService {
  constructor(private db: DatabaseService) {}
}

// AFTER: Add @Injectable()
import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor(private db: DatabaseService) {}
}
```

---

### 4. **Type & Compilation Errors**

**Pattern: Type Mismatches**

```
Error: Type 'Promise<void>' is not assignable to type 'void'
```

**Root Causes:**

- Async method without await
- Return type annotation doesn't match implementation
- Generic type parameter mismatch
- Missing type imports

**Debug Approach:**

1. Read the error message for exact type mismatch
2. Check method return type annotation
3. Review actual return statement
4. Check if method should be async
5. Verify generic type parameters

**Example Fix:**

```typescript
// BEFORE: Type mismatch
method(): void {
  return this.asyncOperation();  // Returns Promise, not void
}

// AFTER: Fix return type
async method(): Promise<void> {
  return await this.asyncOperation();
}
```

---

### 5. **Module Resolution & Import Errors**

**Pattern: Cannot Find Module**

```
Error: Cannot find module '@your-org/auth-lib'
```

**Root Causes:**

- Library not exported from index.ts
- Path alias not configured in tsconfig
- Library not built to dist/
- Wrong import path (using /src instead of dist)

**Debug Approach:**

1. Check if library is installed: `npm ls @your-org/auth-lib`
2. Verify tsconfig.base.json paths configuration
3. Check library's index.ts for exports
4. Verify package.json main/exports fields
5. Build library: `npm run build:libraries`

**Example Fix:**

```json
// tsconfig.base.json - Verify path alias
{
  "compilerOptions": {
    "paths": {
      "@your-org/*": ["libs/*/src/index.ts"]
    }
  }
}
```

```typescript
// libs/auth-lib/src/index.ts - Verify exports
export * from './lib/auth.service';
export * from './lib/auth.module';
export * from './types';
```

---

### 6. **Runtime Exception Errors**

**Pattern: Unhandled Promise Rejection**

```
Error: UnhandledPromiseRejectionWarning
```

**Root Causes:**

- Async operation not caught in try/catch
- Promise rejection in event handler
- Missing error handler on async operation
- Async operation in constructor (anti-pattern)

**Debug Approach:**

1. Locate async operation in stack trace
2. Check if try/catch wraps operation
3. Verify error handlers are attached
4. Look for async operations in constructors
5. Check if Promise.all() is being rejected

**Example Fix:**

```typescript
// BEFORE: Unhandled rejection
async method() {
  const result = await this.db.query();  // No catch
}

// AFTER: Handle rejection
async method() {
  try {
    const result = await this.db.query();
    return result;
  } catch (error) {
    logger.error('Query failed', { error });
    throw new DatabaseException('Query failed');
  }
}
```

---

## 📋 Blocking Conditions

**HALT the debugging loop and ask the user** when:

1. **Architectural Changes Required**
   - Error indicates fundamental design issue (3+ files need refactoring)
   - Solution requires changing module structure significantly
   - Circular dependencies require extracting shared module
   - Ask: "This requires architectural changes. Should I proceed?"

2. **Breaking Changes**
   - Fix would break existing functionality
   - API contract changes needed
   - Database schema migration required
   - Ask: "This fix introduces breaking changes. Proceed?"

3. **Infrastructure Changes**
   - Docker container configuration needed
   - Database schema changes
   - New environment variables required
   - Ask: "Infrastructure changes needed. Shall I update docker-compose.yml?"

4. **No Clear Reproduction**
   - Error is intermittent
   - Error depends on external state
   - No consistent reproduction steps
   - Ask: "Cannot reproduce consistently. Need more context?"

5. **Multiple Root Causes**
   - Multiple independent errors blocking start
   - Unclear which error to fix first
   - Ask: "Multiple issues found. Fix in this order?"

6. **Permission/Configuration Required**
   - Need access to secrets/credentials
   - Need to modify .env in ways user hasn't approved
   - Ask: "Need to update [config]. Approved?"

---

## 📍 File Location Patterns

### App Structure (Generic)

```
apps/{app_name}/
├── src/
│   ├── main.ts                    # Entry point (check for NestFactory.create())
│   ├── app.module.ts              # Root module
│   ├── modules/                   # Feature modules
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.controller.ts
│   │   └── {other modules}
│   ├── config/
│   │   ├── config.module.ts
│   │   ├── environment.service.ts
│   │   └── data-source.service.ts
│   └── common/
│       ├── filters/               # Exception filters
│       ├── guards/                # Authentication guards
│       ├── interceptors/          # Response interceptors
│       └── utils/                 # Utility functions
├── project.json                   # NX project config (contains serve command)
├── tsconfig.app.json             # App-specific TypeScript config
└── tsconfig.spec.json            # Test TypeScript config
```

### Debug Artifacts (Where to store findings)

```
.ai/
└── debug-sessions/
    ├── {app_name}-{timestamp}.md     # Session log
    └── {app_name}-errors.md           # Error pattern catalog
```

### Environment & Configuration

```
.env                               # Environment variables (auto-loaded)
tsconfig.base.json                # Monorepo path aliases
nx.json                           # Monorepo configuration
```

---

## 📚 Reference Implementation: {api-service}

The **{api-service}** application demonstrates NestJS best practices and is the primary example for this skill.

### Key Features for Debugging:

**Error Handling Infrastructure:**

```typescript
// Global exception filter with correlation IDs
GlobalExceptionFilter → Custom exception classes:
  - FinancialException
  - BusinessLogicException
  - ValidationException
  - RateLimitException
```

**Module Structure:**

- Auth module with JWT + Passport
- Config module with environment loading
- Database module with Prisma
- Redis module with connection pooling
- Shared library imports with client/server separation

**Configuration Pattern:**

- ConfigModule.forRoot() in app.module
- Environment variables in .env
- TypeScript strict mode
- Comprehensive error logging

### Debugging {api-service}:

When debugging {api-service} specifically:

1. Check `apps/{api-service}/src/app.module.ts` for module imports
2. Verify database connection via `apps/{api-service}/src/config/data-source.service.ts`
3. Check auth configuration in `apps/{api-service}/src/auth/auth.module.ts`
4. Review .env for required environment variables
5. Use `npm run dev:api` to start (NX_DAEMON=false)

**Success Condition for {api-service}:**

```
✓ Output contains: "Nest application successfully started"
✓ API listening on: http://localhost:3000
✓ Prisma client initialized
✓ Redis connection established
```

---

## ✨ Example Debugging Sessions

### Example 1: Dependency Injection Error

**Error Output:**

```
Error: Nest can't resolve dependencies of AuthService (ConfigService, ?)
```

**Debugging Steps:**

1. **Thought:** "DI error in AuthService. Let me read the service and its module."
2. **Skill:** DependencyInjectionAnalysis
3. **Tool:** read_file → `apps/{app_name}/src/auth/auth.service.ts`
4. **Observation:** "AuthService constructor has ConfigService and unknown dependency."
5. **Tool:** read_file → `apps/{app_name}/src/auth/auth.module.ts`
6. **Observation:** "ConfigModule not imported in AuthModule."
7. **Skill:** CodeGenerationAndFixing
8. **Fix:** Add `ConfigModule` to imports
9. **Tool:** write_file → Complete corrected auth.module.ts
10. **Validation:** Re-run start command → Success! ✓

---

### Example 2: Module Not Found

**Error Output:**

```
Error: Cannot find module '@your-org/auth-lib'
```

**Debugging Steps:**

1. **Thought:** "Module resolution error. Check library exports."
2. **Skill:** ModuleResolutionDebugging
3. **Tool:** read_file → `libs/auth-lib/src/index.ts`
4. **Observation:** "index.ts missing or doesn't export required symbols."
5. **Tool:** list_directory → `libs/auth-lib/src/`
6. **Observation:** "Multiple files exist but not exported from index."
7. **Skill:** CodeGenerationAndFixing
8. **Fix:** Update index.ts with all exports
9. **Tool:** write_file → Complete index.ts with exports
10. **Tool:** execute_shell → `npm run build:libraries`
11. **Validation:** Re-run start command → Success! ✓

---

### Example 3: Database Connection Error

**Error Output:**

```
Error: ECONNREFUSED 127.0.0.1:5432
```

**Debugging Steps:**

1. **Thought:** "Database connection error. Check if container is running."
2. **Skill:** DatabaseConnectionDiagnosis
3. **Tool:** execute_shell → `docker ps` (check if postgres running)
4. **Observation:** "Postgres container not running."
5. **Thought:** "Need to start database."
6. **Tool:** execute_shell → `docker compose -f ./docker/docker-compose.dev.yml up -d postgres`
7. **Wait:** Container startup time (~5s)
8. **Tool:** execute_shell → Run start command again
9. **Validation:** Success! ✓

---

## 🔗 Related Skills & Integration

**This skill works with:**

- `create-task` - For documenting complex fixes requiring wider refactoring
- `develop` - When implementation encounters errors during development
- `qa-story` - When QA testing identifies errors needing investigation

**Skills that use this:**

- Any feature development workflow encountering NestJS errors
- Build/deployment processes with compilation failures
- Integration testing that reveals runtime issues

---

## 📖 Resources & References

**Essential Files for NestJS Debugging:**

**{api-service} Error Infrastructure:**

- Global Exception Filter: `apps/{api-service}/src/common/filters/global-exception.filter.ts`
- Error Codes: `apps/{api-service}/src/common/utils/error-handler.util.ts`
- Exception Classes: `apps/{api-service}/src/common/exceptions/`

**Configuration:**

- Main entry: `apps/{api-service}/src/main.ts`
- App module: `apps/{api-service}/src/app.module.ts`
- Config service: `apps/{api-service}/src/config/config.module.ts`

**Documentation:**

- NestJS Official: https://docs.nestjs.com/
- API Architecture: `docs/architecture/{api-service}-architecture.md`

**Commands:**

```bash
# Start app with hot reload
NX_DAEMON=false npm run dev:api

# Build app
npx nx build {app_name}

# Run tests
npx nx test {app_name}

# View project graph
npx nx graph

# Clear cache
npx nx reset
```

---

## 📝 Thought Logging Template

**Use this format to show your thinking:**

```markdown
## Debug Session: {app_name} - {timestamp}

### Iteration 1

**Thought:** "Starting fresh. I will run the application to see current state."
**Selected_Skill:** ErrorParsing
**Selected_Tool:** execute_shell
**Command:** NX_DAEMON=false npm run dev:api
**Output:** [Raw output from command]

**Analysis:**

- Error Type: [Type from error message]
- Affected File: [File from stack trace]
- Root Cause:\*\* [What's actually wrong]

### Iteration 2

**Thought:** "The error indicates [reason]. I need to check [file]."
**Selected_Skill:** DependencyInjectionAnalysis
**Selected_Tool:** read_file
**Result:** [What I found]

### ... (continue iterations)

### Final Result

✅ **Success** - Application started successfully
✅ **Evidence** - Output contains "Nest application successfully started"
✅ **Fixes Applied** - [List of changes made]
```

---

## 🎓 Best Practices for Autonomous Debugging

1. **Start Simple**: Check obvious issues first (missing imports, typos, configuration)
2. **Narrow Scope**: Focus on one error at a time
3. **Read Stack Traces**: They point to the actual problem location
4. **Understand NestJS DI**: Most errors relate to module structure
5. **Check Configuration First**: Many issues are environment/config related
6. **Test After Each Fix**: Don't chain multiple fixes without validation
7. **Document Patterns**: Note common errors for future reference
8. **Ask for Clarification**: Escalate when decision required

---

## 🚦 Success Criteria

**Task Complete When:**

- ✅ Start command runs without exiting
- ✅ Success condition string appears in output
- ✅ No error stack traces in stderr
- ✅ All essential services initialized (database, cache, etc.)
- ✅ Application ready to accept requests
- ✅ Test suite passing (if applicable)

**Document Results:**

- Log session details to `.ai/debug-sessions/{app_name}-{timestamp}.md`
- Record error patterns encountered
- Note fixes applied
- Update common-errors catalog with new patterns
