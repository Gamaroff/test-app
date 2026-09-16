---
name: response-envelope-enforcer
description: Validate and enforce standardized API response wrapping patterns. Ensures HTTP endpoints wrap responses in StandardSuccessResponse/StandardPaginatedResponse, domain DTOs are used as payload data, service interfaces remain internal, and special cases (WebSocket events, binary files) are handled correctly. Use when creating/reviewing controller endpoints, debugging frontend data extraction errors, or auditing API response consistency.
---

# Response Envelope Enforcer

## Overview

This skill validates and enforces consistent `StandardSuccessResponse` wrapping patterns across your app NestJS API, ensuring frontend-backend contract alignment and preventing response structure inconsistencies that cause data extraction failures.

**Core Principle**: All HTTP API endpoints must return responses wrapped in `StandardSuccessResponse` format `{ success: true, data: T, metadata?: ResponseMetadata }`. Different response types require different handling approaches.

## Problem Context

**Common Issue**: Controllers return data directly without wrapping in the standard API response envelope. The frontend's `BaseApiService` expects `{ success: true, data: [...] }` and tries to extract the data field, but receives a raw array instead, causing extraction failures.

**Root Causes**:
- Controllers use different wrapping strategies without documentation
- Some explicitly wrap with `new StandardSuccessResponse(data)`
- Some return raw data relying on `ResponseTransformInterceptor`
- Special cases (WebSocket, binary files) mixed with HTTP patterns
- DTOs confused with response wrappers

## When to Use This Skill

Invoke this skill when:
- ✅ Creating new controller endpoints
- ✅ Reviewing API response patterns during code review
- ✅ Debugging frontend data extraction errors (missing `.data` field)
- ✅ Auditing API for response consistency
- ✅ Validating interceptor configuration
- ✅ Ensuring type alignment between backend and frontend
- ✅ Refactoring controllers to follow consistent patterns
- ✅ Writing tests for response envelope structure

## Response Type Categories

### Category 1: HTTP Controller Endpoints (MUST BE WRAPPED)

**What**: All REST API HTTP endpoints in controller files

**Location**: `apps/{api-service}/src/**/*.controller.ts`

**Must Return**:
- `StandardSuccessResponse<T>` - Success responses with data
- `StandardPaginatedResponse<T>` - Paginated list responses
- `StandardErrorResponse` - Error responses (handled by GlobalExceptionFilter)
- `createRawResponse(data)` - Binary/file responses

**Rules**:
1. All `@Get()`, `@Post()`, `@Put()`, `@Patch()`, `@Delete()` endpoints MUST return wrapped responses
2. Critical endpoints (financial, auth) MUST use explicit wrapping
3. Standard CRUD MAY rely on ResponseTransformInterceptor (with documentation)
4. No manual envelope construction (`{ success: true, data: ... }`)
5. Errors MUST throw exceptions (handled by GlobalExceptionFilter)

**Pattern Examples**:

```typescript
// ✅ CORRECT - Explicit wrapping (recommended for critical endpoints)
@Post('transfer')
async transferFunds(@Body() dto: TransferDto) {
  const transaction = await this.accountsService.transfer(dto);
  return new StandardSuccessResponse(transaction);
}

// ⚠️ ACCEPTABLE - Interceptor wrapping (for standard CRUD, document intent)
// @InterceptorWrapped - Auto-wrapped by ResponseTransformInterceptor
@Get('faqs')
async getFAQs() {
  return await this.helpService.getFAQs();
}

// ✅ CORRECT - Paginated response
@Get()
async findAll(@Query() pagination: PaginationDto) {
  const { items, total } = await this.service.findAll(pagination);
  return new StandardPaginatedResponse(items, pagination.page, pagination.limit, total);
}

// ❌ VIOLATION - Manual envelope construction
@Get(':id')
async findOne(@Param('id') id: string) {
  const account = await this.accountsService.findOne(id);
  return { success: true, data: account }; // WRONG - use StandardSuccessResponse class
}

// ❌ VIOLATION - Manual error response
@Get(':id')
async findOne(@Param('id') id: string) {
  const account = await this.accountsService.findOne(id);
  if (!account) {
    return { success: false, error: 'Not found' }; // WRONG - throw exception instead
  }
  return new StandardSuccessResponse(account);
}
```

