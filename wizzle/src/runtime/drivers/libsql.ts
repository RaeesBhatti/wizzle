import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { DrizzleInternal, MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: LibSQLDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	const internal = db as unknown as DrizzleInternal;
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';

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
	await internal.session.run(migrationTableCreate);

	const dbMigrations = await db.values<[number, string, string]>(
		sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`,
	);

	const lastDbMigration = dbMigrations[0] ?? undefined;

	const statementToBatch = [];

	for (const migration of migrations) {
		// Migration decision logic: only compare created_at timestamps
		if (!lastDbMigration || Number(lastDbMigration[2])! < migration.folderMillis) {
			for (const stmt of migration.sql) {
				statementToBatch.push(db.run(sql.raw(stmt)));
			}

			statementToBatch.push(
				db.run(
					sql`INSERT INTO ${
						sql.identifier(migrationsTable)
					} ("hash", "created_at", "tag") VALUES(${migration.hash}, ${migration.folderMillis}, ${migration.tag})`,
				),
			);
		}
	}

	await internal.session.migrate(statementToBatch);
}
