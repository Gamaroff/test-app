---
name: docker
description: Comprehensive Docker administration and troubleshooting for multi-service projects. Manages development, test, and production environments with PostgreSQL, Redis, and monitoring stack.
type: project
---

# Docker Administration Skill

Expert Docker administration for multi-environment infrastructure (development, test, production).

> **Placeholders**: this skill uses `{project}`, `{api-service}`, `{db-service}`, `{cache-service}` as templates — replace with your own service names. See [`docs/reference/configuration.md`](../../docs/reference/configuration.md).

## Quick Reference

### Most Common Operations

```bash
# Development Environment (first time)
npm run docker:setup

# Development Environment (daily use)
docker compose -f docker/docker-compose.dev.yml -p {project} up -d
docker compose -f docker/docker-compose.dev.yml -p {project} logs -f

# Testing (automated)
npm run test:local                    # All tests with isolated database
npm run test:local:coverage           # With coverage reports

# Troubleshooting
docker logs {db-service}          # Check database logs
docker logs {api-service}               # Check API logs
docker stats                          # Resource usage
docker compose -f docker/docker-compose.dev.yml -p {project} down -v  # Clean slate
```

**CRITICAL**: Always use `-p {project}` with docker-compose commands for consistent naming.

## Architecture Overview

### Service Stack

**Development** (ports 3000, 5432, 6379, 5050, 8082):
- {api-service} (Node.js 24, hot-reload)
- {db-service} (PostgreSQL 16)
- {cache-service} (Redis 8)
- {app-name}-pgadmin (database UI)
- {cache-service}-commander (Redis UI)

**Test** (ports 5433, 6380 - non-conflicting):
- {db-service}-test (isolated test database)
- {cache-service}-test (isolated test cache)

**Production** (with monitoring):
- {api-service} (3 replicas, load balanced)
- {db-service} (production-tuned)
- {cache-service} (with auth)
- {app-name}-nginx (reverse proxy, SSL)
- {app-name}-prometheus (metrics)
- {app-name}-grafana (dashboards)
- ELK stack (logging)
- backup service (automated daily backups)

## Environment Management

### Development Environment

#### First-Time Setup
```bash
# Automated setup (recommended)
npm run docker:setup

# What it does:
# 1. Validates Docker installation
# 2. Generates secure secrets (JWT, encryption keys)
# 3. Detects local IP for mobile development
# 4. Starts all containers
# 5. Runs health checks
# 6. Executes Prisma migrations
# 7. Displays service info
```

#### Manual Start
```bash
# Start all services
docker compose -f docker/docker-compose.dev.yml -p {project} up -d

# View logs (all services)
docker compose -f docker/docker-compose.dev.yml -p {project} logs -f

# View specific service logs
docker compose -f docker/docker-compose.dev.yml -p {project} logs -f {api-service}
docker compose -f docker/docker-compose.dev.yml -p {project} logs -f {db-service}

# Stop services (preserve data)
docker compose -f docker/docker-compose.dev.yml -p {project} down

# Stop and remove volumes (clean slate)
docker compose -f docker/docker-compose.dev.yml -p {project} down -v
```

#### Service Access
```
API:              http://localhost:3000
PostgreSQL:       localhost:5432 ({app-name}/{app-name}/{app-name})
Redis:            localhost:6379
PgAdmin:          http://localhost:5050 (admin@{app-name}.dev/admin)
Redis Commander:  http://localhost:8082
```

### Test Environment

#### Automated Testing
```bash
# Run all tests with isolated database
npm run test:local

# With E2E tests
npm run test:local:e2e

# With coverage reports
npm run test:local:coverage

# What it does:
# 1. Starts isolated test containers (ports 5433/6380)
# 2. Waits for health checks
# 3. Resets database schema
# 4. Runs all tests in parallel
# 5. Generates coverage reports (optional)
# 6. Cleans up automatically
```

#### Manual Test Environment
```bash
# Start test services
docker compose -f docker/docker-compose.test.yml up -d

# Check test database
docker exec {db-service}-test pg_isready -U testuser -d my_test

# Stop test services and cleanup
docker compose -f docker/docker-compose.test.yml down -v
```

#### Test Service Ports
```
PostgreSQL Test:  localhost:5433 (testuser/testpass/my_test)
Redis Test:       localhost:6380
```

