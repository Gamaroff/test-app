---
name: api-endpoint-validator
description: This skill should be used when creating NestJS API endpoints, reviewing RESTful API design, validating controller patterns, ensuring DTO validation, implementing pagination/filtering, or enforcing API conventions. Use when designing new endpoints, reviewing controller code, refactoring APIs, or ensuring consistent API patterns across the NestJS backend.
---

# API Endpoint Design Validator

## Overview

This skill validates NestJS API endpoints against RESTful conventions and NestJS best practices. Ensures controllers follow proper HTTP methods, DTO validation, error handling, pagination, filtering, and response formatting standards.

## When to Use This Skill

Use this skill when:
- Creating new API endpoints in NestJS controllers
- Reviewing controller code for RESTful compliance
- Refactoring existing APIs for consistency
- Implementing pagination, filtering, or sorting
- Validating request/response DTOs
- Ensuring proper error handling in endpoints
- Standardizing API response formats

## RESTful Endpoint Standards

### HTTP Method Usage

**GET** - Retrieve resources (read-only, idempotent):
```typescript
@Get()
async findAll(): Promise<User[]> {
  return this.userService.findAll();
}

@Get(':id')
async findOne(@Param('id') id: string): Promise<User> {
  return this.userService.findOne(id);
}
```

**POST** - Create new resources (not idempotent):
```typescript
@Post()
async create(@Body() createUserDto: CreateUserDto): Promise<User> {
  return this.userService.create(createUserDto);
}
```

**PUT** - Replace entire resource (idempotent):
```typescript
@Put(':id')
async replace(
  @Param('id') id: string,
  @Body() replaceUserDto: ReplaceUserDto
): Promise<User> {
  return this.userService.replace(id, replaceUserDto);
}
```

**PATCH** - Partial update (idempotent):
```typescript
@Patch(':id')
async update(
  @Param('id') id: string,
  @Body() updateUserDto: UpdateUserDto
): Promise<User> {
  return this.userService.update(id, updateUserDto);
}
```

**DELETE** - Remove resource (idempotent):
```typescript
@Delete(':id')
async remove(@Param('id') id: string): Promise<void> {
  await this.userService.remove(id);
}
```

### Route Naming Conventions

**Resource-based naming** (nouns, not verbs):
```typescript
// ✅ CORRECT - Resource-based
@Controller('users')
@Controller('accounts')
@Controller('transactions')

// ❌ WRONG - Action-based
@Controller('get-users')
@Controller('create-account')
```

**Nested resources**:
```typescript
// ✅ CORRECT - Shows relationship
@Get('users/:userId/accounts')
@Get('accounts/:accountId/transactions')

// ❌ WRONG - Flat structure loses context
@Get('user-accounts/:userId')
```

**Plural nouns for collections**:
```typescript
// ✅ CORRECT
@Controller('users')
@Get('users')

// ❌ WRONG
@Controller('user')
@Get('user')
```

## DTO Validation Patterns

### Request DTOs

**Create DTO** (all required fields):
```typescript
import { IsString, IsEmail, IsNotEmpty, Length } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(8, 100)
  password: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 50)
  handle: string; // Use "handle" not "username"
}
```

**Update DTO** (all optional fields):
```typescript
import { PartialType } from '@nestjs/mapped-types';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  // All fields from CreateUserDto are now optional
}
```

**Query DTOs** (for filtering/pagination):
```typescript
import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class FindUsersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  search?: string;
}
```

### Response DTOs

**Single resource response**:
```typescript
export class UserResponseDto {
  id: string;
  email: string;
  handle: string; // Exclude sensitive fields (password)
  createdAt: Date;
  updatedAt: Date;
}
```

