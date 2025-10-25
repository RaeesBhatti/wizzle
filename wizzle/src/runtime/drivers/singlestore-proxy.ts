import { sql } from 'drizzle-orm';
import type { SingleStoreRemoteDatabase } from 'drizzle-orm/singlestore-proxy';
import { migrateOldMigrationTable } from '../migration-table-migrator';
import type { MigrationConfig } from '../migrator';
import { readLegacyDrizzleConfig, readMigrationFiles } from '../migrator';

export type ProxyMigrator = (migrationQueries: string[]) => Promise<void>;

export async function migrate<TSchema extends Record<string, unknown>>(
	db: SingleStoreRemoteDatabase<TSchema>,
	callback: ProxyMigrator,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);

	const migrationsTable = config.migrationsTable ?? '__wizzle_migrations';

	// Automatic migration from old drizzle table to new wizzle table
	const legacyConfig = readLegacyDrizzleConfig();
	const oldTable = legacyConfig?.migrations?.table || '__drizzle_migrations';

	// Helper function to execute SQL
	const executor = async (query: string) => {
		return db.execute(sql.raw(query));
	};

	await migrateOldMigrationTable(executor, 'singlestore', {
		newTable: migrationsTable,
		oldTable,
	});

	// Note: The 'tag' column is for debugging/readability only.
	// Migration logic uses only 'created_at' to determine which migrations to apply.
	const migrationTableCreate = sql`
		create table if not exists ${sql.identifier(migrationsTable)} (
			id serial primary key,
			hash text not null,
			created_at bigint,
			tag text
		)
	`;
	await db.execute(migrationTableCreate);

	const dbMigrations = await db.select({
		id: sql.raw('id'),
		hash: sql.raw('hash'),
		created_at: sql.raw('created_at'),
	}).from(sql.identifier(migrationsTable).getSQL()).orderBy(
		sql.raw('created_at desc'),
	).limit(1);

	const lastDbMigration = dbMigrations[0];

	const queriesToRun: string[] = [];

	for (const migration of migrations) {
		// Migration decision logic: only compare created_at timestamps
		if (
			!lastDbMigration
			|| Number(lastDbMigration.created_at) < migration.folderMillis
		) {
			queriesToRun.push(
				...migration.sql,
				`insert into ${
					sql.identifier(migrationsTable).value
				} (\`hash\`, \`created_at\`, \`tag\`) values('${migration.hash}', '${migration.folderMillis}', '${migration.tag}')`,
			);
		}
	}

	await callback(queriesToRun);
}
