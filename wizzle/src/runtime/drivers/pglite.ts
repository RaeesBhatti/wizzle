import type { MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: PgliteDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
