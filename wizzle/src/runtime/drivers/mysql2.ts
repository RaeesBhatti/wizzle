import type { MySql2Database } from 'drizzle-orm/mysql2';
import type { DrizzleInternal, MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: MySql2Database<TSchema>,
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
