import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import * as readline from 'readline';
import { generateFromJournal, validateJournalStructure } from './generate-from-journal';

/**
 * Prompt user for yes/no confirmation
 */
async function promptUser(question: string): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(chalk.yellow(`\n${question} (y/n) `), (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
		});
	});
}

/**
 * Get 'out' field from a config file content
 */
function extractOutFolder(content: string, defaultValue: string): string {
	// Try to extract out field value
	const match = content.match(/out:\s*['"]([^'"]+)['"]/);
	return match ? match[1] : defaultValue;
}

/**
 * Initialize wizzle by creating wizzle.config from drizzle.config
 * and optionally converting journal-based migrations to folder-based format
 */
export async function initCommand(): Promise<void> {
	console.log(chalk.bold('\n🔧 Initializing wizzle...\n'));

	const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';

	// Check if wizzle.config already exists
	const wizzleConfigExtensions = ['ts', 'js', 'json', 'mjs', 'cjs'];
	const existingWizzleConfig = wizzleConfigExtensions.find((ext) =>
		existsSync(resolve(join(prefix, `wizzle.config.${ext}`))),
	);

	let wizzleConfigPath: string;
	let wizzleOutFolder: string;
	let drizzleOutFolder: string | undefined;

	if (existingWizzleConfig) {
		console.log(chalk.yellow('⚠️  wizzle.config already exists'));
		console.log(chalk.gray(`   Found: wizzle.config.${existingWizzleConfig}\n`));

		// Read wizzle.config to get out folder
		wizzleConfigPath = resolve(join(prefix, `wizzle.config.${existingWizzleConfig}`));
		const wizzleConfigContent = readFileSync(wizzleConfigPath, 'utf8');
		wizzleOutFolder = extractOutFolder(wizzleConfigContent, './wizzle');

		// Check for drizzle.config to get source folder for migrations
		let drizzleConfigContent: string | undefined;
		for (const ext of ['ts', 'js', 'json', 'mjs', 'cjs']) {
			const path = resolve(join(prefix, `drizzle.config.${ext}`));
			if (existsSync(path)) {
				drizzleConfigContent = readFileSync(path, 'utf8');
				break;
			}
		}

		if (drizzleConfigContent) {
			drizzleOutFolder = extractOutFolder(drizzleConfigContent, './drizzle');
		}
		// Config already exists, skip to migration check
	} else {
		// wizzle.config doesn't exist, need to create it
		// Look for drizzle.config
		const drizzleConfigExtensions = ['ts', 'js', 'json', 'mjs', 'cjs'];
		let drizzleConfigPath: string | undefined;
		let drizzleConfigExt: string | undefined;

		for (const ext of drizzleConfigExtensions) {
			const path = resolve(join(prefix, `drizzle.config.${ext}`));
			if (existsSync(path)) {
				drizzleConfigPath = path;
				drizzleConfigExt = ext;
				break;
			}
		}

		if (drizzleConfigPath && drizzleConfigExt) {
			// Copy and transform drizzle.config
			console.log(chalk.blue(`📄 Found drizzle.config.${drizzleConfigExt}`));
			console.log(chalk.blue('   Creating wizzle.config with updated defaults...\n'));

			const drizzleConfigContent = readFileSync(drizzleConfigPath, 'utf8');
			const wizzleConfigContent = transformDrizzleToWizzleConfig(drizzleConfigContent);

			wizzleConfigPath = resolve(join(prefix, `wizzle.config.${drizzleConfigExt}`));
			writeFileSync(wizzleConfigPath, wizzleConfigContent, 'utf8');

			console.log(chalk.green('✅ Created wizzle.config.' + drizzleConfigExt));
			console.log(chalk.gray('\n   Updated:'));
			console.log(chalk.gray("     - out: 'drizzle' → 'wizzle'"));
			console.log(chalk.gray("     - migrations.table: '__drizzle_migrations' → '__wizzle_migrations'"));
			console.log(chalk.gray("     - migrations.schema: 'drizzle' → 'wizzle'"));
			console.log();

			// Extract folders for migration conversion
			drizzleOutFolder = extractOutFolder(drizzleConfigContent, './drizzle');
			wizzleOutFolder = extractOutFolder(wizzleConfigContent, './wizzle');
		} else {
			// Create default wizzle.config.ts
			console.log(chalk.blue('📄 No drizzle.config found'));
			console.log(chalk.blue('   Creating default wizzle.config.ts...\n'));

			const defaultConfig = `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql', // 'mysql' | 'sqlite' | 'postgresql'
	schema: './src/schema.ts',
	out: './wizzle',
	migrations: {
		table: '__wizzle_migrations',
		schema: 'wizzle'
	}
});
`;

			wizzleConfigPath = resolve(join(prefix, 'wizzle.config.ts'));
			writeFileSync(wizzleConfigPath, defaultConfig, 'utf8');

			console.log(chalk.green('✅ Created wizzle.config.ts'));
			console.log(chalk.gray('\n   Please update the config with your database details.\n'));

			// No drizzle.config means no migrations to convert
			drizzleOutFolder = undefined;
			wizzleOutFolder = './wizzle';
		}
	}

	// Check for journal-based migrations to convert
	if (drizzleOutFolder) {
		const sourceFolder = resolve(join(prefix, drizzleOutFolder));
		const validation = validateJournalStructure(sourceFolder);

		if (validation.valid && validation.journal && validation.journal.entries.length > 0) {
			// Found journal migrations, ask user if they want to convert
			console.log(chalk.blue(`\n🔍 Found journal-based migrations in ${drizzleOutFolder}`));
			console.log(chalk.blue(`   ${validation.journal.entries.length} migration(s) detected`));

			const shouldConvert = await promptUser('Convert to folder-based format?');

			if (shouldConvert) {
				console.log(chalk.blue('\n🔄 Converting journal migrations...\n'));

				await generateFromJournal({
					source: sourceFolder,
					out: resolve(join(prefix, wizzleOutFolder)),
					dryRun: false,
					casing: 'camel',
				});
			} else {
				console.log(chalk.gray('\n   Skipping migration conversion.\n'));
			}
		}
	}

	console.log(chalk.bold('🎉 Initialization complete!\n'));
	console.log(chalk.gray('   You can now run:'));
	console.log(chalk.cyan('     wizzle generate'));
	console.log(chalk.cyan('     wizzle migrate'));
	console.log();
}

/**
 * Transform drizzle.config content to wizzle.config by updating defaults
 */
function transformDrizzleToWizzleConfig(content: string): string {
	let transformed = content;

	// Replace out directory defaults
	transformed = transformed.replace(/out:\s*['"]\.\/drizzle['"]/g, "out: './wizzle'");
	transformed = transformed.replace(/out:\s*['"]drizzle['"]/g, "out: 'wizzle'");

	// Replace migration table defaults
	transformed = transformed.replace(
		/table:\s*['"]__drizzle_migrations['"]/g,
		"table: '__wizzle_migrations'",
	);

	// Replace migration schema defaults (PostgreSQL)
	transformed = transformed.replace(/schema:\s*['"]drizzle['"]/g, "schema: 'wizzle'");

	// Also handle cases where these might be in default() calls
	transformed = transformed.replace(/\.default\(['"]\.\/drizzle['"]\)/g, ".default('./wizzle')");
	transformed = transformed.replace(/\.default\(['"]drizzle['"]\)/g, ".default('wizzle')");
	transformed = transformed.replace(
		/\.default\(['"]__drizzle_migrations['"]\)/g,
		".default('__wizzle_migrations')",
	);

	return transformed;
}