**Critical Controllers** (MUST use explicit wrapping):
- `AccountsController` - Financial operations
- `TransactionsController` - Financial records
- `AuthController` - Authentication/authorization
- `MoneyLoadController` - Payment processing

**Standard Controllers** (MAY use interceptor with documentation):
- `HelpController` - Support conversations
- `ContactsController` - Contact management
- `NotificationsController` - Notification management
- `LocalizationController` - Translation data

### Category 2: Domain-Specific Response DTOs (PAYLOAD DATA)

**What**: Data Transfer Objects that represent the `data` field content inside StandardSuccessResponse

**Location**: `apps/{api-service}/src/**/dto/*-response.dto.ts`

**Purpose**: DTOs are the PAYLOAD, not the wrapper

**Rules**:
1. DTOs are plain data structures, NOT response wrappers
2. DTOs should NOT include `success` field (that's the wrapper's job)
3. DTOs are wrapped by controllers in StandardSuccessResponse
4. DTOs can be used as service return types
5. DTOs have clear, specific names (NotificationResponseDto, not GenericResponse)

**Pattern Examples**:

```typescript
// ✅ CORRECT - DTO is plain data structure
export class NotificationResponseDto {
  id: string;
  title: string;
  message: string;
  type: string;
  priority: string;
  status: string;
  createdAt: Date;
}

// ✅ CORRECT - Service returns DTO
async getNotification(id: string): Promise<NotificationResponseDto> {
  const notification = await this.repo.findOne(id);
  return this.buildDto(notification);
}

// ✅ CORRECT - Controller wraps DTO in StandardSuccessResponse
@Get(':id')
async findOne(@Param('id') id: string) {
  const notification = await this.service.getNotification(id);
  return new StandardSuccessResponse(notification); // DTO is the payload
}

// ❌ VIOLATION - DTO includes wrapper fields
export class NotificationResponseDto {
  success: boolean;  // WRONG - This is the wrapper's responsibility
  data: any;         // WRONG - DTO should BE the data, not contain it
  id: string;
  title: string;
}
```

**Examples of Domain DTOs** (payload inside wrappers):
- `MessageResponseDto` - Chat message data
- `ConversationResponseDto` - Support conversation data
- `NotificationResponseDto` - Notification data
- `UnreadCountResponseDto` - Unread count data
- `HandleAvailabilityResponseDto` - Handle check result
- `AvatarUploadResponseDto` - Avatar upload result
- `PaymentMethodResponseDto` - Payment method data
- `RollbackResponseDto` - Rollback operation result

### Category 3: Service-Level Response Interfaces (INTERNAL)

**What**: Internal interfaces used for communication between services, NOT returned from controllers

**Location**: `apps/{api-service}/src/**/*.service.ts`

**Purpose**: Internal data structures for service-to-service communication

**Rules**:
1. Service interfaces are for internal communication, NOT controller responses
2. Service methods return typed data structures
3. Controllers wrap service results in StandardSuccessResponse
4. No StandardSuccessResponse in service layer

**Pattern Examples**:

```typescript
// ✅ CORRECT - Service method with internal interface
async searchMessages(query: string): Promise<MessageSearchResponse> {
  return {
    results: [],
    totalCount: 0,
    searchTime: 150,
    suggestions: [],
    facets: {}
  };
}

// ✅ CORRECT - Controller wraps service result
@Get('search')
async search(@Query('q') query: string) {
  const result = await this.chatService.searchMessages(query);
  return new StandardSuccessResponse(result);
}

// ❌ VIOLATION - Service returns StandardSuccessResponse
async searchMessages(query: string): Promise<StandardSuccessResponse<MessageSearchResponse>> {
  const result = await this.performSearch(query);
  return new StandardSuccessResponse(result); // WRONG - Controllers should wrap, not services
}
```

**Examples of Service-Level Interfaces** (internal only):
- `MessageSearchResponse` - Search result structure
- `MessageAnalytics` - Analytics data structure
- `TokenPair` - Token data structure
- `TokenValidationResult` - Validation result
- `ValidationResult`, `DeviceSyncResult`, `PushNotificationResult`
- `PaginatedUserContactsResult`, `PaginatedExternalContactsResult`

