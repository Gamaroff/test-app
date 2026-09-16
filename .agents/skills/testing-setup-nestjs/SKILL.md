---
name: testing-setup-nestjs
description: Guide developers through NestJS-specific testing patterns including TestingModule setup, Prisma mocking, controller/service testing, E2E integration tests, and high-coverage testing for sensitive operations
---

# Testing Setup - NestJS

## When to Use This Skill

Invoke this skill when you need to test:
- NestJS services with dependency injection
- Controllers and API endpoints
- Guards and interceptors
- Pipes and validators
- Database operations with Prisma
- E2E integration tests with real database
- Financial operations (95% coverage required)
- Authentication and security flows

**Prerequisites**: First review `testing-setup-shared` skill for common testing infrastructure

---

## Overview

NestJS testing in {api-service} uses:
- **Framework**: NestJS Testing Module
- **Test Runner**: Jest 30.2.0
- **Environment**: Node.js
- **Database**: Prisma ORM 6.18.0
- **File Pattern**: `*.integration.spec.ts` (co-located with source files)

---

## Step 1: Service Testing with TestingModule

### 1.1 Basic Service Test Structure

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '@your-org/prisma';

describe('UserService', () => {
  let service: UserService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    // Create testing module
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: mockPrismaService
        }
      ]
    }).compile();

    service = module.get<UserService>(UserService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should find user by id', async () => {
    // Arrange
    const mockUser = { id: '123', handle: '@alice' };
    jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser);

    // Act
    const result = await service.findById('123');

    // Assert
    expect(result).toEqual(mockUser);
    expect(prismaService.user.findUnique).toHaveBeenCalledWith({
      where: { id: '123' }
    });
  });
});
```

### 1.2 Prisma Service Mock Template

```typescript
// Create reusable Prisma mock
const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },
  account: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  transaction: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn()
  },
  // Add other models as needed
  $transaction: jest.fn() // For database transactions
};
```

---

## Step 2: Service Testing Patterns

### 2.1 Service with Multiple Dependencies

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentService } from './payment.service';
import { PrismaService } from '@your-org/prisma';
import { AccountService } from '../account/account.service';
import { logger } from '@your-org/logging-lib';

describe('PaymentService', () => {
  let service: PaymentService;
  let prismaService: PrismaService;
  let accountService: AccountService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: PrismaService,
          useValue: mockPrismaService
        },
        {
          provide: AccountService,
          useValue: {
            findById: jest.fn(),
            updateBalance: jest.fn(),
            validateSufficientFunds: jest.fn()
          }
        }
      ]
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    prismaService = module.get<PrismaService>(PrismaService);
    accountService = module.get<AccountService>(AccountService);
  });

  it('should process payment successfully', async () => {
    // Arrange
    const payment = {
      fromAccountId: 'account1',
      toAccountId: 'account2',
      amount: 100,
      currency: 'USD'
    };

    jest.spyOn(accountService, 'validateSufficientFunds').mockResolvedValue(true);
    jest.spyOn(prismaService, '$transaction').mockResolvedValue([
      { id: 'tx1', status: 'COMPLETED' }
    ]);

    // Act
    const result = await service.processPayment(payment);

    // Assert
    expect(result.status).toBe('COMPLETED');
    expect(accountService.validateSufficientFunds).toHaveBeenCalledWith('account1', 100);
    expect(prismaService.$transaction).toHaveBeenCalled();
  });
});
```

### 2.2 Service with Error Handling

```typescript
describe('UserService Error Handling', () => {
  it('should throw error when user not found', async () => {
    // Arrange
    jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);

    // Act & Assert
    await expect(service.findById('invalid-id')).rejects.toThrow('User not found');
  });

  it('should handle database errors gracefully', async () => {
    // Arrange
    jest.spyOn(prismaService.user, 'create').mockRejectedValue(
      new Error('Database connection failed')
    );

    // Act & Assert
    await expect(service.createUser({ handle: '@alice' })).rejects.toThrow();
  });
});
```

### 2.3 Service with Transactions

