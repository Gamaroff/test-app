# NestJS Common Errors & Quick Diagnostics

This document is a quick reference for common NestJS errors and their solutions. When debugging, identify the error message below, then follow the diagnostic checklist.

---

## 1. Dependency Injection Errors

### Error: "Nest can't resolve dependencies of ServiceA"

**Quick Diagnosis Checklist:**
- [ ] Does the service have `@Injectable()` decorator?
- [ ] Is the service listed in the module's `providers` array?
- [ ] Is the module imported in the parent module?
- [ ] Are all dependencies of ServiceA also available?
- [ ] Is the service exported from its module if used in another module?

**Common Causes:**
1. Service missing from `providers` array in module
2. Service not exported from module (if used by another module)
3. Dependency of the service is not provided
4. Missing `@Injectable()` decorator
5. Circular module dependencies

**Quick Fix Pattern:**
```typescript
// Add to module providers
@Module({
  providers: [ServiceA, ServiceB],
  exports: [ServiceA]  // If used by other modules
})
export class MyModule {}
```

**Skill to Use:** DependencyInjectionAnalysis

---

### Error: "Unknown provider: SomeService"

**Quick Diagnosis Checklist:**
- [ ] Is the service listed in `providers` array?
- [ ] Is the service name spelled correctly?
- [ ] Is the service imported from correct path?
- [ ] Are you using correct injection syntax?

**Common Causes:**
1. Service name typo in providers array
2. Service not exported from file
3. Wrong import path
4. Using string name instead of class reference

**Quick Fix Pattern:**
```typescript
// WRONG - String name
providers: ['UserService']

// CORRECT - Class reference
providers: [UserService]
```

**Skill to Use:** DependencyInjectionAnalysis

---

### Error: "Circular dependency detected"

**Quick Diagnosis Checklist:**
- [ ] Does ModuleA import ModuleB?
- [ ] Does ModuleB import ModuleA?
- [ ] Can dependencies be reordered?
- [ ] Can you extract to a shared module?

**Common Causes:**
1. ModuleA → ModuleB → ModuleA circular import
2. ServiceA injects ServiceB, ServiceB injects ServiceA
3. Bidirectional module dependencies

**Quick Fix Pattern:**
```typescript
// Create shared module with common logic
@Module({
  providers: [SharedService],
  exports: [SharedService]
})
export class SharedModule {}

// Both modules import shared
@Module({
  imports: [SharedModule]
})
export class ModuleA {}

@Module({
  imports: [SharedModule]
})
export class ModuleB {}
```

**Skill to Use:** DependencyInjectionAnalysis

---

## 2. Module & Import Errors

### Error: "Cannot find module '@your-org/auth-lib'"

**Quick Diagnosis Checklist:**
- [ ] Does the library exist in `libs/` directory?
- [ ] Is the path alias configured in `tsconfig.base.json`?
- [ ] Does the library's `src/index.ts` export the module/service?
- [ ] Has the library been built? (Check `dist/` folder)
- [ ] Is the import path correct?

**Common Causes:**
1. Path alias not configured in tsconfig
2. Library's index.ts doesn't export the symbol
3. Library not built to dist/
4. Wrong import path (using /src instead of main export)
5. Library not installed in package.json

**Quick Fix Pattern:**
```typescript
// tsconfig.base.json - Verify path alias
{
  "compilerOptions": {
    "paths": {
      "@your-org/*": ["libs/*/src/index.ts"]
    }
  }
}

// libs/auth-lib/src/index.ts - Export what you import
export * from './lib/auth.service';
export * from './lib/auth.module';
export * from './types';

// In app - Import from path alias
import { AuthService } from '@your-org/auth-lib';
```

**Skill to Use:** ModuleResolutionDebugging

---

### Error: "Cannot find module './some-file'"

**Quick Diagnosis Checklist:**
- [ ] Does the file exist at the path?
- [ ] Is the file extension correct (.ts, .js)?
- [ ] Is the path relative or absolute?
- [ ] Are there typos in the filename?

**Common Causes:**
1. File doesn't exist at specified path
2. Wrong file extension
3. Typo in filename
4. Case sensitivity mismatch (on Linux/Mac)
5. File deleted but import still exists

**Quick Fix Pattern:**
```typescript
// Find the file
ls apps/{app_name}/src/services/

// Use correct path
import { UserService } from './user.service';  // Correct
import { UserService } from './user-service';  // Wrong - no such file
```

**Skill to Use:** ModuleResolutionDebugging

---

### Error: "Cannot find name 'SomeType'"

**Quick Diagnosis Checklist:**
- [ ] Is the type imported?
- [ ] Does the type exist where imported from?
- [ ] Is the import path correct?
- [ ] Is the type exported from its file?

**Common Causes:**
1. Type not imported
2. Type not exported from definition file
3. Wrong import path
4. Typo in type name

