/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-non-null-assertion,@typescript-eslint/no-unused-vars */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly resourceId?: string,
  ) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(public readonly resourceId: string) {
    super(`Resource not found: ${resourceId}`, "RESOURCE_NOT_FOUND");
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class DuplicateError extends AppError {
  constructor(
    message: string,
    public readonly resourceId: string,
  ) {
    super(message, "DUPLICATE_RESOURCE");
    this.name = "DuplicateError";
    Object.setPrototypeOf(this, DuplicateError.prototype);
  }
}

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBackoff: boolean;
  retryCondition?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}

export interface ErrorRecoveryContext {
  operation: string;
  userId?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorHandlingResult<T> {
  success: boolean;
  data?: T;
  error?: AppError;
  attempts: number;
  recoveryAction?: string;
}

export class ErrorHandler {
  private static readonly DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    exponentialBackoff: true,
    retryCondition: (error: unknown) => ErrorHandler.isRetryableError(error),
  };

  private static readonly OPERATION_SPECIFIC_RETRY_OPTIONS: Record<
    string,
    Partial<RetryOptions>
  > = {
    external_validation: {
      maxAttempts: 5,
      baseDelayMs: 2000,
      maxDelayMs: 30000,
      retryCondition: (error: unknown) =>
        ErrorHandler.isNetworkError(error) ||
        ErrorHandler.isTemporaryServiceError(error),
    },
    database_operation: {
      maxAttempts: 3,
      baseDelayMs: 500,
      maxDelayMs: 5000,
      retryCondition: (error: unknown) =>
        ErrorHandler.isTemporaryDatabaseError(error),
    },
    api_call: {
      maxAttempts: 4,
      baseDelayMs: 1500,
      maxDelayMs: 20000,
      retryCondition: (error: unknown) =>
        ErrorHandler.isRetryableApiError(error),
    },
  };

