---
name: platform-separation-validator
description: This skill should be used when reviewing code for platform separation violations, validating library imports (client vs server paths), ensuring crypto operations remain server-side, checking React Native code uses /client imports only, preventing Node.js dependencies in client bundles, or enforcing security boundaries. Use this when implementing new features that span client and server, reviewing pull requests for separation compliance, debugging "Cannot find module" errors related to imports, refactoring shared libraries, or auditing codebase for platform separation adherence.
---

# Platform Separation Validator

## Overview

This skill enforces the critical platform separation architecture that prevents Node.js dependencies in React Native code and ensures security-critical operations (cryptography, authentication, data encryption) remain exclusively server-side. The skill validates import paths, detects violations, and guides developers toward compliant patterns.

**Core Principle**: Client (React Native) and Server (NestJS) have fundamentally different capabilities. Mixing them causes bundle failures, security vulnerabilities, and runtime crashes.

## When to Use This Skill

Use this skill when:
- Reviewing code changes for platform separation violations
- Implementing new features that span client and server
- Debugging import errors or "Cannot find module" issues
- Refactoring shared libraries for platform compatibility
- Auditing codebase for separation compliance (100% compliance required)
- Creating new shared libraries that need client/server separation
- Investigating bundle size issues or Node.js dependency leaks

## Validation Workflow

### Step 1: Identify Platform Context

Determine where the code will execute:

**React Native (Client)**: React Native app files (components, screens, hooks)
**NestJS (Server)**: Files in `apps/{api-service}/`, controllers, services, guards
**Shared**: Type definitions, interfaces, validation schemas

### Step 2: Validate Imports

**For React Native files** - Check imports use `/client` paths:
```typescript
// ✅ CORRECT
import { logger } from '@your-org/logging-lib/client';
import { validateEmail } from '@your-org/shared-utils/client';
import { decodeToken } from '@your-org/auth-lib/client';

// ❌ VIOLATION
import { logger } from '@your-org/logging-lib'; // Includes Node.js code
import { hashPassword } from '@your-org/auth-lib'; // Server-only
```

**For NestJS files** - Can use default or server imports:
```typescript
// ✅ CORRECT
import { hashPassword } from '@your-org/auth-lib';
import { logger } from '@your-org/logging-lib';
import * as bcrypt from 'bcrypt';
```

### Step 3: Validate Operations

**Server-only operations** (NestJS):
- Password hashing (bcrypt, argon2)
- JWT signing/verification
- AES encryption/decryption
- Private key operations
- File system access
- Environment variables

**Client operations** (React Native):
- Token parsing (NOT validation)
- UI rendering
- Device functions (biometrics, secure storage)
- API calls to server for sensitive operations

### Step 4: Check for Violations

Common patterns to detect:

```typescript
// ❌ Crypto in React Native
import * as crypto from 'crypto'; // Node.js built-in — unavailable in RN
const key = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

// ✅ Correct - Call API
const response = await api.post('/keys/generate');

// ❌ Node.js modules in React Native
import * as crypto from 'crypto';

// ❌ Server imports in React Native
import { logger } from '@your-org/logging-lib';

// ✅ Correct - Client import
import { logger } from '@your-org/logging-lib/client';
```

## Common Violations & Fixes

### Violation 1: Password Hashing in React Native

**Problem**:
```typescript
import * as bcrypt from 'bcrypt';
const hashedPassword = await bcrypt.hash(password, 10); // ❌
```

**Fix**:
```typescript
// Client sends plaintext over HTTPS
await api.post('/auth/register', { email, password });

// Server hashes password
// apps/{api-service}/src/modules/auth/auth.service.ts
const hashedPassword = await bcrypt.hash(password, 10); // ✅
```

### Violation 2: JWT Validation in React Native

**Problem**:
```typescript
import * as jwt from 'jsonwebtoken';
const payload = jwt.verify(token, process.env.JWT_SECRET); // ❌
```

**Fix**:
```typescript
// Client parses (doesn't validate) token
import { decodeToken } from '@your-org/auth-lib/client';
const payload = decodeToken(token); // ✅ Parse only

// Server validates JWT
// apps/{api-service}/src/modules/auth/jwt.strategy.ts
jwt.verify(token, process.env.JWT_SECRET); // ✅
```

### Violation 3: File System in React Native

**Problem**:
```typescript
import * as fs from 'fs';
fs.writeFileSync('/backup/data.json', data); // ❌
```

**Fix**:
```typescript
import * as FileSystem from 'expo-file-system';
await FileSystem.writeAsStringAsync(fileUri, data); // ✅
```

## Compliance Checklist

Before marking code as compliant:

**Import Compliance**:
- [ ] All React Native files use `/client` imports
- [ ] No Node.js modules in React Native
- [ ] Library export paths configured in package.json

**Operation Compliance**:
- [ ] Crypto operations server-side only
- [ ] Password hashing via API endpoints
- [ ] JWT validation server-side

**Bundle Compliance**:
- [ ] Metro bundler completes without errors
- [ ] No Node.js dependency warnings

## Anti-Patterns

**NEVER**:
- ❌ Import Node.js modules in React Native
- ❌ Hash passwords client-side
- ❌ Validate JWTs client-side
- ❌ Use `process.env` in React Native
- ❌ Use default library imports in React Native

**ALWAYS**:
- ✅ Use `/client` imports in React Native
- ✅ Call API endpoints for server operations
- ✅ Keep crypto operations server-side
- ✅ Maintain 100% separation compliance

## Resources

### references/

**platform-specific-development-guide.md** - Complete separation guide including capability matrix, import patterns, library structure, and migration guides

**security-boundaries.md** - Security architecture explaining why separation is critical and attack vectors when violated

**auth-platform-patterns.md** - Authentication-specific patterns for password handling, token management, and OAuth

## Success Criteria

Code is compliant when:
1. Zero Node.js modules in React Native bundle
2. All client code uses `/client` imports
3. All crypto/auth operations server-side
4. Metro bundler completes without dependency errors
5. Platform separation validated in test suites

Refer to references for detailed patterns and migration guides.