**Key Feature**: Test environment runs on different ports and can run concurrently with development.

### Production Environment

#### Deployment
```bash
# Build and start production stack
docker compose -f docker/docker-compose.prod.yml up -d

# Check service status
docker compose -f docker/docker-compose.prod.yml ps

# View logs
docker compose -f docker/docker-compose.prod.yml logs -f

# Stop production stack
docker compose -f docker/docker-compose.prod.yml down
```

#### Monitoring Access
```
API (behind Nginx): https://your-domain.com
Prometheus:         http://localhost:9090
Grafana:            http://localhost:3001
Kibana:             http://localhost:5601
```

## Service Administration

### Container Lifecycle

#### Health Checks
```bash
# Check all containers
docker compose -f docker/docker-compose.dev.yml -p {project} ps

# PostgreSQL ready check
docker exec {db-service} pg_isready -U {app-name} -d {app-name}

# Redis ping check
docker exec {cache-service} redis-cli ping

# API health endpoint
curl http://localhost:3000/health

# View container health status with details
docker inspect {db-service} | grep -A 10 Health
```

#### Resource Monitoring
```bash
# Real-time resource usage
docker stats

# Specific container stats
docker stats {api-service} {db-service} {cache-service}

# System resource usage
docker system df

# Detailed disk usage
docker system df -v
```

#### Container Inspection
```bash
# View container configuration
docker inspect {db-service}

# View container logs
docker logs {db-service}
docker logs --tail 100 {api-service}
docker logs --since 30m {cache-service}

# Follow logs in real-time
docker logs -f {api-service}
```

### Rebuilding Containers

#### When Code Changes (Development)
```bash
# No action needed - hot-reload via volume mounts
# Changes to TypeScript files are automatically detected
```

#### When Dependencies Change
```bash
# Rebuild and restart
docker compose -f docker/docker-compose.dev.yml -p {project} down
docker compose -f docker/docker-compose.dev.yml -p {project} up -d --build

# Force rebuild without cache
docker compose -f docker/docker-compose.dev.yml -p {project} build --no-cache
docker compose -f docker/docker-compose.dev.yml -p {project} up -d
```

#### Production Builds
```bash
# Build production image
docker build -f apps/{api-service}/Dockerfile -t {api-service}:latest .

# Push to registry
docker tag {api-service}:latest your-registry/{api-service}:v1.0.0
docker push your-registry/{api-service}:v1.0.0
```

## Database Operations

### PostgreSQL Management

#### Direct Database Access
```bash
# Access PostgreSQL CLI (development)
docker exec -it {db-service} psql -U {app-name} -d {app-name}

# Common psql commands
\dt              # List tables
\d table_name    # Describe table
\l               # List databases
\q               # Quit

# Execute SQL from command line
docker exec {db-service} psql -U {app-name} -d {app-name} -c "SELECT * FROM users LIMIT 10;"
```

#### Prisma Migrations
```bash
# Generate Prisma client
cd apps/{api-service}
npx prisma generate

# Push schema changes (development)
npx prisma db push

# Create migration (production)
npx prisma migrate dev --name migration_name

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (WARNING: destroys data)
npx prisma migrate reset
```

#### Database Backups
```bash
# Create backup with timestamp
docker exec {db-service} pg_dump -U {app-name} {app-name} > \
  "backup_$(date +%Y%m%d_%H%M%S).sql"

# Compressed backup
docker exec {db-service} pg_dump -U {app-name} {app-name} | \
  gzip > "backup_$(date +%Y%m%d_%H%M%S).sql.gz"

# Backup specific tables
docker exec {db-service} pg_dump -U {app-name} -t users -t accounts {app-name} > \
  "partial_backup_$(date +%Y%m%d_%H%M%S).sql"

# Restore from backup
docker exec -i {db-service} psql -U {app-name} {app-name} < backup.sql

# Restore from compressed
gunzip -c backup.sql.gz | \
  docker exec -i {db-service} psql -U {app-name} {app-name}
```

#### Production Automated Backups
Production environment includes automated daily backups at 2 AM:
- Backup schedule: `0 2 * * *` (cron format)
- Stored in backup volumes
- Can be configured to upload to S3/cloud storage

### Redis Management

