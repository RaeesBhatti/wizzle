import { readFileSync } from 'fs';
import { join } from 'path';
import { schemaToTypeScript as gelSchemaToTypeScript } from '../introspect-gel';
import { schemaToTypeScript as mysqlSchemaToTypeScript } from '../introspect-mysql';
import { schemaToTypeScript as postgresSchemaToTypeScript } from '../introspect-pg';
import { schemaToTypeScript as singlestoreSchemaToTypeScript } from '../introspect-singlestore';
import { schemaToTypeScript as sqliteSchemaToTypeScript } from '../introspect-sqlite';
import type { GelSchema } from '../serializer/gelSchema';
import type { MySqlSchema } from '../serializer/mysqlSchema';
import type { PgSchema } from '../serializer/pgSchema';
import type { SingleStoreSchema } from '../serializer/singlestoreSchema';
import type { SQLiteSchema } from '../serializer/sqliteSchema';
import { relationsToTypeScript } from '../cli/commands/introspect';
import { Casing } from '../cli/validations/common';

export type SnapshotSchema =
	| PgSchema
	| MySqlSchema
	| SQLiteSchema
	| SingleStoreSchema
	| GelSchema;

export type Dialect = 'postgresql' | 'mysql' | 'sqlite' | 'turso' | 'singlestore' | 'gel';

/**
 * Read and parse a snapshot.json file
 */
export function readSnapshot(migrationFolder: string): SnapshotSchema {
	const snapshotPath = join(migrationFolder, 'snapshot.json');
	const content = readFileSync(snapshotPath, 'utf8');
	return JSON.parse(content);
}

/**
 * Detect dialect from snapshot
 */
export function detectDialect(snapshot: SnapshotSchema): Dialect {
	const dialect = snapshot.dialect;

	if (dialect === 'postgresql') return 'postgresql';
	if (dialect === 'mysql') return 'mysql';
	if (dialect === 'sqlite') return 'sqlite';
	if (dialect === 'singlestore') return 'singlestore';
	if (dialect === 'gel') return 'gel';
	if (dialect === 'turso') return 'turso';

	throw new Error(`Unknown dialect: ${dialect}`);
}

/**
 * Generate TypeScript schema code from snapshot
 */
export function generateSchemaFromSnapshot(
	snapshot: SnapshotSchema,
	casing: Casing = 'camel',
): { schema: string; relations: string; combined: string } {
	const dialect = detectDialect(snapshot);

	let schemaResult: { file: string; imports: string; decalrations: string };
	let relationsResult: { file: string };

	switch (dialect) {
		case 'postgresql':
			schemaResult = postgresSchemaToTypeScript(snapshot as PgSchema, casing);
			relationsResult = relationsToTypeScript(snapshot as PgSchema, casing);
			break;

		case 'mysql':
			schemaResult = mysqlSchemaToTypeScript(snapshot as MySqlSchema, casing);
			relationsResult = relationsToTypeScript(snapshot as MySqlSchema, casing);
			break;

		case 'sqlite':
		case 'turso':
			schemaResult = sqliteSchemaToTypeScript(snapshot as SQLiteSchema, casing);
			relationsResult = relationsToTypeScript(snapshot as SQLiteSchema, casing);
			break;

		case 'singlestore':
			// SingleStore doesn't support relations in the same way
			schemaResult = singlestoreSchemaToTypeScript(snapshot as SingleStoreSchema, casing);
			relationsResult = { file: '' }; // No relations for SingleStore
			break;

		case 'gel':
			schemaResult = gelSchemaToTypeScript(snapshot as GelSchema, casing);
			relationsResult = relationsToTypeScript(snapshot as GelSchema, casing);
			break;

		default:
			throw new Error(`Unsupported dialect: ${dialect}`);
	}

	// Combine schema and relations into one file
	// Remove duplicate imports and merge
	const combined = combineSchemaAndRelations(
		schemaResult.file,
		relationsResult.file,
	);

	return {
		schema: schemaResult.file,
		relations: relationsResult.file,
		combined,
	};
}

/**
 * Combine schema and relations TypeScript code into a single file
 */
function combineSchemaAndRelations(schema: string, relations: string): string {
	// Extract imports and code from each file
	const schemaLines = schema.split('\n');
	const relationsLines = relations.split('\n');

	// Find where imports end in each file (look for first non-import line)
	const schemaImportEnd = schemaLines.findIndex(
		(line) => line.trim() && !line.startsWith('import') && !line.startsWith('//')
	);
	const relationsImportEnd = relationsLines.findIndex(
		(line) => line.trim() && !line.startsWith('import') && !line.startsWith('//')
	);

	const schemaImports = schemaLines.slice(0, schemaImportEnd);
	const schemaCode = schemaLines.slice(schemaImportEnd);

	const relationsImports = relationsLines.slice(0, relationsImportEnd);
	const relationsCode = relationsLines.slice(relationsImportEnd);

	// Filter out self-referencing imports from relations (e.g., import { users } from "./schema")
	// These cause circular dependencies since we're combining into a single file
	const filteredRelationsImports = relationsImports.filter((line) => {
		const trimmed = line.trim();
		// Keep non-import lines (comments, empty lines)
		if (!trimmed.startsWith('import')) return true;
		// Filter out imports from "./schema" or './schema'
		if (trimmed.includes('from "./schema"') || trimmed.includes("from './schema'")) {
			return false;
		}
		// Keep other imports (e.g., from "drizzle-orm/relations")
		return true;
	});

	// Merge imports (deduplicate)
	const allImports = new Set([...schemaImports, ...filteredRelationsImports]);
	const mergedImports = Array.from(allImports).join('\n');

	// Combine: imports + schema code + relations code
	return `${mergedImports}\n${schemaCode.join('\n')}\n${relationsCode.join('\n')}`;
}

/**
 * Generate schema file for a specific migration folder
 */
export function generateSchemaForMigration(
	migrationFolder: string,
	casing: Casing = 'camel',
): string {
	const snapshot = readSnapshot(migrationFolder);
	const { combined } = generateSchemaFromSnapshot(snapshot, casing);
	return combined;
}
