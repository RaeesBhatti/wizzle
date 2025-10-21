import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { migrate } from '../../src/runtime/drivers/better-sqlite3';

describe('SQLite runtime migrator', () => {
	let db: ReturnType<typeof drizzle>;
	let sqlite: Database.Database;

	beforeEach(() => {
		sqlite = new Database(':memory:');
		db = drizzle(sqlite);
	});

	afterEach(() => {
		sqlite.close();
	});

	test('applies migrations using snapshot chain', async () => {
		await migrate(db, {
			migrationsFolder: 'tests/runtime-migrator/fixtures/sqlite',
		});

		// Check that migrations table was created
		const tables = sqlite
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__wizzle_migrations'")
			.all();
		expect(tables).toHaveLength(1);

		// Check that both migrations were applied
		const migrations = sqlite
			.prepare('SELECT * FROM __wizzle_migrations ORDER BY created_at')
			.all() as any[];
		expect(migrations).toHaveLength(2);

		// Verify first migration
		expect(migrations[0].created_at).toBe(1700000000000);

		// Verify second migration
		expect(migrations[1].created_at).toBe(1700000001000);

		// Verify the final schema - users table should exist with altered columns
		const userColumns = sqlite
			.prepare("PRAGMA table_info('users')")
			.all() as any[];

		expect(userColumns).toHaveLength(2);
		expect(userColumns[0].name).toBe('id');
		expect(userColumns[0].type.toLowerCase()).toBe('integer');
		expect(userColumns[1].name).toBe('name');
		expect(userColumns[1].type.toLowerCase()).toBe('integer'); // Changed from text to integer
	});

	test('skips already applied migrations', async () => {
		// Apply migrations first time
		await migrate(db, {
			migrationsFolder: 'tests/runtime-migrator/fixtures/sqlite',
		});

		// Apply migrations second time - should skip
		await migrate(db, {
			migrationsFolder: 'tests/runtime-migrator/fixtures/sqlite',
		});

		// Should still have only 2 migration records
		const migrations = sqlite
			.prepare('SELECT * FROM __wizzle_migrations')
			.all();
		expect(migrations).toHaveLength(2);
	});

	test('uses custom migrations table name', async () => {
		await migrate(db, {
			migrationsFolder: 'tests/runtime-migrator/fixtures/sqlite',
			migrationsTable: 'custom_migrations',
		});

		// Check that custom table was created (not the default __wizzle_migrations)
		const tables = sqlite
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='custom_migrations'")
			.all();
		expect(tables).toHaveLength(1);

		// Migrations should be in custom table
		const migrations = sqlite
			.prepare('SELECT * FROM custom_migrations')
			.all();
		expect(migrations).toHaveLength(2);
	});
});

describe('LibSQL runtime migrator', () => {
	test('libsql migrator with in-memory database', async () => {
		const { createClient } = await import('@libsql/client');
		const { drizzle } = await import('drizzle-orm/libsql');
		const { migrate } = await import('../../src/runtime/drivers/libsql');

		const client = createClient({ url: ':memory:' });
		const db = drizzle(client);

		await migrate(db, {
			migrationsFolder: 'tests/runtime-migrator/fixtures/sqlite',
		});

		// Check migrations were applied
		const result = await client.execute(
			'SELECT * FROM __wizzle_migrations ORDER BY created_at',
		);
		expect(result.rows).toHaveLength(2);
		expect(result.rows[0].created_at).toBe(1700000000000);
		expect(result.rows[1].created_at).toBe(1700000001000);

		// Check final schema
		const userColumns = await client.execute("PRAGMA table_info('users')");
		expect(userColumns.rows).toHaveLength(2);
	});
});
