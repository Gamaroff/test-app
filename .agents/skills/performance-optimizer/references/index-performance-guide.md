# Database Index & Performance Guide

Comprehensive guide to database optimization, indexing strategies, and query patterns for optimal performance in your platform.

> **For schema details**, see your project's schema catalog  
> **For relationships**, see your project's relationship mapping  
> **For query examples**, see your project's data-patterns guide

## Current Index Strategy

### Critical Performance Indexes

**User Authentication & Identity**
```sql
-- Essential for login and lookup
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_phone ON users(phone_number) WHERE phone_number IS NOT NULL;
```

**Financial Operations (High Priority)**
```sql
-- Account operations (critical for balance checks)
CREATE UNIQUE INDEX idx_accounts_address ON accounts(address);
CREATE INDEX idx_accounts_user_type ON accounts(user_id, type);
CREATE INDEX idx_accounts_user_status ON accounts(user_id, status) WHERE status = 'ACTIVE';

-- Transaction performance (high-volume queries)
CREATE INDEX idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_user_type ON transactions(user_id, type, status);
CREATE INDEX idx_transactions_from_user ON transactions(from_user_id, created_at DESC) WHERE from_user_id IS NOT NULL;
CREATE INDEX idx_transactions_to_user ON transactions(to_user_id, created_at DESC) WHERE to_user_id IS NOT NULL;
CREATE INDEX idx_transactions_account ON transactions(account_id, created_at DESC) WHERE account_id IS NOT NULL;

-- Payment requests
CREATE INDEX idx_payment_requests_requester ON payment_requests(requester_id, status, created_at DESC);
CREATE INDEX idx_payment_requests_recipient ON payment_requests(recipient_id, status, created_at DESC);  
CREATE INDEX idx_payment_requests_due_date ON payment_requests(due_date) WHERE status = 'PENDING';
```

**Real-Time Communication**
```sql
-- Chat participant lookups  
CREATE INDEX idx_thread_members_user ON thread_members(user_id);
CREATE INDEX idx_thread_members_group ON thread_members(group_id, role);
CREATE UNIQUE INDEX idx_thread_members_user_group ON thread_members(user_id, group_id);

-- Message performance (real-time chat)
CREATE INDEX idx_messages_group_created ON messages(group_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id, created_at DESC);
CREATE INDEX idx_messages_content_type ON messages(group_id, content_type, created_at DESC);
CREATE INDEX idx_messages_featured ON messages(is_featured, created_at DESC) WHERE is_featured = true;
```

**Notification System**
```sql
-- User notifications (real-time delivery)  
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_status ON notifications(user_id, status);
CREATE INDEX idx_notifications_type_priority ON notifications(type, priority);
CREATE INDEX idx_notifications_scheduled ON notifications(scheduled_at, status) WHERE scheduled_at IS NOT NULL;

-- Delivery tracking
CREATE INDEX idx_notification_deliveries_notification ON notification_deliveries(notification_id);
CREATE INDEX idx_notification_deliveries_channel_status ON notification_deliveries(channel, status);
CREATE INDEX idx_notification_deliveries_status_created ON notification_deliveries(status, created_at);

-- User preferences  
CREATE UNIQUE INDEX idx_notification_preferences_user_type ON notification_preferences(user_id, type);
CREATE INDEX idx_notification_preferences_enabled ON notification_preferences(user_id, enabled);
```

## Performance Optimization Patterns

### Query Pattern Analysis

**High-Frequency Operations (Optimize First)**
1. User authentication by email/username (10,000+ req/day)
2. Account balance checks (5,000+ req/day)  
3. Transaction history pagination (3,000+ req/day)
4. Real-time chat message loading (2,000+ req/day)
5. Notification delivery status (1,500+ req/day)

**Medium-Frequency Operations (Monitor Performance)**  
1. Payment request creation and status updates
2. Role/permission lookups for feature access
3. Group/team participant management
4. Financial transaction reporting and analytics

**Low-Frequency Operations (Basic Indexes)**
1. User profile updates
2. Chat group creation and settings
3. Notification template management
4. System administrative queries

### Index Strategy by Domain

**Financial Domain (Precision Critical)**
```sql
-- Multi-column indexes for complex financial queries
CREATE INDEX idx_transactions_user_amount_date ON transactions(user_id, amount DESC, created_at DESC);
CREATE INDEX idx_transactions_currency_status ON transactions(currency, status, created_at DESC);
CREATE INDEX idx_transactions_blockchain_id ON transactions(transaction_id) WHERE transaction_id IS NOT NULL;

-- Account performance with partial indexes
CREATE INDEX idx_accounts_active_balance ON accounts(balance DESC) WHERE status = 'ACTIVE';
CREATE INDEX idx_accounts_type_balance ON accounts(type, balance DESC) WHERE status = 'ACTIVE';
```

