---
name: offline-first-enforcer
description: This skill should be used when implementing offline-first architecture for mobile or web apps, validating sync queue implementations, reviewing conflict resolution strategies, ensuring optimistic UI updates, or designing local-first features. Use when working with offline capabilities, cache strategies, or sync patterns.
license: Complete terms in LICENSE.txt
---

# Offline First Enforcer

Validate and enforce offline-first architecture patterns for mobile and web apps, ensuring reliable operation during network interruptions while maintaining data consistency and security.

## Purpose

Ensure your app operates seamlessly offline by validating local storage patterns, sync queue implementations, conflict resolution strategies, and optimistic UI updates. This skill prevents common offline architecture mistakes and enforces best practices for network-independent operation.

## When to Use This Skill

Use this skill when:

- Implementing offline-capable features
- Reviewing sync queue implementations
- Designing conflict resolution strategies
- Validating cache population patterns
- Implementing optimistic UI updates
- Planning background sync mechanisms
- Ensuring offline data security
- Optimizing for intermittent connectivity

## Offline Architecture

### Multi-Tier Caching System

**L0 SecureStore** (Hardware-Backed):
- Purpose: Cryptographic secrets, auth tokens, biometric credentials
- Technology: Expo SecureStore (hardware-backed encryption)
- Independence: Operates outside cache-lib
- Use for: JWT tokens, encryption keys, PIN hashes, biometric data

**L1 Cache** (In-Memory):
- Purpose: Active session data, hot data
- Technology: in-memory map (e.g. LRU cache)
- Characteristics: Volatile, <10ms access, cleared on app restart
- Use for: active session data, hot entities

**L2 Cache** (Key-Value):
- Purpose: Non-sensitive persisted data
- Technology: AsyncStorage / IndexedDB / localStorage
- Characteristics: Persistent, ~50ms access, key-value storage
- Use for: User preferences, UI state, recent search history

**L3 Cache** (Structured):
- Purpose: Structured offline-first datasets
- Technology: SQLite / WatermelonDB / IndexedDB with schema
- Characteristics: Persistent, relational, observable queries, ~100ms access
- Use for: historical records, large lists, entity metadata, offline queue

### Offline-First Patterns

**Local-First Data Access**:
```typescript
// ✅ CORRECT: Always read from cache first
async function getItem(entityType: string, id: string): Promise<Entity> {
  // 1. Check L1 cache (in-memory)
  const cached = cache.get(`${entityType}:${id}`);
  if (cached) return cached;

  // 2. Check L3 cache (SQLite)
  const local = await cache.query(entityType, { id });
  if (local) {
    // Populate L1 for next access
    cache.set(`${entityType}:${id}`, local);
    return local;
  }

  // 3. Fetch from network (online only)
  if (isOnline()) {
    const remote = await api.get(entityType, id);
    // Populate all caches
    await cache.set(`${entityType}:${id}`, remote); // L1
    await cache.upsert(entityType, remote); // L3
    return remote;
  }

  throw new Error(`${entityType} unavailable offline`);
}
```

**Optimistic UI Updates**:
```typescript
// ✅ CORRECT: Update UI immediately, sync asynchronously
async function sendTransaction(tx: Transaction): Promise<void> {
  // 1. Optimistic UI update
  const optimisticTx = { ...tx, status: 'PENDING', id: generateUUID() };
  await cache.insert('transactions', optimisticTx);
  updateUI(optimisticTx); // Instant feedback

  // 2. Queue for background sync
  await syncQueue.enqueue({
    operation: 'CREATE_TRANSACTION',
    data: tx,
    localId: optimisticTx.id,
    retryCount: 0,
    createdAt: new Date()
  });

  // 3. Attempt sync if online
  if (isOnline()) {
    await syncQueue.processNext();
  }
}
```

**Sync Queue Pattern**:
```typescript
interface SyncQueueItem {
  id: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: string;
  data: unknown;
  localId: string;
  serverId?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  lastAttempt?: Date;
}

class OfflineSyncQueue {
  async enqueue(item: SyncQueueItem): Promise<void> {
    await cache.insert('sync_queue', item);
  }

  async processNext(): Promise<void> {
    const items = await cache.query('sync_queue', { 
      orderBy: 'createdAt',
      limit: 10 
    });

    for (const item of items) {
      try {
        const result = await this.syncItem(item);
        await this.handleSuccess(item, result);
      } catch (error) {
        await this.handleFailure(item, error);
      }
    }
  }

  private async syncItem(item: SyncQueueItem): Promise<unknown> {
    switch (item.operation) {
      case 'CREATE':
        return api.create(item.entity, item.data);
      case 'UPDATE':
        return api.update(item.entity, item.serverId, item.data);
      case 'DELETE':
        return api.delete(item.entity, item.serverId);
    }
  }

  private async handleSuccess(item: SyncQueueItem, result: unknown): Promise<void> {
    // Update local record with server ID
    if (item.operation === 'CREATE') {
      await cache.update(item.entity, 
        { id: item.localId }, 
        { id: result.id, syncedAt: new Date() }
      );
    }
    // Remove from queue
    await cache.delete('sync_queue', { id: item.id });
  }

  private async handleFailure(item: SyncQueueItem, error: unknown): Promise<void> {
    if (item.retryCount >= item.maxRetries) {
      // Move to failed queue
      await cache.insert('sync_failed', { ...item, error: error.message });
      await cache.delete('sync_queue', { id: item.id });
    } else {
      // Increment retry with exponential backoff
      await cache.update('sync_queue', 
        { id: item.id }, 
        { 
          retryCount: item.retryCount + 1,
          lastAttempt: new Date()
        }
      );
    }
  }
}
```

