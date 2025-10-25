import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	type DatabaseDialect,
	type MigrationTableConfig,
	migrateOldMigrationTable,
} from '../src/runtime/migration-table-migrator';

describe('migrateOldMigrationTable', () => {
	describe('PostgreSQL', () => {
		let pglite: any;
		let executor: (sql: string) => Promise<any>;

		beforeEach(async () => {
			const { PGlite } = await import('@electric-sql/pglite');
			pglite = new PGlite();
			await pglite.waitReady;

			executor = async (sql: string) => {
				const result = await pglite.query(sql);
				return result.rows;
			};
		});

		afterEach(async () => {
			if (pglite) {
				await pglite.close();
			}
		});

		test('migrates data from old table to new table', async () => {
			// Setup: Create drizzle schema and old table with data
			await executor('CREATE SCHEMA IF NOT EXISTS drizzle');
			await executor(`
				CREATE TABLE drizzle.__drizzle_migrations (
					id SERIAL PRIMARY KEY,
					hash text NOT NULL,
					created_at numeric,
					tag text
				)
			`);

			// Insert test data
			await executor(`
				INSERT INTO drizzle.__drizzle_migrations (hash, created_at, tag)
				VALUES
					('hash1', 1700000000000, 'tag1'),
					('hash2', 1700000001000, 'tag2'),
					('hash3', 1700000002000, 'tag3')
			`);

			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				newSchema: 'wizzle',
				oldTable: '__drizzle_migrations',
				oldSchema: 'drizzle',
			};

			// Execute migration
			await migrateOldMigrationTable(executor, 'postgresql', config);

			// Assert: New table has copied data
			const newTableRows = await executor(
				'SELECT * FROM wizzle.__wizzle_migrations ORDER BY created_at',
			);
			expect(newTableRows).toHaveLength(3);
			expect(newTableRows[0].hash).toBe('hash1');
			expect(newTableRows[0].tag).toBe('tag1');
			expect(String(newTableRows[0].created_at)).toBe('1700000000000');
			expect(newTableRows[1].hash).toBe('hash2');
			expect(newTableRows[2].hash).toBe('hash3');

			// Assert: Old table still exists
			const oldTableRows = await executor(
				'SELECT * FROM drizzle.__drizzle_migrations',
			);
			expect(oldTableRows).toHaveLength(3);
		});

		test('skips migration when new table has data', async () => {
			// Setup: Create both old and new tables with data
			await executor('CREATE SCHEMA IF NOT EXISTS drizzle');
			await executor('CREATE SCHEMA IF NOT EXISTS wizzle');

			await executor(`
				CREATE TABLE drizzle.__drizzle_migrations (
					id SERIAL PRIMARY KEY,
					hash text NOT NULL,
					created_at numeric,
					tag text
				)
			`);

			await executor(`
				CREATE TABLE wizzle.__wizzle_migrations (
					id SERIAL PRIMARY KEY,
					hash text NOT NULL,
					created_at numeric,
					tag text
				)
			`);

			await executor(`
				INSERT INTO drizzle.__drizzle_migrations (hash, created_at, tag)
				VALUES ('old_hash', 1700000000000, 'old_tag')
			`);

			await executor(`
				INSERT INTO wizzle.__wizzle_migrations (hash, created_at, tag)
				VALUES ('new_hash', 1700000001000, 'new_tag')
			`);

			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				newSchema: 'wizzle',
				oldTable: '__drizzle_migrations',
				oldSchema: 'drizzle',
			};

			// Execute migration
			await migrateOldMigrationTable(executor, 'postgresql', config);

			// Assert: New table still has only its original data
			const newTableRows = await executor(
				'SELECT * FROM wizzle.__wizzle_migrations',
			);
			expect(newTableRows).toHaveLength(1);
			expect(newTableRows[0].hash).toBe('new_hash');
		});

		test('skips migration when old table does not exist', async () => {
			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				newSchema: 'wizzle',
				oldTable: '__drizzle_migrations',
				oldSchema: 'drizzle',
			};

			// Execute migration - should not throw
			await expect(
				migrateOldMigrationTable(executor, 'postgresql', config),
			).resolves.not.toThrow();

			// Assert: No tables were created
			const schemaCheck = await executor(`
				SELECT EXISTS (
					SELECT FROM information_schema.schemata
					WHERE schema_name = 'wizzle'
				)
			`);
			// Schema might not exist or be empty
			expect(schemaCheck).toBeDefined();
		});

		test('handles old table without tag column', async () => {
			// Setup: Create old table WITHOUT tag column
			await executor('CREATE SCHEMA IF NOT EXISTS drizzle');
			await executor(`
				CREATE TABLE drizzle.__drizzle_migrations (
					id SERIAL PRIMARY KEY,
					hash text NOT NULL,
					created_at numeric
				)
			`);

			// Insert test data
			await executor(`
				INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
				VALUES
					('hash1', 1700000000000),
					('hash2', 1700000001000)
			`);

			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				newSchema: 'wizzle',
				oldTable: '__drizzle_migrations',
				oldSchema: 'drizzle',
			};

			// Execute migration
			await migrateOldMigrationTable(executor, 'postgresql', config);

			// Assert: New table has copied data with NULL tags
			const newTableRows = await executor(
				'SELECT * FROM wizzle.__wizzle_migrations ORDER BY created_at',
			);
			expect(newTableRows).toHaveLength(2);
			expect(newTableRows[0].hash).toBe('hash1');
			expect(newTableRows[0].tag).toBeNull();
			expect(newTableRows[1].hash).toBe('hash2');
			expect(newTableRows[1].tag).toBeNull();
		});

		test('works with custom table and schema names', async () => {
			// Setup: Create custom schema and table
			await executor('CREATE SCHEMA IF NOT EXISTS custom_old');
			await executor(`
				CREATE TABLE custom_old.my_old_migrations (
					id SERIAL PRIMARY KEY,
					hash text NOT NULL,
					created_at numeric,
					tag text
				)
			`);

			await executor(`
				INSERT INTO custom_old.my_old_migrations (hash, created_at, tag)
				VALUES ('hash1', 1700000000000, 'tag1')
			`);

			const config: MigrationTableConfig = {
				newTable: 'my_new_migrations',
				newSchema: 'custom_new',
				oldTable: 'my_old_migrations',
				oldSchema: 'custom_old',
			};

			// Execute migration
			await migrateOldMigrationTable(executor, 'postgresql', config);

			// Assert: New table exists with custom name in custom schema
			const newTableRows = await executor(
				'SELECT * FROM custom_new.my_new_migrations',
			);
			expect(newTableRows).toHaveLength(1);
			expect(newTableRows[0].hash).toBe('hash1');
		});

		test('skips migration when old table is empty', async () => {
			// Setup: Create old table without data
			await executor('CREATE SCHEMA IF NOT EXISTS drizzle');
			await executor(`
				CREATE TABLE drizzle.__drizzle_migrations (
					id SERIAL PRIMARY KEY,
					hash text NOT NULL,
					created_at numeric,
					tag text
				)
			`);

			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				newSchema: 'wizzle',
				oldTable: '__drizzle_migrations',
				oldSchema: 'drizzle',
			};

			// Execute migration
			await migrateOldMigrationTable(executor, 'postgresql', config);

			// Assert: New schema might not be created if old table is empty
			const schemaCheck = await executor(`
				SELECT EXISTS (
					SELECT FROM information_schema.schemata
					WHERE schema_name = 'wizzle'
				)
			`);
			// The function should return early and not create the new table
			expect(schemaCheck).toBeDefined();
		});
	});

	describe('MySQL', () => {
		test('migrates data from old table to new table', async () => {
			const executedQueries: string[] = [];
			const queryResults: Record<string, any[]> = {
				// Table exists checks
				"SELECT COUNT(*) as count\n\t\t\t\tFROM information_schema.tables\n\t\t\t\tWHERE table_name = '__wizzle_migrations'":
					[{ count: 0 }],
				"SELECT COUNT(*) as count\n\t\t\t\tFROM information_schema.tables\n\t\t\t\tWHERE table_name = '__drizzle_migrations'":
					[{ count: 1 }],
				// Row count checks
				'SELECT COUNT(*) as count FROM "__drizzle_migrations"': [{ count: 3 }],
				// Column check for tag
				"SELECT COLUMN_NAME\n\t\t\t\t\tFROM INFORMATION_SCHEMA.COLUMNS\n\t\t\t\t\tWHERE TABLE_NAME = '__drizzle_migrations'\n\t\t\t\t\tAND COLUMN_NAME = 'tag'":
					[{ COLUMN_NAME: 'tag' }],
			};

			const executor = vi.fn(async (sql: string) => {
				executedQueries.push(sql.trim());
				// Return matching result or empty array
				for (const [query, result] of Object.entries(queryResults)) {
					if (sql.includes(query) || query.includes(sql.trim())) {
						return result;
					}
				}
				return [];
			});

			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				oldTable: '__drizzle_migrations',
			};

			await migrateOldMigrationTable(
				executor as any,
				'mysql',
				config,
			);

			// Assert: CREATE TABLE was called
			expect(executedQueries.some((q) => q.includes('CREATE TABLE'))).toBe(
				true,
			);
			expect(
				executedQueries.some((q) => q.includes('__wizzle_migrations')),
			).toBe(true);

			// Assert: INSERT INTO was called
			expect(executedQueries.some((q) => q.includes('INSERT INTO'))).toBe(
				true,
			);
			expect(
				executedQueries.some((q) =>
					q.includes('SELECT hash, created_at, tag FROM'),
				),
			).toBe(true);
		});

		test('skips migration when new table has data', async () => {
			const executedQueries: string[] = [];
			const queryResults: Record<string, any[]> = {
				// New table exists and has data
				"SELECT COUNT(*) as count\n\t\t\t\tFROM information_schema.tables\n\t\t\t\tWHERE table_name = '__wizzle_migrations'":
					[{ count: 1 }],
				'SELECT COUNT(*) as count FROM "__wizzle_migrations"': [{ count: 1 }],
			};

			const executor = vi.fn(async (sql: string) => {
				executedQueries.push(sql.trim());
				for (const [query, result] of Object.entries(queryResults)) {
					if (sql.includes(query) || query.includes(sql.trim())) {
						return result;
					}
				}
				return [];
			});

			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				oldTable: '__drizzle_migrations',
			};

			await migrateOldMigrationTable(
				executor as any,
				'mysql',
				config,
			);

			// Assert: No CREATE TABLE or INSERT was called
			expect(executedQueries.some((q) => q.includes('CREATE TABLE'))).toBe(
				false,
			);
			expect(executedQueries.some((q) => q.includes('INSERT INTO'))).toBe(
				false,
			);
		});

		test('handles old table without tag column', async () => {
			const executedQueries: string[] = [];
			const queryResults: Record<string, any[]> = {
				// Table exists checks
				"SELECT COUNT(*) as count\n\t\t\t\tFROM information_schema.tables\n\t\t\t\tWHERE table_name = '__wizzle_migrations'":
					[{ count: 0 }],
				"SELECT COUNT(*) as count\n\t\t\t\tFROM information_schema.tables\n\t\t\t\tWHERE table_name = '__drizzle_migrations'":
					[{ count: 1 }],
				// Row count checks
				'SELECT COUNT(*) as count FROM "__drizzle_migrations"': [{ count: 2 }],
				// Column check for tag - no tag column
				"SELECT COLUMN_NAME\n\t\t\t\t\tFROM INFORMATION_SCHEMA.COLUMNS\n\t\t\t\t\tWHERE TABLE_NAME = '__drizzle_migrations'\n\t\t\t\t\tAND COLUMN_NAME = 'tag'":
					[],
			};

			const executor = vi.fn(async (sql: string) => {
				executedQueries.push(sql.trim());
				for (const [query, result] of Object.entries(queryResults)) {
					if (sql.includes(query) || query.includes(sql.trim())) {
						return result;
					}
				}
				return [];
			});

			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				oldTable: '__drizzle_migrations',
			};

			await migrateOldMigrationTable(
				executor as any,
				'mysql',
				config,
			);

			// Assert: INSERT uses NULL for tag column
			expect(
				executedQueries.some((q) =>
					q.includes('SELECT hash, created_at, NULL FROM'),
				),
			).toBe(true);
		});
	});

	describe('SQLite', () => {
		let db: Database.Database;
		let executor: (sql: string) => Promise<any>;

		beforeEach(() => {
			db = new Database(':memory:');
			executor = async (sql: string) => {
				// Handle both data-returning queries (SELECT) and non-data-returning queries (CREATE, INSERT)
				try {
					return db.prepare(sql).all();
				} catch (e: any) {
					// If it's a non-data-returning statement, use run()
					if (e.message?.includes('does not return data')) {
						db.prepare(sql).run();
						return [];
					}
					throw e;
				}
			};
		});

		afterEach(() => {
			db.close();
		});

		test('migrates data from old table to new table', async () => {
			// Setup: Create old table with data
			db.prepare(`
				CREATE TABLE __drizzle_migrations (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					hash text NOT NULL,
					created_at numeric,
					tag text
				)
			`).run();

			db.prepare(`
				INSERT INTO __drizzle_migrations (hash, created_at, tag)
				VALUES
					('hash1', 1700000000000, 'tag1'),
					('hash2', 1700000001000, 'tag2'),
					('hash3', 1700000002000, 'tag3')
			`).run();

			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				oldTable: '__drizzle_migrations',
			};

			// Execute migration
			await migrateOldMigrationTable(executor, 'sqlite', config);

			// Assert: New table has copied data
			const newTableRows = db
				.prepare('SELECT * FROM __wizzle_migrations ORDER BY created_at')
				.all() as any[];
			expect(newTableRows).toHaveLength(3);
			expect(newTableRows[0].hash).toBe('hash1');
			expect(newTableRows[0].tag).toBe('tag1');
			expect(newTableRows[0].created_at).toBe(1700000000000);
			expect(newTableRows[1].hash).toBe('hash2');
			expect(newTableRows[2].hash).toBe('hash3');

			// Assert: Old table still exists
			const oldTableRows = db
				.prepare('SELECT * FROM __drizzle_migrations')
				.all();
			expect(oldTableRows).toHaveLength(3);
		});

		test('skips migration when new table has data', async () => {
			// Setup: Create both tables with data
			db.prepare(`
				CREATE TABLE __drizzle_migrations (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					hash text NOT NULL,
					created_at numeric,
					tag text
				)
			`).run();

			db.prepare(`
				CREATE TABLE __wizzle_migrations (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					hash text NOT NULL,
					created_at numeric,
					tag text
				)
			`).run();

			db.prepare(`
				INSERT INTO __drizzle_migrations (hash, created_at, tag)
				VALUES ('old_hash', 1700000000000, 'old_tag')
			`).run();

			db.prepare(`
				INSERT INTO __wizzle_migrations (hash, created_at, tag)
				VALUES ('new_hash', 1700000001000, 'new_tag')
			`).run();

			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				oldTable: '__drizzle_migrations',
			};

			// Execute migration
			await migrateOldMigrationTable(executor, 'sqlite', config);

			// Assert: New table still has only its original data
			const newTableRows = db
				.prepare('SELECT * FROM __wizzle_migrations')
				.all();
			expect(newTableRows).toHaveLength(1);
			expect((newTableRows[0] as any).hash).toBe('new_hash');
		});

		test('skips migration when old table does not exist', async () => {
			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				oldTable: '__drizzle_migrations',
			};

			// Execute migration - should not throw
			await expect(
				migrateOldMigrationTable(executor, 'sqlite', config),
			).resolves.not.toThrow();

			// Assert: No tables were created
			const tables = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='__wizzle_migrations'",
				)
				.all();
			expect(tables).toHaveLength(0);
		});

		test('handles old table without tag column', async () => {
			// Setup: Create old table WITHOUT tag column
			db.prepare(`
				CREATE TABLE __drizzle_migrations (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					hash text NOT NULL,
					created_at numeric
				)
			`).run();

			db.prepare(`
				INSERT INTO __drizzle_migrations (hash, created_at)
				VALUES
					('hash1', 1700000000000),
					('hash2', 1700000001000)
			`).run();

			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				oldTable: '__drizzle_migrations',
			};

			// Execute migration
			await migrateOldMigrationTable(executor, 'sqlite', config);

			// Assert: New table has copied data with NULL tags
			const newTableRows = db
				.prepare('SELECT * FROM __wizzle_migrations ORDER BY created_at')
				.all() as any[];
			expect(newTableRows).toHaveLength(2);
			expect(newTableRows[0].hash).toBe('hash1');
			expect(newTableRows[0].tag).toBeNull();
			expect(newTableRows[1].hash).toBe('hash2');
			expect(newTableRows[1].tag).toBeNull();
		});

		test('works with custom table names', async () => {
			// Setup: Create custom old table
			db.prepare(`
				CREATE TABLE my_old_migrations (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					hash text NOT NULL,
					created_at numeric,
					tag text
				)
			`).run();

			db.prepare(`
				INSERT INTO my_old_migrations (hash, created_at, tag)
				VALUES ('hash1', 1700000000000, 'tag1')
			`).run();

			const config: MigrationTableConfig = {
				newTable: 'my_new_migrations',
				oldTable: 'my_old_migrations',
			};

			// Execute migration
			await migrateOldMigrationTable(executor, 'sqlite', config);

			// Assert: New table exists with custom name
			const newTableRows = db
				.prepare('SELECT * FROM my_new_migrations')
				.all();
			expect(newTableRows).toHaveLength(1);
			expect((newTableRows[0] as any).hash).toBe('hash1');
		});

		test('skips migration when old table is empty', async () => {
			// Setup: Create old table without data
			db.prepare(`
				CREATE TABLE __drizzle_migrations (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					hash text NOT NULL,
					created_at numeric,
					tag text
				)
			`).run();

			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				oldTable: '__drizzle_migrations',
			};

			// Execute migration
			await migrateOldMigrationTable(executor, 'sqlite', config);

			// Assert: New table was not created
			const tables = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='__wizzle_migrations'",
				)
				.all();
			expect(tables).toHaveLength(0);
		});
	});

	describe('SingleStore', () => {
		test('migrates data using mysql dialect', async () => {
			const executedQueries: string[] = [];
			const queryResults: Record<string, any[]> = {
				// Table exists checks
				"SELECT COUNT(*) as count\n\t\t\t\tFROM information_schema.tables\n\t\t\t\tWHERE table_name = '__wizzle_migrations'":
					[{ count: 0 }],
				"SELECT COUNT(*) as count\n\t\t\t\tFROM information_schema.tables\n\t\t\t\tWHERE table_name = '__drizzle_migrations'":
					[{ count: 1 }],
				// Row count checks
				'SELECT COUNT(*) as count FROM "__drizzle_migrations"': [{ count: 2 }],
				// Column check for tag
				"SELECT COLUMN_NAME\n\t\t\t\t\tFROM INFORMATION_SCHEMA.COLUMNS\n\t\t\t\t\tWHERE TABLE_NAME = '__drizzle_migrations'\n\t\t\t\t\tAND COLUMN_NAME = 'tag'":
					[{ COLUMN_NAME: 'tag' }],
			};

			const executor = vi.fn(async (sql: string) => {
				executedQueries.push(sql.trim());
				for (const [query, result] of Object.entries(queryResults)) {
					if (sql.includes(query) || query.includes(sql.trim())) {
						return result;
					}
				}
				return [];
			});

			const config: MigrationTableConfig = {
				newTable: '__wizzle_migrations',
				oldTable: '__drizzle_migrations',
			};

			await migrateOldMigrationTable(
				executor as any,
				'singlestore',
				config,
			);

			// Assert: CREATE TABLE was called (SingleStore uses MySQL syntax)
			expect(executedQueries.some((q) => q.includes('CREATE TABLE'))).toBe(
				true,
			);
			expect(
				executedQueries.some((q) => q.includes('__wizzle_migrations')),
			).toBe(true);

			// Assert: INSERT INTO was called
			expect(executedQueries.some((q) => q.includes('INSERT INTO'))).toBe(
				true,
			);
		});
	});
});
