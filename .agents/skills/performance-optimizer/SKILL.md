---
name: performance-optimizer
description: Review code for performance issues and apply optimization patterns. Use when performing performance review, optimizing slow features, reducing bundle size, improving database queries, optimizing React Native rendering, or implementing caching strategies.
---

# Performance Optimizer

## Overview

This skill identifies and resolves performance issues across your project. Covers React Native optimization (memoization, virtualization), database optimization (N+1 detection, indexes), bundle size reduction, image optimization, caching strategies, and memory leak prevention.

## When to Use This Skill

Use this skill when:
- Performing code review with performance focus
- Investigating slow screen renders or sluggish UI
- Optimizing database queries and reducing query time
- Reducing mobile app bundle size
- Implementing or reviewing caching strategies
- Detecting and fixing memory leaks
- Optimizing image loading and display
- Reviewing FlatList or ScrollView performance
- Profiling and improving API response times
- Implementing lazy loading or code splitting

## React Native Optimization

### Memoization Patterns

**React.memo for component re-renders**:

```typescript
import React, { memo } from 'react';

// ✅ CORRECT - Memoize expensive components
export const TransactionListItem = memo(({ transaction, onPress }: Props) => {
  return (
    <TouchableOpacity onPress={() => onPress(transaction.id)}>
      <View>
        <Text>{transaction.description}</Text>
        <Text>{transaction.amount.toFixed(2)}</Text>
      </View>
    </TouchableOpacity>
  );
});

// Custom comparison function when needed
export const AccountCard = memo(
  ({ account }: Props) => {
    return (
      <View>
        <Text>{account.name}</Text>
        <Text>{account.balance.toString()}</Text>
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if account balance or name changed
    return (
      prevProps.account.balance.eq(nextProps.account.balance) &&
      prevProps.account.name === nextProps.account.name
    );
  }
);

// ❌ WRONG - Memoizing trivial components (overhead > benefit)
export const SimpleText = memo(({ text }: { text: string }) => {
  return <Text>{text}</Text>;
});
```

**useMemo for expensive calculations**:

```typescript
import { useMemo } from 'react';

function TransactionSummary({ transactions }: Props) {
  // ✅ CORRECT - Memoize expensive calculations
  const summary = useMemo(() => {
    const total = transactions.reduce(
      (sum, tx) => sum.plus(tx.amount),
      new Decimal(0)
    );
    const average = total.div(transactions.length || 1);
    const categories = groupByCategory(transactions); // Expensive operation

    return { total, average, categories };
  }, [transactions]); // Recompute only when transactions change

  return (
    <View>
      <Text>Total: {summary.total.toFixed(2)}</Text>
      <Text>Average: {summary.average.toFixed(2)}</Text>
      <CategoryChart data={summary.categories} />
    </View>
  );
}

// ❌ WRONG - No memoization for expensive calculation
function SlowTransactionSummary({ transactions }: Props) {
  // Recalculates on every render
  const total = transactions.reduce((sum, tx) => sum.plus(tx.amount), new Decimal(0));
  const categories = groupByCategory(transactions); // Runs every render!

  return <View>...</View>;
}
```

**useCallback for function identity**:

```typescript
import { useCallback } from 'react';

function TransactionList({ transactions }: Props) {
  const navigation = useNavigation();

  // ✅ CORRECT - Stable callback reference
  const handleTransactionPress = useCallback((id: string) => {
    navigation.navigate('TransactionDetail', { id });
  }, [navigation]); // Stable unless navigation changes

  return (
    <FlatList
      data={transactions}
      renderItem={({ item }) => (
        <TransactionListItem
          transaction={item}
          onPress={handleTransactionPress} // Same reference across renders
        />
      )}
      keyExtractor={(item) => item.id}
    />
  );
}

// ❌ WRONG - New function on every render
function SlowTransactionList({ transactions }: Props) {
  const navigation = useNavigation();

  return (
    <FlatList
      data={transactions}
      renderItem={({ item }) => (
        <TransactionListItem
          transaction={item}
          onPress={(id) => navigation.navigate('TransactionDetail', { id })} // NEW function every render
        />
      )}
      keyExtractor={(item) => item.id}
    />
  );
}
```

### FlatList Optimization

**Optimized FlatList with getItemLayout**:

