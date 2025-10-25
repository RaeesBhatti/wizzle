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

/**
 * Legacy drizzle.config structure for reading old migration table config
 */
interface LegacyDrizzleConfig {
	migrations?: {
		table?: string;
		schema?: string;
	};
}

/**
 * Read old drizzle.config to get migration table/schema names
 * Returns undefined if drizzle.config doesn't exist or can't be read
 * This is used for automatic migration from old table to new table
 */
let cachedLegacyConfig: LegacyDrizzleConfig | undefined | null = null;

export function readLegacyDrizzleConfig(): LegacyDrizzleConfig | undefined {
	// Return cached result if already read
	if (cachedLegacyConfig !== null) {
		return cachedLegacyConfig || undefined;
	}

	const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';

	// Look for drizzle.config in various formats
	const extensions = ['ts', 'js', 'mjs', 'cjs', 'json'];
	let drizzleConfigPath: string | undefined;

	for (const ext of extensions) {
		const testPath = path.join(prefix, `drizzle.config.${ext}`);
		if (fs.existsSync(testPath)) {
			drizzleConfigPath = testPath;
			break;
		}
	}

	if (!drizzleConfigPath) {
		// No drizzle.config found
		cachedLegacyConfig = undefined;
		return undefined;
	}

	try {
		// For JSON, just parse it
		if (drizzleConfigPath.endsWith('.json')) {
			const content = fs.readFileSync(drizzleConfigPath, 'utf8');
			const config = JSON.parse(content);
			cachedLegacyConfig = config;
			return config;
		}

		// For JS/TS files, try to require it
		// Note: This may not work for all TS files without transpilation
		// In production, wizzle init should have already copied the config
		try {
			delete require.cache[require.resolve(drizzleConfigPath)];
			const required = require(drizzleConfigPath);
			const config = required.default || required;
			cachedLegacyConfig = config;
			return config;
		} catch (requireError) {
			// If require fails, try simple regex parsing for basic cases
			const content = fs.readFileSync(drizzleConfigPath, 'utf8');

			// Try to extract migrations.table and migrations.schema values
			const tableMatch = content.match(/table:\s*['"]([^'"]+)['"]/);
			const schemaMatch = content.match(/schema:\s*['"]([^'"]+)['"]/);

			if (tableMatch || schemaMatch) {
				const config: LegacyDrizzleConfig = {
					migrations: {
						table: tableMatch?.[1],
						schema: schemaMatch?.[1],
					},
				};
				cachedLegacyConfig = config;
				return config;
			}
		}
	} catch (error) {
		// If reading fails, return undefined
	}

	cachedLegacyConfig = undefined;
	return undefined;
}
