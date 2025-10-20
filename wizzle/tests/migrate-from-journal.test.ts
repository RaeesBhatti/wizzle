import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import {
	detectHybridStructure,
	migrateFromJournal,
	parseTagName,
	validateJournalStructure,
} from '../src/cli/commands/migrate-from-journal';
import {
	cleanupMigrationFolder,
	countMigrationFolders,
	createTempMigrationFolder,
	readSnapshot,
	readSql,
	verifyFolderStructure,
} from './helpers/migration-test-utils';

describe('parseTagName', () => {
	test('parses tag with underscore correctly', () => {
		expect(parseTagName('0000_little_blizzard')).toBe('little_blizzard');
		expect(parseTagName('0001_second_migration')).toBe('second_migration');
	});

	test('handles tag without underscore', () => {
		expect(parseTagName('migration')).toBe('migration');
	});

	test('handles multiple underscores', () => {
		expect(parseTagName('0000_add_user_email_column')).toBe('add_user_email_column');
	});
});

describe('validateJournalStructure', () => {
	test('validates correct journal structure', () => {
		const fixtureFolder = 'tests/fixtures/journal-based';
		const validation = validateJournalStructure(fixtureFolder);

		expect(validation.valid).toBe(true);
		expect(validation.missingFiles).toHaveLength(0);
		expect(validation.journal).toBeDefined();
		expect(validation.journal?.entries).toHaveLength(3);
	});

	test('detects missing migrations folder', () => {
		const validation = validateJournalStructure('tests/fixtures/nonexistent');

		expect(validation.valid).toBe(false);
		expect(validation.missingFiles).toContain('tests/fixtures/nonexistent');
	});

	test('detects missing meta folder', () => {
		const tempFolder = createTempMigrationFolder('test-no-meta');
		const validation = validateJournalStructure(tempFolder);

		expect(validation.valid).toBe(false);
		expect(validation.missingFiles).toContain(join(tempFolder, 'meta'));

		cleanupMigrationFolder(tempFolder);
	});

	test('detects missing _journal.json', () => {
		const tempFolder = createTempMigrationFolder('test-no-journal');
		const fs = require('fs');
		fs.mkdirSync(join(tempFolder, 'meta'), { recursive: true });

		const validation = validateJournalStructure(tempFolder);

		expect(validation.valid).toBe(false);
		expect(validation.missingFiles).toContain(join(tempFolder, 'meta', '_journal.json'));

		cleanupMigrationFolder(tempFolder);
	});

	test('detects missing snapshot files', () => {
		const tempFolder = createTempMigrationFolder('test-missing-snapshot');
		const fs = require('fs');
		const path = require('path');

		// Create meta folder and journal
		fs.mkdirSync(join(tempFolder, 'meta'), { recursive: true });
		fs.writeFileSync(
			join(tempFolder, 'meta', '_journal.json'),
			JSON.stringify({
				version: '7',
				dialect: 'postgresql',
				entries: [
					{ idx: 0, version: '7', when: 1700000000000, tag: '0000_first', breakpoints: true },
				],
			}),
		);

		const validation = validateJournalStructure(tempFolder);

		expect(validation.valid).toBe(false);
		expect(validation.missingFiles).toContain(join(tempFolder, 'meta', '0000_snapshot.json'));
		expect(validation.missingFiles).toContain(join(tempFolder, '0000_first.sql'));

		cleanupMigrationFolder(tempFolder);
	});
});

describe('detectHybridStructure', () => {
	test('detects hybrid structure', () => {
		const tempFolder = createTempMigrationFolder('test-hybrid');
		const fs = require('fs');
		const path = require('path');

		// Create old format (journal)
		fs.mkdirSync(join(tempFolder, 'meta'), { recursive: true });
		fs.writeFileSync(
			join(tempFolder, 'meta', '_journal.json'),
			JSON.stringify({
				version: '7',
				dialect: 'postgresql',
				entries: [],
			}),
		);

		// Create new format (folder-based)
		const migrationFolder = join(tempFolder, '1700000000000_test');
		fs.mkdirSync(migrationFolder, { recursive: true });
		fs.writeFileSync(
			join(migrationFolder, 'snapshot.json'),
			JSON.stringify({
				id: 'test-id',
				prevId: '00000000-0000-0000-0000-000000000000',
			}),
		);

		const isHybrid = detectHybridStructure(tempFolder);
		expect(isHybrid).toBe(true);

		cleanupMigrationFolder(tempFolder);
	});

	test('detects pure old format', () => {
		const fixtureFolder = 'tests/fixtures/journal-based';
		const isHybrid = detectHybridStructure(fixtureFolder);
		expect(isHybrid).toBe(false);
	});

	test('detects pure new format', () => {
		const fixtureFolder = 'tests/fixtures/snapshot-chains/valid-chain';
		const isHybrid = detectHybridStructure(fixtureFolder);
		expect(isHybrid).toBe(false);
	});

	test('handles non-existent folder', () => {
		const isHybrid = detectHybridStructure('tests/fixtures/nonexistent');
		expect(isHybrid).toBe(false);
	});
});