```typescript
describe('PaymentService Transactions', () => {
  it('should rollback on transaction failure', async () => {
    // Arrange
    const payment = { fromAccountId: 'w1', toAccountId: 'w2', amount: 100 };

    jest.spyOn(prismaService, '$transaction').mockRejectedValue(
      new Error('Transaction failed')
    );

    // Act & Assert
    await expect(service.processPayment(payment)).rejects.toThrow('Transaction failed');

    // Verify rollback behavior
    expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
  });

  it('should create transaction atomically', async () => {
    // Arrange
    const mockTransaction = jest.fn(async (operations) => {
      // Execute all operations
      return await Promise.all(operations.map((op: any) => op));
    });

    jest.spyOn(prismaService, '$transaction').mockImplementation(mockTransaction);

    // Act
    await service.transferFunds('w1', 'w2', 100);

    // Assert
    expect(prismaService.$transaction).toHaveBeenCalled();
  });
});
```

---

## Step 3: Controller Testing

### 3.1 Basic Controller Test

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let controller: UserController;
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: {
            findById: jest.fn(),
            findByHandle: jest.fn(),
            create: jest.fn(),
            update: jest.fn()
          }
        }
      ]
    }).compile();

    controller = module.get<UserController>(UserController);
    service = module.get<UserService>(UserService);
  });

  describe('GET /users/:id', () => {
    it('should return user by id', async () => {
      // Arrange
      const mockUser = { id: '123', handle: '@alice' };
      jest.spyOn(service, 'findById').mockResolvedValue(mockUser);

      // Act
      const result = await controller.findOne('123');

      // Assert
      expect(result).toEqual(mockUser);
      expect(service.findById).toHaveBeenCalledWith('123');
    });

    it('should return 404 when user not found', async () => {
      // Arrange
      jest.spyOn(service, 'findById').mockResolvedValue(null);

      // Act & Assert
      await expect(controller.findOne('invalid')).rejects.toThrow();
    });
  });

  describe('POST /users', () => {
    it('should create new user', async () => {
      // Arrange
      const createDto = { handle: '@alice', email: 'alice@example.com' };
      const mockCreatedUser = { id: '123', ...createDto };

      jest.spyOn(service, 'create').mockResolvedValue(mockCreatedUser);

      // Act
      const result = await controller.create(createDto);

      // Assert
      expect(result).toEqual(mockCreatedUser);
      expect(service.create).toHaveBeenCalledWith(createDto);
    });
  });
});
```

### 3.2 Controller with Guards

```typescript
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('UserController with Guards', () => {
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true }) // Mock guard to always allow
      .compile();

    controller = module.get<UserController>(UserController);
  });

  it('should allow authenticated requests', async () => {
    // Guard is mocked to allow access
    const result = await controller.getProfile('123');
    expect(result).toBeDefined();
  });
});
```

### 3.3 Controller with Request/Response Objects

```typescript
import { Request, Response } from 'express';