```typescript
import { FlatList } from 'react-native';

const ITEM_HEIGHT = 80;

function OptimizedTransactionList({ transactions }: Props) {
  // ✅ CORRECT - Full optimization
  const getItemLayout = useCallback(
    (data: any, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    []
  );

  const renderItem = useCallback(({ item }: { item: Transaction }) => (
    <TransactionListItem transaction={item} />
  ), []);

  const keyExtractor = useCallback((item: Transaction) => item.id, []);

  return (
    <FlatList
      data={transactions}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout} // Critical for performance
      removeClippedSubviews={true} // Android optimization
      maxToRenderPerBatch={10} // Render 10 items per batch
      updateCellsBatchingPeriod={50} // Batch updates every 50ms
      initialNumToRender={10} // Render 10 items initially
      windowSize={5} // Keep 5 screens of items in memory
    />
  );
}

// ❌ WRONG - No optimization
function SlowTransactionList({ transactions }: Props) {
  return (
    <FlatList
      data={transactions}
      renderItem={({ item }) => <TransactionListItem transaction={item} />} // Inline function
      keyExtractor={(item) => item.id} // Inline function
      // No getItemLayout, no other optimizations
    />
  );
}
```

### Image Optimization

**Optimized image loading**:

```typescript
import FastImage from 'react-native-fast-image';

// ✅ CORRECT - Optimized image loading
function UserAvatar({ userId, size = 50 }: Props) {
  const imageUri = `https://api.example.com/avatars/${userId}.jpg`;

  return (
    <FastImage
      source={{
        uri: imageUri,
        priority: FastImage.priority.normal,
        cache: FastImage.cacheControl.immutable,
      }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      resizeMode={FastImage.resizeMode.cover}
    />
  );
}

// ❌ WRONG - Using Image without optimization
import { Image } from 'react-native';

function SlowUserAvatar({ userId, size = 50 }: Props) {
  return (
    <Image
      source={{ uri: `https://api.example.com/avatars/${userId}.jpg` }}
      style={{ width: size, height: size }}
    />
  );
}
```

### Memory Leak Prevention

**Cleanup subscriptions and timers**:

```typescript
import { useEffect, useRef } from 'react';

function LiveBalanceDisplay({ accountId }: Props) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Setup interval
    intervalRef.current = setInterval(() => {
      fetchBalance(accountId);
    }, 5000);

    // ✅ CORRECT - Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [accountId]);

  return <Text>Balance: ...</Text>;
}

// ❌ WRONG - No cleanup, causes memory leak
function LeakyBalanceDisplay({ accountId }: Props) {
  useEffect(() => {
    setInterval(() => {
      fetchBalance(accountId); // Keeps running after unmount!
    }, 5000);
    // Missing cleanup
  }, [accountId]);

  return <Text>Balance: ...</Text>;
}
```

**Cleanup event listeners**:

```typescript
import { useEffect } from 'react';

function WebSocketListener() {
  useEffect(() => {
    const handler = (data: any) => {
      console.log('Received:', data);
    };

    webSocketService.on('message', handler);

    // ✅ CORRECT - Remove listener on unmount
    return () => {
      webSocketService.off('message', handler);
    };
  }, []);

  return <View>...</View>;
}
```

## Database Optimization

### N+1 Query Detection and Prevention

**N+1 problem example**:

```typescript
// ❌ WRONG - N+1 query problem
async function getUsersWithAccounts(): Promise<User[]> {
  const users = await prisma.user.findMany(); // 1 query

  // N queries (one per user)
  for (const user of users) {
    user.accounts = await prisma.account.findMany({
      where: { userId: user.id }
    });
  }

  return users;
}

// ✅ CORRECT - Single query with include
async function getUsersWithAccounts(): Promise<User[]> {
  return prisma.user.findMany({
    include: {
      accounts: true // Joins in single query
    }
  });
}

// ✅ ALTERNATIVE - DataLoader pattern for GraphQL
import DataLoader from 'dataloader';

const accountLoader = new DataLoader(async (userIds: string[]) => {
  const accounts = await prisma.account.findMany({
    where: { userId: { in: userIds } }
  });

  // Group accounts by userId
  const accountsByUserId = accounts.reduce((acc, account) => {
    if (!acc[account.userId]) acc[account.userId] = [];
    acc[account.userId].push(account);
    return acc;
  }, {} as Record<string, Account[]>);

  // Return in same order as userIds
  return userIds.map(id => accountsByUserId[id] || []);
});
```

### Proper Database Indexes

**Index creation for common queries**:

```prisma
// schema.prisma

