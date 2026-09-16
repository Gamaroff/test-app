# Platform-Specific Development Guide

## Overview

This guide provides practical development workflows and best practices for implementing and maintaining the platform-specific architecture in a client/server separated project. It covers daily development tasks, debugging, testing, and deployment considerations when working with client/server separation patterns.

## Quick Reference

### Platform-Specific Import Patterns

#### Server-Side Imports (NestJS Backend)

```typescript
// Full authentication utilities (includes bcrypt, JWT signing)
import {
  hashPassword,
  comparePassword,
  generateTokenPair,
  verifyAccessToken
} from '@your-org/auth-lib';

// Server-only utilities (includes AES encryption, HMAC signing)
import {
  encryptData,
  decryptData,
  generateHMAC,
  verifyHMAC
} from '@your-org/shared-utils/server';

// Common utilities (validation, formatting)
import { validateEmail, formatCurrency } from '@your-org/shared-utils';
```

#### Client-Side Imports (React Native Mobile)

```typescript
// Mobile-safe authentication (parsing only, no crypto)
import {
  decodeToken,
  isTokenExpired,
  validateLoginCredentials
} from '@your-org/auth-lib/src/client';

// Client-only utilities (device detection, local storage)
import {
  getDeviceInfo,
  detectPlatform,
  generateClientId
} from '@your-org/shared-utils/client';

// Common utilities (validation, formatting)
import { validateEmail, formatCurrency } from '@your-org/shared-utils';
```

## Development Workflows

### 1. Authentication Feature Development

#### Server-Side Authentication Implementation

**File**: `apps/{api-service}/src/modules/auth/auth.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import {
  hashPassword,
  comparePassword,
  generateTokenPair,
  verifyAccessToken
} from '@your-org/auth-lib';
import { RegisterDto, LoginDto } from './dto';

@Injectable()
export class AuthService {
  async register(registerDto: RegisterDto): Promise<AuthResult> {
    // Server-only: Hash password with bcrypt
    const hashedPassword = await hashPassword(registerDto.password, 12);

    // Create user with hashed password
    const user = await this.userService.create({
      ...registerDto,
      password: hashedPassword
    });

    // Server-only: Generate JWT tokens
    const tokens = generateTokenPair(
      {
        sub: user.id,
        email: user.email,
        role: user.role
      },
      this.authConfig
    );

    return {
      user: this.createSafeUser(user),
      tokens
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResult> {
    const user = await this.userService.findByEmail(loginDto.email);

    // Server-only: Compare plaintext password with bcrypt hash
    const isValidPassword = await comparePassword(
      loginDto.password,
      user.password
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Server-only: Generate fresh JWT tokens
    const tokens = generateTokenPair(
      {
        sub: user.id,
        email: user.email,
        role: user.role
      },
      this.authConfig
    );

    return {
      user: this.createSafeUser(user),
      tokens
    };
  }
}
```

#### Client-Side Authentication Implementation

**File**: `src/services/api/auth-service.ts`

```typescript
import {
  decodeToken,
  isTokenExpired,
  validateLoginCredentials
} from '@your-org/auth-lib/src/client';
import { LoginRequest, RegisterRequest } from '@your-org/shared-types';
import { ApiService } from './base-api-service';

export class AuthService extends ApiService {
  async login(credentials: LoginRequest): Promise<AuthResult> {
    // Client-side: Validate input format only
    const validation = validateLoginCredentials(credentials);
    if (!validation.isValid) {
      throw new Error(`Invalid credentials: ${validation.errors.join(', ')}`);
    }

    // Send plaintext credentials over HTTPS to server
    const response = await this.post('/auth/login', {
      email: credentials.email,
      password: credentials.password // Plaintext - server will hash
    });

    if (response.success) {
      // Client-side: Parse JWT for UX purposes only
      const tokenInfo = decodeToken(response.data.tokens.accessToken);

      // Store tokens securely (biometric-protected)
      await this.secureStorage.setItem(
        'accessToken',
        response.data.tokens.accessToken
      );
      await this.secureStorage.setItem(
        'refreshToken',
        response.data.tokens.refreshToken
      );

      return {
        user: response.data.user,
        tokens: response.data.tokens,
        tokenInfo // For UI display only
      };
    }

    throw new Error(response.error || 'Login failed');
  }

  async checkTokenValidity(): Promise<boolean> {
    const token = await this.secureStorage.getItem('accessToken');
    if (!token) return false;

    // Client-side: Check expiration for UX optimization
    return !isTokenExpired(token);
  }
}
```

