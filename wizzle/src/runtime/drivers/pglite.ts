import type { DrizzleInternal, MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: PgliteDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	const internal = db as unknown as DrizzleInternal;
	await internal.dialect.migrate(migrations, internal.session, config);
}