**Conflict Resolution**:
```typescript
enum ConflictResolution {
  SERVER_WINS = 'SERVER_WINS',
  CLIENT_WINS = 'CLIENT_WINS',
  LAST_WRITE_WINS = 'LAST_WRITE_WINS',
  MERGE = 'MERGE'
}

async function resolveConflict(
  local: Entity, 
  server: Entity, 
  strategy: ConflictResolution
): Promise<Entity> {
  switch (strategy) {
    case ConflictResolution.SERVER_WINS:
      // Discard local changes
      await cache.update(local.entity, { id: local.id }, server);
      return server;

    case ConflictResolution.CLIENT_WINS:
      // Upload local changes
      const updated = await api.update(local.entity, local.id, local);
      return updated;

    case ConflictResolution.LAST_WRITE_WINS:
      // Compare timestamps
      return local.updatedAt > server.updatedAt ? local : server;

    case ConflictResolution.MERGE:
      // Field-level merge
      const merged = { ...server, ...local };
      // Handle specific field conflicts
      merged.balance = server.balance; // Server is source of truth for computed fields
      merged.displayName = local.displayName; // Client wins for user preferences
      return merged;
  }
}
```

## Validation Checklist

### Offline Architecture Validation

- [ ] All reads check local cache before network
- [ ] Network calls wrapped in `isOnline()` checks
- [ ] Optimistic UI updates for all mutations
- [ ] Sync queue persisted to SQLite (L3 cache)
- [ ] Background sync scheduled on connectivity changes
- [ ] Conflict resolution strategy defined for each entity
- [ ] Retry logic with exponential backoff implemented
- [ ] Failed sync items moved to error queue with alerting

### Cache Strategy Validation

- [ ] SecureStore (L0) used ONLY for cryptographic data
- [ ] In-memory cache (L1) cleared on app restart
- [ ] AsyncStorage (L2) used for non-sensitive preferences
- [ ] SQLite (L3) used for structured, queryable data
- [ ] Cache invalidation on logout implemented
- [ ] Cache size limits defined and enforced
- [ ] Stale data detection and refresh logic in place

### Security Validation

- [ ] Sensitive data NEVER stored in L2/L3 caches
- [ ] Encryption keys stored ONLY in SecureStore (L0)
- [ ] Auth tokens refreshed before expiry
- [ ] Cached data integrity validated
- [ ] Cache cleared on suspicious activity
- [ ] Offline operations logged for audit

### Network Resilience Validation

- [ ] Network detection accurate (not just reachability)
- [ ] Graceful degradation when offline
- [ ] Clear UI indicators for offline state
- [ ] User notified when operations queued
- [ ] Automatic sync on reconnection
- [ ] Manual sync option provided

## Common Offline Anti-Patterns

### NEVER Do This

**Network-First Architecture**:
```typescript
// ❌ WRONG: Fetches from network before checking cache
async function getData(id: string) {
  const data = await api.get(id); // Fails offline
  return data;
}

// ✅ CORRECT: Cache-first with network fallback
async function getData(id: string) {
  const cached = await cache.get(id);
  if (cached) return cached;
  
  if (isOnline()) {
    const data = await api.get(id);
    await cache.set(id, data);
    return data;
  }
  
  throw new OfflineError('Data unavailable offline');
}
```

**Synchronous Network Calls**:
```typescript
// ❌ WRONG: Blocks UI thread
function submitOperation() {
  const result = await api.submit(data); // Blocks until network response
  updateUI(result);
}

// ✅ CORRECT: Optimistic update with background sync
async function submitOperation() {
  const optimistic = createOptimisticRecord(data);
  updateUI(optimistic); // Instant UI update
  await syncQueue.enqueue(optimistic); // Background sync
}
```

**No Conflict Resolution**:
```typescript
// ❌ WRONG: Last write silently overwrites
await api.update(local); // Overwrites concurrent server changes

// ✅ CORRECT: Detect and resolve conflicts
const server = await api.get(id);
if (local.updatedAt !== server.updatedAt) {
  const resolved = await resolveConflict(local, server, strategy);
  await api.update(resolved);
}
```

**Storing Secrets in AsyncStorage**:
```typescript
// ❌ WRONG: Secrets in unencrypted AsyncStorage
await AsyncStorage.setItem('jwt_token', token);

// ✅ CORRECT: Secrets in hardware-backed SecureStore
await SecureStore.setItemAsync('jwt_token', token, {
  keychainAccessible: SecureStore.WHEN_UNLOCKED
});
```

## Integration with Development Workflow

### Pre-Implementation Checklist

Before implementing offline features:

1. Identify data access patterns (read-heavy vs write-heavy)
2. Choose appropriate cache tier (L0/L1/L2/L3)
3. Define conflict resolution strategy
4. Plan sync queue schema
5. Design optimistic UI states
6. Document offline behavior

### Code Review Checklist

When reviewing offline code:

1. Verify cache-first data access
2. Check optimistic UI updates
3. Validate sync queue implementation
4. Ensure conflict resolution handles all cases
5. Confirm security boundaries (no secrets in L2/L3)
6. Test offline→online transition
7. Verify error handling and user feedback

## Performance Considerations

- Cache reads should be <100ms (L3 SQLite)
- Sync queue processing batched (10 items)
- Background sync uses low-priority threads
- Cache size monitoring prevents unbounded growth
- Stale data detected within 72-hour TTL

## Workflow Summary

To implement offline-first features:

1. Choose appropriate cache tier based on data sensitivity and access pattern
2. Implement cache-first read logic
3. Add optimistic UI updates for writes
4. Queue writes to sync queue (L3)
5. Define conflict resolution strategy
6. Implement background sync on connectivity changes
7. Test offline→online transitions
8. Validate security boundaries
