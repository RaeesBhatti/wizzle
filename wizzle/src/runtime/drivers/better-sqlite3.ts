import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { DrizzleInternal, MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';

export function migrate<TSchema extends Record<string, unknown>>(
	db: BetterSQLite3Database<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	const internal = db as unknown as DrizzleInternal;
	internal.dialect.migrate(migrations, internal.session, config);
}
