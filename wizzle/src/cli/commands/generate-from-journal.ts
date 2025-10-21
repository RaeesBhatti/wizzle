import chalk from 'chalk';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildSnapshotChain } from '../../utils';
import { generateSchemaFromSnapshot } from '../../utils/schemaGenerator';
import { Casing } from '../validations/common';

export type Journal = {
	version: string;
	dialect: string;
	entries: {
		idx: number;
		version: string;
		when: number;
		tag: string;
		breakpoints: boolean;
	}[];
};

export type GenerateOptions = {
	source: string;
	out: string;
	dryRun?: boolean;
	casing?: Casing;
};

type ValidationResult = {
	valid: boolean;
	missingFiles: string[];
	journal?: Journal;
};

/**
 * Parse the migration name from a tag by removing the numeric prefix
 * @param tag - Migration tag (e.g., "0000_little_blizzard")
 * @returns Migration name (e.g., "little_blizzard")
 */
export function parseTagName(tag: string): string {
	const firstUnderscore = tag.indexOf('_');
	if (firstUnderscore === -1) {
		return tag;
	}
	return tag.substring(firstUnderscore + 1);
}

/**
 * Validate that the old journal-based migration structure exists and is complete
 * @param folder - Migrations folder path
 * @returns Validation result with missing files list
 */
export function validateJournalStructure(folder: string): ValidationResult {
	const missingFiles: string[] = [];

	// Check if migrations folder exists
	if (!existsSync(folder)) {
		return {
			valid: false,
			missingFiles: [folder],
		};
	}

	const metaFolder = join(folder, 'meta');
	const journalPath = join(metaFolder, '_journal.json');

	// Check if meta folder exists
	if (!existsSync(metaFolder)) {
		missingFiles.push(metaFolder);
		return {
			valid: false,
			missingFiles,
		};
	}

	// Check if _journal.json exists
	if (!existsSync(journalPath)) {
		missingFiles.push(journalPath);
		return {
			valid: false,
			missingFiles,
		};
	}

	// Parse journal
	let journal: Journal;
	try {
		const journalContent = readFileSync(journalPath, 'utf8');
		journal = JSON.parse(journalContent);
	} catch (error) {
		console.error(chalk.red(`Error parsing ${journalPath}:`), error);
		return {
			valid: false,
			missingFiles: [journalPath + ' (malformed)'],
		};
	}

	// Validate all referenced files exist
	for (const entry of journal.entries) {
		const prefix = entry.tag.split('_')[0];
		const snapshotPath = join(metaFolder, `${prefix}_snapshot.json`);
		const sqlPath = join(folder, `${entry.tag}.sql`);

		if (!existsSync(snapshotPath)) {
			missingFiles.push(snapshotPath);
		}
		if (!existsSync(sqlPath)) {
			missingFiles.push(sqlPath);
		}
	}

	return {
		valid: missingFiles.length === 0,
		missingFiles,
		journal,
	};
}

/**
 * Detect if the folder has a hybrid structure (both old and new format)
 * @param folder - Migrations folder path
 * @returns True if hybrid structure detected
 */
export function detectHybridStructure(folder: string): boolean {
	if (!existsSync(folder)) {
		return false;
	}

	// Check for new format (folder-based migrations)
	const newFormatFolders = buildSnapshotChain(folder);
	const hasNewFormat = newFormatFolders.length > 0;

	// Check for old format (meta/_journal.json)
	const hasOldFormat = existsSync(join(folder, 'meta', '_journal.json'));

	return hasNewFormat && hasOldFormat;
}

/**
 * Generate folder-based migrations from journal-based structure
 * @param options - Generation options
 */