describe('migrateFromJournal', () => {
	let tempFolder: string;

	afterEach(() => {
		if (tempFolder) {
			cleanupMigrationFolder(tempFolder);
		}
	});

	test('migrates all journal entries to folder structure', async () => {
		tempFolder = createTempMigrationFolder('test-migrate-all');
		const fs = require('fs');
		const path = require('path');

		// Copy journal-based fixtures to temp folder
		const sourceFolder = 'tests/fixtures/journal-based';
		fs.cpSync(sourceFolder, tempFolder, { recursive: true });

		// Verify no new-format folders exist before migration
		expect(countMigrationFolders(tempFolder)).toBe(0);

		// Perform migration
		await migrateFromJournal({
			out: tempFolder,
			dryRun: false,
		});

		// Verify all 3 migrations were created
		expect(countMigrationFolders(tempFolder)).toBe(3);

		// Verify folder structure
		verifyFolderStructure(tempFolder, '1700000000000_first');
		verifyFolderStructure(tempFolder, '1700000001000_second');
		verifyFolderStructure(tempFolder, '1700000002000_third');

		// Verify content was copied correctly
		const firstSnapshot = readSnapshot(tempFolder, '1700000000000_first');
		expect(firstSnapshot.id).toBe('aaaaaaaa-0001-0001-0001-000000000001');
		expect(firstSnapshot.prevId).toBe('00000000-0000-0000-0000-000000000000');

		const firstSql = readSql(tempFolder, '1700000000000_first');
		expect(firstSql).toContain('CREATE TABLE IF NOT EXISTS "users"');

		// Verify old files are still present
		expect(existsSync(join(tempFolder, 'meta', '_journal.json'))).toBe(true);
		expect(existsSync(join(tempFolder, '0000_first.sql'))).toBe(true);
		expect(existsSync(join(tempFolder, 'meta', '0000_snapshot.json'))).toBe(true);
	});

	test('dry run does not create files', async () => {
		tempFolder = createTempMigrationFolder('test-dry-run');
		const fs = require('fs');

		// Copy journal-based fixtures
		const sourceFolder = 'tests/fixtures/journal-based';
		fs.cpSync(sourceFolder, tempFolder, { recursive: true });

		// Perform dry run
		await migrateFromJournal({
			out: tempFolder,
			dryRun: true,
		});

		// Verify no new folders were created
		expect(countMigrationFolders(tempFolder)).toBe(0);

		// But old files should still exist
		expect(existsSync(join(tempFolder, 'meta', '_journal.json'))).toBe(true);
	});

	test('skips already migrated entries', async () => {
		tempFolder = createTempMigrationFolder('test-skip-existing');
		const fs = require('fs');
		const path = require('path');

		// Copy journal-based fixtures
		const sourceFolder = 'tests/fixtures/journal-based';
		fs.cpSync(sourceFolder, tempFolder, { recursive: true });

		// Manually create one migration in new format
		const existingFolder = join(tempFolder, '1700000000000_first');
		fs.mkdirSync(existingFolder, { recursive: true });
		fs.copyFileSync(
			join(tempFolder, 'meta', '0000_snapshot.json'),
			join(existingFolder, 'snapshot.json'),
		);
		fs.copyFileSync(
			join(tempFolder, '0000_first.sql'),
			join(existingFolder, 'up.sql'),
		);

		// Perform migration
		await migrateFromJournal({
			out: tempFolder,
			dryRun: false,
		});

		// Should have 3 total: 1 existing + 2 new
		expect(countMigrationFolders(tempFolder)).toBe(3);
	});

	test('uses timestamp from journal when field for folder names', async () => {
		tempFolder = createTempMigrationFolder('test-timestamp-naming');
		const fs = require('fs');

		// Copy journal-based fixtures
		const sourceFolder = 'tests/fixtures/journal-based';
		fs.cpSync(sourceFolder, tempFolder, { recursive: true });

		await migrateFromJournal({
			out: tempFolder,
			dryRun: false,
		});

		// Verify folder names match {when}_{name} pattern
		expect(existsSync(join(tempFolder, '1700000000000_first'))).toBe(true);
		expect(existsSync(join(tempFolder, '1700000001000_second'))).toBe(true);
		expect(existsSync(join(tempFolder, '1700000002000_third'))).toBe(true);
	});

	test('fails gracefully with invalid journal structure', async () => {
		tempFolder = createTempMigrationFolder('test-invalid-journal');

		// Expect the migration to exit with error
		await expect(
			migrateFromJournal({
				out: tempFolder,
				dryRun: false,
			}),
		).rejects.toThrow();
	});

	test('preserves snapshot chain references', async () => {
		tempFolder = createTempMigrationFolder('test-chain-references');
		const fs = require('fs');

		// Copy journal-based fixtures
		const sourceFolder = 'tests/fixtures/journal-based';
		fs.cpSync(sourceFolder, tempFolder, { recursive: true });

		await migrateFromJournal({
			out: tempFolder,
			dryRun: false,
		});

		// Verify chain is intact
		const first = readSnapshot(tempFolder, '1700000000000_first');
		const second = readSnapshot(tempFolder, '1700000001000_second');
		const third = readSnapshot(tempFolder, '1700000002000_third');

		expect(first.prevId).toBe('00000000-0000-0000-0000-000000000000');
		expect(second.prevId).toBe(first.id);
		expect(third.prevId).toBe(second.id);
	});

	test('copies SQL content correctly', async () => {
		tempFolder = createTempMigrationFolder('test-sql-content');
		const fs = require('fs');

		const sourceFolder = 'tests/fixtures/journal-based';
		fs.cpSync(sourceFolder, tempFolder, { recursive: true });

		await migrateFromJournal({
			out: tempFolder,
			dryRun: false,
		});

		// Verify SQL content matches original
		const originalSql = readFileSync(join(tempFolder, '0001_second.sql'), 'utf8');
		const migratedSql = readSql(tempFolder, '1700000001000_second');

		expect(migratedSql).toBe(originalSql);
	});
});