model Transaction {
  id            String   @id @default(uuid())
  fromAccountId  String
  toAccountId    String
  amount        Decimal
  status        String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // ✅ CORRECT - Indexes for common queries
  @@index([fromAccountId, status])      // WHERE fromAccountId AND status
  @@index([toAccountId, status])        // WHERE toAccountId AND status
  @@index([createdAt])                 // ORDER BY createdAt
  @@index([status, createdAt])         // WHERE status ORDER BY createdAt
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique  // Automatic index
  handle    String   @unique  // Automatic index
  createdAt DateTime @default(now())

  @@index([createdAt]) // For pagination by creation date
}
```

### Query Optimization

**Optimize with select and pagination**:

```typescript
// ✅ CORRECT - Select only needed fields
async function getTransactionSummaries(accountId: string, page: number = 1, limit: number = 20) {
  const skip = (page - 1) * limit;

  return prisma.transaction.findMany({
    where: { fromAccountId: accountId },
    select: {
      id: true,
      amount: true,
      status: true,
      createdAt: true,
      // NOT selecting unnecessary fields
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
  });
}

// ❌ WRONG - Fetching all fields, no pagination
async function getTransactionSummaries(accountId: string) {
  return prisma.transaction.findMany({
    where: { fromAccountId: accountId },
    // Returns ALL fields and ALL rows
  });
}
```

## Bundle Size Optimization

### Code Splitting and Lazy Loading

**Lazy load screens**:

```typescript
import React, { lazy, Suspense } from 'react';
import { ActivityIndicator } from 'react-native';

// ✅ CORRECT - Lazy load heavy screens
const TransactionHistory = lazy(() => import('./screens/TransactionHistory'));
const Settings = lazy(() => import('./screens/Settings'));
const AccountDetail = lazy(() => import('./screens/AccountDetail'));

function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Transactions">
          {() => (
            <Suspense fallback={<ActivityIndicator />}>
              <TransactionHistory />
            </Suspense>
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ❌ WRONG - Import all screens upfront
import TransactionHistory from './screens/TransactionHistory';
import Settings from './screens/Settings';
import AccountDetail from './screens/AccountDetail';
// All loaded on app start, increasing initial bundle
```

### Tree Shaking

**Import only what you need**:

```typescript
// ✅ CORRECT - Import specific functions
import { map, filter, reduce } from 'lodash';

// ✅ BETTER - Import from subpath
import map from 'lodash/map';
import filter from 'lodash/filter';

// ❌ WRONG - Imports entire lodash library
import _ from 'lodash';
```

## Caching Strategies

### React Query for API Caching

**Efficient API caching**:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ✅ CORRECT - React Query with caching
function useAccount(accountId: string) {
  return useQuery({
    queryKey: ['account', accountId],
    queryFn: () => accountService.getAccount(accountId),
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    cacheTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch on focus
  });
}

// Mutation with cache invalidation
function useUpdateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { id: string; name: string }) =>
      accountService.updateAccount(data.id, data),
    onSuccess: (updatedAccount) => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['account', updatedAccount.id] });
    },
  });
}
```

### Redis Caching (Server-Side)

**Cache expensive operations**:

```typescript
import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  async getAccountBalance(accountId: string): Promise<Decimal> {
    // ✅ CORRECT - Check cache first
    const cacheKey = `account:${accountId}:balance`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return new Decimal(cached);
    }

    // Not in cache, fetch from database
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { balance: true },
    });

    // Cache for 1 minute
    await this.redis.setex(cacheKey, 60, account.balance.toString());

    return account.balance;
  }

  async updateBalance(accountId: string, newBalance: Decimal): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: { balance: newBalance },
    });

    // ✅ CORRECT - Invalidate cache
    await this.redis.del(`account:${accountId}:balance`);
  }
}
```

### In-Memory Caching (Client-Side)

**Simple in-memory cache**:

```typescript
class CacheService {
  private cache = new Map<string, { data: any; expiry: number }>();

  set(key: string, data: any, ttlMs: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlMs,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Usage
const cache = new CacheService();

async function fetchUserProfile(userId: string): Promise<User> {
  const cacheKey = `user:${userId}`;
  const cached = cache.get<User>(cacheKey);

  if (cached) {
    return cached;
  }

  const user = await userService.getUser(userId);
  cache.set(cacheKey, user, 5 * 60 * 1000); // Cache for 5 minutes

  return user;
}
```

## Profiling and Monitoring

### React Native Performance Monitor

**Enable performance monitoring**:

```typescript
import { PerformanceObserver, performance } from 'react-native-performance';

// Monitor render times
const observer = new PerformanceObserver((list) => {
  const entries = list.getEntries();
  entries.forEach((entry) => {
    console.log(`${entry.name}: ${entry.duration}ms`);

    if (entry.duration > 16) {
      // Slower than 60fps
      logger.warn('Slow render detected', {
        component: entry.name,
        duration: entry.duration,
      });
    }
  });
});

observer.observe({ entryTypes: ['measure'] });

// Measure component render
function ExpensiveComponent() {
  performance.mark('expensive-start');

  // Render logic

  performance.mark('expensive-end');
  performance.measure('ExpensiveComponent', 'expensive-start', 'expensive-end');

  return <View>...</View>;
}
```

## Validation Checklist

**React Native:**
- [ ] Expensive components wrapped in React.memo
- [ ] Expensive calculations use useMemo
- [ ] Callback functions use useCallback
- [ ] FlatList uses getItemLayout for fixed-height items
- [ ] FlatList has maxToRenderPerBatch, windowSize configured
- [ ] Images use FastImage with caching
- [ ] No memory leaks (timers, listeners cleaned up)
- [ ] No inline functions in renderItem
- [ ] Keys provided for all list items

**Database:**
- [ ] No N+1 query problems
- [ ] Indexes created for common WHERE clauses
- [ ] Indexes created for ORDER BY fields
- [ ] Only selected fields fetched (not SELECT *)
- [ ] Pagination implemented for large datasets
- [ ] Joins used instead of multiple queries

**Bundle Size:**
- [ ] Heavy screens lazy loaded
- [ ] Only necessary imports from libraries
- [ ] Tree shaking enabled in build config
- [ ] No unused dependencies in package.json

**Caching:**
- [ ] React Query used for API calls
- [ ] Appropriate staleTime and cacheTime set
- [ ] Cache invalidation on mutations
- [ ] Redis caching for expensive server operations
- [ ] Cache keys follow consistent pattern

**Memory:**
- [ ] All timers cleared on unmount
- [ ] All event listeners removed on unmount
- [ ] No circular references in objects
- [ ] Large data structures properly cleaned up

## Anti-Patterns to Avoid

**NEVER:**
- ❌ Memoize trivial components (overhead > benefit)
- ❌ Use inline functions in FlatList renderItem
- ❌ Skip getItemLayout for fixed-height FlatList items
- ❌ Fetch all fields when only few are needed
- ❌ Load all data without pagination
- ❌ Skip database indexes for common queries
- ❌ Import entire libraries when only using few functions
- ❌ Forget to clean up timers and listeners
- ❌ Re-fetch data that's already cached
- ❌ Use synchronous operations on main thread

**ALWAYS:**
- ✅ Profile before optimizing (measure first)
- ✅ Use React.memo for expensive components
- ✅ Use useMemo for expensive calculations
- ✅ Use useCallback for callback stability
- ✅ Implement proper FlatList optimization
- ✅ Use FastImage for image loading
- ✅ Create database indexes for common queries
- ✅ Use select to fetch only needed fields
- ✅ Implement pagination for large datasets
- ✅ Cache frequently accessed data
- ✅ Clean up resources on unmount
- ✅ Lazy load heavy screens

## Resources

### references/

**react-native-optimization.md** - React Native performance optimization patterns, profiling techniques, and best practices

**database-optimization.md** - Database query optimization, indexing strategies, and N+1 query prevention

**caching-strategies.md** - Caching patterns for client and server, cache invalidation strategies, and TTL management

## Success Criteria

Code is well-optimized when:
1. No unnecessary re-renders in React components
2. FlatList renders smoothly at 60fps
3. No N+1 query problems in database access
4. Appropriate database indexes for common queries
5. Only necessary data fetched from API/database
6. Bundle size minimized with code splitting
7. Frequently accessed data cached appropriately
8. No memory leaks from timers or listeners
9. Images load quickly with proper caching
10. App starts quickly with lazy loading

Refer to references for detailed optimization techniques.
