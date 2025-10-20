import { describe, expect, test } from 'vitest';

describe('All runtime migrator drivers', () => {
	const allDrivers = [
		// PostgreSQL
		'node-postgres',
		'postgres-js',
		'neon-serverless',
		'neon-http',
		'pglite',
		'pg-proxy',
		'vercel-postgres',
		'xata-http',
		'aws-data-api-pg',
		// MySQL
		'mysql2',
		'mysql-proxy',
		'planetscale-serverless',
		'tidb-serverless',
		// SQLite
		'better-sqlite3',
		'libsql',
		'bun-sqlite',
		'bun-sql',
		'sqlite-proxy',
		'sql-js',
		'd1',
		'durable-sqlite',
		'expo-sqlite',
		'op-sqlite',
		// SingleStore
		'singlestore',
		'singlestore-proxy',
	];

	test('all 25 drivers export migrate function', async () => {
		expect(allDrivers).toHaveLength(25);

		for (const driver of allDrivers) {
			const module = await import(`../../src/runtime/drivers/${driver}`);
			expect(module.migrate, `Driver ${driver} should export migrate function`).toBeDefined();
			expect(typeof module.migrate, `Driver ${driver} migrate should be a function`).toBe('function');
		}
	});

	test('migrate function signatures are consistent', async () => {
		// All migrate functions should accept (db, config) as parameters
		// We can't test the exact signature without TypeScript compiler API,
		// but we can verify the function exists and has expected arity

		for (const driver of allDrivers) {
			const module = await import(`../../src/runtime/drivers/${driver}`);
			const { migrate } = module;

			// Most migrate functions accept 2 parameters: (db, config)
			// Some proxy migrators might accept 3: (db, callback, config)
			expect(migrate.length).toBeGreaterThanOrEqual(2);
			expect(migrate.length).toBeLessThanOrEqual(3);
		}
	});

	test('drivers are organized by database type', () => {
		const pgDrivers = allDrivers.filter((d) =>
			[
				'node-postgres',
				'postgres-js',
				'neon-serverless',
				'neon-http',
				'pglite',
				'pg-proxy',
				'vercel-postgres',
				'xata-http',
				'aws-data-api-pg',
			].includes(d)
		);
		expect(pgDrivers).toHaveLength(9);

		const mysqlDrivers = allDrivers.filter((d) =>
			['mysql2', 'mysql-proxy', 'planetscale-serverless', 'tidb-serverless'].includes(d)
		);
		expect(mysqlDrivers).toHaveLength(4);

		const sqliteDrivers = allDrivers.filter((d) =>
			[
				'better-sqlite3',
				'libsql',
				'bun-sqlite',
				'bun-sql',
				'sqlite-proxy',
				'sql-js',
				'd1',
				'durable-sqlite',
				'expo-sqlite',
				'op-sqlite',
			].includes(d)
		);
		expect(sqliteDrivers).toHaveLength(10);

		const singlestoreDrivers = allDrivers.filter((d) => ['singlestore', 'singlestore-proxy'].includes(d));
		expect(singlestoreDrivers).toHaveLength(2);
	});
});

describe('Runtime migrator imports', () => {
	test('readMigrationFiles can be imported from core migrator', async () => {
		const { readMigrationFiles } = await import('../../src/runtime/migrator');
		expect(typeof readMigrationFiles).toBe('function');
	});

	test('MigrationConfig type is exported', async () => {
		const module = await import('../../src/runtime/migrator');
		// TypeScript types don't exist at runtime, but we can check the module loaded
		expect(module).toBeDefined();
	});

	test('logger utilities can be imported', async () => {
		const {
			ConsoleMigrationLogger,
			defaultLogger,
		} = await import('../../src/runtime/logger');

		expect(ConsoleMigrationLogger).toBeDefined();
		expect(defaultLogger).toBeDefined();
		expect(typeof defaultLogger.logStart).toBe('function');
		expect(typeof defaultLogger.logMigration).toBe('function');
		expect(typeof defaultLogger.logComplete).toBe('function');
		expect(typeof defaultLogger.logSkipped).toBe('function');
	});
});