### 2. Shared Utility Development

#### Server-Only Utility Implementation

**File**: `libs/shared-utils/src/server.ts`

```typescript
import * as crypto from 'crypto';
import { promisify } from 'util';

const randomBytes = promisify(crypto.randomBytes);
const pbkdf2 = promisify(crypto.pbkdf2);

export async function encryptData(
  data: string,
  password: string
): Promise<EncryptedData> {
  const salt = await randomBytes(32);
  const iv = await randomBytes(16);

  // Derive key using PBKDF2
  const key = await pbkdf2(password, salt, 100000, 32, 'sha256');

  // Encrypt using AES-256-GCM
  const cipher = crypto.createCipher('aes-256-gcm', key);
  cipher.setAAD(Buffer.from('my-app', 'utf8'));

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

export async function generateHMAC(
  data: string,
  secret: string
): Promise<string> {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  return hmac.digest('hex');
}
```

#### Client-Only Utility Implementation

**File**: `libs/shared-utils/src/client.ts`

```typescript
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

export async function getDeviceInfo(): Promise<DeviceInfoResult> {
  const [deviceId, deviceName, systemVersion] = await Promise.all([
    DeviceInfo.getUniqueId(),
    DeviceInfo.getDeviceName(),
    DeviceInfo.getSystemVersion()
  ]);

  return {
    deviceId,
    deviceName,
    platform: Platform.OS,
    systemVersion,
    timestamp: new Date().toISOString()
  };
}

export function detectPlatform(): PlatformInfo {
  return {
    os: Platform.OS,
    version: Platform.Version,
    isAndroid: Platform.OS === 'android',
    isIOS: Platform.OS === 'ios'
  };
}

export function generateClientId(): string {
  // Client-side UUID generation (no crypto.randomBytes)
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2);
  return `client_${timestamp}_${randomPart}`;
}
```

### 3. Testing Platform-Specific Code

#### Server-Side Testing

**File**: `apps/{api-service}/src/modules/auth/__tests__/auth.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import * as authLib from '@your-org/auth-lib';

// Mock the entire auth library for server testing
jest.mock('@your-org/auth-lib');

describe('AuthService', () => {
  let service: AuthService;
  const mockHashPassword = authLib.hashPassword as jest.Mock;
  const mockComparePassword = authLib.comparePassword as jest.Mock;
  const mockGenerateTokenPair = authLib.generateTokenPair as jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService]
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should hash password during registration', async () => {
    mockHashPassword.mockResolvedValue('hashed_password_123');
    mockGenerateTokenPair.mockReturnValue({
      accessToken: 'access_token',
      refreshToken: 'refresh_token'
    });

    const result = await service.register({
      email: 'test@example.com',
      password: 'plaintext_password'
    });

    expect(mockHashPassword).toHaveBeenCalledWith('plaintext_password', 12);
    expect(result.user.password).toBeUndefined(); // Should not expose hashed password
  });
});
```

#### Client-Side Testing

**File**: `src/services/api/__tests__/auth-service.spec.ts`

```typescript
import { AuthService } from '../auth-service';
import * as authMobile from '@your-org/auth-lib/src/client';

// Mock only the mobile-specific auth imports
jest.mock('@your-org/auth-lib/src/client');

describe('AuthService (Client)', () => {
  let service: AuthService;
  const mockDecodeToken = authMobile.decodeToken as jest.Mock;
  const mockIsTokenExpired = authMobile.isTokenExpired as jest.Mock;
  const mockValidateLoginCredentials =
    authMobile.validateLoginCredentials as jest.Mock;

  beforeEach(() => {
    service = new AuthService();
  });

  it('should validate credentials client-side before API call', async () => {
    mockValidateLoginCredentials.mockReturnValue({
      isValid: true,
      errors: []
    });

    // Mock successful API response
    const mockPost = jest.spyOn(service, 'post').mockResolvedValue({
      success: true,
      data: {
        user: { id: '1', email: 'test@example.com' },
        tokens: { accessToken: 'token', refreshToken: 'refresh' }
      }
    });

    await service.login({
      email: 'test@example.com',
      password: 'password123'
    });

    expect(mockValidateLoginCredentials).toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith('/auth/login', {
      email: 'test@example.com',
      password: 'password123' // Plaintext sent to server
    });
  });

  it('should check token expiration client-side', async () => {
    mockIsTokenExpired.mockReturnValue(false);

    const isValid = await service.checkTokenValidity();

    expect(mockIsTokenExpired).toHaveBeenCalled();
    expect(isValid).toBe(true);
  });
});
```

