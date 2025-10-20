import { afterEach, describe, expect, test } from 'vitest';
import { readMigrationFiles } from '../../src/runtime/migrator';
import { writeResult } from '../../src/cli/commands/migrate';
import {
	cleanupMigrationFolder,
	countMigrationFolders,
	createMockSnapshot,
	createMockSqlStatements,
	createTempMigrationFolder,
	getMigrationFolders,
	readSnapshot,
	verifyFolderStructure,
	verifySnapshotChain,
} from '../helpers/migration-test-utils';

describe('E2E: Folder-based Migration Flow', () => {
	let tempFolder: string;

	afterEach(() => {
		if (tempFolder) {
			cleanupMigrationFolder(tempFolder);
		}
	});

	test('generates first migration with correct folder structure', () => {
		tempFolder = createTempMigrationFolder('e2e-first-migration');

		const snapshot = createMockSnapshot({
			dialect: 'postgresql',
			id: 'e2e-id-001',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		const sqlStatements = createMockSqlStatements('postgresql');

		writeResult({
			cur: snapshot,
			sqlStatements,
			outFolder: tempFolder,
			breakpoints: true,
			name: 'initial_schema',
			type: 'none',
		});

		// Verify folder was created
		expect(countMigrationFolders(tempFolder)).toBe(1);

		const folders = getMigrationFolders(tempFolder);
		const firstFolder = folders[0];

		// Verify structure
		verifyFolderStructure(tempFolder, firstFolder);

		// Verify snapshot
		const savedSnapshot = readSnapshot(tempFolder, firstFolder);
		expect(savedSnapshot.id).toBe('e2e-id-001');
		expect(savedSnapshot.prevId).toBe('00000000-0000-0000-0000-000000000000');
	});

	test('generates second migration with correct prevId chain', () => {
		tempFolder = createTempMigrationFolder('e2e-second-migration');

		// First migration
		const snapshot1 = createMockSnapshot({
			dialect: 'postgresql',
			id: 'e2e-chain-001',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		writeResult({
			cur: snapshot1,
			sqlStatements: createMockSqlStatements('postgresql'),
			outFolder: tempFolder,
			breakpoints: true,
			name: 'first',
			type: 'none',
		});

		// Second migration
		const snapshot2 = createMockSnapshot({
			dialect: 'postgresql',
			id: 'e2e-chain-002',
			prevId: 'e2e-chain-001', // Links to first
		});

		writeResult({
			cur: snapshot2,
			sqlStatements: ['ALTER TABLE "users" ADD COLUMN "email" text;'],
			outFolder: tempFolder,
			breakpoints: true,
			name: 'second',
			type: 'none',
		});

		// Should have 2 migrations
		expect(countMigrationFolders(tempFolder)).toBe(2);

		// Verify chain
		verifySnapshotChain(tempFolder);
	});

	test('generates third migration maintaining chain integrity', () => {
		tempFolder = createTempMigrationFolder('e2e-third-migration');

		// Create three linked migrations
		const migrations = [
			{ id: 'chain-1', prevId: '00000000-0000-0000-0000-000000000000', name: 'first' },
			{ id: 'chain-2', prevId: 'chain-1', name: 'second' },
			{ id: 'chain-3', prevId: 'chain-2', name: 'third' },
		];

		migrations.forEach((migration) => {
			const snapshot = createMockSnapshot({
				dialect: 'postgresql',
				id: migration.id,
				prevId: migration.prevId,
			});

			writeResult({
				cur: snapshot,
				sqlStatements: createMockSqlStatements('postgresql'),
				outFolder: tempFolder,
				breakpoints: true,
				name: migration.name,
				type: 'none',
			});
		});

		expect(countMigrationFolders(tempFolder)).toBe(3);
		verifySnapshotChain(tempFolder);
	});

	test('runtime migrator can read generated migrations', () => {
		tempFolder = createTempMigrationFolder('e2e-runtime-read');

		// Generate a few migrations
		const snapshot1 = createMockSnapshot({
			dialect: 'postgresql',
			id: 'runtime-001',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		writeResult({
			cur: snapshot1,
			sqlStatements: createMockSqlStatements('postgresql'),
			outFolder: tempFolder,
			breakpoints: true,
			name: 'migration_one',
			type: 'none',
		});

		const snapshot2 = createMockSnapshot({
			dialect: 'postgresql',
			id: 'runtime-002',
			prevId: 'runtime-001',
		});

		writeResult({
			cur: snapshot2,
			sqlStatements: ['ALTER TABLE "users" ADD COLUMN "name" text;'],
			outFolder: tempFolder,
			breakpoints: true,
			name: 'migration_two',
			type: 'none',
		});

		// Runtime migrator should be able to read these
		const migrations = readMigrationFiles({
			migrationsFolder: tempFolder,
		});

		expect(migrations).toHaveLength(2);
		expect(migrations[0].sql.length).toBeGreaterThan(0);
		expect(migrations[1].sql.length).toBeGreaterThan(0);
	});

	test('full flow for PostgreSQL dialect', () => {
		tempFolder = createTempMigrationFolder('e2e-pg-full');

		// Create a series of PostgreSQL migrations
		const pgMigrations = [
			{
				id: 'pg-001',
				prevId: '00000000-0000-0000-0000-000000000000',
				name: 'create_users',
				sql: ['CREATE TABLE "users" ("id" serial PRIMARY KEY);'],
			},
			{
				id: 'pg-002',
				prevId: 'pg-001',
				name: 'add_email',
				sql: ['ALTER TABLE "users" ADD COLUMN "email" text;'],
			},
			{
				id: 'pg-003',
				prevId: 'pg-002',
				name: 'add_index',
				sql: ['CREATE INDEX "users_email_idx" ON "users" ("email");'],
			},
		];

		pgMigrations.forEach((migration) => {
			const snapshot = createMockSnapshot({
				dialect: 'postgresql',
				id: migration.id,
				prevId: migration.prevId,
			});

			writeResult({
				cur: snapshot,
				sqlStatements: migration.sql,
				outFolder: tempFolder,
				breakpoints: true,
				name: migration.name,
				type: 'none',
			});
		});

		expect(countMigrationFolders(tempFolder)).toBe(3);
		verifySnapshotChain(tempFolder);

		// Runtime migrator should read them in correct order
		const migrations = readMigrationFiles({
			migrationsFolder: tempFolder,
		});

		expect(migrations).toHaveLength(3);
		expect(migrations[0].sql[0]).toContain('CREATE TABLE');
		expect(migrations[1].sql[0]).toContain('ADD COLUMN');
		expect(migrations[2].sql[0]).toContain('CREATE INDEX');
	});

	test('full flow for MySQL dialect', () => {
		tempFolder = createTempMigrationFolder('e2e-mysql-full');

		const mysqlMigrations = [
			{
				id: 'mysql-001',
				prevId: '00000000-0000-0000-0000-000000000000',
				name: 'create_users',
				sql: ['CREATE TABLE `users` (`id` int PRIMARY KEY AUTO_INCREMENT);'],
			},
			{
				id: 'mysql-002',
				prevId: 'mysql-001',
				name: 'add_email',
				sql: ['ALTER TABLE `users` ADD COLUMN `email` varchar(255);'],
			},
		];

		mysqlMigrations.forEach((migration) => {
			const snapshot = createMockSnapshot({
				dialect: 'mysql',
				id: migration.id,
				prevId: migration.prevId,
			});

			writeResult({
				cur: snapshot,
				sqlStatements: migration.sql,
				outFolder: tempFolder,
				breakpoints: true,
				name: migration.name,
				type: 'none',
			});
		});

		expect(countMigrationFolders(tempFolder)).toBe(2);
		verifySnapshotChain(tempFolder);
	});

	test('full flow for SQLite dialect', () => {
		tempFolder = createTempMigrationFolder('e2e-sqlite-full');

		const sqliteMigrations = [
			{
				id: 'sqlite-001',
				prevId: '00000000-0000-0000-0000-000000000000',
				name: 'create_users',
				sql: ['CREATE TABLE `users` (`id` integer PRIMARY KEY NOT NULL);'],
			},
			{
				id: 'sqlite-002',
				prevId: 'sqlite-001',
				name: 'add_name',
				sql: ['ALTER TABLE `users` ADD COLUMN `name` text;'],
			},
		];

		sqliteMigrations.forEach((migration) => {
			const snapshot = createMockSnapshot({
				dialect: 'sqlite',
				id: migration.id,
				prevId: migration.prevId,
			});

			writeResult({
				cur: snapshot,
				sqlStatements: migration.sql,
				outFolder: tempFolder,
				breakpoints: true,
				name: migration.name,
				type: 'none',
			});
		});

		expect(countMigrationFolders(tempFolder)).toBe(2);
		verifySnapshotChain(tempFolder);
	});

	test('migrations are ordered by timestamp when multiple exist', () => {
		tempFolder = createTempMigrationFolder('e2e-timestamp-ordering');

		// Create migrations with specific timestamps (simulated by waiting)
		const snapshot1 = createMockSnapshot({
			dialect: 'postgresql',
			id: 'timestamp-001',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		writeResult({
			cur: snapshot1,
			sqlStatements: createMockSqlStatements('postgresql'),
			outFolder: tempFolder,
			breakpoints: true,
			name: 'first',
			type: 'none',
		});

		// Small delay to ensure different timestamps
		const now = Date.now();
		while (Date.now() < now + 10) {
			// Small delay
		}

		const snapshot2 = createMockSnapshot({
			dialect: 'postgresql',
			id: 'timestamp-002',
			prevId: 'timestamp-001',
		});

		writeResult({
			cur: snapshot2,
			sqlStatements: createMockSqlStatements('postgresql'),
			outFolder: tempFolder,
			breakpoints: true,
			name: 'second',
			type: 'none',
		});

		const folders = getMigrationFolders(tempFolder);

		// Extract timestamps
		const timestamp1 = parseInt(folders[0].match(/^(\d+)_/)?.[1] || '0');
		const timestamp2 = parseInt(folders[1].match(/^(\d+)_/)?.[1] || '0');

		expect(timestamp2).toBeGreaterThan(timestamp1);
	});
});
