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
	tag: string; // Migration folder name (e.g., "1725358702427_create_users") - for debugging/readability only
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
	const migrationsFolder = config.migrationsFolder;

	// Check if migrations folder exists
	if (!fs.existsSync(migrationsFolder)) {
		throw new Error(`Can't find migrations folder at ${migrationsFolder}`);
	}

	// Use snapshot chain to get ordered migration tags
	const orderedTags = buildSnapshotChain(migrationsFolder);

	if (orderedTags.length === 0) {
		// No migrations to apply
		return [];
	}

	const migrationQueries: MigrationMeta[] = [];

	for (const tag of orderedTags) {
		// Extract timestamp from tag (first part before underscore)
		const timestampMatch = tag.match(/^(\d+)_/);
		if (!timestampMatch) {
			throw new Error(
				`Invalid migration folder name: ${tag}. Expected format: <timestamp>_<name>`,
			);
		}
		const timestamp = parseInt(timestampMatch[1]);

		// Read SQL file
		const sqlPath = path.join(migrationsFolder, tag, 'up.sql');
		if (!fs.existsSync(sqlPath)) {
			throw new Error(`SQL file not found: ${sqlPath}`);
		}

		// Read snapshot file
		const snapshotPath = path.join(migrationsFolder, tag, 'snapshot.json');
		if (!fs.existsSync(snapshotPath)) {
			throw new Error(`Snapshot file not found: ${snapshotPath}`);
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
				tag, // Store folder name for debugging/readability
			});
		} catch (error) {
			throw new Error(`Failed to read migration ${tag}: ${error}`);
		}
	}

	return migrationQueries;
}
