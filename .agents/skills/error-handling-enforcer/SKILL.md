---
name: error-handling-enforcer
description: Ensure consistent error handling across client and server. Use when adding error handling, reviewing exceptions, implementing error boundaries, creating error classes, validating error codes, ensuring proper logging, or implementing retry logic and circuit breakers.
---

# Error Handling Enforcer

## Overview

This skill enforces consistent error handling patterns across client and server. Ensures proper error class hierarchy, standardized error codes, sanitized logging, user-friendly messages, retry logic, circuit breakers, and React error boundaries.

## When to Use This Skill

Use this skill when:
- Creating new error classes or extending AppError
- Implementing try-catch blocks in services or controllers
- Adding error handling to API endpoints
- Creating React error boundaries
- Implementing retry logic for network requests
- Adding circuit breakers for external services
- Reviewing error handling code for consistency
- Ensuring errors are logged without PII
- Validating error codes follow naming conventions
- Implementing error recovery strategies

## Error Class Hierarchy

### Base AppError Class

Standard error structure for the entire system:

```typescript
export enum ErrorType {
  VALIDATION = 'VALIDATION_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND_ERROR',
  NETWORK = 'NETWORK_ERROR',
  SERVER = 'SERVER_ERROR',
  UNKNOWN = 'UNKNOWN_ERROR',
}

export class AppError extends Error {
  type: ErrorType;
  statusCode: number;
  code?: string;
  details?: any;

  constructor(
    message: string,
    type: ErrorType,
    codeOrStatusCode?: string | number,
    detailsOrStatusCode?: any | number,
    finalDetails?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.type = type;

    if (typeof codeOrStatusCode === 'string') {
      this.code = codeOrStatusCode;
      this.statusCode = typeof detailsOrStatusCode === 'number' ? detailsOrStatusCode : 400;
      this.details = typeof detailsOrStatusCode === 'number' ? finalDetails : detailsOrStatusCode;
    } else {
      this.statusCode = codeOrStatusCode || 400;
      this.details = detailsOrStatusCode;
    }
  }
}
```

### Typed Subclasses

Extend `AppError` for specific error categories:

```typescript
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorType.VALIDATION, 'VALIDATION_ERROR', 422, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, ErrorType.NOT_FOUND, 'RESOURCE_NOT_FOUND', 404, { resource, id });
    this.name = 'NotFoundError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, ErrorType.AUTHORIZATION, 'ACCESS_DENIED', 403);
    this.name = 'AuthorizationError';
  }
}
```

## Error Code Standards

### Naming Convention

Error codes follow the pattern `RESOURCE_OPERATION_STATE`:

```typescript
// ✅ CORRECT - Clear, descriptive, uppercase
export enum ErrorCode {
  // Resource errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CREATION_FAILED = 'RESOURCE_CREATION_FAILED',

  // Validation errors
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Operation errors
  OPERATION_FAILED = 'OPERATION_FAILED',
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',

  // System errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ❌ WRONG - Inconsistent naming
enum BAD_ERROR_CODES {
  'resource-not-found',    // lowercase, hyphens
  'ResourceCreationErr',   // Mixed case, abbreviated
  'ERR_001',               // Generic numeric code
  'error_resource_create', // Wrong order
}
```

### Error Code Categories

Organize by module with a prefix:

```typescript
// Prefix pattern: MODULE_OPERATION_STATUS
export const ErrorCodes = {
  // User module (USER_*)
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  USER_SUSPENDED: 'USER_SUSPENDED',

  // Auth module (AUTH_*)
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_RATE_LIMITED: 'AUTH_RATE_LIMITED',

  // API module (API_*)
  API_INVALID_REQUEST: 'API_INVALID_REQUEST',
  API_RATE_LIMITED: 'API_RATE_LIMITED',
  API_UPSTREAM_FAILED: 'API_UPSTREAM_FAILED',
};
```

## Logging Patterns

### Sanitized Logging (No PII)

**CRITICAL**: Never log sensitive information:

```typescript
// ✅ CORRECT - Sanitized, no PII
try {
  await userService.update(userId, data);
} catch (error) {
  console.error('User update failed', {
    errorCode: error.code,
    errorMessage: error.message,
    userId,           // IDs are OK
    // NO email, phone, name, address, etc.
  });
}

// ❌ WRONG - Logs PII
try {
  await userService.update(userId, data);
} catch (error) {
  console.error('User update failed', {
    error: error.message,
    email: user.email,        // ❌ PII
    phone: user.phone,        // ❌ PII
    address: user.address,    // ❌ PII
    password: data.password,  // ❌ NEVER log passwords
  });
}
```