**Messaging Domain (Real-Time Critical)**
```sql
-- Message pagination optimization
CREATE INDEX idx_messages_thread_cursor ON messages(thread_id, created_at DESC, id);
CREATE INDEX idx_messages_unread ON messages(thread_id, created_at)
  WHERE created_at > (SELECT last_read_at FROM thread_members WHERE thread_id = messages.thread_id);

-- Thread member activity tracking
CREATE INDEX idx_thread_members_activity ON thread_members(thread_id, last_read_at DESC);
```

**Notification Domain (Delivery Critical)**  
```sql
-- Notification queue processing
CREATE INDEX idx_notifications_queue ON notifications(status, priority DESC, scheduled_at ASC) 
  WHERE status IN ('pending', 'queued');

-- Failed delivery retry logic
CREATE INDEX idx_notification_deliveries_retry ON notification_deliveries(status, created_at) 
  WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours';
```

## Advanced Indexing Strategies

### Partial Indexes for Efficiency

**Active Record Filtering**
```sql
-- Only index active/relevant records
CREATE INDEX idx_accounts_active_user ON accounts(user_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_transactions_pending ON transactions(user_id, created_at DESC) WHERE status = 'PENDING';
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
```

**Time-Based Partitioning**
```sql  
-- Recent data optimization (hot data)
CREATE INDEX idx_transactions_recent ON transactions(user_id, created_at DESC) 
  WHERE created_at > NOW() - INTERVAL '30 days';

-- Archive data indexing (cold data) 
CREATE INDEX idx_transactions_archive ON transactions(user_id, type) 
  WHERE created_at <= NOW() - INTERVAL '30 days';
```

### Composite Index Optimization

**Query-Specific Compound Indexes**
```sql
-- Financial dashboard queries
CREATE INDEX idx_transactions_user_type_status_date ON transactions(user_id, type, status, created_at DESC);

-- Chat activity analysis  
CREATE INDEX idx_messages_group_sender_date ON messages(group_id, sender_id, created_at DESC);

-- Notification delivery analytics
CREATE INDEX idx_notification_deliveries_channel_status_date ON notification_deliveries(channel, status, created_at);
```

### Expression Indexes for Complex Queries

**Date-Based Aggregations**
```sql
-- Monthly transaction aggregations
CREATE INDEX idx_transactions_monthly ON transactions(user_id, DATE_TRUNC('month', created_at));

-- Daily notification analytics
CREATE INDEX idx_notifications_daily ON notifications(type, DATE_TRUNC('day', created_at));
```

**Text Search Optimization** 
```sql
-- Case-insensitive username searches (future enhancement)
CREATE INDEX idx_users_username_lower ON users(LOWER(username));

-- Chat message search (future enhancement)  
CREATE INDEX idx_messages_content_search ON messages USING gin(to_tsvector('english', content));
```

## Query Performance Patterns

### Efficient Pagination Strategies

**Cursor-Based Pagination (Recommended)**
```sql
-- Transaction history with cursor
SELECT * FROM transactions 
WHERE user_id = $1 
  AND created_at < $cursor_timestamp
ORDER BY created_at DESC 
LIMIT $page_size;

-- Uses: idx_transactions_user_created
```

**Offset-Based Pagination (Limited Use)**
```sql
-- Chat messages with offset (small offsets only)
SELECT * FROM messages
WHERE group_id = $1
ORDER BY created_at DESC
LIMIT $page_size OFFSET $offset;

-- Warning: Performance degrades with large offsets
-- Uses: idx_messages_group_created  
```

### Optimized Aggregation Queries

**Financial Summary Queries**
```sql
-- User balance summary (optimized)
SELECT 
  w.type as account_type,
  SUM(w.balance) as total_balance,
  COUNT(*) as account_count
FROM accounts w
WHERE w.user_id = $1 AND w.status = 'ACTIVE'
GROUP BY w.type;

-- Uses: idx_accounts_user_status
```

**Transaction Analytics**
```sql
-- Monthly transaction volumes (with index support)
SELECT 
  DATE_TRUNC('month', created_at) as month,
  type,
  COUNT(*) as transaction_count,
  SUM(amount) as total_amount  
FROM transactions
WHERE user_id = $1 
  AND created_at >= $start_date
GROUP BY DATE_TRUNC('month', created_at), type
ORDER BY month DESC;

-- Uses: idx_transactions_user_created
```