### Category 4: WebSocket Event Responses (SPECIAL STRUCTURE)

**What**: WebSocket events have their own structure, separate from HTTP responses

**Location**: `apps/{api-service}/src/**/*.gateway.ts`

**Purpose**: Real-time event notifications over WebSocket connections

**Rules**:
1. WebSocket events use event-specific structures (ChatMessageEvent, etc.)
2. Events extend BaseWebSocketEvent
3. Events should NOT be wrapped in StandardSuccessResponse
4. Event responses from `@SubscribeMessage` can return simple objects

**Pattern Examples**:

```typescript
// ✅ CORRECT - WebSocket event structure (NOT wrapped)
@SubscribeMessage('sendMessage')
async handleMessage(client: Socket, payload: any) {
  const event: ChatMessageEvent = {
    eventName: 'newMessage',
    timestamp: new Date().toISOString(),
    correlationId: generateId(),
    messageId: message.id,
    content: message.content,
    senderId: sender.id
  };
  this.server.to(groupId).emit('newMessage', event);
}

// ✅ CORRECT - SubscribeMessage response (simple object for WebSocket)
@SubscribeMessage('joinGroup')
async handleJoin(client: Socket, groupId: string) {
  await this.joinRoom(client, groupId);
  return { success: true, groupId }; // Simple response, NOT HTTP envelope
}

// ❌ VIOLATION - Wrapping WebSocket event in StandardSuccessResponse
const event: ChatMessageEvent = { eventName: 'newMessage', ... };
const wrapped = new StandardSuccessResponse(event); // WRONG - WebSocket events are NOT HTTP
this.server.emit('newMessage', wrapped);
```

**WebSocket Event Types**:
- `BaseWebSocketEvent` - Base event structure
- `ChatMessageEvent` - Message events
- `TransactionEvent` - Payment events
- `UserStatusEvent` - User status changes
- `AccountBalanceEvent` - Balance updates
- `NotificationEvent` - System notifications
- `SystemEvent` - System events

### Category 5: Raw/Binary Responses (BYPASS WRAPPING)

**What**: File downloads, images, PDFs, and other binary content

**Location**: File upload/download endpoints, health checks

**Purpose**: Serve binary data without JSON wrapping

**Rules**:
1. Binary responses MUST use `createRawResponse()` marker
2. StreamableFile automatically bypasses transformation
3. Health checks can use StandardSuccessResponse with simple data
4. No JSON wrapping for binary content

**Pattern Examples**:

```typescript
// ✅ CORRECT - Raw response marker for binary data
@Get(':id/download')
async download(@Param('id') id: string) {
  const file = await this.filesService.getFile(id);
  return createRawResponse(file);
}

// ✅ CORRECT - StreamableFile automatically detected as raw
@Get(':id/avatar')
async getAvatar(@Param('id') id: string) {
  const avatar = await this.usersService.getAvatar(id);
  return new StreamableFile(avatar, {
    type: 'image/png',
    disposition: 'inline; filename="avatar.png"'
  });
}

// ✅ CORRECT - Health check with StandardSuccessResponse
app.use('/api/v1/health', (req, res) => {
  res.json(
    new StandardSuccessResponse({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: '1.0.0'
    })
  );
});

// ❌ VIOLATION - Binary data without raw marker
@Get(':id/download')
async download(@Param('id') id: string) {
  return await this.filesService.getFile(id); // WRONG - Missing createRawResponse marker
}
```

**Binary Content Types** (must use raw response):
- File downloads (`application/octet-stream`)
- PDF files (`application/pdf`)
- Image files (`image/*`)
- Video files (`video/*`)
- Audio files (`audio/*`)

**Streaming** (automatically raw):
- WebSocket connections (`ws` protocol)
- Server-Sent Events (`text/event-stream`)

## Validation Workflow

### Step 1: Identify File Type

```bash
# Controller file?
*.controller.ts → Apply HTTP endpoint rules (Category 1)

# DTO file?
**/dto/*-response.dto.ts → Check payload structure (Category 2)

# Service file?
*.service.ts → Check internal interfaces (Category 3)

# Gateway file?
*.gateway.ts → Check WebSocket event structure (Category 4)

# Binary/file endpoint?
Check for file downloads, images, etc. → Verify raw response marker (Category 5)
```

