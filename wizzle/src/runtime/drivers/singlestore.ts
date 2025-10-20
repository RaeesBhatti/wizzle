import type { MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';
import type { SingleStoreDriverDatabase } from 'drizzle-orm/singlestore';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: SingleStoreDriverDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
