# API Design Document

## Document Information

**Purpose**: Define comprehensive API standards, endpoints, and data models for NestJS backend services  
**Priority**: High  
**Version**: 1.0

## API Overview

### Purpose

The API serves as the unified backend for client applications, providing secure, scalable endpoints for business operations, user management, and data access.

**Key Capabilities:**

- User and account management
- Resource CRUD operations with pagination and filtering
- Real-time data via WebSocket connections
- Role-based access control and authentication
- Administrative oversight and management

### Base URL Structure

- **Development**: `http://localhost:3000/api/v1`
- **Staging**: `https://staging-api.yourdomain.com/api/v1`
- **Production**: `https://api.yourdomain.com/api/v1`

### API Architecture

- **Primary**: REST API with standard HTTP methods
- **Real-time**: WebSocket connections for live updates
- **Authentication**: JWT-based authentication with role-based access control

## Authentication & Authorization

### JWT Structure

**Standard User:**

```typescript
interface UserJWT {
    sub: string        // User ID
    role: 'user' | 'admin'
    permissions: string[]
    iat: number
    exp: number        // 24 hours for access tokens
}
```

**Admin User:**

```typescript
interface AdminJWT {
    sub: string        // Admin ID
    role: 'admin_super' | 'admin_regional' | 'admin_support'
    permissions: string[]
    iat: number
    exp: number        // 8 hours for admin tokens
}
```

### Authorization Levels

- **Guest**: Public endpoints (registration, password reset)
- **Authenticated User**: Standard authenticated users
- **Admin**: Administrative users with role-based permissions
- **System**: Internal service-to-service communication

### Required Headers

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

## API Standards

### HTTP Methods

- `GET`: Retrieve data
- `POST`: Create new resources
- `PUT`: Update entire resources
- `PATCH`: Partial updates
- `DELETE`: Remove resources

### Success Response Format

```json
{
    "success": true,
    "data": {},
    "message": "Operation completed successfully",
    "meta": {
        "timestamp": "2025-07-31T10:30:00Z",
        "version": "v1",
        "requestId": "req_123456789",
        "pagination": {
            "page": 1,
            "limit": 20,
            "total": 150,
            "totalPages": 8,
            "hasNext": true,
            "hasPrev": false
        }
    }
}
```

### Error Response Format

```json
{
    "success": false,
    "error": {
        "code": "INSUFFICIENT_FUNDS",
        "message": "Insufficient funds for this transaction",
        "details": {
            "required": "100.50",
            "available": "75.25",
            "currency": "EUR"
        },
        "field": "amount"
    },
    "meta": {
        "timestamp": "2025-07-31T10:30:00Z",
        "version": "v1",
        "requestId": "req_123456789"
    }
}
```

### Common Error Codes

```typescript
// Authentication & Authorization
AUTH_001: 'INVALID_TOKEN'
AUTH_002: 'TOKEN_EXPIRED'
AUTH_003: 'INSUFFICIENT_PERMISSIONS'
AUTH_004: 'ACCOUNT_SUSPENDED'

// Validation
VAL_001: 'INVALID_REQUEST_FORMAT'
VAL_002: 'MISSING_REQUIRED_FIELD'
VAL_003: 'INVALID_FIELD_VALUE'
VAL_004: 'FIELD_LENGTH_EXCEEDED'

// Business Logic
BIZ_001: 'RESOURCE_NOT_FOUND'
BIZ_002: 'RESOURCE_ALREADY_EXISTS'
BIZ_003: 'OPERATION_NOT_PERMITTED'
BIZ_004: 'LIMIT_EXCEEDED'

// System
SYS_001: 'INTERNAL_SERVER_ERROR'
SYS_002: 'SERVICE_UNAVAILABLE'
SYS_003: 'RATE_LIMIT_EXCEEDED'
SYS_004: 'MAINTENANCE_MODE'
```

### Status Codes

- `200`: Success
- `201`: Created
- `204`: No Content
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
- `422`: Validation Error
- `500`: Internal Server Error

## Example Endpoints

### Resource Collection

#### GET /products

**Description**: List products with pagination and filtering  
**Authorization**: Optional

**Query Parameters**:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `search`: Full-text search term
- `status`: Filter by status
- `sort`: Sort field (default: createdAt)
- `order`: Sort direction (asc/desc, default: desc)

**Response**:

```json
{
    "success": true,
    "data": [
        {
            "id": "prod_uuid",
            "name": "Wireless Headphones",
            "slug": "wireless-headphones",
            "price": 99.99,
            "currency": "USD",
            "status": "active",
            "createdAt": "2025-07-31T10:30:00Z"
        }
    ],
    "meta": {
        "pagination": {
            "page": 1,
            "limit": 20,
            "total": 150,
            "totalPages": 8,
            "hasNext": true,
            "hasPrev": false
        }
    }
}
```

#### POST /products

**Description**: Create a new product  
**Authorization**: Required (Admin)

**Request Body**:

