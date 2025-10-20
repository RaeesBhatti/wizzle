import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildSnapshotChain } from '../utils';

export interface KitConfig {
	out: string;
	schema: string;
}

export interface MigrationConfig {
	migrationsFolder: string;
	migrationsTable?: string;
	migrationsSchema?: string;
}

export interface MigrationMeta {
	sql: string[];
	folderMillis: number;
	hash: string;
	bps: boolean;
}

/**
 * Internal database interface that exposes dialect and session properties.
 * These properties exist at runtime but are marked as @internal in drizzle-orm,
 * so they're not part of the public TypeScript API.
 */
export interface DrizzleInternal {
	dialect: {
		migrate(migrations: MigrationMeta[], session: any, config: MigrationConfig): Promise<void>;
	};
	session: any;
}

export function readMigrationFiles(config: MigrationConfig): MigrationMeta[] {
	const migrationFolderTo = config.migrationsFolder;
	const metaFolder = path.join(migrationFolderTo, 'meta');

	// Check if meta folder exists
	if (!fs.existsSync(metaFolder)) {
		throw new Error(`Can't find meta folder at ${metaFolder}`);
	}

	// Use snapshot chain instead of journal
	const orderedSnapshots = buildSnapshotChain(metaFolder);

	if (orderedSnapshots.length === 0) {
		// No migrations to apply
		return [];
	}

	const migrationQueries: MigrationMeta[] = [];

	for (const snapshotPath of orderedSnapshots) {
		// Extract tag from snapshot filename (e.g., "1234567890_add_users_table_snapshot.json" -> "1234567890_add_users_table")
		const filename = path.basename(snapshotPath, '.json');
		const tag = filename.replace('_snapshot', '');

		// Extract timestamp from tag (first part before underscore)
		const timestampMatch = tag.match(/^(\d+)_/);
		if (!timestampMatch) {
			throw new Error(`Invalid snapshot filename format: ${filename}. Expected format: <timestamp>_<name>_snapshot.json`);
		}
		const timestamp = parseInt(timestampMatch[1]);

		// Read SQL file
		const sqlPath = path.join(migrationFolderTo, `${tag}.sql`);
		if (!fs.existsSync(sqlPath)) {
			throw new Error(`SQL file not found: ${sqlPath}`);
		}

		try {
			const query = fs.readFileSync(sqlPath).toString();

			// Read snapshot to check for breakpoints metadata
			const snapshot = JSON.parse(fs.readFileSync(snapshotPath).toString());
			const breakpoints = snapshot._meta?.breakpoints ?? true;

			// Split by statement breakpoint marker
			const result = query.split('--> statement-breakpoint').map((it) => {
				return it.trim();
			}).filter(Boolean);

			migrationQueries.push({
				sql: result,
				bps: breakpoints,
				folderMillis: timestamp,
				hash: crypto.createHash('sha256').update(query).digest('hex'),
			});
		} catch (error) {
			throw new Error(`Failed to read migration file ${sqlPath}: ${error}`);
		}
	}

	return migrationQueries;
}