### Error Logging Best Practices

Structure error logs consistently:

```typescript
class UserService {
  async createUser(tenantId: string, role: string): Promise<User> {
    try {
      const user = await this.userRepository.create({ tenantId, role });

      console.info('User created successfully', {
        userId: user.id,
        tenantId,
        role,
      });

      return user;
    } catch (error) {
      console.error('User creation failed', {
        errorCode: error instanceof AppError ? error.code : 'UNKNOWN_ERROR',
        errorMessage: error.message,
        tenantId,
        role,
        stack: error.stack,
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to create user',
        ErrorType.SERVER,
        'USER_CREATION_FAILED',
        500,
        { tenantId, role, originalError: error.message }
      );
    }
  }
}
```

## User-Friendly vs Technical Messages

### Dual Error Messages

Separate user-facing messages from technical details:

```typescript
export class OperationError extends AppError {
  public readonly userMessage: string;
  public readonly technicalMessage: string;

  constructor(
    type: ErrorType,
    code: string,
    technicalMessage: string,
    userMessage: string,
    statusCode = 400,
    details?: Record<string, unknown>
  ) {
    super(technicalMessage, type, code, statusCode, details);
    this.name = 'OperationError';
    this.technicalMessage = technicalMessage;
    this.userMessage = userMessage;
  }
}
```

### User-Friendly Message Mapping

Map error types to user messages:

```typescript
export function getUserFriendlyErrorMessage(error: Error | AppError | unknown): string {
  if (error instanceof AppError) {
    switch (error.type) {
      case ErrorType.VALIDATION:
        return error.message; // Validation messages are already user-friendly

      case ErrorType.AUTHENTICATION:
        return `Authentication failed: ${error.message}`;

      case ErrorType.AUTHORIZATION:
        return 'You do not have permission to perform this action';

      case ErrorType.NOT_FOUND:
        return error.message;

      case ErrorType.NETWORK:
        return 'Network connection issue. Please check your internet connection and try again';

      case ErrorType.SERVER:
        return 'Something went wrong on our end. Please try again later.';

      default:
        return 'An unexpected error occurred. Please try again later';
    }
  }

  return 'An unexpected error occurred. Please try again.';
}
```

## Retry Logic and Circuit Breakers

### Retry with Exponential Backoff

Implement retry logic for transient failures:

```typescript
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    retryableErrors?: string[];
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    retryableErrors = ['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR'],
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error, retryableErrors)) {
        throw error;
      }

      if (attempt === maxAttempts) {
        break;
      }

      const delay = Math.min(
        initialDelay * Math.pow(factor, attempt - 1),
        maxDelay
      );
      const jitter = delay * 0.1 * Math.random();

      console.info(`Retry attempt ${attempt}/${maxAttempts} after ${Math.round(delay + jitter)}ms`, {
        errorCode: error.code,
        errorMessage: error.message,
      });

      await sleep(delay + jitter);
    }
  }

  throw lastError;
}

function isRetryableError(error: any, retryableErrors: string[]): boolean {
  if (error.code && retryableErrors.includes(error.code)) {
    return true;
  }

  if (error instanceof AppError) {
    return [ErrorType.NETWORK, ErrorType.SERVER].includes(error.type);
  }

  return false;
}
```

### Circuit Breaker Pattern

Prevent cascading failures:

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private successCount = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private nextAttempt = Date.now();

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
    private resetTimeout: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;

      if (this.successCount >= 2) {
        this.state = 'CLOSED';
        this.successCount = 0;
        console.info('Circuit breaker CLOSED');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;

      console.error('Circuit breaker OPEN', {
        failureCount: this.failureCount,
        nextAttemptAt: new Date(this.nextAttempt).toISOString(),
      });
    }
  }

  getState(): string {
    return this.state;
  }
}
```

## React Error Boundaries

### Error Boundary Component

Catch and display React errors gracefully:

```typescript
import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('React error boundary caught error', {
      errorMessage: error.message,
      errorStack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: undefined });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p>We're sorry, but something unexpected happened. Please try again.</p>
          <button onClick={this.handleReset}>Try Again</button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## Error Recovery Strategies

### Graceful Degradation

Provide fallback functionality when features fail:

```typescript
class NotificationService {
  async sendNotification(userId: string, message: string): Promise<void> {
    try {
      await this.pushNotificationService.send(userId, message);
    } catch (error) {
      console.error('Push notification failed, falling back to in-app notification', {
        errorCode: error.code,
        userId,
      });

      try {
        await this.inAppNotificationService.create(userId, message);
      } catch (fallbackError) {
        console.error('In-app notification failed, queuing for later', {
          errorCode: fallbackError.code,
          userId,
        });

        await this.notificationQueue.add({ userId, message });
      }
    }
  }
}
```

