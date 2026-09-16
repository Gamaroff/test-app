---
name: railway-postgres-crud
description: >
  Look up, create, update, and delete rows in Railway-hosted PostgreSQL databases.
  Use this skill whenever the user wants to query the Railway database, delete a
  user, remove test data, clean up staging, look up an entity, insert or update
  rows, or perform any direct SQL operation against staging or production. Also
  use when the user says "go direct to the Railway db", "delete from staging",
  "remove from the live environment", "look up user in staging/production",
  or "run SQL against Railway".
type: project
---

# Railway PostgreSQL CRUD

Safely look up, insert, update, and delete entities in a Railway-hosted PostgreSQL database.
No `psql` required — uses the project's own `node_modules/pg`.

This skill is **project-agnostic**. It discovers service names, connection
strings, and schema structure at runtime from the linked Railway project and
the local Prisma schema (or `information_schema` if Prisma is not used).

---

## Safety rules

1. **Staging is always the default.** Never target production unless the user explicitly says "production".
2. **Production requires confirmation.** State the action and its effect, then ask the user before executing any `INSERT`, `UPDATE`, or `DELETE` against production.
3. **Look up before mutating.** Always run a `SELECT` first and show the user the affected rows before any write operation.
4. **Verify after mutating.** Run a follow-up `SELECT` after every write to confirm the expected outcome.
5. **Protect system data in production.** Identify seed/system tables by reading the seed files and never delete from them in production.

---

## Step 1 — Discover the environment

Before any operation, establish which Railway project you are working with and
what services exist.

### 1a. Check Railway context

```bash
railway status          # linked project and environment
railway whoami          # authenticated user and workspace
```

### 1b. List services to find the database

```bash
railway service list --json
```

Or use the MCP tool:
```
mcp__railway-mcp-server__list-services
  workspacePath: <project root>
```

Look for a service whose name indicates a database (e.g. `Postgres`,
`PostgreSQL`, `postgres-db`). This is the service that holds the
`DATABASE_PUBLIC_URL` variable.

### 1c. Get the public connection string

The `DATABASE_URL` on app services uses Railway's internal hostname
(`*.railway.internal`) which is **not reachable** from outside Railway.
Always read `DATABASE_PUBLIC_URL` from the **database service**, not the app
service.

**Via MCP (preferred):**
```
mcp__railway-mcp-server__list-variables
  workspacePath: <project root>
  environment: staging
  service: <database service name from 1b>
```

**Via CLI:**
```bash
railway variable list -e staging -s <database-service> --json \
  | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.DATABASE_PUBLIC_URL)"
```

---

## Step 2 — Discover the schema

Read the Prisma schema to learn what tables exist, their columns, lookup
fields, and cascade behaviour. To find the schema:
```bash
find . -name "schema.prisma" -not -path "*/node_modules/*" -not -path "*/generated/*"
```

**If the project does not use Prisma**, query `information_schema` directly
after connecting (Step 3):
```sql
-- List all tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- List columns for a table
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '<table>';
-- List foreign keys and their ON DELETE behaviour
SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table,
       rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = '<parent_table>';
```

When reading the schema (Prisma or `information_schema`), note for each model:
- **Table name**: the `@@map("table_name")` directive, or the model name in
  snake_case if no `@@map` is present.
- **Unique/lookup fields**: fields with `@unique` or `@id` — these are what
  you will use in `WHERE` clauses (e.g. `email`, `name`, `handle`, `token`).
- **Cascade behaviour**: the `onDelete` argument on `@relation` fields.
  Categorise every relation to the target model into one of three buckets:
  1. **Cascade** (`onDelete: Cascade`) — child row is auto-deleted when the
     parent is deleted. No action required.
  2. **SetNull** (`onDelete: SetNull`) — the FK column is set to NULL but the
     child row stays. May need manual cleanup after deletion.
  3. **Restrict / absent** (no `onDelete` directive, or `onDelete: Restrict`)
     — the parent **cannot be deleted** while these child rows exist. You
     **must** delete or reassign these rows before deleting the parent.
- **Unmanaged FK columns**: some tables may have columns like `userId` with
  **no `@relation` directive** in the Prisma schema. These are not enforced by
  DB-level foreign keys — rows will be silently orphaned after deletion and
  may need manual cleanup.

**Tip:** search the schema for all `@relation` directives that reference the
target model. Group them by their `onDelete` value to build the three-bucket
list before performing any deletion.

---

## Step 3 — Connect and run SQL

