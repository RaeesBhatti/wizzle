import { afterEach, describe, expect, test } from 'vitest';
import { writeResult } from '../src/cli/commands/migrate';
import {
	cleanupMigrationFolder,
	createMockSnapshot,
	createMockSqlStatements,
	createTempMigrationFolder,
	readSnapshot,
	readSql,
	verifyFolderStructure,
} from './helpers/migration-test-utils';

describe('writeResult - Folder Structure', () => {
	let tempFolder: string;

	afterEach(() => {
		if (tempFolder) {
			cleanupMigrationFolder(tempFolder);
		}
	});

	test('creates migration folder with timestamp prefix', () => {
		tempFolder = createTempMigrationFolder('test-timestamp');

		const snapshot = createMockSnapshot({
			dialect: 'postgresql',
			id: 'test-id-001',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		const sqlStatements = createMockSqlStatements('postgresql');

		writeResult({
			cur: snapshot,
			sqlStatements,
			outFolder: tempFolder,
			breakpoints: true,
			name: 'create_users',
			type: 'none',
		});

		// Should have created exactly one folder
		const fs = require('fs');
		const folders = fs.readdirSync(tempFolder).filter((item: string) => {
			const stat = fs.statSync(`${tempFolder}/${item}`);
			return stat.isDirectory();
		});

		expect(folders).toHaveLength(1);

		// Folder name should match pattern: <timestamp>_create_users
		const folderName = folders[0];
		expect(folderName).toMatch(/^\d+_create_users$/);
	});

	test('writes up.sql file inside migration folder', () => {
		tempFolder = createTempMigrationFolder('test-sql-file');

		const snapshot = createMockSnapshot({
			dialect: 'postgresql',
			id: 'test-id-002',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		const sqlStatements = createMockSqlStatements('postgresql');

		writeResult({
			cur: snapshot,
			sqlStatements,
			outFolder: tempFolder,
			breakpoints: true,
			name: 'add_column',
			type: 'none',
		});

		// Find the migration folder
		const fs = require('fs');
		const folders = fs.readdirSync(tempFolder).filter((item: string) => {
			const stat = fs.statSync(`${tempFolder}/${item}`);
			return stat.isDirectory();
		});

		const migrationFolder = folders[0];
		verifyFolderStructure(tempFolder, migrationFolder, { checkSql: true, checkSnapshot: false });

		const sql = readSql(tempFolder, migrationFolder);
		expect(sql).toContain('CREATE TABLE');
	});

	test('writes snapshot.json file inside migration folder', () => {
		tempFolder = createTempMigrationFolder('test-snapshot-file');

		const snapshot = createMockSnapshot({
			dialect: 'postgresql',
			id: 'test-id-003',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		const sqlStatements = createMockSqlStatements('postgresql');

		writeResult({
			cur: snapshot,
			sqlStatements,
			outFolder: tempFolder,
			breakpoints: true,
			name: 'migration_snapshot',
			type: 'none',
		});

		// Find the migration folder
		const fs = require('fs');
		const folders = fs.readdirSync(tempFolder).filter((item: string) => {
			const stat = fs.statSync(`${tempFolder}/${item}`);
			return stat.isDirectory();
		});

		const migrationFolder = folders[0];
		verifyFolderStructure(tempFolder, migrationFolder, { checkSql: false, checkSnapshot: true });

		const savedSnapshot = readSnapshot(tempFolder, migrationFolder);
		expect(savedSnapshot.id).toBe('test-id-003');
		expect(savedSnapshot.prevId).toBe('00000000-0000-0000-0000-000000000000');
	});

	test('snapshot contains correct prevId for chaining', () => {
		tempFolder = createTempMigrationFolder('test-previd-chain');

		const snapshot = createMockSnapshot({
			dialect: 'postgresql',
			id: 'chain-id-002',
			prevId: 'chain-id-001',
		});

		const sqlStatements = createMockSqlStatements('postgresql');

		writeResult({
			cur: snapshot,
			sqlStatements,
			outFolder: tempFolder,
			breakpoints: true,
			name: 'second_migration',
			type: 'none',
		});

		const fs = require('fs');
		const folders = fs.readdirSync(tempFolder).filter((item: string) => {
			const stat = fs.statSync(`${tempFolder}/${item}`);
			return stat.isDirectory();
		});

		const migrationFolder = folders[0];
		const savedSnapshot = readSnapshot(tempFolder, migrationFolder);

		expect(savedSnapshot.prevId).toBe('chain-id-001');
		expect(savedSnapshot.id).toBe('chain-id-002');
	});

	test('handles custom migration type with empty SQL template', () => {
		tempFolder = createTempMigrationFolder('test-custom');

		const snapshot = createMockSnapshot({
			dialect: 'postgresql',
			id: 'custom-id-001',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		writeResult({
			cur: snapshot,
			sqlStatements: [],
			outFolder: tempFolder,
			breakpoints: true,
			name: 'custom_migration',
			type: 'custom',
		});

		const fs = require('fs');
		const folders = fs.readdirSync(tempFolder).filter((item: string) => {
			const stat = fs.statSync(`${tempFolder}/${item}`);
			return stat.isDirectory();
		});

		const migrationFolder = folders[0];
		const sql = readSql(tempFolder, migrationFolder);

		expect(sql).toContain('-- Custom SQL migration file');
		expect(sql).toContain('put your code below!');
	});

	test('handles introspect type with commented SQL', () => {
		tempFolder = createTempMigrationFolder('test-introspect');

		const snapshot = createMockSnapshot({
			dialect: 'postgresql',
			id: 'introspect-id-001',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		const sqlStatements = createMockSqlStatements('postgresql');

		writeResult({
			cur: snapshot,
			sqlStatements,
			outFolder: tempFolder,
			breakpoints: true,
			name: 'introspect_migration',
			type: 'introspect',
		});

		const fs = require('fs');
		const folders = fs.readdirSync(tempFolder).filter((item: string) => {
			const stat = fs.statSync(`${tempFolder}/${item}`);
			return stat.isDirectory();
		});

		const migrationFolder = folders[0];
		const sql = readSql(tempFolder, migrationFolder);

		expect(sql).toContain('-- Current sql file was generated after introspecting the database');
		expect(sql).toContain('/*');
		expect(sql).toContain('*/');
		expect(sql).toContain('CREATE TABLE');
	});

	test('uses breakpoints correctly in SQL', () => {
		tempFolder = createTempMigrationFolder('test-breakpoints');

		const snapshot = createMockSnapshot({
			dialect: 'sqlite',
			id: 'breakpoint-id-001',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		const sqlStatements = [
			'CREATE TABLE users (id INTEGER PRIMARY KEY);',
			'CREATE TABLE posts (id INTEGER PRIMARY KEY);',
		];

		writeResult({
			cur: snapshot,
			sqlStatements,
			outFolder: tempFolder,
			breakpoints: true, // With breakpoints
			name: 'with_breakpoints',
			type: 'none',
		});

		const fs = require('fs');
		const folders = fs.readdirSync(tempFolder).filter((item: string) => {
			const stat = fs.statSync(`${tempFolder}/${item}`);
			return stat.isDirectory();
		});

		const migrationFolder = folders[0];
		const sql = readSql(tempFolder, migrationFolder);

		// Should contain breakpoint separator
		expect(sql).toContain('--> statement-breakpoint');
	});

	test('works for PostgreSQL dialect', () => {
		tempFolder = createTempMigrationFolder('test-pg');

		const snapshot = createMockSnapshot({
			dialect: 'postgresql',
			id: 'pg-id-001',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		const sqlStatements = createMockSqlStatements('postgresql');

		writeResult({
			cur: snapshot,
			sqlStatements,
			outFolder: tempFolder,
			breakpoints: true,
			name: 'pg_migration',
			type: 'none',
		});

		const fs = require('fs');
		const folders = fs.readdirSync(tempFolder);
		expect(folders.length).toBeGreaterThan(0);

		const migrationFolder = folders[0];
		const savedSnapshot = readSnapshot(tempFolder, migrationFolder);
		expect(savedSnapshot.dialect).toBe('postgresql');
	});

	test('works for MySQL dialect', () => {
		tempFolder = createTempMigrationFolder('test-mysql');

		const snapshot = createMockSnapshot({
			dialect: 'mysql',
			id: 'mysql-id-001',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		const sqlStatements = createMockSqlStatements('mysql');

		writeResult({
			cur: snapshot,
			sqlStatements,
			outFolder: tempFolder,
			breakpoints: true,
			name: 'mysql_migration',
			type: 'none',
		});

		const fs = require('fs');
		const folders = fs.readdirSync(tempFolder);
		expect(folders.length).toBeGreaterThan(0);

		const migrationFolder = folders[0];
		const savedSnapshot = readSnapshot(tempFolder, migrationFolder);
		expect(savedSnapshot.dialect).toBe('mysql');
	});

	test('works for SQLite dialect', () => {
		tempFolder = createTempMigrationFolder('test-sqlite');

		const snapshot = createMockSnapshot({
			dialect: 'sqlite',
			id: 'sqlite-id-001',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		const sqlStatements = createMockSqlStatements('sqlite');

		writeResult({
			cur: snapshot,
			sqlStatements,
			outFolder: tempFolder,
			breakpoints: true,
			name: 'sqlite_migration',
			type: 'none',
		});

		const fs = require('fs');
		const folders = fs.readdirSync(tempFolder);
		expect(folders.length).toBeGreaterThan(0);

		const migrationFolder = folders[0];
		const savedSnapshot = readSnapshot(tempFolder, migrationFolder);
		expect(savedSnapshot.dialect).toBe('sqlite');
	});

	test('works for SingleStore dialect', () => {
		tempFolder = createTempMigrationFolder('test-singlestore');

		const snapshot = createMockSnapshot({
			dialect: 'singlestore',
			id: 'singlestore-id-001',
			prevId: '00000000-0000-0000-0000-000000000000',
		});

		const sqlStatements = createMockSqlStatements('singlestore');

		writeResult({
			cur: snapshot,
			sqlStatements,
			outFolder: tempFolder,
			breakpoints: true,
			name: 'singlestore_migration',
			type: 'none',
		});

		const fs = require('fs');
		const folders = fs.readdirSync(tempFolder);
		expect(folders.length).toBeGreaterThan(0);

		const migrationFolder = folders[0];
		const savedSnapshot = readSnapshot(tempFolder, migrationFolder);
		expect(savedSnapshot.dialect).toBe('singlestore');
	});
});