  public static async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: ErrorRecoveryContext,
    customOptions?: Partial<RetryOptions>,
  ): Promise<ErrorHandlingResult<T>> {
    const options = {
      ...ErrorHandler.DEFAULT_RETRY_OPTIONS,
      ...ErrorHandler.OPERATION_SPECIFIC_RETRY_OPTIONS[context.operation],
      ...customOptions,
    };

    let lastError: unknown;
    let attempts = 0;

    while (attempts < options.maxAttempts) {
      attempts++;

      try {
        const result = await operation();
        return {
          success: true,
          data: result,
          attempts,
          recoveryAction:
            attempts > 1 ? `Succeeded after ${attempts} attempts` : undefined,
        };
      } catch (error) {
        lastError = error;

        if (options.onRetry) {
          options.onRetry(attempts, error);
        }

        if (
          attempts >= options.maxAttempts ||
          !options.retryCondition!(error)
        ) {
          break;
        }

        const delay = ErrorHandler.calculateDelay(attempts, options);
        await ErrorHandler.sleep(delay);
      }
    }

    const appError = ErrorHandler.normalizeError(lastError, context);

    return {
      success: false,
      error: appError,
      attempts,
      recoveryAction: ErrorHandler.suggestRecoveryAction(appError, context),
    };
  }

  public static async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    context: ErrorRecoveryContext,
    circuitBreakerOptions?: {
      failureThreshold: number;
      recoveryTimeoutMs: number;
      monitoringPeriodMs: number;
    },
  ): Promise<ErrorHandlingResult<T>> {
    const options = {
      failureThreshold: 5,
      recoveryTimeoutMs: 60000,
      monitoringPeriodMs: 300000,
      ...circuitBreakerOptions,
    };

    const circuitKey = `${context.operation}_${context.userId || "global"}`;

    if (ErrorHandler.isCircuitOpen(circuitKey, options)) {
      return {
        success: false,
        error: new AppError(
          "Service temporarily unavailable due to repeated failures",
          "CIRCUIT_BREAKER_OPEN",
        ),
        attempts: 0,
        recoveryAction: "Wait for circuit breaker recovery or contact support",
      };
    }

    const result = await ErrorHandler.executeWithRetry(operation, context);

    if (result.success) {
      ErrorHandler.recordSuccess(circuitKey);
    } else {
      ErrorHandler.recordFailure(circuitKey, options);
    }

    return result;
  }

  private static calculateDelay(
    attempt: number,
    options: RetryOptions,
  ): number {
    if (!options.exponentialBackoff) {
      return Math.min(options.baseDelayMs, options.maxDelayMs);
    }

    const exponentialDelay = options.baseDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, options.maxDelayMs);
  }

  private static async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static isRetryableError(error: unknown): boolean {
    return (
      ErrorHandler.isNetworkError(error) ||
      ErrorHandler.isTemporaryServiceError(error) ||
      ErrorHandler.isTemporaryDatabaseError(error) ||
      ErrorHandler.isRateLimitError(error)
    );
  }

  private static isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      const networkErrorCodes = [
        "ECONNRESET",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "ENOTFOUND",
      ];
      return networkErrorCodes.some((code) => error.message.includes(code));
    }
    return false;
  }

  private static isTemporaryServiceError(error: unknown): boolean {
    if (error instanceof Error) {
      const temporaryMessages = [
        "service unavailable",
        "temporary failure",
        "server busy",
        "maintenance mode",
        "503",
        "502",
        "504",
      ];
      return temporaryMessages.some((msg) =>
        error.message.toLowerCase().includes(msg),
      );
    }
    return false;
  }

  private static isTemporaryDatabaseError(error: unknown): boolean {
    if (error instanceof Error) {
      const dbErrorMessages = [
        "connection timeout",
        "connection reset",
        "deadlock",
        "lock timeout",
        "connection pool",
        "database busy",
      ];
      return dbErrorMessages.some((msg) =>
        error.message.toLowerCase().includes(msg),
      );
    }
    return false;
  }

  private static isRateLimitError(error: unknown): boolean {
    if (error instanceof AppError) {
      return error.code === "RATE_LIMITED";
    }
    if (error instanceof Error) {
      return (
        error.message.toLowerCase().includes("rate limit") ||
        error.message.includes("429") ||
        error.message.toLowerCase().includes("too many requests")
      );
    }
    return false;
  }

  private static isRetryableApiError(error: unknown): boolean {
    if (error instanceof Error) {
      const statusCodes = ["429", "500", "502", "503", "504"];
      return statusCodes.some((code) => error.message.includes(code));
    }
    return false;
  }

  private static normalizeError(
    error: unknown,
    context: ErrorRecoveryContext,
  ): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        return new NotFoundError(context.resourceId || "unknown");
      }

      if (
        error.message.includes("duplicate") ||
        error.message.includes("already exists")
      ) {
        return new DuplicateError(error.message, context.resourceId || "unknown");
      }

      if (
        error.message.includes("validation") ||
        error.message.includes("invalid")
      ) {
        return new ValidationError(error.message, context.resourceId);
      }

      return new AppError(
        `${context.operation} failed: ${error.message}`,
        "OPERATION_FAILED",
      );
    }

    return new AppError(
      `${context.operation} failed with unknown error`,
      "UNKNOWN_ERROR",
    );
  }

  private static suggestRecoveryAction(
    error: AppError,
    _context: ErrorRecoveryContext,
  ): string {
    switch (error.code) {
      case "NETWORK_ERROR":
        return "Check network connectivity and try again";
      case "RATE_LIMITED":
        return "Wait a few minutes before attempting this operation again";
      case "VALIDATION_ERROR":
        return "Please review and correct the input data";
      case "ACCESS_DENIED":
        return "Verify user permissions and authentication status";
      case "DUPLICATE_RESOURCE":
        return "A resource with these details already exists - consider updating the existing record";
      case "RESOURCE_NOT_FOUND":
        return "The resource may have been deleted or access permissions changed";
      case "CIRCUIT_BREAKER_OPEN":
        return "Service is temporarily unavailable - please try again later";
      case "DATABASE_ERROR":
        return "Database operation failed - please try again or contact support";
      case "EXTERNAL_SERVICE_ERROR":
        return "External service is temporarily unavailable - please try again";
      default:
        return "Please try again or contact support if the problem persists";
    }
  }

  private static circuitState: Map<
    string,
    {
      failures: number;
      lastFailureTime: number;
      isOpen: boolean;
      successCount: number;
    }
  > = new Map();

  private static isCircuitOpen(
    circuitKey: string,
    options: {
      failureThreshold: number;
      recoveryTimeoutMs: number;
      monitoringPeriodMs: number;
    },
  ): boolean {
    const state = ErrorHandler.circuitState.get(circuitKey);

    if (!state) {
      return false;
    }

    const now = Date.now();

    if (now - state.lastFailureTime > options.monitoringPeriodMs) {
      ErrorHandler.circuitState.delete(circuitKey);
      return false;
    }

    if (state.isOpen) {
      if (now - state.lastFailureTime > options.recoveryTimeoutMs) {
        state.isOpen = false;
        state.failures = 0;
        state.successCount = 0;
        return false;
      }
      return true;
    }

    return false;
  }

  private static recordFailure(
    circuitKey: string,
    options: {
      failureThreshold: number;
      recoveryTimeoutMs: number;
      monitoringPeriodMs: number;
    },
  ): void {
    const state = ErrorHandler.circuitState.get(circuitKey) || {
      failures: 0,
      lastFailureTime: 0,
      isOpen: false,
      successCount: 0,
    };

    state.failures++;
    state.lastFailureTime = Date.now();

    if (state.failures >= options.failureThreshold) {
      state.isOpen = true;
    }

    ErrorHandler.circuitState.set(circuitKey, state);
  }

  private static recordSuccess(circuitKey: string): void {
    const state = ErrorHandler.circuitState.get(circuitKey);

    if (state) {
      state.successCount++;

      if (state.successCount >= 3) {
        ErrorHandler.circuitState.delete(circuitKey);
      } else {
        ErrorHandler.circuitState.set(circuitKey, state);
      }
    }
  }

  public static classifyError(error: unknown): {
    type:
      | "network"
      | "validation"
      | "authorization"
      | "business_logic"
      | "external_service"
      | "database"
      | "unknown";
    severity: "low" | "medium" | "high" | "critical";
    isRetryable: boolean;
    requiresUserAction: boolean;
  } {
    if (error instanceof ValidationError) {
      return {
        type: "validation",
        severity: "medium",
        isRetryable: false,
        requiresUserAction: true,
      };
    }

    if (error instanceof NotFoundError) {
      return {
        type: "business_logic",
        severity: "medium",
        isRetryable: false,
        requiresUserAction: true,
      };
    }

    if (error instanceof DuplicateError) {
      return {
        type: "business_logic",
        severity: "low",
        isRetryable: false,
        requiresUserAction: true,
      };
    }

    if (error instanceof AppError) {
      switch (error.code) {
        case "ACCESS_DENIED":
          return {
            type: "authorization",
            severity: "high",
            isRetryable: false,
            requiresUserAction: true,
          };
        case "RATE_LIMITED":
          return {
            type: "external_service",
            severity: "medium",
            isRetryable: true,
            requiresUserAction: false,
          };
        case "NETWORK_ERROR":
          return {
            type: "network",
            severity: "medium",
            isRetryable: true,
            requiresUserAction: false,
          };
        case "DATABASE_ERROR":
          return {
            type: "database",
            severity: "high",
            isRetryable: true,
            requiresUserAction: false,
          };
        default:
          return {
            type: "unknown",
            severity: "medium",
            isRetryable: true,
            requiresUserAction: false,
          };
      }
    }

    if (error instanceof Error) {
      if (ErrorHandler.isNetworkError(error)) {
        return {
          type: "network",
          severity: "medium",
          isRetryable: true,
          requiresUserAction: false,
        };
      }

      if (ErrorHandler.isTemporaryDatabaseError(error)) {
        return {
          type: "database",
          severity: "high",
          isRetryable: true,
          requiresUserAction: false,
        };
      }
    }

    return {
      type: "unknown",
      severity: "high",
      isRetryable: false,
      requiresUserAction: true,
    };
  }

  public static logError(
    error: unknown,
    context: ErrorRecoveryContext,
    classification?: ReturnType<typeof ErrorHandler.classifyError>,
  ): void {
    const errorClassification =
      classification || ErrorHandler.classifyError(error);

    const logEntry = {
      timestamp: new Date().toISOString(),
      operation: context.operation,
      userId: context.userId,
      resourceId: context.resourceId,
      errorType: errorClassification.type,
      severity: errorClassification.severity,
      isRetryable: errorClassification.isRetryable,
      requiresUserAction: errorClassification.requiresUserAction,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorCode: error instanceof AppError ? error.code : undefined,
      metadata: context.metadata,
      stackTrace: error instanceof Error ? error.stack : undefined,
    };

    console.error("[ErrorHandler] Operation failed:", logEntry);

    if (errorClassification.severity === "critical") {
      ErrorHandler.triggerCriticalErrorAlert(logEntry);
    }
  }

  private static triggerCriticalErrorAlert(
    logEntry: Record<string, unknown>,
  ): void {
    console.error("[CRITICAL] System critical error:", {
      operation: logEntry["operation"] as string | undefined,
      userId: logEntry["userId"] as string | undefined,
      timestamp: logEntry["timestamp"] as string | undefined,
      errorMessage: logEntry["errorMessage"],
    });
  }

  public static getErrorRecoveryPlan(
    error: AppError,
    _context: ErrorRecoveryContext,
  ): {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
    preventive: string[];
  } {
    const classification = ErrorHandler.classifyError(error);

    const basePlan = {
      immediate: ["Log error details", "Notify user of failure"],
      shortTerm: ["Review error patterns", "Check system status"],
      longTerm: ["Analyze root cause", "Implement preventive measures"],
      preventive: ["Monitor error rates", "Regular system health checks"],
    };

    switch (classification.type) {
      case "network":
        return {
          immediate: [
            ...basePlan.immediate,
            "Check network connectivity",
            "Retry with exponential backoff",
          ],
          shortTerm: [
            ...basePlan.shortTerm,
            "Monitor network stability",
            "Consider caching strategy",
          ],
          longTerm: [
            ...basePlan.longTerm,
            "Implement offline mode",
            "Optimize network usage",
          ],
          preventive: [
            ...basePlan.preventive,
            "Network monitoring alerts",
            "Connection pooling",
          ],
        };

      case "validation":
        return {
          immediate: [
            ...basePlan.immediate,
            "Return detailed validation errors",
            "Suggest corrections",
          ],
          shortTerm: [
            ...basePlan.shortTerm,
            "Review validation rules",
            "Update user guidance",
          ],
          longTerm: [
            ...basePlan.longTerm,
            "Enhance input validation",
            "Improve UX feedback",
          ],
          preventive: [
            ...basePlan.preventive,
            "Input sanitization",
            "Real-time validation",
          ],
        };

      case "authorization":
        return {
          immediate: [
            ...basePlan.immediate,
            "Verify user session",
            "Check permissions",
          ],
          shortTerm: [
            ...basePlan.shortTerm,
            "Review access control rules",
            "Audit user roles",
          ],
          longTerm: [
            ...basePlan.longTerm,
            "Enhance security policies",
            "Implement fine-grained permissions",
          ],
          preventive: [
            ...basePlan.preventive,
            "Regular permission audits",
            "Session monitoring",
          ],
        };

      case "external_service":
        return {
          immediate: [
            ...basePlan.immediate,
            "Check service status",
            "Use fallback if available",
          ],
          shortTerm: [
            ...basePlan.shortTerm,
            "Monitor service health",
            "Review SLA compliance",
          ],
          longTerm: [
            ...basePlan.longTerm,
            "Implement service redundancy",
            "Negotiate better SLAs",
          ],
          preventive: [
            ...basePlan.preventive,
            "Service health monitoring",
            "Fallback mechanisms",
          ],
        };

      default:
        return basePlan;
    }
  }

  public static async handleBatchOperationErrors<T>(
    operations: Array<() => Promise<T>>,
    context: ErrorRecoveryContext,
    options?: {
      failFast?: boolean;
      maxConcurrent?: number;
      collectErrors?: boolean;
    },
  ): Promise<{
    successes: T[];
    failures: Array<{ index: number; error: AppError; attempts: number }>;
    summary: {
      total: number;
      successful: number;
      failed: number;
      retryable: number;
    };
  }> {
    const opts = {
      failFast: false,
      maxConcurrent: 5,
      collectErrors: true,
      ...options,
    };

    const successes: T[] = [];
    const failures: Array<{
      index: number;
      error: AppError;
      attempts: number;
    }> = [];

    for (let i = 0; i < operations.length; i += opts.maxConcurrent) {
      const batch = operations.slice(i, i + opts.maxConcurrent);
      const batchPromises = batch.map(async (operation, batchIndex) => {
        const operationIndex = i + batchIndex;
        const operationContext = {
          ...context,
          metadata: { ...context.metadata, operationIndex },
        };

        return ErrorHandler.executeWithRetry(operation, operationContext);
      });

      const batchResults = await Promise.all(batchPromises);

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const operationIndex = i + j;

        if (result.success && result.data !== undefined) {
          successes.push(result.data);
        } else if (result.error) {
          failures.push({
            index: operationIndex,
            error: result.error,
            attempts: result.attempts,
          });

          if (opts.failFast) {
            return ErrorHandler.buildBatchResult(
              successes,
              failures,
              operations.length,
            );
          }
        }
      }
    }

    return ErrorHandler.buildBatchResult(successes, failures, operations.length);
  }

  private static buildBatchResult<T>(
    successes: T[],
    failures: Array<{ index: number; error: AppError; attempts: number }>,
    total: number,
  ) {
    const retryableCount = failures.filter(
      (f) => ErrorHandler.classifyError(f.error).isRetryable,
    ).length;

    return {
      successes,
      failures,
      summary: {
        total,
        successful: successes.length,
        failed: failures.length,
        retryable: retryableCount,
      },
    };
  }
}