Use the project-local `pg` package. It is already installed in most
NestJS + Prisma projects. If it is missing, install it temporarily:
```bash
npm install pg
```
Always include `ssl: { rejectUnauthorized: false }` for Railway's TCP proxy.

**Always use parameterised queries** (`$1`, `$2`, …) — never interpolate
user-supplied values into SQL strings. String interpolation is vulnerable to
SQL injection.

**Template (copy-paste and fill in the SQL):**
```bash
node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: '<DATABASE_PUBLIC_URL from Step 1c>',
  ssl: { rejectUnauthorized: false }
});
async function run() {
  await client.connect();

  // --- SQL goes here ---

  await client.end();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
" 2>&1 | grep -v "^Node Version" | grep -v "^Note:" | grep -E "."
```

The trailing `grep` filters out the nvm banner noise that appears when node
runs under nvm.

---

## Common operations

### Look up an entity

```js
const r = await client.query(
  'SELECT * FROM <table> WHERE <field> = $1',
  ['<value>']
);
console.log(JSON.stringify(r.rows, null, 2));
```

For broader searches, use `LIKE` or list multiple rows:

```js
const r = await client.query(
  'SELECT id, <columns> FROM <table> WHERE <field> LIKE $1 ORDER BY "createdAt" DESC LIMIT 20',
  ['%pattern%']
);
console.log(JSON.stringify(r.rows, null, 2));
```

### Insert a row

Read the schema first to identify required columns (non-nullable, no default)
and auto-generated columns (UUIDs, timestamps) that should be omitted.

```js
// 1. Insert
const r = await client.query(
  'INSERT INTO <table> (<col1>, <col2>) VALUES ($1, $2) RETURNING *',
  ['value1', 'value2']
);
console.log('Inserted:', JSON.stringify(r.rows[0]));

// 2. Verify
const check = await client.query('SELECT * FROM <table> WHERE id = $1', [r.rows[0].id]);
console.log('Verified:', JSON.stringify(check.rows[0]));
```

To avoid duplicates on a unique column, use `ON CONFLICT`:

```js
const r = await client.query(
  `INSERT INTO <table> (<col1>, <col2>) VALUES ($1, $2)
   ON CONFLICT (<unique_column>) DO NOTHING
   RETURNING *`,
  ['value1', 'value2']
);
if (r.rows.length === 0) { console.log('Already exists.'); return; }
console.log('Inserted:', JSON.stringify(r.rows[0]));
```

### Insert or update (upsert)

```js
const r = await client.query(
  `INSERT INTO <table> (<col1>, <col2>) VALUES ($1, $2)
   ON CONFLICT (<unique_column>) DO UPDATE SET <col2> = EXCLUDED.<col2>
   RETURNING *`,
  ['value1', 'value2']
);
console.log('Upserted:', JSON.stringify(r.rows[0]));
```

### Update a row

```js
// 1. Lookup to confirm the row exists and show current state
const found = await client.query('SELECT * FROM <table> WHERE <field> = $1', ['<value>']);
if (found.rows.length === 0) { console.log('Not found.'); return; }
console.log('Before:', JSON.stringify(found.rows[0]));

// 2. Update
const u = await client.query(
  'UPDATE <table> SET <column> = $1 WHERE id = $2 RETURNING *',
  ['new_value', found.rows[0].id]
);
console.log('After:', JSON.stringify(u.rows[0]));
```

To update multiple columns:

```js
const u = await client.query(
  'UPDATE <table> SET <col1> = $1, <col2> = $2 WHERE id = $3 RETURNING *',
  ['val1', 'val2', id]
);
console.log('Updated:', JSON.stringify(u.rows[0]));
```

### Delete an entity by a unique field

**Pattern — always three steps: lookup, delete, verify.**

```js
// 1. Lookup
const found = await client.query(
  'SELECT id, <display_columns> FROM <table> WHERE <field> = $1',
  ['<value>']
);
if (found.rows.length === 0) { console.log('Not found.'); return; }
console.log('Found:', JSON.stringify(found.rows));

// 2. Delete
const del = await client.query('DELETE FROM <table> WHERE id = $1', [found.rows[0].id]);
console.log('Deleted:', del.rowCount);

// 3. Verify
const check = await client.query('SELECT COUNT(*) FROM <table> WHERE <field> = $1', ['<value>']);
console.log('Remaining:', check.rows[0].count);
```

### Delete a parent entity (has child tables)

When deleting an entity that other tables reference via foreign keys, the
delete **will fail** if any child table uses `Restrict` (or has no `onDelete`
directive). Follow the four-phase approach below.

#### Phase 1 — Discover