### Join Optimization Patterns

**Efficient User-Transaction Joins**
```sql
-- User transaction summary with proper join order
SELECT 
  u.username,
  COUNT(t.id) as tx_count,
  COALESCE(SUM(t.amount), 0) as total_volume
FROM users u
LEFT JOIN transactions t ON u.id = t.user_id 
  AND t.created_at >= $date_filter
  AND t.status = 'CONFIRMED'
GROUP BY u.id, u.username;

-- Join order: users → transactions (uses FK index)
```

**Chat Activity with Participants**
```sql
-- Group activity with member details  
SELECT 
  g.name as group_name,
  COUNT(DISTINCT gm.user_id) as member_count,
  COUNT(m.id) as message_count,
  MAX(m.created_at) as last_activity
FROM groups g
JOIN group_members gm ON g.id = gm.group_id
LEFT JOIN messages m ON g.id = m.group_id 
  AND m.created_at >= $activity_window
GROUP BY g.id, g.name
ORDER BY last_activity DESC;

-- Uses multiple indexes efficiently
```

## Performance Monitoring & Analysis

### Query Performance Metrics

**Index Usage Analysis**
```sql
-- Find unused indexes  
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY schemaname, tablename;

-- Find most used indexes
SELECT 
  schemaname,
  tablename, 
  indexname,
  idx_scan,
  idx_tup_read
FROM pg_stat_user_indexes  
ORDER BY idx_scan DESC
LIMIT 20;
```

**Slow Query Identification**
```sql
-- Enable slow query logging
ALTER SYSTEM SET log_min_duration_statement = 1000; -- 1 second
SELECT pg_reload_conf();

-- Check current settings
SHOW log_min_duration_statement;
SHOW log_statement;
```

**Table Statistics**
```sql  
-- Table size and activity
SELECT 
  schemaname,
  tablename,
  n_tup_ins as inserts,
  n_tup_upd as updates, 
  n_tup_del as deletes,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows
FROM pg_stat_user_tables
ORDER BY n_tup_ins + n_tup_upd + n_tup_del DESC;
```

### Index Maintenance

**Regular Maintenance Tasks**
```sql
-- Rebuild statistics (weekly)
ANALYZE;

-- Update table statistics for specific high-traffic tables
ANALYZE users, transactions, messages, notifications;

-- Check for index bloat
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Index Rebuilding (Maintenance Windows)**  
```sql
-- Rebuild specific indexes if bloated
REINDEX INDEX idx_transactions_user_created;
REINDEX INDEX idx_notifications_user_status;

-- Rebuild all indexes for a table (during maintenance)
REINDEX TABLE transactions;
```

## Connection Pool Optimization

### Connection Pool Configuration

**PgBouncer Settings (Production)**
```ini
[databases]
{app-name} = host=localhost port=5432 dbname={app-name}

[pgbouncer] 
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
max_db_connections = 30
server_idle_timeout = 600
server_connect_timeout = 15
query_timeout = 30
```

**Application-Level Pooling (Prisma)**
```typescript
// Prisma connection pool configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL
    }
  }
});

// Connection pool monitoring
async function getConnectionInfo() {
  const result = await prisma.$queryRaw`
    SELECT 
      count(*) as total_connections,
      count(*) FILTER (WHERE state = 'active') as active_connections,
      count(*) FILTER (WHERE state = 'idle') as idle_connections
    FROM pg_stat_activity 
    WHERE datname = current_database();
  `;
  return result[0];
}
```

### Query Optimization Best Practices

**Parameter Binding (Prevent SQL Injection)**
```typescript
// Correct: Parameterized queries with automatic index usage
const transactions = await prisma.transaction.findMany({
  where: {
    userId: userId,  // Uses idx_transactions_user_created
    status: 'CONFIRMED',
    createdAt: {
      gte: startDate
    }
  },
  orderBy: {
    createdAt: 'desc'
  },
  take: pageSize
});
```

**Avoid N+1 Query Problems** 
```typescript
// Incorrect: N+1 queries
const users = await prisma.user.findMany();
for (const user of users) {
  const accounts = await prisma.account.findMany({
    where: { userId: user.id }  // Executes N queries
  });
}

// Correct: Single query with includes
const users = await prisma.user.findMany({
  include: {
    accounts: {
      where: { status: 'ACTIVE' }
    }
  }
});
```

**Selective Field Loading**
```typescript
// Load only necessary fields for better performance
const users = await prisma.user.findMany({
  select: {
    id: true,
    username: true,
    email: true,
    // Skip heavy fields like profileImageUrl if not needed
  }
});
```

## Database Scaling Strategies

### Read Replica Configuration

**Read-Write Splitting**
```typescript
// Master-replica connection management
const masterDB = new PrismaClient({
  datasources: { db: { url: MASTER_DATABASE_URL } }
});