#### Direct Redis Access
```bash
# Access Redis CLI (development)
docker exec -it {cache-service} redis-cli

# Common Redis commands
PING                    # Test connection
KEYS *                  # List all keys (dev only, slow on production)
GET key_name            # Get value
SET key_name value      # Set value
DEL key_name            # Delete key
FLUSHDB                 # Clear current database (WARNING)
INFO                    # Server information

# Execute command from shell
docker exec {cache-service} redis-cli PING
docker exec {cache-service} redis-cli INFO memory
```

#### Redis Monitoring
```bash
# Monitor commands in real-time
docker exec {cache-service} redis-cli MONITOR

# Check memory usage
docker exec {cache-service} redis-cli INFO memory

# View connected clients
docker exec {cache-service} redis-cli CLIENT LIST

# Check keyspace statistics
docker exec {cache-service} redis-cli INFO keyspace
```

#### Redis Backups
```bash
# Trigger manual save
docker exec {cache-service} redis-cli BGSAVE

# Check last save time
docker exec {cache-service} redis-cli LASTSAVE

# Copy RDB file
docker cp {cache-service}:/data/dump.rdb ./redis_backup_$(date +%Y%m%d).rdb

# Restore RDB file
docker cp ./redis_backup.rdb {cache-service}:/data/dump.rdb
docker restart {cache-service}
```

## Troubleshooting Guide

### Issue 1: Docker Services Not Starting

**Symptoms**:
- Containers fail to start
- "Error starting userland proxy" messages
- Containers exit immediately

**Diagnosis**:
```bash
# Check container status
docker compose -f docker/docker-compose.dev.yml -p {project} ps

# View container logs
docker logs {db-service}
docker logs {cache-service}

# Check Docker daemon status
docker info
```

**Solutions**:
```bash
# Solution 1: Clean restart
docker compose -f docker/docker-compose.dev.yml -p {project} down
docker compose -f docker/docker-compose.dev.yml -p {project} up -d

# Solution 2: Remove volumes (if data corruption suspected)
docker compose -f docker/docker-compose.dev.yml -p {project} down -v
docker compose -f docker/docker-compose.dev.yml -p {project} up -d

# Solution 3: Restart Docker Desktop
# Quit and restart Docker Desktop application
# Then retry startup

# Solution 4: Clean Docker state
docker system prune -f
docker compose -f docker/docker-compose.dev.yml -p {project} up -d
```

### Issue 2: Port Conflicts

**Symptoms**:
- "Bind for 0.0.0.0:5432 failed: port is already allocated"
- Cannot start containers due to port conflicts

**Diagnosis**:
```bash
# Check what's using the ports
lsof -i :3000  # API port
lsof -i :5432  # PostgreSQL port
lsof -i :6379  # Redis port
lsof -i :5050  # PgAdmin port

# For test environment
lsof -i :5433  # Test PostgreSQL
lsof -i :6380  # Test Redis
```

**Solutions**:
```bash
# Solution 1: Kill conflicting process
# Find PID from lsof output, then:
kill -9 <PID>

# Solution 2: Use test environment (different ports)
docker compose -f docker/docker-compose.test.yml up -d

# Solution 3: Change ports in docker-compose.yml
# Edit docker/docker-compose.dev.yml and change port mappings
# Example: "5433:5432" instead of "5432:5432"
```

### Issue 3: Database Connection Failures

**Symptoms**:
- "Connection refused" errors
- API cannot connect to database
- Prisma errors

**Diagnosis**:
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check PostgreSQL logs
docker logs {db-service}

# Test connection
docker exec {db-service} pg_isready -U {app-name} -d {app-name}

# Verify DATABASE_URL
cat .env | grep DATABASE_URL
```

**Solutions**:
```bash
# Solution 1: Verify DATABASE_URL format
# Development: postgresql://{app-name}:{app-name}@localhost:5432/{app-name}?schema=public
# Test: postgresql://testuser:testpass@localhost:5433/my_test

# Solution 2: Wait for container to be ready
docker compose -f docker/docker-compose.dev.yml -p {project} up -d
sleep 10  # Wait for PostgreSQL to initialize
docker exec {db-service} pg_isready -U {app-name} -d {app-name}