```json
{
    "name": "Wireless Headphones",
    "slug": "wireless-headphones",
    "price": 99.99,
    "currency": "USD",
    "categoryId": "cat_electronics",
    "description": "High-quality wireless headphones"
}
```

**Response** (201 Created):

```json
{
    "success": true,
    "data": {
        "id": "prod_uuid",
        "name": "Wireless Headphones",
        "slug": "wireless-headphones",
        "price": 99.99,
        "currency": "USD",
        "status": "draft",
        "createdAt": "2025-07-31T10:30:00Z"
    }
}
```

#### GET /products/:id

**Description**: Get a single product by ID  
**Authorization**: Optional

#### PATCH /products/:id

**Description**: Partially update a product  
**Authorization**: Required (Admin)

#### DELETE /products/:id

**Description**: Delete a product  
**Authorization**: Required (Admin)  
**Response**: 204 No Content

### User Management

#### POST /auth/register

**Description**: Register a new user

**Request Body**:

```json
{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "name": "Jane Smith"
}
```

**Response**:

```json
{
    "success": true,
    "data": {
        "user": {
            "id": "user_uuid",
            "email": "user@example.com",
            "name": "Jane Smith",
            "role": "user"
        },
        "tokens": {
            "accessToken": "jwt_access_token",
            "refreshToken": "jwt_refresh_token",
            "expiresIn": 86400
        }
    }
}
```

#### POST /auth/login

**Description**: Authenticate a user

**Request Body**:

```json
{
    "email": "user@example.com",
    "password": "SecurePass123!"
}
```

#### GET /users/me

**Description**: Get current user profile  
**Authorization**: Required

#### PATCH /users/me

**Description**: Update current user profile  
**Authorization**: Required

#### GET /users

**Description**: List users with pagination  
**Authorization**: Admin only

**Query Parameters**:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)
- `search`: Search by name or email
- `role`: Filter by role
- `sort`: Sort field
- `order`: Sort direction (asc/desc)

## Data Models

### User Model

```json
{
    "id": "uuid",
    "email": "string",
    "name": "string",
    "avatar": "string|null",
    "role": "user|admin",
    "isActive": "boolean",
    "createdAt": "ISO 8601",
    "updatedAt": "ISO 8601"
}
```

### Resource Model Template

```json
{
    "id": "uuid",
    "name": "string",
    "slug": "string",
    "status": "draft|active|archived",
    "createdAt": "ISO 8601",
    "updatedAt": "ISO 8601"
}
```

## Validation Rules

### User Registration

- `email`: Required, valid email format, unique
- `password`: Required, minimum 8 characters, must contain uppercase, lowercase, number, special character
- `name`: Required, 2-50 characters

### Resource Creation

- `name`: Required, 1-255 characters
- `slug`: Required, 3-100 lowercase alphanumeric characters and hyphens, unique
- `price`: Optional, positive number with max 2 decimal places

## Pagination

### Request Parameters

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)

### Response Format

```json
{
    "data": [],
    "meta": {
        "pagination": {
            "page": 1,
            "limit": 10,
            "total": 100,
            "totalPages": 10,
            "hasNext": true,
            "hasPrev": false
        }
    }
}
```

## Filtering and Sorting

### Query Parameters

- `filter[field]`: Filter by field value
- `search`: Full-text search
- `sort`: Sort field
- `order`: Sort direction (asc/desc)

### Example

```
GET /products?filter[status]=active&search=headphones&sort=price&order=asc
```

## Rate Limiting

### Limits

- **Authenticated Users**: 1000 requests per hour
- **Guest Users**: 100 requests per hour
- **Admin Users**: 5000 requests per hour

### Headers

- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset timestamp

## File Upload

### Endpoint: POST /upload

**Description**: Upload files  
**Content-Type**: `multipart/form-data`  
**Max File Size**: 10MB

**Response**:

```json
{
    "success": true,
    "data": {
        "url": "https://cdn.example.com/file.jpg",
        "filename": "file.jpg",
        "size": 1024,
        "mimeType": "image/jpeg"
    }
}
```

## WebSocket Events

### Connection

- **URL**: `ws://localhost:3000/ws`
- **Authentication**: Query parameter `?token=jwt_token`

### Events

- `connect`: Client connected
- `disconnect`: Client disconnected
- `message`: Real-time message
- `notification`: Push notification

## API Versioning

### Strategy

- URL versioning: `/api/v1/`, `/api/v2/`
- Backward compatibility for 2 major versions
- Deprecation notices 6 months before removal

## Testing

### Test Categories

- **Unit Tests**: Individual endpoint logic
- **Integration Tests**: End-to-end API flows
- **Load Tests**: Performance under load
- **Security Tests**: Authentication and authorization

### Test Data

- Use factories for consistent test data
- Mock external services
- Isolated test database

## Documentation

### Interactive Documentation

- **Swagger/OpenAPI**: Available at `/api/docs`
- **Postman Collection**: Link to collection

---

_This document will be updated as the API evolves and new endpoints are added._
