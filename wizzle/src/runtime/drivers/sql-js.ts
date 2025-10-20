import type { MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';
import type { SQLJsDatabase } from 'drizzle-orm/sql-js';

export function migrate<TSchema extends Record<string, unknown>>(
	db: SQLJsDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session, config);
}
