import type { MigrationConfig } from '../migrator';
import { readMigrationFiles } from '../migrator';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: BunSQLDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
