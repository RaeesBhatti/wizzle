import chalk from 'chalk';

export type DatabaseDialect = 'postgresql' | 'mysql' | 'sqlite' | 'singlestore';

export interface MigrationTableConfig {
	newTable: string;
	newSchema?: string; // PostgreSQL only
	oldTable: string;
	oldSchema?: string; // PostgreSQL only
}

/**
 * Check if a table exists in the database
 */
async function tableExists(
	executor: (sql: string) => Promise<any>,
	dialect: DatabaseDialect,
	tableName: string,
	schemaName?: string,
): Promise<boolean> {
	try {
		if (dialect === 'postgresql') {
			const schema = schemaName || 'public';
			const result = await executor(`
				SELECT EXISTS (
					SELECT FROM information_schema.tables
					WHERE table_schema = '${schema}'
					AND table_name = '${tableName}'
				)
			`);
			return result[0]?.exists === true || result[0]?.exists === 't';
		} else if (dialect === 'mysql' || dialect === 'singlestore') {
			const result = await executor(`
				SELECT COUNT(*) as count
				FROM information_schema.tables
				WHERE table_name = '${tableName}'
			`);
			return result[0]?.count > 0;
		} else if (dialect === 'sqlite') {
			const result = await executor(`
				SELECT name FROM sqlite_master
				WHERE type='table' AND name='${tableName}'
			`);
			return result.length > 0;
		}
	} catch (e) {
		// If query fails, assume table doesn't exist
		return false;
	}
	return false;
}

/**
 * Count rows in a table
 */
async function countTableRows(
	executor: (sql: string) => Promise<any>,
	tableName: string,
	schemaName?: string,
): Promise<number> {
	try {
		const fullTableName = schemaName ? `"${schemaName}"."${tableName}"` : `"${tableName}"`;
		const result = await executor(`SELECT COUNT(*) as count FROM ${fullTableName}`);
		return parseInt(result[0]?.count || '0', 10);
	} catch (e) {
		return 0;
	}
}

/**
 * Migrate migration history from old table to new table
 * This is called automatically during the first migration run after upgrading from drizzle-kit
 */
export async function migrateOldMigrationTable(
	executor: (sql: string) => Promise<any>,
	dialect: DatabaseDialect,
	config: MigrationTableConfig,
): Promise<void> {
	const { newTable, newSchema, oldTable, oldSchema } = config;

	// 1. Check if new table exists and has data
	const newTableExists = await tableExists(executor, dialect, newTable, newSchema);
	if (newTableExists) {
		const newTableRows = await countTableRows(executor, newTable, newSchema);
		if (newTableRows > 0) {
			// New table has data, nothing to migrate
			return;
		}
	}

	// 2. Check if old table exists
	const oldTableExists = await tableExists(executor, dialect, oldTable, oldSchema);
	if (!oldTableExists) {
		// No old table, nothing to migrate
		return;
	}

	// 3. Check if old table has data
	const oldTableRows = await countTableRows(executor, oldTable, oldSchema);
	if (oldTableRows === 0) {
		// Old table exists but empty, nothing to migrate
		return;
	}

	// 4. Perform migration
	console.log(chalk.blue(`\n🔄 Detected existing migration history in ${oldSchema ? oldSchema + '.' : ''}${oldTable}`));
	console.log(chalk.blue(`   Migrating to ${newSchema ? newSchema + '.' : ''}${newTable}...\n`));

	try {
		// Create new schema if needed (PostgreSQL only)
		if (dialect === 'postgresql' && newSchema) {
			await executor(`CREATE SCHEMA IF NOT EXISTS "${newSchema}"`);
		}

		// Create new table
		if (dialect === 'postgresql') {
			const schema = newSchema || 'public';
			await executor(`
				CREATE TABLE IF NOT EXISTS "${schema}"."${newTable}" (
					id SERIAL PRIMARY KEY,
					hash text NOT NULL,
					created_at numeric,
					tag text
				)
			`);
		} else if (dialect === 'mysql' || dialect === 'singlestore') {
			await executor(`
				CREATE TABLE IF NOT EXISTS \`${newTable}\` (
					\`id\` int AUTO_INCREMENT PRIMARY KEY,
					\`hash\` text NOT NULL,
					\`created_at\` bigint,
					\`tag\` text
				)
			`);
		} else if (dialect === 'sqlite') {
			await executor(`
				CREATE TABLE IF NOT EXISTS "${newTable}" (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					hash text NOT NULL,
					created_at numeric,
					tag text
				)
			`);
		}

		// Copy data from old table to new table
		const oldFullTable = oldSchema ? `"${oldSchema}"."${oldTable}"` : `"${oldTable}"`;
		const newFullTable = newSchema ? `"${newSchema}"."${newTable}"` : `"${newTable}"`;

		// Check if old table has 'tag' column (added in recent versions)
		let hasTagColumn = false;
		try {
			if (dialect === 'postgresql') {
				const result = await executor(`
					SELECT column_name
					FROM information_schema.columns
					WHERE table_name = '${oldTable}'
					AND table_schema = '${oldSchema || 'public'}'
					AND column_name = 'tag'
				`);
				hasTagColumn = result.length > 0;
			} else if (dialect === 'mysql' || dialect === 'singlestore') {
				const result = await executor(`
					SELECT COLUMN_NAME
					FROM INFORMATION_SCHEMA.COLUMNS
					WHERE TABLE_NAME = '${oldTable}'
					AND COLUMN_NAME = 'tag'
				`);
				hasTagColumn = result.length > 0;
			} else if (dialect === 'sqlite') {
				const result = await executor(`PRAGMA table_info(${oldTable})`);
				hasTagColumn = result.some((col: any) => col.name === 'tag');
			}
		} catch (e) {
			// If check fails, assume tag column doesn't exist
			hasTagColumn = false;
		}

		// Copy data
		if (hasTagColumn) {
			await executor(`
				INSERT INTO ${newFullTable} (hash, created_at, tag)
				SELECT hash, created_at, tag FROM ${oldFullTable}
			`);
		} else {
			// Old table doesn't have tag column, insert with NULL
			await executor(`
				INSERT INTO ${newFullTable} (hash, created_at, tag)
				SELECT hash, created_at, NULL FROM ${oldFullTable}
			`);
		}

		console.log(chalk.green(`   ✅ Migrated ${oldTableRows} migration records`));
		console.log(chalk.gray(`   📝 Old table preserved for safety\n`));
	} catch (error) {
		console.error(chalk.red(`\n❌ Migration failed: ${error}\n`));
		throw error;
	}
}