## Debugging Platform-Specific Issues

### 1. Bundle Size Debugging

#### Check Import Sources

```bash
# Analyze bundle composition
npx expo export --dump-assetmap

# Check for server-only imports in mobile bundle
grep -r "from '@your-org/auth-lib'" apps/{app-name}/
grep -r "from '@your-org/shared-utils/server'" apps/{app-name}/
```

#### Expected vs Problematic Patterns

```typescript
// ✅ Good: Mobile should only use mobile-specific imports
import { decodeToken } from '@your-org/auth-lib/src/client';

// ❌ Bad: Mobile importing server crypto functions
import { hashPassword } from '@your-org/auth-lib'; // Includes bcrypt!

// ✅ Good: Common utilities can be imported directly
import { validateEmail } from '@your-org/shared-utils';

// ❌ Bad: Mobile importing server-only crypto
import { encryptData } from '@your-org/shared-utils/server';
```

### 2. Runtime Error Debugging

#### Common Error Patterns

**Error**: `Cannot resolve module 'bcrypt'`

```typescript
// Problem: Mobile code importing server auth functions
import { hashPassword } from '@your-org/auth-lib';

// Solution: Use mobile-specific imports
import { validateLoginCredentials } from '@your-org/auth-lib/src/client';
```

**Error**: `crypto.randomBytes is not a function`

```typescript
// Problem: Client trying to use Node.js crypto
import { encryptData } from '@your-org/shared-utils/server';

// Solution: Use client-safe alternatives
import { generateClientId } from '@your-org/shared-utils/client';
```

### 3. Authentication Flow Debugging

#### Server-Side Debug Points

```typescript
// Debug password hashing
console.log('Hashing password with bcrypt rounds:', rounds);
const hash = await hashPassword(password, rounds);
console.log('Generated hash length:', hash.length);

// Debug JWT generation
const payload = { sub: user.id, email: user.email };
console.log('JWT payload:', payload);
const tokens = generateTokenPair(payload, config);
console.log('Generated tokens:', {
  accessTokenLength: tokens.accessToken.length,
  refreshTokenLength: tokens.refreshToken.length
});
```

#### Client-Side Debug Points

```typescript
// Debug token parsing (no verification)
try {
  const decoded = decodeToken(accessToken);
  console.log('Token payload:', decoded);
  console.log('Token expires:', new Date(decoded.exp * 1000));
} catch (error) {
  console.error('Token parsing failed:', error.message);
}

// Debug credential validation
const validation = validateLoginCredentials({ email, password });
console.log('Client validation result:', validation);
```

## Performance Optimization

### 1. Bundle Size Optimization

#### Measure Impact

```bash
# Before platform-specific imports
npx expo export --dump-assetmap
# Bundle size: ~2.1MB

# After platform-specific imports
npx expo export --dump-assetmap
# Bundle size: ~1.6MB (24% reduction)
```

#### Tree Shaking Verification

```typescript
// Check what gets bundled from each library
import { validateEmail } from '@your-org/shared-utils'; // ✅ Small impact
import { decodeToken } from '@your-org/auth-lib/src/client'; // ✅ Small impact
import { hashPassword } from '@your-org/auth-lib'; // ❌ Bundles bcrypt
```

### 2. Startup Performance

#### Client-Side Initialization