# Solution 3: Recreate container
docker compose -f docker/docker-compose.dev.yml -p {project} down
docker volume rm {project}_postgres_data  # WARNING: destroys data
docker compose -f docker/docker-compose.dev.yml -p {project} up -d

# Solution 4: Check network connectivity
docker exec {api-service} ping {db-service}
```

### Issue 4: Image Caching Issues

**Symptoms**:
- Code changes not reflected in container
- Old dependencies still present
- Build errors after package updates

**Diagnosis**:
```bash
# Check if using bind mounts (development)
docker inspect {api-service} | grep -A 20 Mounts

# Check image build date
docker images | grep {api-service}
```

**Solutions**:
```bash
# For code changes (development mode)
# No action needed - hot-reload via volume mounts
# TypeScript changes are automatically detected

# For dependency changes (package.json modified)
docker compose -f docker/docker-compose.dev.yml -p {project} down
docker compose -f docker/docker-compose.dev.yml -p {project} up -d --build

# For persistent caching issues
docker compose -f docker/docker-compose.dev.yml -p {project} build --no-cache
docker compose -f docker/docker-compose.dev.yml -p {project} up -d

# Nuclear option (complete rebuild)
docker compose -f docker/docker-compose.dev.yml -p {project} down -v
docker system prune -a -f
docker compose -f docker/docker-compose.dev.yml -p {project} up -d --build
```

### Issue 5: Out of Disk Space

**Symptoms**:
- "No space left on device" errors
- Docker refuses to start containers
- Build failures

**Diagnosis**:
```bash
# Check Docker disk usage
docker system df

# Detailed breakdown
docker system df -v

# Check system disk space
df -h
```

**Solutions**:
```bash
# Solution 1: Clean unused resources
docker system prune -f

# Solution 2: Remove unused volumes
docker volume prune -f

# Solution 3: Remove unused images
docker image prune -a -f

# Solution 4: Complete cleanup (WARNING)
docker system prune -a --volumes -f

# Solution 5: Increase Docker disk limit
# Docker Desktop → Settings → Resources → Disk image size
# Increase from default 60GB to higher value

# Solution 6: Remove specific large volumes
docker volume ls
docker volume rm <volume_name>
```

### Issue 6: Test Environment Not Cleaning Up

**Symptoms**:
- Test containers still running after script exits
- Port conflicts when running tests again
- Stale test data

**Diagnosis**:
```bash
# Check for running test containers
docker ps | grep test

# Check for test volumes
docker volume ls | grep test
```

**Solutions**:
```bash
# Solution 1: Manual cleanup
docker compose -f docker/docker-compose.test.yml down -v

# Solution 2: Remove all test volumes
docker volume ls | grep test | awk '{print $2}' | xargs docker volume rm

# Solution 3: Clean all stopped containers and volumes
docker container prune -f
docker volume prune -f

# Solution 4: Verify cleanup in test script
# Check scripts/test-local.sh has proper trap handlers
# Should include: trap cleanup EXIT INT TERM
```

### Issue 7: Slow Container Performance

**Symptoms**:
- Containers running slowly
- High CPU/memory usage
- Slow database queries

**Diagnosis**:
```bash
# Check resource usage
docker stats

# Check container logs for errors
docker logs {api-service} | grep -i error
docker logs {db-service} | grep -i error

# Check database performance
docker exec {db-service} psql -U {app-name} -d {app-name} -c "
  SELECT pid, state, query_start, query
  FROM pg_stat_activity
  WHERE state != 'idle'
  ORDER BY query_start;"
```

**Solutions**:
```bash
# Solution 1: Increase Docker resources
# Docker Desktop → Settings → Resources
# Increase CPUs (recommend 4+) and Memory (recommend 8GB+)

# Solution 2: Optimize PostgreSQL
docker exec {db-service} psql -U {app-name} -d {app-name} -c "VACUUM ANALYZE;"

# Solution 3: Clear Redis cache
docker exec {cache-service} redis-cli FLUSHDB

# Solution 4: Restart containers
docker compose -f docker/docker-compose.dev.yml -p {project} restart

# Solution 5: Check for resource limits in compose file
# Review docker/docker-compose.dev.yml for resource constraints
```

## Security Operations

### Secret Management

#### Development Secrets
```bash
# Generate secure secrets (automated)
node scripts/generate-secrets.js

