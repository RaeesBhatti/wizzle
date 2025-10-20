import type { DrizzleInternal, MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';
import { sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: DrizzleD1Database<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	const internal = db as unknown as DrizzleInternal;
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';

	const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)
	`;
	await internal.session.run(migrationTableCreate);

	const dbMigrations = await db.values<[number, string, string]>(
		sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`,
	);

	const lastDbMigration = dbMigrations[0] ?? undefined;

	const statementToBatch = [];

	for (const migration of migrations) {
		if (!lastDbMigration || Number(lastDbMigration[2])! < migration.folderMillis) {
			for (const stmt of migration.sql) {
				statementToBatch.push(db.run(sql.raw(stmt)));
			}

			statementToBatch.push(
				db.run(
					sql`INSERT INTO ${sql.identifier(migrationsTable)} ("hash", "created_at") VALUES(${
						sql.raw(`'${migration.hash}'`)
					}, ${sql.raw(`${migration.folderMillis}`)})`,
				),
			);
		}
	}

	if (statementToBatch.length > 0) {
		await internal.session.batch(statementToBatch);
	}
}