**Quick Fix Pattern:**
```typescript
// Add missing import
import { CreateUserDto } from './dto/create-user.dto';

// Or export from file if missing
export interface CreateUserDto {
  email: string;
  name: string;
}
```

**Skill to Use:** TypeScriptTypeChecking

---

## 3. Configuration & Startup Errors

### Error: "Cannot read property 'get' of undefined (ConfigService)"

**Quick Diagnosis Checklist:**
- [ ] Is `ConfigModule` imported in `app.module.ts`?
- [ ] Is `ConfigModule.forRoot()` called?
- [ ] Is `ConfigModule` imported BEFORE modules that use it?
- [ ] Is environment variable defined in `.env`?

**Common Causes:**
1. ConfigModule not imported in app.module
2. ConfigModule imported after dependent modules
3. Environment variable not set in .env
4. Accessing config in constructor (before initialization)

**Quick Fix Pattern:**
```typescript
// app.module.ts - Import ConfigModule FIRST
@Module({
  imports: [
    ConfigModule.forRoot(),  // MUST be first
    AuthModule,
    DatabaseModule,
    OtherModules
  ]
})
export class AppModule {}

// .env - Add required variable
DATABASE_URL=postgresql://...
API_KEY=your-api-key
```

**Skill to Use:** ConfigFileValidation

---

### Error: "ECONNREFUSED 127.0.0.1:5432" (PostgreSQL)

**Quick Diagnosis Checklist:**
- [ ] Is PostgreSQL container running? (`docker ps`)
- [ ] Is connection string correct in .env?
- [ ] Is port 5432 accessible?
- [ ] Are credentials correct (username, password)?

**Common Causes:**
1. Database container not started
2. Wrong connection string in .env
3. Database not accepting connections yet (startup delay)
4. Port conflicts
5. Firewall blocking connection

**Quick Fix Pattern:**
```bash
# Check if container is running
docker ps | grep postgres

# Start container if stopped
docker compose -f ./docker/docker-compose.dev.yml up -d postgres

# Verify connection string in .env
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# Wait for database to be ready (it takes a few seconds)
sleep 5

# Test connection
psql postgresql://user:password@localhost:5432/dbname
```

**Skill to Use:** DatabaseConnectionDiagnosis

---

### Error: "ECONNREFUSED 127.0.0.1:6379" (Redis)

**Quick Diagnosis Checklist:**
- [ ] Is Redis container running? (`docker ps`)
- [ ] Is port 6379 accessible?
- [ ] Is Redis connection string correct?

**Common Causes:**
1. Redis container not started
2. Wrong Redis connection string
3. Port not exposed or blocked

**Quick Fix Pattern:**
```bash
# Start Redis container
docker compose -f ./docker/docker-compose.dev.yml up -d redis

# Verify connection string in .env
REDIS_URL=redis://localhost:6379

# Test connection
redis-cli ping
```

**Skill to Use:** DatabaseConnectionDiagnosis

---

## 4. Decorator & Metadata Errors

### Error: "Cannot read property 'length' of undefined"

**Quick Diagnosis Checklist:**
- [ ] Does the class have required decorators (@Injectable, @Controller)?
- [ ] Do all route parameters have decorators (@Query, @Param, @Body)?
- [ ] Are decorators imported from @nestjs/common?

**Common Causes:**
1. Missing @Injectable() on service
2. Missing @Controller() on controller
3. Route handler parameters missing decorators
4. Invalid decorator syntax

**Quick Fix Pattern:**
```typescript
// WRONG - Missing @Injectable()
export class UserService {
  constructor(private db: Database) {}
}

// CORRECT - Add @Injectable()
import { Injectable } from '@nestjs/common';

@Injectable()
export class UserService {
  constructor(private db: Database) {}
}

// WRONG - Missing parameter decorators
@Controller('users')
export class UserController {
  @Get(':id')
  getUser(id: string) {  // Missing @Param decorator
    return this.service.get(id);
  }
}

// CORRECT - Add decorators
@Controller('users')
export class UserController {
  @Get(':id')
  getUser(@Param('id') id: string) {  // Added decorator
    return this.service.get(id);
  }
}
```

**Skill to Use:** ConfigFileValidation

---

## 5. Type & Compilation Errors

### Error: "Type 'Promise<X>' is not assignable to type 'X'"

**Quick Diagnosis Checklist:**
- [ ] Should the method be async?
- [ ] Should the return type be Promise<X>?
- [ ] Is the return statement awaited?

**Common Causes:**
1. Method should be async but isn't
2. Return type doesn't match actual return
3. Returning Promise without await

**Quick Fix Pattern:**
```typescript
// WRONG - Returns Promise but type says void
method(): void {
  return this.asyncOperation();
}

// CORRECT - Return type should be Promise
async method(): Promise<void> {
  return await this.asyncOperation();
}
```

