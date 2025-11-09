## Wizzle

Wizzle is an experimental fork of Drizzle Kit - a CLI migrator tool for Drizzle ORM. It is probably the one and only tool that lets you completely automatically generate SQL migrations and covers ~95% of the common cases like deletions and renames by prompting user input.

**Note**: This is a custom fork for experimental modifications. For the official version, see [drizzle-kit](https://github.com/drizzle-team/drizzle-orm).

## Documentation

Check the full documentation for Drizzle Kit on [the website](https://orm.drizzle.team/kit-docs/overview).

### How it works

Wizzle traverses a schema module and generates a snapshot to compare with the previous version, if there is one.
Based on the difference, it will generate all needed SQL migrations. If there are any cases that can't be resolved automatically, such as renames, it will prompt the user for input.

For example, for this schema module:

```typescript
// src/db/schema.ts

import { integer, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";

const users = pgTable("users", {
    id: serial("id").primaryKey(),
    fullName: varchar("full_name", { length: 256 }),
  }, (table) => ({
    nameIdx: index("name_idx", table.fullName),
  })
);

export const authOtp = pgTable("auth_otp", {
  id: serial("id").primaryKey(),
  phone: varchar("phone", { length: 256 }),
  userId: integer("user_id").references(() => users.id),
});
```

It will generate:

```SQL
CREATE TABLE IF NOT EXISTS auth_otp (
 "id" SERIAL PRIMARY KEY,
 "phone" character varying(256),
 "user_id" INT
);

CREATE TABLE IF NOT EXISTS users (
 "id" SERIAL PRIMARY KEY,
 "full_name" character varying(256)
);

DO $$ BEGIN
 ALTER TABLE auth_otp ADD CONSTRAINT auth_otp_user_id_fkey FOREIGN KEY ("user_id") REFERENCES users(id);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS users_full_name_index ON users (full_name);
```

### Installation & configuration

```shell
npm install -D wizzle-cli
```

Running with CLI options:

```jsonc
// package.json
{
 "scripts": {
  "generate": "wizzle-cli generate --out migrations-folder --schema src/db/schema.ts"
 }
}
```

```shell
npm run generate
```

## Runtime Migrations

Wizzle provides runtime migrators that work with snapshot chains instead of journal files. This makes wizzle fully independent from drizzle-orm's migration system.

### Migration Structure

Wizzle uses a folder-based migration structure where each migration is self-contained:

```
migrations/
├── 1700000000000_initial_setup/
│   ├── up.sql
│   └── snapshot.json
└── 1700000001000_add_users/
    ├── up.sql
    └── snapshot.json
```

Each migration folder contains:
- `up.sql` - The SQL statements to apply
- `snapshot.json` - Complete schema snapshot with metadata and `prevId` chain reference

### How it works

Unlike drizzle-orm's runtime migrator which relies on `_journal.json`, wizzle's runtime migrator:
- Uses snapshot chains to determine migration order by following `prevId` references in each snapshot
- Each migration is self-contained in its own folder
- Reads migration metadata directly from snapshot files
- Provides detailed logging for each migration being applied
- Maintains the same external API as drizzle-orm for easy migration

### Installation

```bash
npm install wizzle-cli drizzle-orm
```

### Usage

Import the migrator for your database driver and call it with your drizzle database instance:

#### PostgreSQL (node-postgres)

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'wizzle-cli/migrator/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// Run migrations
await migrate(db, { migrationsFolder: './drizzle' });
```

#### PostgreSQL (postgres.js)

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'wizzle-cli/migrator/postgres-js';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(sql);

await migrate(db, { migrationsFolder: './drizzle' });
```

#### MySQL (mysql2)

```typescript
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'wizzle-cli/migrator/mysql2';
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

await migrate(db, { migrationsFolder: './drizzle' });
```

#### SQLite (better-sqlite3)

```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'wizzle-cli/migrator/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('sqlite.db');
const db = drizzle(sqlite);

await migrate(db, { migrationsFolder: './drizzle' });
```

#### SQLite (libsql)

```typescript
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'wizzle-cli/migrator/libsql';
import { createClient } from '@libsql/client';

const client = createClient({ url: 'file:local.db' });
const db = drizzle(client);

await migrate(db, { migrationsFolder: './drizzle' });
```

### Supported Drivers

Wizzle supports all major database drivers:

#### PostgreSQL
- `wizzle-cli/migrator/node-postgres` - node-postgres (pg)
- `wizzle-cli/migrator/postgres-js` - postgres.js
- `wizzle-cli/migrator/neon-serverless` - Neon serverless
- `wizzle-cli/migrator/neon-http` - Neon HTTP
- `wizzle-cli/migrator/pglite` - PGlite
- `wizzle-cli/migrator/pg-proxy` - PostgreSQL proxy
- `wizzle-cli/migrator/vercel-postgres` - Vercel Postgres
- `wizzle-cli/migrator/xata-http` - Xata HTTP
- `wizzle-cli/migrator/aws-data-api-pg` - AWS Data API for PostgreSQL

#### MySQL
- `wizzle-cli/migrator/mysql2` - mysql2
- `wizzle-cli/migrator/mysql-proxy` - MySQL proxy
- `wizzle-cli/migrator/planetscale-serverless` - PlanetScale serverless
- `wizzle-cli/migrator/tidb-serverless` - TiDB serverless

#### SQLite
- `wizzle-cli/migrator/better-sqlite3` - better-sqlite3
- `wizzle-cli/migrator/libsql` - libSQL
- `wizzle-cli/migrator/bun-sqlite` - Bun SQLite
- `wizzle-cli/migrator/bun-sql` - Bun SQL
- `wizzle-cli/migrator/sqlite-proxy` - SQLite proxy
- `wizzle-cli/migrator/sql-js` - sql.js
- `wizzle-cli/migrator/d1` - Cloudflare D1
- `wizzle-cli/migrator/durable-sqlite` - Durable SQLite
- `wizzle-cli/migrator/expo-sqlite` - Expo SQLite
- `wizzle-cli/migrator/op-sqlite` - OP SQLite

#### SingleStore
- `wizzle-cli/migrator/singlestore` - SingleStore
- `wizzle-cli/migrator/singlestore-proxy` - SingleStore proxy

### Migration Configuration

The `migrate` function accepts a configuration object:

```typescript
interface MigrationConfig {
  migrationsFolder: string;      // Path to migrations folder (required)
  migrationsTable?: string;       // Custom migrations table name (default: "__drizzle_migrations")
  migrationsSchema?: string;      // Schema for migrations table (PostgreSQL only)
}
```

Example with custom configuration:

```typescript
await migrate(db, {
  migrationsFolder: './drizzle',
  migrationsTable: 'my_migrations',
  migrationsSchema: 'public', // PostgreSQL only
});
```

### Migration Logging

Wizzle provides detailed logging during migration:

```
Applying 3 migration(s)...
  [1/3] 1234567890_bold_thor
  [2/3] 1234567891_brave_loki
  [3/3] 1234567892_wise_odin
✓ 3 migration(s) applied successfully in 145ms
```

### Migrating from drizzle-orm migrators

If you're currently using drizzle-orm's runtime migrators, switching to wizzle is straightforward:

**Before (drizzle-orm):**
```typescript
import { migrate } from 'drizzle-orm/node-postgres/migrator';
```

**After (wizzle):**
```typescript
import { migrate } from 'wizzle-cli/migrator/node-postgres';
```

The API remains identical - only the import path changes.

**Note on Migration Structure:** Wizzle uses a different folder structure than drizzle-kit:
- **drizzle-kit:** Flat structure with `meta/` folder containing snapshots
- **wizzle:** Folder per migration containing `up.sql` and `snapshot.json`

If migrating from drizzle-kit, you'll need to manually restructure your migrations to the new folder-based format.
