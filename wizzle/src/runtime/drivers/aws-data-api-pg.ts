import type { DrizzleInternal, MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';
import type { AwsDataApiPgDatabase } from 'drizzle-orm/aws-data-api/pg';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: AwsDataApiPgDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	const internal = db as unknown as DrizzleInternal;
	await internal.dialect.migrate(migrations, internal.session, config);
}