**Paginated response**:
```typescript
export class PaginatedResponseDto<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

## Pagination Implementation

**Controller endpoint**:
```typescript
@Get()
async findAll(
  @Query() query: FindUsersDto
): Promise<PaginatedResponseDto<UserResponseDto>> {
  const { page = 1, limit = 20 } = query;
  return this.userService.findAllPaginated(page, limit, query);
}
```

**Service implementation**:
```typescript
async findAllPaginated(
  page: number,
  limit: number,
  query: FindUsersDto
): Promise<PaginatedResponseDto<UserResponseDto>> {
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    this.prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: query.order },
      where: query.search ? {
        OR: [
          { email: { contains: query.search, mode: 'insensitive' } },
          { handle: { contains: query.search, mode: 'insensitive' } }
        ]
      } : undefined
    }),
    this.prisma.user.count({
      where: query.search ? {
        OR: [
          { email: { contains: query.search } },
          { handle: { contains: query.search } }
        ]
      } : undefined
    })
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
}
```

## Error Response Standards

**Consistent error format**:
```typescript
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    {
      "field": "email",
      "message": "Email must be a valid email address"
    }
  ]
}
```

**HTTP status code usage**:
- `200 OK` - Successful GET, PATCH, PUT
- `201 Created` - Successful POST
- `204 No Content` - Successful DELETE
- `400 Bad Request` - Validation errors, malformed request
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Authenticated but insufficient permissions
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Resource conflict (e.g., duplicate email)
- `422 Unprocessable Entity` - Semantic errors
- `500 Internal Server Error` - Server-side errors

**Error handling in controller**:
```typescript
@Post()
async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
  try {
    return await this.userService.create(dto);
  } catch (error) {
    if (error.code === 'P2002') { // Prisma unique constraint
      throw new ConflictException('User with this email already exists');
    }
    throw new InternalServerErrorException('Failed to create user');
  }
}
```

## Filtering and Sorting

**Multiple filter criteria**:
```typescript
export class FilterProductsDto {
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

  @IsOptional()
  @IsEnum(['category-a', 'category-b'])
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;
}

@Get('products')
async findProducts(@Query() filters: FilterProductsDto) {
  return this.productService.findAll({
    where: {
      status: filters.status,
      category: filters.category,
      price: filters.minPrice ? { gte: filters.minPrice } : undefined
    }
  });
}
```

**Sorting**:
```typescript
export class SortDto {
  @IsOptional()
  @IsEnum(['createdAt', 'updatedAt', 'email'])
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}

@Get()
async findAll(@Query() sort: SortDto) {
  return this.userService.findAll({
    orderBy: { [sort.sortBy]: sort.order }
  });
}
```

## Validation Checklist

**Endpoint Design:**
- [ ] Uses correct HTTP method (GET, POST, PUT, PATCH, DELETE)
- [ ] Route follows resource-based naming (nouns, not verbs)
- [ ] Nested routes show resource relationships
- [ ] Uses plural nouns for collections
- [ ] Idempotent operations (GET, PUT, PATCH, DELETE)

**DTO Validation:**
- [ ] Request DTOs use class-validator decorators
- [ ] All required fields marked with @IsNotEmpty()
- [ ] Update DTOs use PartialType for optional fields
- [ ] Response DTOs exclude sensitive fields (passwords, tokens)
- [ ] Query DTOs validate pagination parameters

**Error Handling:**
- [ ] Proper HTTP status codes returned
- [ ] Consistent error response format
- [ ] No sensitive information in error messages
- [ ] Validation errors include field details
- [ ] Database errors translated to HTTP errors

**Pagination/Filtering:**
- [ ] Pagination implemented for list endpoints
- [ ] Default page/limit values set
- [ ] Maximum limit enforced (e.g., 100)
- [ ] Total count included in paginated response
- [ ] Filters validated with class-validator

**Performance:**
- [ ] Database queries use indexes
- [ ] N+1 queries avoided (use relations/includes)
- [ ] Large responses paginated
- [ ] Unnecessary fields excluded from responses

## Anti-Patterns to Avoid

**NEVER:**
- ❌ Use verbs in route names (`/getUsers`, `/createAccount`)
- ❌ Mix HTTP methods incorrectly (GET for creating, POST for reading)
- ❌ Return different response formats from same endpoint
- ❌ Expose raw Prisma errors to clients
- ❌ Skip DTO validation decorators
- ❌ Return passwords or tokens in response DTOs
- ❌ Implement unlimited pagination (always set max limit)
- ❌ Use generic error messages ("Something went wrong")

**ALWAYS:**
- ✅ Use resource-based naming (`/users`, `/accounts`, `/transactions`)
- ✅ Follow HTTP method semantics correctly
- ✅ Validate all request inputs with DTOs
- ✅ Return consistent response formats
- ✅ Use proper HTTP status codes
- ✅ Exclude sensitive fields from responses
- ✅ Implement pagination for collections
- ✅ Provide descriptive error messages

## Resources

### references/

**api-design.md** - API design standards and RESTful conventions for NestJS backends

**validation-patterns.md** - DTO validation patterns and class-validator usage examples

## Success Criteria

Endpoints are well-designed when:
1. All HTTP methods used correctly and semantically
2. Routes follow RESTful resource-based naming
3. All request/response DTOs validated
4. Consistent error responses with proper status codes
5. Pagination implemented for collections
6. No sensitive data exposed in responses
7. Performance optimized (indexes, no N+1)

Refer to references for detailed patterns and examples.
