import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { expect } from 'vitest';
import { buildSnapshotChain } from '../../src/utils';

/**
 * Creates a temporary migration folder for testing
 */
export function createTempMigrationFolder(testName: string): string {
	const tempPath = join(process.cwd(), 'tests', 'fixtures', 'temp', testName);
	if (existsSync(tempPath)) {
		rmSync(tempPath, { recursive: true });
	}
	mkdirSync(tempPath, { recursive: true });
	return tempPath;
}

/**
 * Cleans up temporary migration folder after tests
 */
export function cleanupMigrationFolder(folderPath: string): void {
	if (existsSync(folderPath)) {
		rmSync(folderPath, { recursive: true });
	}
}

/**
 * Generates a valid snapshot JSON object
 */
export function createMockSnapshot(options: {
	dialect: 'postgresql' | 'mysql' | 'sqlite' | 'singlestore';
	id: string;
	prevId: string;
	tableName?: string;
}) {
	const { dialect, id, prevId, tableName = 'users' } = options;

	const baseSnapshot: any = {
		version: dialect === 'postgresql' ? '7' : dialect === 'mysql' ? '5' : dialect === 'singlestore' ? '1' : '6',
		dialect: dialect === 'singlestore' ? 'singlestore' : dialect === 'sqlite' ? 'sqlite' : dialect === 'mysql' ? 'mysql' : 'postgresql',
		id,
		prevId,
		tables: {},
		_meta: {
			tables: {},
			columns: {},
		},
	};

	if (dialect === 'postgresql') {
		baseSnapshot.enums = {};
		baseSnapshot.schemas = {};
		baseSnapshot._meta.schemas = {};
		baseSnapshot.tables[`public.${tableName}`] = {
			name: tableName,
			schema: 'public',
			columns: {
				id: {
					name: 'id',
					type: 'serial',
					primaryKey: true,
					notNull: true,
				},
			},
			indexes: {},
			foreignKeys: {},
			compositePrimaryKeys: {},
			uniqueConstraints: {},
			policies: {},
			checkConstraints: {},
			isRLSEnabled: false,
		};
	} else if (dialect === 'mysql') {
		baseSnapshot.views = {};
		baseSnapshot.tables[tableName] = {
			name: tableName,
			columns: {
				id: {
					name: 'id',
					type: 'int',
					primaryKey: true,
					notNull: true,
					autoincrement: true,
				},
			},
			indexes: {},
			foreignKeys: {},
			compositePrimaryKeys: {},
			uniqueConstraints: {},
			checkConstraint: {},
		};
	} else if (dialect === 'sqlite') {
		baseSnapshot.enums = {};
		baseSnapshot.views = {};
		baseSnapshot.tables[tableName] = {
			name: tableName,
			columns: {
				id: {
					name: 'id',
					type: 'integer',
					primaryKey: true,
					notNull: true,
				},
			},
			indexes: {},
			foreignKeys: {},
			compositePrimaryKeys: {},
			uniqueConstraints: {},
			checkConstraints: {},
		};
	} else if (dialect === 'singlestore') {
		baseSnapshot.tables[tableName] = {
			name: tableName,
			columns: {
				id: {
					name: 'id',
					type: 'int',
					primaryKey: true,
					notNull: true,
					autoincrement: true,
				},
			},
			indexes: {},
			compositePrimaryKeys: {},
			uniqueConstraints: {},
		};
	}

	return baseSnapshot;
}

/**
 * Generates test SQL statements
 */
export function createMockSqlStatements(dialect: 'postgresql' | 'mysql' | 'sqlite' | 'singlestore'): string[] {
	switch (dialect) {
		case 'postgresql':
			return [
				'CREATE TABLE IF NOT EXISTS "users" (\n\t"id" serial PRIMARY KEY NOT NULL\n);',
			];
		case 'mysql':
			return [
				'CREATE TABLE `users` (\n\t`id` int PRIMARY KEY AUTO_INCREMENT NOT NULL\n);',
			];
		case 'sqlite':
			return [
				'CREATE TABLE `users` (\n\t`id` integer PRIMARY KEY NOT NULL\n);',
			];
		case 'singlestore':
			return [
				'CREATE TABLE `users` (\n\t`id` int PRIMARY KEY AUTO_INCREMENT NOT NULL\n);',
			];
	}
}

