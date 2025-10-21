import { describe, expect, test, vi } from 'vitest';

describe('PostgreSQL runtime migrator', () => {
	test('migrate function exists and can be imported', async () => {
		const { migrate } = await import('../../src/runtime/drivers/node-postgres');
		expect(typeof migrate).toBe('function');
	});

	test('migrate function for postgres-js exists', async () => {
		const { migrate } = await import('../../src/runtime/drivers/postgres-js');
		expect(typeof migrate).toBe('function');
	});

	test('migrate function for neon-serverless exists', async () => {
		const { migrate } = await import('../../src/runtime/drivers/neon-serverless');
		expect(typeof migrate).toBe('function');
	});

	test('migrate function for pglite exists', async () => {
		const { migrate } = await import('../../src/runtime/drivers/pglite');
		expect(typeof migrate).toBe('function');
	});

	test('all PostgreSQL drivers export migrate function', async () => {
		const drivers = [
			'node-postgres',
			'postgres-js',
			'neon-serverless',
			'neon-http',
			'pglite',
			'pg-proxy',
			'vercel-postgres',
			'xata-http',
			'aws-data-api-pg',
		];

		for (const driver of drivers) {
			const module = await import(`../../src/runtime/drivers/${driver}`);
			expect(module.migrate).toBeDefined();
			expect(typeof module.migrate).toBe('function');
		}
	});
});

// Integration test with PGlite (no external database needed)
describe('PGlite runtime migrator integration', () => {
	test('applies migrations using snapshot chain', async () => {
		const { PGlite } = await import('@electric-sql/pglite');
		const { drizzle } = await import('drizzle-orm/pglite');
		const { migrate } = await import('../../src/runtime/drivers/pglite');

		const pglite = new PGlite();
		await pglite.waitReady;
		const db = drizzle(pglite);

		await migrate(db, {
			migrationsFolder: 'tests/runtime-migrator/fixtures/pg',
			migrationsSchema: 'public',
		});

		// Check that migrations table was created
		const tablesResult = await pglite.query(`
			SELECT tablename FROM pg_tables
			WHERE schemaname = 'public' AND tablename = '__wizzle_migrations'
		`);
		expect(tablesResult.rows).toHaveLength(1);

		// Check that both migrations were applied
		const migrationsResult = await pglite.query(
			'SELECT * FROM __wizzle_migrations ORDER BY created_at',
		);
		expect(migrationsResult.rows).toHaveLength(2);

		// Verify first migration timestamp (bigint values)
		expect(String(migrationsResult.rows[0].created_at)).toBe('1700000000000');

		// Verify second migration timestamp
		expect(String(migrationsResult.rows[1].created_at)).toBe('1700000001000');

		// Verify the final schema - users table should exist
		const columnsResult = await pglite.query(`
			SELECT column_name, data_type, is_nullable
			FROM information_schema.columns
			WHERE table_name = 'users' AND table_schema = 'public'
			ORDER BY ordinal_position
		`);

		expect(columnsResult.rows).toHaveLength(4);
		expect(columnsResult.rows[0].column_name).toBe('id');
		expect(columnsResult.rows[1].column_name).toBe('name');
		expect(columnsResult.rows[2].column_name).toBe('email');
		expect(columnsResult.rows[3].column_name).toBe('created_at');
	});

	test('skips already applied migrations', async () => {
		const { PGlite } = await import('@electric-sql/pglite');
		const { drizzle } = await import('drizzle-orm/pglite');
		const { migrate } = await import('../../src/runtime/drivers/pglite');

		const pglite = new PGlite();
		await pglite.waitReady;
		const db = drizzle(pglite);

		// Apply migrations first time
		await migrate(db, {
			migrationsFolder: 'tests/runtime-migrator/fixtures/pg',
			migrationsSchema: 'public',
		});

		// Apply migrations second time - should skip
		await migrate(db, {
			migrationsFolder: 'tests/runtime-migrator/fixtures/pg',
			migrationsSchema: 'public',
		});

		// Should still have only 2 migration records
		const result = await pglite.query('SELECT * FROM __wizzle_migrations');
		expect(result.rows).toHaveLength(2);
	});

	test('uses custom migrations table and schema', async () => {
		const { PGlite } = await import('@electric-sql/pglite');
		const { drizzle } = await import('drizzle-orm/pglite');
		const { migrate } = await import('../../src/runtime/drivers/pglite');

		const pglite = new PGlite();
		await pglite.waitReady;
		const db = drizzle(pglite);

		await migrate(db, {
			migrationsFolder: 'tests/runtime-migrator/fixtures/pg',
			migrationsTable: 'my_migrations',
			migrationsSchema: 'public',
		});

		// Check that custom table was created (not the default __wizzle_migrations)
		const tablesResult = await pglite.query(`
			SELECT tablename FROM pg_tables
			WHERE schemaname = 'public' AND tablename = 'my_migrations'
		`);
		expect(tablesResult.rows).toHaveLength(1);

		// Migrations should be in custom table
		const result = await pglite.query('SELECT * FROM my_migrations');
		expect(result.rows).toHaveLength(2);
	});
});