describe('AuthController', () => {
  it('should set JWT cookie on login', async () => {
    // Arrange
    const mockRequest = {} as Request;
    const mockResponse = {
      cookie: jest.fn(),
      json: jest.fn()
    } as unknown as Response;

    const loginDto = { email: 'alice@example.com', password: 'password123' };
    jest.spyOn(authService, 'login').mockResolvedValue({
      accessToken: 'jwt-token',
      user: { id: '123', handle: '@alice' }
    });

    // Act
    await controller.login(loginDto, mockResponse);

    // Assert
    expect(mockResponse.cookie).toHaveBeenCalledWith(
      'accessToken',
      'jwt-token',
      expect.objectContaining({ httpOnly: true })
    );
  });
});
```

---

## Step 4: Prisma Mocking Strategies

### 4.1 Complete Prisma Mock

```typescript
// Create in separate file: prisma.mock.ts
export const createMockPrismaService = () => ({
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },
  account: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  transaction: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn()
  },
  paymentRequest: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  contact: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  // Add all other models as needed
  $transaction: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn()
});
```

### 4.2 Relation Mocking

```typescript
describe('User with Relations', () => {
  it('should find user with accounts', async () => {
    // Arrange
    const mockUserWithAccounts = {
      id: '123',
      handle: '@alice',
      accounts: [
        { id: 'w1', currency: 'USD', balance: 1000 },
        { id: 'w2', currency: 'EUR', balance: 0.5 }
      ]
    };

    jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUserWithAccounts);

    // Act
    const result = await service.findUserWithAccounts('123');

    // Assert
    expect(result.accounts).toHaveLength(2);
    expect(prismaService.user.findUnique).toHaveBeenCalledWith({
      where: { id: '123' },
      include: { accounts: true }
    });
  });
});
```

### 4.3 Transaction Mocking

```typescript
describe('Atomic Operations', () => {
  it('should execute multiple operations in transaction', async () => {
    // Arrange
    const mockTransactionCallback = jest.fn().mockImplementation(
      async (callback) => await callback(prismaService)
    );

    jest.spyOn(prismaService, '$transaction').mockImplementation(mockTransactionCallback);

    // Act
    await service.transferMoney('w1', 'w2', 100);

    // Assert
    expect(prismaService.$transaction).toHaveBeenCalled();
  });
});
```

---

## Step 5: Integration Testing (Real Database)

### 5.1 Integration Test Setup

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@your-org/prisma';
import { UserService } from './user.service';

describe('UserService Integration Tests', () => {
  let service: UserService;
  let prismaService: PrismaService;

  beforeAll(async () => {
    // Use REAL PrismaService for integration tests
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserService, PrismaService]
    }).compile();

    service = module.get<UserService>(UserService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Connect to test database
    await prismaService.$connect();
  });

  afterAll(async () => {
    // Cleanup and disconnect
    await prismaService.$disconnect();
  });

  beforeEach(async () => {
    // Clean database before each test
    await prismaService.user.deleteMany();
    await prismaService.account.deleteMany();
    await prismaService.transaction.deleteMany();
  });

  it('should create user in database', async () => {
    // Arrange
    const userData = {
      handle: '@alice',
      email: 'alice@example.com',
      passwordHash: 'hashed-password'
    };

    // Act
    const createdUser = await service.create(userData);

    // Assert - Verify in database
    const dbUser = await prismaService.user.findUnique({
      where: { id: createdUser.id }
    });

    expect(dbUser).toBeDefined();
    expect(dbUser.handle).toBe('@alice');
  });
});
```

### 5.2 Database Seeding for Tests

```typescript
describe('Payment Service Integration', () => {
  let testUser: any;
  let testAccount: any;

  beforeEach(async () => {
    // Seed test data
    testUser = await prismaService.user.create({
      data: {
        handle: '@testuser',
        email: 'test@example.com',
        passwordHash: 'hash'
      }
    });

    testAccount = await prismaService.account.create({
      data: {
        userId: testUser.id,
        currency: 'USD',
        balance: 1000
      }
    });
  });

  it('should process payment with real database', async () => {
    // Act
    const result = await service.processPayment({
      fromAccountId: testAccount.id,
      toAccountId: 'recipient-account',
      amount: 100
    });

    // Assert
    const updatedAccount = await prismaService.account.findUnique({
      where: { id: testAccount.id }
    });

    expect(updatedAccount.balance).toBe(900); // 1000 - 100
  });
});
```

---

## Step 6: E2E Testing Setup

### 6.1 E2E Test Structure

**Location**: `apps/{api-service}/test/integration/`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@your-org/prisma';