/**
 * Verifies that a migration folder structure exists and is correct
 */
export function verifyFolderStructure(
	outFolder: string,
	tag: string,
	options?: {
		checkSql?: boolean;
		checkSnapshot?: boolean;
	}
): void {
	const { checkSql = true, checkSnapshot = true } = options || {};

	// Check migration folder exists
	const migrationFolder = join(outFolder, tag);
	expect(existsSync(migrationFolder), `Migration folder ${migrationFolder} should exist`).toBe(true);
	expect(statSync(migrationFolder).isDirectory(), `${migrationFolder} should be a directory`).toBe(true);

	// Check up.sql exists
	if (checkSql) {
		const sqlFile = join(migrationFolder, 'up.sql');
		expect(existsSync(sqlFile), `SQL file ${sqlFile} should exist`).toBe(true);
		expect(statSync(sqlFile).isFile(), `${sqlFile} should be a file`).toBe(true);
	}

	// Check snapshot.json exists
	if (checkSnapshot) {
		const snapshotFile = join(migrationFolder, 'snapshot.json');
		expect(existsSync(snapshotFile), `Snapshot file ${snapshotFile} should exist`).toBe(true);
		expect(statSync(snapshotFile).isFile(), `${snapshotFile} should be a file`).toBe(true);
	}
}

/**
 * Reads and parses a snapshot.json file
 */
export function readSnapshot(outFolder: string, tag: string): any {
	const snapshotPath = join(outFolder, tag, 'snapshot.json');
	const content = readFileSync(snapshotPath, 'utf8');
	return JSON.parse(content);
}

/**
 * Reads the up.sql file
 */
export function readSql(outFolder: string, tag: string): string {
	const sqlPath = join(outFolder, tag, 'up.sql');
	return readFileSync(sqlPath, 'utf8');
}

/**
 * Verifies that a snapshot chain is valid
 * Checks that each migration's prevId matches the previous migration's id
 */
export function verifySnapshotChain(migrationsFolder: string): void {
	// Use buildSnapshotChain to get the correct order
	const orderedFolders = buildSnapshotChain(migrationsFolder);

	expect(orderedFolders.length).toBeGreaterThan(0);

	const snapshots = orderedFolders.map((folder) => {
		const snapshotPath = join(migrationsFolder, folder, 'snapshot.json');
		const content = JSON.parse(readFileSync(snapshotPath, 'utf8'));
		return { folder, id: content.id, prevId: content.prevId };
	});

	// First migration should have originUUID as prevId
	expect(snapshots[0].prevId).toBe('00000000-0000-0000-0000-000000000000');

	// Each subsequent migration should reference the previous one
	for (let i = 1; i < snapshots.length; i++) {
		const currentPrevId = snapshots[i].prevId;
		const prevId = snapshots[i - 1].id;

		expect(currentPrevId).toBe(prevId);
	}
}

/**
 * Counts the number of migration folders in a directory
 */
export function countMigrationFolders(migrationsFolder: string): number {
	if (!existsSync(migrationsFolder)) {
		return 0;
	}

	return readdirSync(migrationsFolder, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory())
		.filter((dirent) => {
			const snapshotPath = join(migrationsFolder, dirent.name, 'snapshot.json');
			return existsSync(snapshotPath);
		})
		.length;
}

/**
 * Gets all migration folder names sorted by timestamp
 */
export function getMigrationFolders(migrationsFolder: string): string[] {
	if (!existsSync(migrationsFolder)) {
		return [];
	}

	return readdirSync(migrationsFolder, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory())
		.map((dirent) => dirent.name)
		.filter((folderName) => {
			const snapshotPath = join(migrationsFolder, folderName, 'snapshot.json');
			return existsSync(snapshotPath);
		})
		.sort((a, b) => {
			const timestampA = parseInt(a.match(/^(\d+)_/)?.[1] || '0');
			const timestampB = parseInt(b.match(/^(\d+)_/)?.[1] || '0');
			return timestampA - timestampB;
		});
}