export async function generateFromJournal(options: GenerateOptions): Promise<void> {
	const { source, out, dryRun = false, casing = 'camel' } = options;

	console.log(chalk.bold('\nGenerating folder-based migrations from journal...\n'));
	console.log(chalk.blue(`Source: ${source}`));
	console.log(chalk.blue(`Output: ${out}\n`));

	// Validate journal structure
	const validation = validateJournalStructure(source);

	if (!validation.valid) {
		console.error(chalk.red('❌ Invalid journal structure. Missing files:'));
		validation.missingFiles.forEach((file) => {
			console.error(chalk.red(`  - ${file}`));
		});
		process.exit(1);
	}

	const journal = validation.journal!;
	console.log(chalk.blue(`Found ${journal.entries.length} migrations in journal`));

	// Check for hybrid structure in source
	if (detectHybridStructure(source)) {
		console.log(chalk.yellow('\n⚠️  Warning: Detected both old and new migration formats in source.'));
		console.log(chalk.yellow('   Only journal-based migrations will be converted.\n'));
	}

	// Get existing new-format migrations in output folder to avoid duplicates
	const existingMigrations = existsSync(out) ? new Set(buildSnapshotChain(out)) : new Set();

	if (dryRun) {
		console.log(chalk.cyan('\n🔍 Dry run mode - no files will be created:\n'));
	}

	let migratedCount = 0;
	let skippedCount = 0;

	// Process each journal entry
	for (const entry of journal.entries) {
		const { tag, when } = entry;
		const name = parseTagName(tag);
		const prefix = tag.split('_')[0];

		// New folder name: {timestamp}_{name}
		const newFolderName = `${when}_${name}`;
		const newFolderPath = join(out, newFolderName);

		// Check if this migration already exists in new format
		if (existingMigrations.has(newFolderName)) {
			if (dryRun || migratedCount === 0) {
				console.log(chalk.gray(`⏭️  Skipping ${newFolderName} (already exists)`));
			}
			skippedCount++;
			continue;
		}

		// Read source files
		const metaFolder = join(source, 'meta');
		const snapshotPath = join(metaFolder, `${prefix}_snapshot.json`);
		const sqlPath = join(source, `${tag}.sql`);

		const snapshotContent = readFileSync(snapshotPath, 'utf8');
		const sqlContent = readFileSync(sqlPath, 'utf8');

		if (dryRun) {
			console.log(chalk.green(`✓ Would generate: ${tag} → ${newFolderName}/`));
		} else {
			// Create new folder
			mkdirSync(newFolderPath, { recursive: true });

			// Write snapshot.json
			writeFileSync(
				join(newFolderPath, 'snapshot.json'),
				snapshotContent,
			);

			// Write up.sql
			writeFileSync(
				join(newFolderPath, 'up.sql'),
				sqlContent,
			);

			// Generate and write schema.ts from snapshot
			const snapshot = JSON.parse(snapshotContent);
			const { combined } = generateSchemaFromSnapshot(snapshot, casing);
			writeFileSync(join(newFolderPath, 'schema.ts'), combined);

			console.log(chalk.green(`✓ Generated: ${tag} → ${newFolderName}/`));
		}

		migratedCount++;
	}

	// Summary
	console.log(chalk.bold('\n' + '─'.repeat(50)));
	if (dryRun) {
		console.log(chalk.cyan(`\n🔍 Dry run complete:`));
		console.log(chalk.cyan(`   ${migratedCount} migrations would be generated`));
		if (skippedCount > 0) {
			console.log(chalk.cyan(`   ${skippedCount} migrations already exist`));
		}
		console.log(chalk.cyan(`\nRun without --dry-run to generate the migrations.`));
	} else {
		console.log(chalk.green(`\n✅ Generation complete:`));
		console.log(chalk.green(`   ${migratedCount} migrations generated in ${out}/`));
		if (skippedCount > 0) {
			console.log(chalk.yellow(`   ${skippedCount} migrations skipped (already exist)`));
		}
		console.log(chalk.blue(`\n📁 Old migration files preserved in:`));
		console.log(chalk.blue(`   ${source}/meta/`));
		console.log(chalk.blue(`   ${source}/*.sql`));
	}
}
