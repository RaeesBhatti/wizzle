import { describe, expect, test } from 'vitest';
import { buildSnapshotChain } from '../src/utils';
import { getMigrationFolders } from './helpers/migration-test-utils';

describe('buildSnapshotChain', () => {
	test('correctly orders migrations by following prevId chain', () => {
		const tags = buildSnapshotChain('tests/fixtures/snapshot-chains/valid-chain');

		expect(tags).toHaveLength(3);
		expect(tags[0]).toBe('1700000000000_first');
		expect(tags[1]).toBe('1700000001000_second');
		expect(tags[2]).toBe('1700000002000_third');
	});

	test('handles root migration with originUUID prevId', () => {
		const tags = buildSnapshotChain('tests/fixtures/snapshot-chains/valid-chain');

		expect(tags[0]).toBe('1700000000000_first');
		// The first migration should be the root
		const firstFolder = tags[0];
		expect(firstFolder).toMatch(/^\d+_/); // Has timestamp prefix
	});

	test('returns empty array for non-existent folder', () => {
		// buildSnapshotChain doesn't throw on non-existent folder, it returns []
		// (based on the implementation that checks existsSync)
		const tags = buildSnapshotChain('tests/fixtures/snapshot-chains/non-existent');

		expect(tags).toEqual([]);
	});

	test('returns empty array for empty migration folder', () => {
		// Create an empty folder for testing
		const fs = require('fs');
		const emptyPath = 'tests/fixtures/snapshot-chains/empty';

		if (!fs.existsSync(emptyPath)) {
			fs.mkdirSync(emptyPath, { recursive: true });
		}

		const tags = buildSnapshotChain(emptyPath);

		expect(tags).toEqual([]);

		// Cleanup
		if (fs.existsSync(emptyPath)) {
			fs.rmdirSync(emptyPath);
		}
	});

	test('uses timestamp for ordering when available', () => {
		const tags = buildSnapshotChain('tests/fixtures/snapshot-chains/valid-chain');

		// Extract timestamps from folder names
		const timestamps = tags.map((tag) => {
			const match = tag.match(/^(\d+)_/);
			return match ? parseInt(match[1]) : 0;
		});

		// Verify timestamps are in ascending order
		for (let i = 1; i < timestamps.length; i++) {
			expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
		}
	});

	test('handles malformed snapshot.json gracefully', () => {
		// Create a folder with a malformed snapshot
		const fs = require('fs');
		const path = require('path');
		const malformedPath = 'tests/fixtures/snapshot-chains/malformed';
		const migrationFolder = path.join(malformedPath, '1700000000000_malformed');

		if (!fs.existsSync(migrationFolder)) {
			fs.mkdirSync(migrationFolder, { recursive: true });
		}

		// Write invalid JSON
		fs.writeFileSync(path.join(migrationFolder, 'snapshot.json'), '{invalid json');

		// buildSnapshotChain should handle the error and skip this migration
		const tags = buildSnapshotChain(malformedPath);

		// Should return empty array or skip the malformed one
		expect(tags).toEqual([]);

		// Cleanup
		if (fs.existsSync(malformedPath)) {
			fs.rmSync(malformedPath, { recursive: true });
		}
	});

	test('detects and handles broken chains', () => {
		// This chain has a migration with prevId that doesn't exist
		const tags = buildSnapshotChain('tests/fixtures/snapshot-chains/broken-chain');

		// Should only return the first migration since the second one's prevId is broken
		expect(tags).toHaveLength(1);
		expect(tags[0]).toBe('1700000000000_first');
	});

	test('only includes folders with snapshot.json', () => {
		// Create a folder with a migration and a random folder without snapshot
		const fs = require('fs');
		const path = require('path');
		const testPath = 'tests/fixtures/snapshot-chains/mixed';
		const validMigration = path.join(testPath, '1700000000000_valid');
		const invalidFolder = path.join(testPath, '1700000001000_no_snapshot');

		if (!fs.existsSync(validMigration)) {
			fs.mkdirSync(validMigration, { recursive: true });
		}
		if (!fs.existsSync(invalidFolder)) {
			fs.mkdirSync(invalidFolder, { recursive: true });
		}

		// Only create snapshot.json in the valid migration
		fs.writeFileSync(
			path.join(validMigration, 'snapshot.json'),
			JSON.stringify({
				version: '7',
				dialect: 'postgresql',
				id: 'test-id',
				prevId: '00000000-0000-0000-0000-000000000000',
				tables: {},
				enums: {},
				schemas: {},
				_meta: { schemas: {}, tables: {}, columns: {} },
			})
		);

		// Don't create snapshot.json in the invalid folder

		const tags = buildSnapshotChain(testPath);

		// Should only return the folder with snapshot.json
		expect(tags).toHaveLength(1);
		expect(tags[0]).toBe('1700000000000_valid');

		// Cleanup
		if (fs.existsSync(testPath)) {
			fs.rmSync(testPath, { recursive: true });
		}
	});

	test('handles multiple migrations with same prevId (branching)', () => {
		// Create a scenario where two migrations both have the same prevId
		const fs = require('fs');
		const path = require('path');
		const branchPath = 'tests/fixtures/snapshot-chains/branching';
		const firstMigration = path.join(branchPath, '1700000000000_first');
		const secondMigrationA = path.join(branchPath, '1700000001000_second_a');
		const secondMigrationB = path.join(branchPath, '1700000002000_second_b');

		if (!fs.existsSync(firstMigration)) {
			fs.mkdirSync(firstMigration, { recursive: true });
		}
		if (!fs.existsSync(secondMigrationA)) {
			fs.mkdirSync(secondMigrationA, { recursive: true });
		}
		if (!fs.existsSync(secondMigrationB)) {
			fs.mkdirSync(secondMigrationB, { recursive: true });
		}

		const firstId = 'branch-0001';
		const secondIdA = 'branch-0002-a';
		const secondIdB = 'branch-0002-b';

		fs.writeFileSync(
			path.join(firstMigration, 'snapshot.json'),
			JSON.stringify({
				version: '7',
				dialect: 'postgresql',
				id: firstId,
				prevId: '00000000-0000-0000-0000-000000000000',
				tables: {},
				enums: {},
				schemas: {},
				_meta: { schemas: {}, tables: {}, columns: {} },
			})
		);

		// Both reference the first migration
		fs.writeFileSync(
			path.join(secondMigrationA, 'snapshot.json'),
			JSON.stringify({
				version: '7',
				dialect: 'postgresql',
				id: secondIdA,
				prevId: firstId, // Same prevId
				tables: {},
				enums: {},
				schemas: {},
				_meta: { schemas: {}, tables: {}, columns: {} },
			})
		);

		fs.writeFileSync(
			path.join(secondMigrationB, 'snapshot.json'),
			JSON.stringify({
				version: '7',
				dialect: 'postgresql',
				id: secondIdB,
				prevId: firstId, // Same prevId
				tables: {},
				enums: {},
				schemas: {},
				_meta: { schemas: {}, tables: {}, columns: {} },
			})
		);

		const tags = buildSnapshotChain(branchPath);

		// Should return all 3, with the first migration first, then both branches sorted by timestamp
		expect(tags).toHaveLength(3);
		expect(tags[0]).toBe('1700000000000_first');
		// The two branches should be sorted by timestamp
		expect(tags[1]).toBe('1700000001000_second_a');
		expect(tags[2]).toBe('1700000002000_second_b');

		// Cleanup
		if (fs.existsSync(branchPath)) {
			fs.rmSync(branchPath, { recursive: true });
		}
	});
});