# What gets generated:
# - JWT_SECRET (64 chars, high entropy)
# - JWT_REFRESH_SECRET (64 chars, high entropy)
# - CHAT_ENCRYPTION_SECRET (64 chars, high entropy)
# - ENCRYPTION_KEY (64 chars, high entropy)

# Verify secrets in .env
cat .env | grep -E "JWT_SECRET|ENCRYPTION"
```

#### Production Secrets
```bash
# Use external secret management (recommended)
# - AWS Secrets Manager
# - HashiCorp Vault
# - Azure Key Vault

# Example with Docker secrets
docker secret create jwt_secret jwt_secret.txt
docker secret create db_password db_password.txt

# Reference in docker-compose.prod.yml
services:
  api:
    secrets:
      - jwt_secret
      - db_password
```

### Container Security

#### Non-Root User Enforcement
```dockerfile
# All containers run as non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001
USER nestjs
```

#### Security Scanning
```bash
# Scan images for vulnerabilities
docker scan {api-service}:latest

# Check for outdated base images
docker images | grep node

# Update base images
docker pull node:24-alpine
docker compose -f docker/docker-compose.dev.yml build
```

### Network Security

#### Internal Network Isolation
```yaml
# Production: Services communicate on private network
# Only nginx exposed externally on 80/443
networks:
  {app-name}-network:
    driver: bridge
    internal: false  # Only nginx connects externally
```

#### Database Access Control
```bash
# PostgreSQL: Password authentication required
# Redis: Password protection in production

# Verify PostgreSQL auth
docker exec {db-service} cat /var/lib/postgresql/data/pg_hba.conf
```

## Best Practices

### DO
- ✅ Always use `-p {project}` with docker-compose commands
- ✅ Run `npm run docker:setup` for first-time setup (handles secrets, migrations)
- ✅ Use automated scripts (`npm run test:local`) instead of manual Docker commands
- ✅ Let scripts handle cleanup (test-local.sh has trap handlers)
- ✅ Check container logs when debugging: `docker logs <container-name>`
- ✅ Run `npm run test:local` before committing to verify database integration
- ✅ Use test environment (ports 5433/6380) for isolated testing
- ✅ Create backups before major migrations or schema changes
- ✅ Monitor resource usage with `docker stats`
- ✅ Use `docker compose ps` to verify health checks

### DON'T
- ❌ Don't manually stop containers during test execution
- ❌ Don't modify test database manually (let Prisma migrations handle schema)
- ❌ Don't run tests against dev database (use isolated test environment)
- ❌ Don't commit .env files with real secrets
- ❌ Don't install packages in NX app subdirs (NX monorepo - install at root)
- ❌ Don't use `docker-compose` (deprecated) - use `docker compose` (v2)
- ❌ Don't run production containers without resource limits
- ❌ Don't expose PostgreSQL/Redis ports externally in production
- ❌ Don't skip health checks when deploying

## Additional Resources

### Documentation
- **Primary**: `/docker/DOCKER-INFRASTRUCTURE.md` - Complete 2,887-line guide
- **Main Guide**: `/CLAUDE.md` - Development workflow integration

### Helper Scripts
- `scripts/setup-docker-environment.sh` - Automated development setup
- `scripts/test-local.sh` - Test orchestration with cleanup
- `scripts/generate-secrets.js` - Secure secret generation

### Port Reference
```
Development:
3000  - API
5432  - PostgreSQL
6379  - Redis
5050  - PgAdmin
8082  - Redis Commander

Test (non-conflicting):
5433  - PostgreSQL Test
6380  - Redis Test

Production:
80    - Nginx HTTP
443   - Nginx HTTPS
3000  - API (internal)
5432  - PostgreSQL (internal)
6379  - Redis (internal)
9090  - Prometheus
3001  - Grafana
9200  - Elasticsearch
5601  - Kibana
```

## When to Use This Skill

Invoke this skill for:
- Docker environment setup and configuration
- Service administration (start, stop, restart, health checks)
- Database operations (backups, restores, migrations)
- Troubleshooting connection issues, port conflicts, performance problems
- Security operations (secret management, container security)
- Monitoring and resource management
- Production deployment guidance

**Quick Start**: Ask "How do I set up the Docker development environment?" or "My PostgreSQL container won't start" or "How do I backup the database?"
