import { sql } from 'drizzle-orm';
import type { DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import { migrateOldMigrationTable } from '../migration-table-migrator';
import type { MigrationMeta } from '../migrator';
import { readLegacyDrizzleConfig } from '../migrator';

interface MigrationConfig {
	journal: {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};
	migrations: Record<string, string>;
}

function readMigrationFiles({ journal, migrations }: MigrationConfig): MigrationMeta[] {
	const migrationQueries: MigrationMeta[] = [];

	for (const journalEntry of journal.entries) {
		const query = migrations[`m${journalEntry.idx.toString().padStart(4, '0')}`];

		if (!query) {
			throw new Error(`Missing migration: ${journalEntry.tag}`);
		}

		try {
			const result = query.split('--> statement-breakpoint').map((it) => {
				return it;
			});

			migrationQueries.push({
				sql: result,
				bps: journalEntry.breakpoints,
				folderMillis: journalEntry.when,
				hash: '',
				tag: journalEntry.tag, // Store tag for debugging/readability
			});
		} catch {
			throw new Error(`Failed to parse migration: ${journalEntry.tag}`);
		}
	}

	return migrationQueries;
}

export async function migrate<
	TSchema extends Record<string, unknown>,
>(
	db: DrizzleSqliteDODatabase<TSchema>,
	config: MigrationConfig,
): Promise<void> {
	const migrations = readMigrationFiles(config);

	// Automatic migration from old drizzle table to new wizzle table
	const legacyConfig = readLegacyDrizzleConfig();
	const oldTable = legacyConfig?.migrations?.table || '__drizzle_migrations';

	// Helper function to execute SQL
	const executor = async (query: string) => {
		return db.run(sql.raw(query));
	};

	await migrateOldMigrationTable(executor, 'sqlite', {
		newTable: '__wizzle_migrations',
		oldTable,
	});

	db.transaction((tx) => {
		try {
			const migrationsTable = '__wizzle_migrations';

			// Note: The 'tag' column is for debugging/readability only.
			// Migration logic uses only 'created_at' to determine which migrations to apply.
			const migrationTableCreate = sql`
				CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
					id SERIAL PRIMARY KEY,
					hash text NOT NULL,
					created_at numeric,
					tag text
				)
			`;
			db.run(migrationTableCreate);

			const dbMigrations = db.values<[number, string, string]>(
				sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`,
			);

			const lastDbMigration = dbMigrations[0] ?? undefined;

			for (const migration of migrations) {
				// Migration decision logic: only compare created_at timestamps
				if (!lastDbMigration || Number(lastDbMigration[2])! < migration.folderMillis) {
					for (const stmt of migration.sql) {
						db.run(sql.raw(stmt));
					}
					db.run(
						sql`INSERT INTO ${
							sql.identifier(migrationsTable)
						} ("hash", "created_at", "tag") VALUES(${migration.hash}, ${migration.folderMillis}, ${migration.tag})`,
					);
				}
			}
		} catch (error: any) {
			tx.rollback();
			throw error;
		}
	});
}
