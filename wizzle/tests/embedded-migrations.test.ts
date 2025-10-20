import { describe, expect, test } from 'vitest';
import { embeddedMigrations } from '../src/cli/commands/migrate';

describe('embeddedMigrations', () => {
	test('generates correct imports for folder structure', () => {
		const js = embeddedMigrations('tests/fixtures/snapshot-chains/valid-chain');

		// Should import from folder/up.sql pattern
		expect(js).toContain("from './1700000000000_first/up.sql'");
		expect(js).toContain("from './1700000001000_second/up.sql'");
		expect(js).toContain("from './1700000002000_third/up.sql'");
	});

	test('orders migrations correctly using buildSnapshotChain', () => {
		const js = embeddedMigrations('tests/fixtures/snapshot-chains/valid-chain');

		// The imports should be in order
		const firstImportIndex = js.indexOf('1700000000000_first/up.sql');
		const secondImportIndex = js.indexOf('1700000001000_second/up.sql');
		const thirdImportIndex = js.indexOf('1700000002000_third/up.sql');

		expect(firstImportIndex).toBeLessThan(secondImportIndex);
		expect(secondImportIndex).toBeLessThan(thirdImportIndex);
	});

	test('generates correct module format for Expo', () => {
		const js = embeddedMigrations('tests/fixtures/snapshot-chains/valid-chain', 'expo');

		// Should include Expo-specific comment
		expect(js).toContain('// This file is required for Expo/React Native SQLite migrations');
		expect(js).toContain('https://orm.drizzle.team/quick-sqlite/expo');
	});

	test('generates correct module format without driver', () => {
		const js = embeddedMigrations('tests/fixtures/snapshot-chains/valid-chain');

		// Should not include Expo-specific comment
		expect(js).not.toContain('// This file is required for Expo/React Native SQLite migrations');
	});

	test('includes all migrations in export', () => {
		const js = embeddedMigrations('tests/fixtures/snapshot-chains/valid-chain');

		// Should export default with migrations object
		expect(js).toContain('export default');
		expect(js).toContain('migrations: {');

		// Should include indexed migrations
		expect(js).toContain('m0000');
		expect(js).toContain('m0001');
		expect(js).toContain('m0002');
	});

	test('uses padded indices for migrations', () => {
		const js = embeddedMigrations('tests/fixtures/snapshot-chains/valid-chain');

		// Indices should be zero-padded to 4 digits
		expect(js).toMatch(/m0000/);
		expect(js).toMatch(/m0001/);
		expect(js).toMatch(/m0002/);
	});

	test('returns empty structure for folder with no migrations', () => {
		const fs = require('fs');
		const emptyPath = 'tests/fixtures/snapshot-chains/empty-for-embedded';

		if (!fs.existsSync(emptyPath)) {
			fs.mkdirSync(emptyPath, { recursive: true });
		}

		const js = embeddedMigrations(emptyPath);

		// Should have export structure but no imports
		expect(js).toContain('export default');
		expect(js).toContain('migrations: {');

		// Should not have any import statements
		expect(js).not.toContain("import m");

		// Cleanup
		if (fs.existsSync(emptyPath)) {
			fs.rmdirSync(emptyPath);
		}
	});

	test('handles single migration correctly', () => {
		// Create a temporary folder with just one migration
		const fs = require('fs');
		const path = require('path');
		const singlePath = 'tests/fixtures/snapshot-chains/single-migration';
		const migrationFolder = path.join(singlePath, '1700000000000_only_one');

		if (!fs.existsSync(migrationFolder)) {
			fs.mkdirSync(migrationFolder, { recursive: true });
		}

		fs.writeFileSync(
			path.join(migrationFolder, 'snapshot.json'),
			JSON.stringify({
				version: '7',
				dialect: 'postgresql',
				id: 'single-id',
				prevId: '00000000-0000-0000-0000-000000000000',
				tables: {},
				enums: {},
				schemas: {},
				_meta: { schemas: {}, tables: {}, columns: {} },
			})
		);

		fs.writeFileSync(
			path.join(migrationFolder, 'up.sql'),
			'CREATE TABLE users (id serial);'
		);

		const js = embeddedMigrations(singlePath);

		// Should have exactly one import
		expect(js).toContain("import m0000 from './1700000000000_only_one/up.sql'");
		expect(js).not.toContain('m0001');

		// Cleanup
		if (fs.existsSync(singlePath)) {
			fs.rmSync(singlePath, { recursive: true });
		}
	});
});
