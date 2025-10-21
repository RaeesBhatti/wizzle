import { sql } from 'drizzle-orm';
import type { PgRemoteDatabase } from 'drizzle-orm/pg-proxy';
import type { MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';

export type ProxyMigrator = (migrationQueries: string[]) => Promise<void>;

export async function migrate<TSchema extends Record<string, unknown>>(
	db: PgRemoteDatabase<TSchema>,
	callback: ProxyMigrator,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);

	// Note: The 'tag' column is for debugging/readability only.
	// Migration logic uses only 'created_at' to determine which migrations to apply.
	const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS "wizzle"."__wizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric,
			tag text
		)
	`;

	await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "wizzle"`);
	await db.execute(migrationTableCreate);

	const dbMigrations = await db.execute<{
		id: number;
		hash: string;
		created_at: string;
	}>(
		sql`SELECT id, hash, created_at FROM "wizzle"."__wizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
	);

	const lastDbMigration = dbMigrations[0] ?? undefined;

	const queriesToRun: string[] = [];

	for (const migration of migrations) {
		// Migration decision logic: only compare created_at timestamps
		if (
			!lastDbMigration
			|| Number(lastDbMigration.created_at)! < migration.folderMillis
		) {
			queriesToRun.push(
				...migration.sql,
				`INSERT INTO "wizzle"."__wizzle_migrations" ("hash", "created_at", "tag") VALUES('${migration.hash}', '${migration.folderMillis}', '${migration.tag}')`,
			);
		}
	}

	await callback(queriesToRun);
}
