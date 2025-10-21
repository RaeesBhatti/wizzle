import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { DrizzleInternal, MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';

export function migrate<TSchema extends Record<string, unknown>>(
	db: BunSQLiteDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	const internal = db as unknown as DrizzleInternal;
	const configWithDefaults = {
		...config,
		migrationsTable: config.migrationsTable ?? '__wizzle_migrations',
	};
	internal.dialect.migrate(migrations, internal.session, configWithDefaults);
}