export function withErrorHandling(
  context: ErrorRecoveryContext,
  retryOptions?: Partial<RetryOptions>,
) {
  return function <T>(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]): Promise<T> {
      const fullContext = {
        ...context,
        metadata: {
          ...context.metadata,
          methodName: propertyKey,
          className: target.constructor.name,
        },
      };

      const result = await ErrorHandler.executeWithRetry(
        () => originalMethod.apply(this, args),
        fullContext,
        retryOptions,
      );

      if (!result.success && result.error) {
        ErrorHandler.logError(result.error, fullContext);
      }

      if (result.success && result.data !== undefined) {
        return result.data as T;
      } else {
        throw (
          result.error || new AppError("Operation failed", "OPERATION_FAILED")
        );
      }
    };

    return descriptor;
  };
}

export class GracefulDegradationHandler {
  public static async executeWithFallback<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    context: ErrorRecoveryContext,
    options?: {
      fallbackThreshold?: number;
      fallbackCacheDurationMs?: number;
    },
  ): Promise<T> {
    const opts = {
      fallbackThreshold: 3,
      fallbackCacheDurationMs: 300000,
      ...options,
    };

    const fallbackKey = `${context.operation}_fallback`;

    if (
      GracefulDegradationHandler.shouldUseFallback(
        fallbackKey,
        opts.fallbackThreshold,
      )
    ) {
      try {
        const result = await fallbackOperation();
        GracefulDegradationHandler.recordFallbackSuccess(fallbackKey);
        return result;
      } catch (fallbackError) {
        ErrorHandler.logError(fallbackError, {
          ...context,
          operation: `${context.operation}_fallback`,
        });
      }
    }

    try {
      const result = await primaryOperation();
      GracefulDegradationHandler.recordPrimarySuccess(fallbackKey);
      return result;
    } catch (primaryError) {
      GracefulDegradationHandler.recordPrimaryFailure(fallbackKey);

      try {
        const result = await fallbackOperation();
        ErrorHandler.logError(primaryError, {
          ...context,
          metadata: { ...context.metadata, usedFallback: true },
        });
        return result;
      } catch (fallbackError) {
        ErrorHandler.logError(fallbackError, {
          ...context,
          operation: `${context.operation}_fallback_final`,
        });
        throw primaryError;
      }
    }
  }

  private static fallbackState: Map<
    string,
    {
      primaryFailures: number;
      lastPrimaryFailure: number;
      useFallback: boolean;
    }
  > = new Map();

  private static shouldUseFallback(
    fallbackKey: string,
    _threshold: number,
  ): boolean {
    const state = GracefulDegradationHandler.fallbackState.get(fallbackKey);
    return state ? state.useFallback : false;
  }

  private static recordPrimaryFailure(fallbackKey: string): void {
    const state = GracefulDegradationHandler.fallbackState.get(fallbackKey) || {
      primaryFailures: 0,
      lastPrimaryFailure: 0,
      useFallback: false,
    };

    state.primaryFailures++;
    state.lastPrimaryFailure = Date.now();

    if (state.primaryFailures >= 3) {
      state.useFallback = true;
    }

    GracefulDegradationHandler.fallbackState.set(fallbackKey, state);
  }

  private static recordPrimarySuccess(fallbackKey: string): void {
    const state = GracefulDegradationHandler.fallbackState.get(fallbackKey);
    if (state) {
      state.primaryFailures = Math.max(0, state.primaryFailures - 1);

      if (state.primaryFailures === 0) {
        state.useFallback = false;
      }

      GracefulDegradationHandler.fallbackState.set(fallbackKey, state);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private static recordFallbackSuccess(_fallbackKey: string): void {}
}