### Compensating Transactions

Rollback on failure for critical operations:

```typescript
class TransferService {
  async transfer(fromId: string, toId: string, amount: string): Promise<Transaction> {
    let debitTx: Transaction | null = null;

    try {
      debitTx = await this.accountService.debit(fromId, amount);
      const creditTx = await this.accountService.credit(toId, amount);
      await this.transactionService.complete(debitTx.id);
      await this.transactionService.complete(creditTx.id);
      return debitTx;
    } catch (error) {
      console.error('Transfer failed, initiating rollback', {
        errorCode: error.code,
        fromId,
        toId,
        amount,
      });

      if (debitTx) {
        try {
          await this.accountService.credit(fromId, amount);
          await this.transactionService.cancel(debitTx.id);
          console.info('Transfer rollback successful', { fromId, toId });
        } catch (rollbackError) {
          console.error('CRITICAL: Transfer rollback failed', {
            debitTxId: debitTx.id,
            fromId,
            amount,
            rollbackError: rollbackError.message,
          });

          await this.alertService.criticalAlert({
            type: 'TRANSFER_ROLLBACK_FAILED',
            debitTxId: debitTx.id,
            fromId,
            amount,
          });
        }
      }

      throw error;
    }
  }
}
```

## Validation Checklist

**Error Classes:**
- [ ] All errors extend `AppError` or an appropriate typed subclass
- [ ] Error codes follow `RESOURCE_OPERATION_STATE` naming
- [ ] Error codes are UPPERCASE with underscores
- [ ] Error details exclude sensitive information (PII)
- [ ] Error stack trace captured properly

**Logging:**
- [ ] No PII logged (email, phone, address, passwords)
- [ ] Error code included in all error logs
- [ ] Stack trace logged for debugging
- [ ] Log level appropriate (error, warn, info)
- [ ] Structured logging used (JSON format)
- [ ] Context included (IDs only, no sensitive values)

**User Messages:**
- [ ] User-friendly messages separate from technical messages
- [ ] No technical jargon in user messages
- [ ] No sensitive information in user messages
- [ ] Clear actionable guidance provided
- [ ] Consistent tone and voice

**Error Handling:**
- [ ] Try-catch blocks around all async operations
- [ ] Errors re-thrown or wrapped in typed errors
- [ ] Retry logic for transient failures
- [ ] Circuit breakers for external services
- [ ] Graceful degradation for non-critical features
- [ ] Compensating transactions for critical operations

**Error Boundaries:**
- [ ] Error boundaries wrap all major screens/views
- [ ] Fallback UI provides retry option
- [ ] Errors logged to monitoring service
- [ ] Component stack included in logs

## Anti-Patterns to Avoid

**NEVER:**
- ❌ Log PII (email, phone, address, password, etc.)
- ❌ Use generic error messages ("Something went wrong") with no actionable info
- ❌ Use lowercase or mixed-case error codes
- ❌ Expose stack traces to users
- ❌ Swallow errors silently (empty catch blocks)
- ❌ Return different error formats from the same module
- ❌ Throw generic `Error` objects (use typed errors)
- ❌ Retry non-idempotent operations without safeguards
- ❌ Skip compensating transactions for critical operations
- ❌ Use numeric error codes without descriptive names

**ALWAYS:**
- ✅ Extend `AppError` for all custom errors
- ✅ Include error codes in all custom errors
- ✅ Log errors with sanitized context
- ✅ Provide user-friendly error messages
- ✅ Implement retry logic with exponential backoff
- ✅ Use circuit breakers for external services
- ✅ Wrap React components in error boundaries
- ✅ Implement graceful degradation
- ✅ Use compensating transactions for rollbacks
- ✅ Monitor and alert on critical errors

## Resources

### references/

**error-handling.ts** - Generic error class hierarchy with retry logic, circuit breaker, graceful degradation, and batch error handling patterns

## Success Criteria

Error handling is well-implemented when:
1. All errors use typed classes extending `AppError`
2. Error codes follow consistent naming conventions
3. No PII logged in error messages or details
4. User-friendly messages separate from technical logs
5. Retry logic implemented for transient failures
6. Circuit breakers prevent cascading failures
7. Error boundaries protect the UI
8. Graceful degradation for non-critical features
9. Compensating transactions for critical operations
10. Errors monitored and alerted appropriately

Refer to references for detailed patterns and examples.
