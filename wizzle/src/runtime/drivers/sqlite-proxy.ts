import { sql } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { migrateOldMigrationTable } from '../migration-table-migrator';
import type { MigrationConfig } from '../migrator';
import { readLegacyDrizzleConfig, readMigrationFiles } from '../migrator';

export type ProxyMigrator = (migrationQueries: string[]) => Promise<void>;

export async function migrate<TSchema extends Record<string, unknown>>(
	db: SqliteRemoteDatabase<TSchema>,
	callback: ProxyMigrator,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);

	const migrationsTable = typeof config === 'string'
		? '__wizzle_migrations'
		: config.migrationsTable ?? '__wizzle_migrations';

	// Automatic migration from old drizzle table to new wizzle table
	const legacyConfig = readLegacyDrizzleConfig();
	const oldTable = legacyConfig?.migrations?.table || '__drizzle_migrations';

	// Helper function to execute SQL
	const executor = async (query: string) => {
		return db.run(sql.raw(query));
	};

	await migrateOldMigrationTable(executor, 'sqlite', {
		newTable: migrationsTable,
		oldTable,
	});

	// Note: The 'tag' column is for debugging/readability only.
	// Migration logic uses only 'created_at' to determine which migrations to apply.
	const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric,
			tag text
		)
	`;

	await db.run(migrationTableCreate);

	const dbMigrations = await db.values<[number, string, string]>(
		sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`,
	);

	const lastDbMigration = dbMigrations[0] ?? undefined;

	const queriesToRun: string[] = [];
	for (const migration of migrations) {
		// Migration decision logic: only compare created_at timestamps
		if (
			!lastDbMigration
			|| Number(lastDbMigration[2])! < migration.folderMillis
		) {
			queriesToRun.push(
				...migration.sql,
				`INSERT INTO \`${migrationsTable}\` ("hash", "created_at", "tag") VALUES('${migration.hash}', '${migration.folderMillis}', '${migration.tag}')`,
			);
		}
	}

	await callback(queriesToRun);
}
