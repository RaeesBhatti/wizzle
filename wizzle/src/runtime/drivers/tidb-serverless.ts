import type { MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';
import type { TiDBServerlessDatabase } from 'drizzle-orm/tidb-serverless';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: TiDBServerlessDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
