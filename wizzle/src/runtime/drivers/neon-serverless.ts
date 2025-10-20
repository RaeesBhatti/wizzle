import type { MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: NeonDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
