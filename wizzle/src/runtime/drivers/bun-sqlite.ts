import type { DrizzleInternal, MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

export function migrate<TSchema extends Record<string, unknown>>(
	db: BunSQLiteDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	const internal = db as unknown as DrizzleInternal;
	internal.dialect.migrate(migrations, internal.session, config);
}
