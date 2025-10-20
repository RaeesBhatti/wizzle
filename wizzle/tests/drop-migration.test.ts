import { afterEach, describe, expect, test, vi } from 'vitest';
import { dropMigration } from '../src/cli/commands/drop';
import {
	cleanupMigrationFolder,
	countMigrationFolders,
	createTempMigrationFolder,
	getMigrationFolders,
} from './helpers/migration-test-utils';
import { existsSync } from 'fs';
import { join } from 'path';

// Mock hanji's render function and classes
vi.mock('hanji', () => ({
	render: vi.fn((view) => {
		// Simulate user selecting the first migration
		return Promise.resolve({
			status: 'submitted',
			data: {
				tag: '1700000001000_second',
			},
		});
	}),
	Prompt: class Prompt {
		on() {}
	},
	SelectState: class SelectState {
		selectedIdx = 0;
		items: any[] = [];
		bind() {}
	},
	TaskView: class TaskView {
		on() {}
		requestLayout() {}
	},
}));

describe('dropMigration', () => {
	let tempFolder: string;

	afterEach(() => {
		if (tempFolder) {
			cleanupMigrationFolder(tempFolder);
		}
		vi.clearAllMocks();
	});

	test('deletes entire migration folder', async () => {
		tempFolder = createTempMigrationFolder('test-drop-folder');

		// Copy valid-chain fixtures to temp folder
		const fs = require('fs');
		const path = require('path');
		const sourceFolder = 'tests/fixtures/snapshot-chains/valid-chain';

		// Copy all migration folders
		const sourceFolders = fs.readdirSync(sourceFolder);
		sourceFolders.forEach((folder: string) => {
			const sourcePath = path.join(sourceFolder, folder);
			const destPath = path.join(tempFolder, folder);

			if (fs.statSync(sourcePath).isDirectory()) {
				fs.mkdirSync(destPath, { recursive: true });

				// Copy files
				const files = fs.readdirSync(sourcePath);
				files.forEach((file: string) => {
					fs.copyFileSync(
						path.join(sourcePath, file),
						path.join(destPath, file)
					);
				});
			}
		});

		// Verify we have 3 migrations before drop
		expect(countMigrationFolders(tempFolder)).toBe(3);

		// Drop the second migration
		await dropMigration({
			out: tempFolder,
			bundle: false,
		});

		// Should have 2 migrations left
		expect(countMigrationFolders(tempFolder)).toBe(2);

		// The second migration folder should not exist
		expect(existsSync(join(tempFolder, '1700000001000_second'))).toBe(false);

		// First and third should still exist
		expect(existsSync(join(tempFolder, '1700000000000_first'))).toBe(true);
		expect(existsSync(join(tempFolder, '1700000002000_third'))).toBe(true);
	});

	test('uses buildSnapshotChain to list migrations', async () => {
		tempFolder = createTempMigrationFolder('test-list-migrations');

		// Copy valid-chain fixtures
		const fs = require('fs');
		const path = require('path');
		const sourceFolder = 'tests/fixtures/snapshot-chains/valid-chain';

		const sourceFolders = fs.readdirSync(sourceFolder);
		sourceFolders.forEach((folder: string) => {
			const sourcePath = path.join(sourceFolder, folder);
			const destPath = path.join(tempFolder, folder);

			if (fs.statSync(sourcePath).isDirectory()) {
				fs.mkdirSync(destPath, { recursive: true });

				const files = fs.readdirSync(sourcePath);
				files.forEach((file: string) => {
					fs.copyFileSync(
						path.join(sourcePath, file),
						path.join(destPath, file)
					);
				});
			}
		});

		const folders = getMigrationFolders(tempFolder);

		// Should be ordered by snapshot chain, not just timestamp
		expect(folders).toEqual([
			'1700000000000_first',
			'1700000001000_second',
			'1700000002000_third',
		]);
	});

	test('handles empty migrations folder gracefully', async () => {
		tempFolder = createTempMigrationFolder('test-empty-drop');

		// Call dropMigration on empty folder - should not throw
		await expect(dropMigration({
			out: tempFolder,
			bundle: false,
		})).resolves.not.toThrow();
	});

	test('updates embedded migrations after drop when bundle is true', async () => {
		tempFolder = createTempMigrationFolder('test-bundle-update');

		// Copy valid-chain fixtures
		const fs = require('fs');
		const path = require('path');
		const sourceFolder = 'tests/fixtures/snapshot-chains/valid-chain';

		const sourceFolders = fs.readdirSync(sourceFolder);
		sourceFolders.forEach((folder: string) => {
			const sourcePath = path.join(sourceFolder, folder);
			const destPath = path.join(tempFolder, folder);

			if (fs.statSync(sourcePath).isDirectory()) {
				fs.mkdirSync(destPath, { recursive: true });

				const files = fs.readdirSync(sourcePath);
				files.forEach((file: string) => {
					fs.copyFileSync(
						path.join(sourcePath, file),
						path.join(destPath, file)
					);
				});
			}
		});

		// Drop with bundle = true
		await dropMigration({
			out: tempFolder,
			bundle: true,
		});

		// migrations.js should have been created/updated
		const migrationsJsPath = join(tempFolder, 'migrations.js');
		expect(existsSync(migrationsJsPath)).toBe(true);

		// Read the file and verify it doesn't include the dropped migration
		const content = fs.readFileSync(migrationsJsPath, 'utf8');
		expect(content).not.toContain('1700000001000_second');
	});

	test('maintains folder structure after deletion', async () => {
		tempFolder = createTempMigrationFolder('test-structure-after-drop');

		// Copy valid-chain fixtures
		const fs = require('fs');
		const path = require('path');
		const sourceFolder = 'tests/fixtures/snapshot-chains/valid-chain';

		const sourceFolders = fs.readdirSync(sourceFolder);
		sourceFolders.forEach((folder: string) => {
			const sourcePath = path.join(sourceFolder, folder);
			const destPath = path.join(tempFolder, folder);

			if (fs.statSync(sourcePath).isDirectory()) {
				fs.mkdirSync(destPath, { recursive: true });

				const files = fs.readdirSync(sourcePath);
				files.forEach((file: string) => {
					fs.copyFileSync(
						path.join(sourcePath, file),
						path.join(destPath, file)
					);
				});
			}
		});

		await dropMigration({
			out: tempFolder,
			bundle: false,
		});

		// Verify remaining migrations still have both files
		const firstFolder = join(tempFolder, '1700000000000_first');
		expect(existsSync(join(firstFolder, 'up.sql'))).toBe(true);
		expect(existsSync(join(firstFolder, 'snapshot.json'))).toBe(true);

		const thirdFolder = join(tempFolder, '1700000002000_third');
		expect(existsSync(join(thirdFolder, 'up.sql'))).toBe(true);
		expect(existsSync(join(thirdFolder, 'snapshot.json'))).toBe(true);
	});
});
