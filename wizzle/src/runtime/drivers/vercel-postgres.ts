import type { MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';
import type { VercelPgDatabase } from 'drizzle-orm/vercel-postgres';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: VercelPgDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