const replicaDB = new PrismaClient({
  datasources: { db: { url: REPLICA_DATABASE_URL } }
});

// Route queries appropriately
async function getUserTransactions(userId: string) {
  // Use replica for read queries
  return await replicaDB.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });
}

async function createTransaction(data: TransactionData) {
  // Use master for write operations
  return await masterDB.transaction.create({ data });
}
```

### Partitioning Strategies  

**Time-Based Partitioning (Future Enhancement)**
```sql
-- Partition large tables by date
CREATE TABLE transactions_2024 PARTITION OF transactions 
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE transactions_2025 PARTITION OF transactions
FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- Automatic partition pruning improves query performance
SELECT * FROM transactions 
WHERE created_at >= '2024-01-01' 
  AND user_id = $1;  -- Only scans transactions_2024
```

**Hash Partitioning (High-Volume Tables)**
```sql  
-- Distribute high-volume tables by hash
CREATE TABLE notifications_p1 PARTITION OF notifications
FOR VALUES WITH (MODULUS 4, REMAINDER 0);

CREATE TABLE notifications_p2 PARTITION OF notifications  
FOR VALUES WITH (MODULUS 4, REMAINDER 1);

-- Continue for p3, p4...
```

## Caching Strategies

### Application-Level Caching  

**Redis Integration for Hot Data**
```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Cache user balance (frequent lookups)
async function getUserBalance(userId: string): Promise<number> {
  const cached = await redis.get(`balance:${userId}`);
  if (cached) {
    return parseFloat(cached);
  }
  
  // Fallback to database  
  const accounts = await prisma.account.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { balance: true }
  });
  
  const total = accounts.reduce((sum, w) => sum + w.balance.toNumber(), 0);
  
  // Cache for 5 minutes
  await redis.setex(`balance:${userId}`, 300, total.toString());
  
  return total;
}
```

**Query Result Caching**
```typescript
// Cache expensive aggregation queries
async function getUserStats(userId: string) {
  const cacheKey = `stats:${userId}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const stats = await prisma.transaction.groupBy({
    by: ['type'],
    where: { userId },
    _sum: { amount: true },
    _count: true
  });
  
  await redis.setex(cacheKey, 3600, JSON.stringify(stats)); // 1 hour
  return stats;
}
```

### Database-Level Caching

**PostgreSQL Shared Buffer Optimization**
```sql
-- Increase shared buffers for hot data
ALTER SYSTEM SET shared_buffers = '512MB';  -- Adjust based on available RAM
ALTER SYSTEM SET effective_cache_size = '2GB';  -- Total system cache  
ALTER SYSTEM SET work_mem = '16MB';  -- Per-query working memory

-- Restart required for some changes
SELECT pg_reload_conf();
```

## Performance Testing & Benchmarking

### Load Testing Scenarios

**Financial Operations Load Test**
```typescript
// Simulate high-frequency balance checks
async function balanceCheckLoadTest() {
  const users = await generateTestUsers(1000);
  const promises = [];
  
  for (let i = 0; i < 1000; i++) {
    const randomUser = users[Math.floor(Math.random() * users.length)];
    promises.push(
      measureQueryTime(async () => {
        return await prisma.account.findMany({
          where: { userId: randomUser.id, status: 'ACTIVE' },
          select: { balance: true, type: true }
        });
      })
    );
  }
  
  const results = await Promise.all(promises);
  const avgTime = results.reduce((sum, time) => sum + time, 0) / results.length;
  console.log(`Average balance check time: ${avgTime}ms`);
}
```

**Chat Message Load Test**  
```typescript
// Simulate real-time chat load
async function chatMessageLoadTest() {
  const groups = await generateTestChatGroups(100);
  
  // Simulate concurrent message loading  
  const promises = groups.map(group => 
    measureQueryTime(async () => {
      return await prisma.chatMessage.findMany({
        where: { groupId: group.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { 
          // Simulate full message loading with sender info
        }
      });
    })
  );
  
  const results = await Promise.all(promises);
  console.log('Chat load test completed:', results.length);
}
```

### Performance Baseline Metrics

**Target Performance Goals**
- User authentication: < 50ms (99th percentile)
- Balance checks: < 100ms (95th percentile)  
- Transaction history: < 200ms (95th percentile)
- Chat message loading: < 150ms (95th percentile)
- Notification delivery: < 500ms (90th percentile)

**Monitoring Query Performance**
```sql
-- Track slow queries in production
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  rows,
  100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
WHERE mean_time > 100  -- Queries averaging > 100ms
ORDER BY mean_time DESC
LIMIT 20;
```

## Troubleshooting Performance Issues

### Common Performance Problems

**1. Missing Index Symptoms**
- Slow queries on filtered results  
- High CPU usage during peak hours
- Sequential scan warnings in query plans

**Diagnosis:**
```sql
-- Find queries doing sequential scans
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM transactions 
WHERE user_id = 'user-uuid' 
  AND status = 'PENDING';

-- Look for "Seq Scan" instead of "Index Scan"
```

**Solution:**
```sql  
-- Add appropriate compound index
CREATE INDEX idx_transactions_user_status ON transactions(user_id, status);
```

**2. Index Bloat Issues**  
- Degrading performance over time
- Large index sizes relative to data
- Frequent UPDATE/DELETE operations

**Diagnosis:**
```sql
-- Check index bloat
SELECT 
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  idx_scan,
  idx_tup_read  
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC;
```

**Solution:**
```sql
-- Rebuild bloated indexes during maintenance window  
REINDEX INDEX idx_transactions_user_created;
```

**3. Connection Pool Exhaustion**
- Application timeouts under load
- "Too many connections" errors  
- High connection count relative to limits

**Diagnosis:**
```sql
-- Check active connections
SELECT 
  datname,
  state,
  count(*) 
FROM pg_stat_activity 
GROUP BY datname, state;
```

**Solution:**  
```typescript
// Implement connection pool monitoring
setInterval(async () => {
  const connections = await getConnectionInfo();
  if (connections.active_connections > WARNING_THRESHOLD) {
    console.warn('High connection usage:', connections);
  }
}, 30000);
```

### Emergency Performance Fixes

**Immediate Relief Strategies**
```sql
-- Terminate long-running queries (emergency only)
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'active'
  AND query_start < NOW() - INTERVAL '5 minutes'
  AND query NOT LIKE '%pg_stat_activity%';

-- Temporarily disable expensive indexes (rebuild later)
DROP INDEX IF EXISTS idx_expensive_query;

-- Increase work memory temporarily
SET work_mem = '64MB';  -- Session-level change
```

## Future Optimization Opportunities

### Advanced Features (Roadmap)

**Full-Text Search**
```sql
-- Future: Enhanced chat message search
ALTER TABLE messages ADD COLUMN search_vector tsvector;
CREATE INDEX idx_messages_search ON messages USING gin(search_vector);

-- Trigger to maintain search vector
CREATE TRIGGER trig_messages_search_update
BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION 
tsvector_update_trigger(search_vector, 'pg_catalog.english', content);
```

**Materialized Views for Analytics**
```sql
-- Future: Pre-computed financial summaries  
CREATE MATERIALIZED VIEW user_financial_summary AS
SELECT 
  u.id as user_id,
  u.username,
  COUNT(DISTINCT w.id) as account_count,
  SUM(w.balance) as total_balance,
  COUNT(t.id) as transaction_count,
  MAX(t.created_at) as last_transaction
FROM users u
LEFT JOIN accounts w ON u.id = w.user_id AND w.status = 'ACTIVE'  
LEFT JOIN transactions t ON u.id = t.user_id
GROUP BY u.id, u.username;

-- Refresh schedule (e.g., hourly)
CREATE UNIQUE INDEX idx_user_financial_summary_user ON user_financial_summary(user_id);
```

**Database Partitioning Implementation**
```sql
-- Future: Implement time-based partitioning for high-volume tables
-- Benefits: Improved query performance, easier maintenance, better backup strategies
-- Priority tables: transactions, messages, notifications
```

## Cross-References

These are the companion documents a project typically keeps beside this guide; none ship with the skill.

- **Query Examples**: your project's data-patterns guide - Practical query implementations
- **Schema Structure**: your project's schema catalog - Complete field documentation
- **Relationships**: your project's relationship mapping - Foreign key optimization
- **Migration Planning**: your project's migration history - Schema evolution tracking
- **Setup Guide**: your project's database guide - Development environment optimization

---

**Performance Principles**:
- **Index Strategically**: Cover high-frequency queries without over-indexing
- **Monitor Continuously**: Track performance metrics and query patterns  
- **Cache Intelligently**: Balance freshness with performance for hot data
- **Scale Proactively**: Plan for growth with partitioning and read replicas