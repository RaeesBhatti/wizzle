import type { DrizzleInternal, MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: ExpoSQLiteDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	const internal = db as unknown as DrizzleInternal;
	await internal.dialect.migrate(migrations, internal.session, config);
}