describe('User API (E2E)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prismaService = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean database
    await prismaService.user.deleteMany();
  });

  describe('POST /users', () => {
    it('should create new user', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({
          handle: '@alice',
          email: 'alice@example.com',
          password: 'Password123!'
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.handle).toBe('@alice');
          expect(res.body.id).toBeDefined();
        });
    });

    it('should return 400 for invalid handle', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({
          handle: 'invalid-no-at',
          email: 'alice@example.com',
          password: 'Password123!'
        })
        .expect(400);
    });
  });

  describe('GET /users/:id', () => {
    it('should return user by id', async () => {
      // Seed user
      const user = await prismaService.user.create({
        data: {
          handle: '@alice',
          email: 'alice@example.com',
          passwordHash: 'hash'
        }
      });

      return request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.handle).toBe('@alice');
        });
    });
  });
});
```

### 6.2 E2E with Authentication

```typescript
describe('Protected Endpoints (E2E)', () => {
  let authToken: string;

  beforeEach(async () => {
    // Create user and get auth token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'Password123!'
      });

    authToken = loginResponse.body.accessToken;
  });

  it('should access protected endpoint with token', () => {
    return request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  });

  it('should reject request without token', () => {
    return request(app.getHttpServer())
      .get('/users/me')
      .expect(401);
  });
});
```

---

## Step 7: Financial Operations Testing

### 7.1 Payment Processing Test (95% Coverage Required)

```typescript
describe('PaymentService Financial Operations', () => {
  it('should process payment with correct fee calculation', async () => {
    // Arrange
    const payment = {
      fromAccountId: 'w1',
      toAccountId: 'w2',
      amount: 100,
      currency: 'USD'
    };

    jest.spyOn(prismaService.account, 'findUnique')
      .mockResolvedValueOnce({ id: 'w1', balance: 500, currency: 'USD' })
      .mockResolvedValueOnce({ id: 'w2', balance: 200, currency: 'USD' });

    // Act
    const result = await service.processPayment(payment);

    // Assert
    expect(result.fee).toBe(1); // 1% fee = $1
    expect(result.totalAmount).toBe(101); // $100 + $1 fee
    expect(result.status).toBe('COMPLETED');
  });

  it('should reject payment with insufficient funds', async () => {
    // Arrange
    const payment = {
      fromAccountId: 'w1',
      toAccountId: 'w2',
      amount: 1000,
      currency: 'USD'
    };

    jest.spyOn(prismaService.account, 'findUnique')
      .mockResolvedValue({ id: 'w1', balance: 500, currency: 'USD' });

    // Act & Assert
    await expect(service.processPayment(payment)).rejects.toThrow('Insufficient funds');
  });

  it('should handle currency mismatch', async () => {
    // Test cross-currency payment failure
  });

  it('should create transaction record', async () => {
    // Verify transaction is recorded in database
  });

  it('should update account balances atomically', async () => {
    // Verify both accounts updated in single transaction
  });
});
```

### 7.2 Transaction History Test

```typescript
describe('TransactionService', () => {
  it('should return paginated transaction history', async () => {
    // Arrange
    const mockTransactions = Array.from({ length: 25 }, (_, i) => ({
      id: `tx${i}`,
      amount: 100,
      status: 'COMPLETED'
    }));

    jest.spyOn(prismaService.transaction, 'findMany').mockResolvedValue(
      mockTransactions.slice(0, 10)
    );

    jest.spyOn(prismaService.transaction, 'count').mockResolvedValue(25);

    // Act
    const result = await service.getTransactionHistory('user1', { page: 1, limit: 10 });

    // Assert
    expect(result.items).toHaveLength(10);
    expect(result.total).toBe(25);
    expect(result.hasMore).toBe(true);
  });
});
```

---

## Step 8: Security Testing Patterns

### 8.1 Authentication Test

```typescript
import { hashPassword, verifyPassword } from '@your-org/auth-lib';

