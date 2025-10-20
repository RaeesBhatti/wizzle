import type { SQLJsDatabase } from 'drizzle-orm/sql-js';
import type { DrizzleInternal, MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';

export function migrate<TSchema extends Record<string, unknown>>(
	db: SQLJsDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	const internal = db as unknown as DrizzleInternal;
	internal.dialect.migrate(migrations, internal.session, config);
}