```typescript
// Optimize token validation on startup
export class AuthService {
  private tokenValidityCache = new Map<string, boolean>();

  async initializeAuth(): Promise<void> {
    const startTime = performance.now();

    // Quick client-side token check (no server round-trip)
    const token = await this.secureStorage.getItem('accessToken');
    const isValid = token ? !isTokenExpired(token) : false;

    this.tokenValidityCache.set('startup', isValid);

    const endTime = performance.now();
    console.log(`Auth initialization: ${endTime - startTime}ms`);
  }
}
```

## Deployment Considerations

### 1. Environment Separation

#### Server Environment Variables

```bash
# Backend (.env.production)
JWT_SECRET=server_only_secret_key
BCRYPT_ROUNDS=12
DATABASE_ENCRYPTION_KEY=server_encryption_key
```

#### Client Environment Variables

```bash
# Mobile (app.config.js)
export default {
  extra: {
    apiUrl: process.env.API_URL,
    // Never include server secrets in mobile builds
  }
};
```

### 2. Build Verification

#### Pre-deployment Checks

```bash
# Verify mobile bundle doesn't include server dependencies
npx expo export --dump-assetmap | grep -E "(bcrypt|crypto\.randomBytes|jwt\.sign)"
# Should return no results

# Verify server includes all required dependencies
npm ls bcrypt jsonwebtoken
# Should show installed versions
```

## Troubleshooting Guide

### Issue: Mobile App Won't Start

**Symptoms**: Metro bundler fails, crypto/bcrypt errors
**Diagnosis**:

```bash
# Check for server imports in mobile code
grep -r "from '@your-org/auth-lib'" apps/{app-name}/ | grep -v "mobile"
```

**Solution**: Replace server imports with mobile-specific imports

### Issue: Authentication Failing

**Symptoms**: Login returns 401, token validation errors
**Server-side diagnosis**:

```typescript
// Check password hashing
const hash = await hashPassword('test123', 12);
const isValid = await comparePassword('test123', hash);
console.log('Password verification:', isValid); // Should be true
```

**Client-side diagnosis**:

```typescript
// Check token parsing
const token = await secureStorage.getItem('accessToken');
const decoded = decodeToken(token);
console.log('Token valid:', !isTokenExpired(token));
```

### Issue: Bundle Size Too Large

**Diagnosis**:

```bash
npx expo export --dump-assetmap | grep -E "(bcrypt|jsonwebtoken)"
```

**Solution**: Audit imports for server-only dependencies in mobile code

## Security Checklist

### Development Security

- [ ] No server secrets in mobile environment variables
- [ ] All password operations use server-side bcrypt hashing
- [ ] JWT signing/verification only on server
- [ ] Client sends plaintext passwords over HTTPS only
- [ ] Sensitive tokens stored in biometric-protected SecureStore
- [ ] No crypto operations in mobile bundle
- [ ] All API communications over HTTPS with certificate pinning

### Code Review Security

- [ ] No `@your-org/auth-lib` imports in mobile code (use `/src/client`)
- [ ] No `@your-org/shared-utils/server` imports in mobile code
- [ ] No plaintext passwords logged on server
- [ ] No JWT secrets in client-accessible configuration
- [ ] All financial operations have 95%+ test coverage
- [ ] Input validation on both client and server sides

### Deployment Security

- [ ] Server environment variables are properly secured
- [ ] Mobile builds don't contain server-only dependencies
- [ ] HTTPS certificate pinning enabled for production
- [ ] API rate limiting configured for authentication endpoints
- [ ] Security headers configured on server responses
- [ ] Database encryption keys are server-only

## Best Practices Summary

### DO

- Use platform-specific entry points for libraries
- Send plaintext credentials over HTTPS to server for hashing
- Parse JWT tokens client-side for UX optimization only
- Store sensitive data in biometric-protected SecureStore
- Implement input validation on both client and server
- Use common utilities from main library exports
- Test platform separation with proper mocking strategies

### DON'T

- Import server crypto functions in mobile code
- Attempt password hashing or JWT signing client-side
- Store JWT secrets in mobile builds
- Log sensitive data in either client or server
- Skip input validation on either side
- Use synchronous operations for crypto functions
- Mix platform-specific and common imports

This guide should be updated as new platform-specific patterns are introduced to the codebase.