### Step 2: Scan Response Patterns

**For Controllers (HTTP endpoints)**:

```bash
# Find explicit wrapping (GOOD)
grep -n "new StandardSuccessResponse" apps/{api-service}/src/**/*.controller.ts
grep -n "new StandardPaginatedResponse" apps/{api-service}/src/**/*.controller.ts
grep -n "createRawResponse" apps/{api-service}/src/**/*.controller.ts

# Find potential interceptor reliance (CHECK DOCUMENTATION)
grep -n "return.*await.*Service" apps/{api-service}/src/**/*.controller.ts

# Find violations (BAD)
grep -n "return.*{ success:" apps/{api-service}/src/**/*.controller.ts
```

**For DTOs (Payload structures)**:

```bash
# Check for inappropriate wrapper fields (VIOLATION)
grep -n "success:" apps/{api-service}/src/**/dto/*-response.dto.ts
grep -n "data:" apps/{api-service}/src/**/dto/*-response.dto.ts
```

**For Services (Internal interfaces)**:

```bash
# Ensure service methods return typed data
grep -n "Promise<" apps/{api-service}/src/**/*.service.ts

# Check for inappropriate StandardSuccessResponse in services (VIOLATION)
grep -n "StandardSuccessResponse" apps/{api-service}/src/**/*.service.ts
```

**For Gateways (WebSocket)**:

```bash
# Check WebSocket event structure
grep -n "@SubscribeMessage" apps/{api-service}/src/**/*.gateway.ts
grep -n "this.server.emit" apps/{api-service}/src/**/*.gateway.ts

# Check for inappropriate HTTP wrapping (VIOLATION)
grep -n "StandardSuccessResponse" apps/{api-service}/src/**/*.gateway.ts
```

### Step 3: Validate Pattern Consistency

For each controller:
1. Count explicit wrapping endpoints
2. Count interceptor reliance endpoints
3. Calculate consistency score: `(max_pattern_count / total_endpoints) * 100`
4. Check if pattern matches controller criticality
5. Verify documentation exists for mixed patterns

**Consistency Levels**:
- **100% Consistent** - All endpoints use same pattern → ✅ COMPLIANT
- **Documented Mixed** - Different patterns with comments → ⚠️ ACCEPTABLE
- **<80% Consistent** - Mixed patterns without documentation → ❌ VIOLATION

### Step 4: Report Findings

Generate structured report:

**1. Compliant Controllers**
```
✅ AccountsController - 14/14 endpoints use explicit StandardSuccessResponse
✅ HelpController - 8/8 endpoints documented interceptor reliance
```

**2. Violations Found**
```
❌ ProductsController:23 - Manual envelope construction { success: true, data: ... }
❌ UsersController:45 - Manual error response { success: false, error: ... }
❌ OrdersController - Inconsistent pattern (3 explicit, 5 interceptor, no documentation)
❌ NotificationResponseDto:12 - DTO includes 'success' field (wrapper responsibility)
❌ ChatGateway:78 - WebSocket event wrapped in StandardSuccessResponse
```

**3. Recommendations**
```
🔧 ProductsController:23
   Before: return { success: true, data: product };
   After:  return new StandardSuccessResponse(product);

🔧 UsersController:45
   Before: return { success: false, error: 'Not found' };
   After:  throw new NotFoundException('User not found');

🔧 OrdersController
   Standardize to explicit wrapping (critical financial operations):
   - Add 'return new StandardSuccessResponse(data);' to all endpoints
```

**4. Test Suggestions**
```typescript
// Add response envelope structure tests
describe('AccountsController', () => {
  it('should return StandardSuccessResponse with account data', async () => {
    const response = await controller.findOne('123');
    expect(response).toBeInstanceOf(StandardSuccessResponse);
    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();
  });
});
```

## Compliance Checklist

Use this checklist to verify compliance:

### HTTP Controller Endpoints ✓

