import type { OPSQLiteDatabase } from 'drizzle-orm/op-sqlite';
import type { DrizzleInternal, MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: OPSQLiteDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	const internal = db as unknown as DrizzleInternal;
	const configWithDefaults = {
		...config,
		migrationsTable: config.migrationsTable ?? '__wizzle_migrations',
	};
	await internal.dialect.migrate(migrations, internal.session, configWithDefaults);
}