Using the schema discovery from Step 2, categorise every relation pointing to
the target model into the three buckets (Cascade / SetNull / Restrict) plus
any unmanaged FK columns.

#### Phase 2 — Pre-delete (Restrict tables)

For each Restrict-FK table found in Phase 1, delete or reassign child rows
**before** attempting the parent delete:

```js
// For each table with Restrict FK to the target entity:
await client.query('DELETE FROM <restrict_table> WHERE "<fk_column>" = $1', [id]);
// If the table has multiple FK columns to the same parent:
await client.query(
  'DELETE FROM <restrict_table> WHERE "<fk_col_1>" = $1 OR "<fk_col_2>" = $1',
  [id]
);
```

If skipping this phase, the DELETE in Phase 3 will fail with a foreign key
constraint error.

#### Phase 3 — Delete

```js
// Cascade child rows are handled automatically
const d = await client.query('DELETE FROM <table> WHERE id = $1', [id]);
console.log('Deleted:', d.rowCount);
```

#### Phase 4 — Post-delete cleanup (only if needed)

- **SetNull tables** — the row stays with a null FK. To free a resource for
  reuse: `DELETE FROM <table> WHERE <column> = $1`
- **Unmanaged FK tables** — orphaned rows with stale IDs remain. Only clean
  in staging if a completely clean slate is needed.

### Delete a standalone entity (no children)

Entities with no child tables don't need the four-phase approach, but the
safety rules still apply — lookup first, delete, then verify:

```js
// 1. Lookup
const found = await client.query('SELECT * FROM <table> WHERE <field> = $1', ['<value>']);
if (found.rows.length === 0) { console.log('Not found.'); return; }
console.log('Found:', JSON.stringify(found.rows));

// 2. Delete
const d = await client.query('DELETE FROM <table> WHERE id = $1', [found.rows[0].id]);
console.log('Deleted:', d.rowCount);

// 3. Verify
const check = await client.query('SELECT COUNT(*) FROM <table> WHERE <field> = $1', ['<value>']);
console.log('Remaining:', check.rows[0].count);
```

### Bulk cleanup by timestamp

Delete all rows from a table created after a given date. **Staging only.**
Use the actual timestamp column name from the schema (commonly `"createdAt"`,
`created_at`, or similar).

```js
// 1. Preview what will be deleted
const preview = await client.query(
  'SELECT COUNT(*) FROM <table> WHERE "<timestamp_column>" > $1',
  ['2026-03-01T00:00:00Z']
);
console.log('Rows to delete:', preview.rows[0].count);

// 2. Delete
const d = await client.query(
  'DELETE FROM <table> WHERE "<timestamp_column>" > $1',
  ['2026-03-01T00:00:00Z']
);
console.log('Deleted:', d.rowCount);

// 3. Verify
const after = await client.query(
  'SELECT COUNT(*) FROM <table> WHERE "<timestamp_column>" > $1',
  ['2026-03-01T00:00:00Z']
);
console.log('Remaining:', after.rows[0].count);
```

Narrow by a specific column value:

```js
const d = await client.query(
  'DELETE FROM <table> WHERE <field> LIKE $1 AND "<timestamp_column>" > $2',
  ['%pattern%', '2026-01-01T00:00:00Z']
);
console.log('Deleted:', d.rowCount);
```

---

## How to identify system vs test data

System data is seeded at environment provisioning time and must not be deleted
in production. To find what is system data:

1. Locate the seed files (typically alongside the Prisma schema):
   ```bash
   find . -name "seed*.ts" -path "*/prisma/*" -not -path "*/node_modules/*"
   ```
2. System seeds use `upsert` with `update: {}` — this makes them idempotent
   and re-runnable. The tables they write to are system tables.
3. Test/dev seeds create sample data and are **not safe for production**.

**Rule of thumb**: if a table's rows are created by a system seed file, treat
it as system data in production (look up only, never delete).

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `getaddrinfo ENOTFOUND postgres.railway.internal` | Using internal URL from outside Railway | Use `DATABASE_PUBLIC_URL` from the Postgres service, not `DATABASE_URL` from the app service |
| `self signed certificate` or SSL error | Missing SSL config | Add `ssl: { rejectUnauthorized: false }` to the Client constructor |
| `Cannot find module 'pg'` | Not in project root | `cd` to the project root where `node_modules/pg` exists |
| nvm banner floods the output | nvm prints help text on every node invocation | Pipe through `grep -v "^Node Version" \| grep -E "."` |
| Delete fails with FK constraint | Child table has `Restrict` or no `onDelete` | Delete children first, then the parent. Read the schema to find the blocking relation |
