import type { AwsDataApiPgDatabase } from 'drizzle-orm/aws-data-api/pg';
import type { DrizzleInternal, MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: AwsDataApiPgDatabase<TSchema>,
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
