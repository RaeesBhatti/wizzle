import type { MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export function migrate<TSchema extends Record<string, unknown>>(
	db: BetterSQLite3Database<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session, config);
}