describe('AuthService', () => {
  it('should hash password securely', async () => {
    // Act
    const hash = await hashPassword('Password123!');

    // Assert
    expect(hash).not.toBe('Password123!');
    expect(hash.length).toBeGreaterThan(50); // bcrypt hash length
  });

  it('should verify correct password', async () => {
    // Arrange
    const password = 'Password123!';
    const hash = await hashPassword(password);

    // Act
    const isValid = await verifyPassword(password, hash);

    // Assert
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    // Arrange
    const hash = await hashPassword('Password123!');

    // Act
    const isValid = await verifyPassword('WrongPassword', hash);

    // Assert
    expect(isValid).toBe(false);
  });
});
```

### 8.2 Authorization Test

```typescript
describe('Authorization', () => {
  it('should allow user to access own resources', async () => {
    // Arrange
    const userId = '123';
    const accountId = 'account-owned-by-123';

    jest.spyOn(accountService, 'findById').mockResolvedValue({
      id: accountId,
      userId: '123'
    });

    // Act
    const result = await accountService.canAccess(userId, accountId);

    // Assert
    expect(result).toBe(true);
  });

  it('should deny user access to other resources', async () => {
    // Arrange
    const userId = '123';
    const accountId = 'account-owned-by-456';

    jest.spyOn(accountService, 'findById').mockResolvedValue({
      id: accountId,
      userId: '456'
    });

    // Act
    const result = await accountService.canAccess(userId, accountId);

    // Assert
    expect(result).toBe(false);
  });
});
```

### 8.3 Input Validation Test

```typescript
describe('Input Validation', () => {
  it('should reject invalid email', async () => {
    await expect(
      service.createUser({ email: 'invalid-email', handle: '@alice' })
    ).rejects.toThrow('Invalid email format');
  });

  it('should reject SQL injection attempt', async () => {
    await expect(
      service.findByHandle("'; DROP TABLE users; --")
    ).rejects.toThrow();
  });

  it('should sanitize user input', async () => {
    const result = await service.createUser({
      handle: '@alice<script>alert("xss")</script>'
    });

    expect(result.handle).not.toContain('<script>');
  });
});
```

---

## Step 9: Test Execution

### 9.1 Run NestJS Tests

```bash
# Run integration tests
npx nx test {api-service} --no-cache

# Run with coverage
npx nx test {api-service} --coverage

# Run specific test file
npx nx test {api-service} --testFile=src/modules/users/user.service.integration.spec.ts

# Run E2E tests
npm run test:e2e:api
```

### 9.2 E2E Test Commands

```bash
# Setup test database
npm run test:e2e:setup

# Run E2E tests
npm run test:e2e:api

# Run specific E2E test
npm run test:e2e:api -- --testNamePattern="User API"
```

### 9.3 Coverage Requirements

- **General Services**: 80%+ coverage
- **Financial Operations**: 95%+ coverage (MANDATORY)
- **Security Operations**: 95%+ coverage (MANDATORY)

---

## Step 10: Troubleshooting NestJS Tests

### 10.1 Dependency Injection Issues

**Error**: `Nest can't resolve dependencies of the UserService`

**Cause**: Missing provider in TestingModule

**Solution**: Add all dependencies to providers array:
```typescript
const module: TestingModule = await Test.createTestingModule({
  providers: [
    UserService,
    { provide: PrismaService, useValue: mockPrismaService },
    { provide: AccountService, useValue: mockAccountService }
  ]
}).compile();
```

### 10.2 Database Connection Issues

**Error**: `Can't reach database server`

**Cause**: Test database not running

**Solution**: Start Docker test database:
```bash
docker compose -f ./docker/docker-compose.dev.yml up -d postgres
npm run test:e2e:setup
```

### 10.3 Transaction Mock Not Working

**Error**: `prismaService.$transaction is not a function`

**Cause**: Missing $transaction in Prisma mock

**Solution**: Add to mock:
```typescript
const mockPrismaService = {
  // ... other methods
  $transaction: jest.fn()
};
```

---

## NestJS Testing Checklist

Before completing, verify:

- [ ] ✅ Test file co-located with source file
- [ ] ✅ Using TestingModule for dependency injection
- [ ] ✅ All dependencies mocked or provided
- [ ] ✅ Prisma operations properly mocked
- [ ] ✅ Database transactions tested
- [ ] ✅ Error handling tested
- [ ] ✅ Financial operations have 95% coverage
- [ ] ✅ Security operations have 95% coverage
- [ ] ✅ E2E tests for critical endpoints
- [ ] ✅ Input validation tested
- [ ] ✅ Authorization tested
- [ ] ✅ Integration tests use real database
- [ ] ✅ Database cleanup in beforeEach/afterAll

---

## Related Skills

- **testing-setup-shared**: Common testing infrastructure and mocking patterns
- **testing-setup-react-native**: React Native component testing patterns

---

## References

- `apps/{api-service}/test/integration/README.md` - E2E testing guide
- NestJS Testing: https://docs.nestjs.com/fundamentals/testing
