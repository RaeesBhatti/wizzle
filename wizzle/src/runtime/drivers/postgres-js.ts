import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { DrizzleInternal, MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: PostgresJsDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	const internal = db as unknown as DrizzleInternal;
	const configWithDefaults = {
		...config,
		migrationsTable: config.migrationsTable ?? '__wizzle_migrations',
		migrationsSchema: config.migrationsSchema ?? 'wizzle',
	};
	await internal.dialect.migrate(migrations, internal.session, configWithDefaults);
}