**Skill to Use:** TypeScriptTypeChecking

---

### Error: "Property 'X' does not exist on type 'Y'"

**Quick Diagnosis Checklist:**
- [ ] Does type Y actually have property X?
- [ ] Is the property name spelled correctly?
- [ ] Is the property defined in the interface/class?

**Common Causes:**
1. Property typo
2. Property not defined in type
3. Wrong type being used
4. Property is private or protected

**Quick Fix Pattern:**
```typescript
// Check the interface
interface User {
  id: string;
  email: string;
  // name property missing
}

// Fix: Add missing property
interface User {
  id: string;
  email: string;
  name: string;  // Added
}
```

**Skill to Use:** TypeScriptTypeChecking

---

## 6. Database & ORM Errors

### Error: "Prisma error: P2002 Unique constraint failed"

**Quick Diagnosis Checklist:**
- [ ] Is the value already in database?
- [ ] Is the query trying to create duplicate?
- [ ] Should you use upsert instead of create?

**Common Causes:**
1. Duplicate value violates unique constraint
2. Record already exists with same unique field
3. Using create() when should use upsert()

**Quick Fix Pattern:**
```typescript
// Handle unique constraint error
try {
  const user = await prisma.user.create({
    data: { email }
  });
} catch (error) {
  if (error.code === 'P2002') {
    // User with this email already exists
    throw new ValidationException('Email already in use');
  }
}

// Or use upsert to update if exists
const user = await prisma.user.upsert({
  where: { email },
  update: { name },
  create: { email, name }
});
```

**Skill to Use:** DatabaseConnectionDiagnosis

---

### Error: "Prisma error: P1000 Authentication failed"

**Quick Diagnosis Checklist:**
- [ ] Is the database connection string correct?
- [ ] Are username/password correct?
- [ ] Is the database server running?

**Common Causes:**
1. Wrong username or password
2. Database server not running
3. Connection string format incorrect

**Quick Fix Pattern:**
```bash
# Verify connection string format
DATABASE_URL="postgresql://username:password@localhost:5432/dbname"

# Check credentials
docker compose logs postgres | grep "accepting"

# Test connection directly
psql postgresql://username:password@localhost:5432/dbname
```

**Skill to Use:** DatabaseConnectionDiagnosis

---

## 7. Build & Compilation Errors

### Error: "NX build failed / Cannot find module"

**Quick Diagnosis Checklist:**
- [ ] Have all libraries been built? (`npm run build:libraries`)
- [ ] Do library exports exist?
- [ ] Is tsconfig path alias correct?

**Common Causes:**
1. Dependencies not built to dist/
2. Circular dependencies in build
3. Missing exports in index.ts
4. Path alias misconfigured

**Quick Fix Pattern:**
```bash
# Rebuild all libraries
npm run build:libraries

# Clean and rebuild
npx nx reset
npm run build:libraries

# Build specific app
npx nx build {app_name}

# Check build output
ls dist/libs/@your-org/auth-lib/
```

**Skill to Use:** ModuleResolutionDebugging

---

## 8. Runtime & Execution Errors

### Error: "UnhandledPromiseRejectionWarning"

**Quick Diagnosis Checklist:**
- [ ] Is the async operation wrapped in try/catch?
- [ ] Does the Promise have .catch() handler?
- [ ] Is error being logged?

**Common Causes:**
1. Async operation without error handling
2. Promise rejection not caught
3. Error handler not attached
4. Async code in event listener

**Quick Fix Pattern:**
```typescript
// WRONG - No error handling
async method() {
  const result = await this.db.query();
}

// CORRECT - Add try/catch
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

**Skill to Use:** ErrorParsing

---

## 🎯 Diagnostic Quick Reference

**Use this when you see any error:**

1. **Read the error message carefully**
   - What is failing?
   - What line/file?
   - What is the root cause hint?

2. **Match to category above**
   - DI error → Dependency Injection Errors section
   - Module error → Module & Import Errors section
   - Config error → Configuration & Startup Errors section
   - Type error → Type & Compilation Errors section

3. **Follow the checklist**
   - Work through each item
   - Check what applies to your error

4. **Apply the fix pattern**
   - Use the code example as template
   - Modify for your specific case

5. **Verify the fix**
   - Re-run the command
   - Check for new errors

---

## 🔗 Related Resources

- **NestJS Documentation**: https://docs.nestjs.com/
- **Prisma Documentation**: https://www.prisma.io/docs/
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/

---

## 📝 Adding New Patterns

When you encounter a new error pattern not in this guide:

1. Document the error message exactly
2. Note the root cause
3. Record the fix that worked
4. Add it to appropriate section above
5. Include checklist and code pattern

This helps future debugging sessions and builds institutional knowledge.