- [ ] All endpoints return StandardSuccessResponse/StandardPaginatedResponse/createRawResponse
- [ ] No manual envelope construction (`{ success: true, data: ... }`)
- [ ] Critical endpoints (financial, auth) use explicit StandardSuccessResponse
- [ ] Standard CRUD endpoints document pattern choice (explicit or interceptor)
- [ ] Errors throw exceptions, not return error objects
- [ ] Pattern consistency within controller (all explicit OR all interceptor OR documented mixed)
- [ ] Paginated responses use StandardPaginatedResponse
- [ ] Controller-level comment documents pattern choice

### Domain DTOs ✓

- [ ] DTOs are plain data structures (no `success` field)
- [ ] DTOs are wrapped by controllers in StandardSuccessResponse
- [ ] DTOs can be used as service return types
- [ ] DTOs have clear, specific names (NotificationResponseDto, not GenericResponse)
- [ ] DTOs do NOT include `data` field (DTO IS the data)
- [ ] DTOs represent business domain concepts

### Service Interfaces ✓

- [ ] Service methods return typed internal interfaces
- [ ] Service results are wrapped by controllers, not by services
- [ ] No StandardSuccessResponse in service layer
- [ ] Service interfaces clearly typed (Promise<InterfaceName>)
- [ ] Service-to-service communication uses internal interfaces

### WebSocket Events ✓

- [ ] Events extend BaseWebSocketEvent or use specific event types
- [ ] Events NOT wrapped in StandardSuccessResponse
- [ ] SubscribeMessage responses use simple objects or event structures
- [ ] Event structure includes eventName, timestamp, correlationId
- [ ] WebSocket responses separate from HTTP responses

### Binary/Raw Responses ✓

- [ ] Binary endpoints use createRawResponse() marker
- [ ] StreamableFile used for file downloads
- [ ] Content-Type set appropriately for binary content
- [ ] No JSON wrapping for binary data
- [ ] Health checks properly structured

## Decision Matrix

| Response Type | Must Wrap? | Pattern | Example |
|--------------|-----------|---------|---------|
| HTTP GET/POST/PUT/DELETE | ✅ Yes | StandardSuccessResponse | `return new StandardSuccessResponse(data)` |
| Paginated List | ✅ Yes | StandardPaginatedResponse | `return new StandardPaginatedResponse(items, page, limit, total)` |
| Error Response | ✅ Yes | Throw Exception | `throw new NotFoundException('Not found')` |
| Domain DTO | ❌ No (is payload) | Plain data structure | `export class NotificationResponseDto { id: string; }` |
| Service Interface | ❌ No (internal) | Typed return | `async search(): Promise<SearchResult>` |
| WebSocket Event | ❌ No (special) | Event structure | `const event: ChatMessageEvent = { ... }` |
| Binary/File | ⚠️ Special | Raw response marker | `return createRawResponse(file)` |
| Health Check | ✅ Yes | StandardSuccessResponse | `new StandardSuccessResponse({ status: 'healthy' })` |

## Critical Files Reference

**Core Infrastructure**:
- `apps/{api-service}/src/common/dto/standard-response.dto.ts` - Response wrapper definitions
- `apps/{api-service}/src/common/interceptors/response-transform.interceptor.ts` - Auto-wrapping logic
- `apps/{api-service}/src/common/filters/global-exception.filter.ts` - Error response wrapping
- `apps/{api-service}/src/main.ts` - Global interceptor registration

**Reference Controllers**:
- `apps/{api-service}/src/accounts/accounts.controller.ts` - Explicit wrapping pattern (all 14 endpoints)
- `apps/{api-service}/src/auth/auth.controller.ts` - Interceptor reliance pattern
- `apps/{api-service}/src/help/help.controller.ts` - Standard CRUD pattern

**Response DTOs**:
- `apps/{api-service}/src/help/dto/conversation-response.dto.ts` - Payload DTO example
- `apps/{api-service}/src/notifications/dto/notification-response.dto.ts` - Payload DTO example

**WebSocket**:
- `apps/{api-service}/src/common/websocket/websocket-events.ts` - Event structure definitions
- `apps/{api-service}/src/chat/chat.gateway.ts` - Gateway implementation example

**Frontend**:
- `apps/{app-name}/services/api/base-api.ts` - Response extraction logic (line 483-488)
