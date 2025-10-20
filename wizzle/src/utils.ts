import type { RunResult } from 'better-sqlite3';
import chalk from 'chalk';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'url';
import type { NamedWithSchema } from './cli/commands/migrate';
import { info } from './cli/views';
import { assertUnreachable, snapshotVersion } from './global';
import type { Dialect } from './schemaValidator';
import { backwardCompatibleGelSchema } from './serializer/gelSchema';
import { backwardCompatibleMysqlSchema } from './serializer/mysqlSchema';
import { backwardCompatiblePgSchema } from './serializer/pgSchema';
import { backwardCompatibleSingleStoreSchema } from './serializer/singlestoreSchema';
import { backwardCompatibleSqliteSchema } from './serializer/sqliteSchema';
import type { ProxyParams } from './serializer/studio';

export type Proxy = (params: ProxyParams) => Promise<any[]>;

export type TransactionProxy = (queries: { sql: string; method?: ProxyParams['method'] }[]) => Promise<any[]>;

export type DB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
};

export type SQLiteDB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
	run(query: string): Promise<void>;
};

export type LibSQLDB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
	run(query: string): Promise<void>;
	batchWithPragma?(queries: string[]): Promise<void>;
};

export const copy = <T>(it: T): T => {
	return JSON.parse(JSON.stringify(it));
};

export const objectValues = <T extends object>(obj: T): Array<T[keyof T]> => {
	return Object.values(obj);
};

export const assertV1OutFolder = (out: string) => {
	if (!existsSync(out)) return;

	const oldMigrationFolders = readdirSync(out).filter(
		(it) => it.length === 14 && /^\d+$/.test(it),
	);

	if (oldMigrationFolders.length > 0) {
		console.log(
			`Your migrations folder format is outdated, please run ${
				chalk.green.bold(
					`drizzle-kit up`,
				)
			}`,
		);
		process.exit(1);
	}
};

/**
 * Builds an ordered chain of migration snapshots by following prevId references.
 *
 * Algorithm:
 * 1. List all migration folders containing snapshot.json files
 * 2. Find root snapshot (prevId === originUUID or empty)
 * 3. Build chain by following prevId references
 * 4. If multiple snapshots have same prevId, sort by timestamp from folder name
 *
 * @param migrationsFolder - Path to the migrations folder containing migration subfolders
 * @returns Ordered array of migration folder paths (tags) from oldest to newest
 *
 * TODO: Future enhancement - detect if concurrent migrations modified same schema entities.
 * If two migrations with same prevId touch the same tables/columns, we should show an error
 * to prevent potential data conflicts. This requires analyzing the snapshot diffs.
 */
export const buildSnapshotChain = (migrationsFolder: string): string[] => {
	// Extract timestamp from folder name (format: <timestamp>_<name>)
	const getTimestamp = (folderName: string): number => {
		const match = folderName.match(/^(\d+)_/);
		return match ? parseInt(match[1]) : 0;
	};

	// Read all directories that contain a snapshot.json file
	const folders = readdirSync(migrationsFolder, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory())
		.map((dirent) => dirent.name)
		.filter((folderName) => {
			const snapshotPath = join(migrationsFolder, folderName, 'snapshot.json');
			return existsSync(snapshotPath);
		});

	if (folders.length === 0) {
		return [];
	}

	// Parse all snapshots and build adjacency map: prevId -> [{tag, timestamp, id}]
	const snapshotMap = new Map<string, Array<{ tag: string; timestamp: number; id: string }>>();
	const snapshotsById = new Map<string, { tag: string; prevId: string }>();

	for (const folder of folders) {
		const snapshotPath = join(migrationsFolder, folder, 'snapshot.json');
		try {
			const content = JSON.parse(readFileSync(snapshotPath).toString());
			const id = content.id;
			const prevId = content.prevId || '';
			const timestamp = getTimestamp(folder);

			snapshotsById.set(id, { tag: folder, prevId });

			if (!snapshotMap.has(prevId)) {
				snapshotMap.set(prevId, []);
			}
			snapshotMap.get(prevId)!.push({ tag: folder, timestamp, id });
		} catch (e) {
			console.error(`Error parsing snapshot ${snapshotPath}:`, e);
		}
	}

	// Find root(s) - snapshots with prevId === originUUID or ''
	const roots = snapshotMap.get('00000000-0000-0000-0000-000000000000')
		|| snapshotMap.get('') || [];

	if (roots.length === 0) {
		console.warn('No root snapshot found (prevId should be originUUID)');
		return [];
	}

	// Build chain by traversing from root
	const orderedTags: string[] = [];

	const traverse = (currentId: string) => {
		const children = snapshotMap.get(currentId) || [];

		// Sort siblings by timestamp if multiple exist
		children.sort((a, b) => a.timestamp - b.timestamp);

		for (const child of children) {
			orderedTags.push(child.tag);
			traverse(child.id);
		}
	};

	// Start traversal from each root (sorted by timestamp)
	roots.sort((a, b) => a.timestamp - b.timestamp);
	for (const root of roots) {
		orderedTags.push(root.tag);
		traverse(root.id);
	}

	return orderedTags;
};

// export const preparePushFolder = (dialect: Dialect) => {
//   const out = ".drizzle";
//   let snapshot: string = "";
//   if (!existsSync(join(out))) {
//     mkdirSync(out);
//     snapshot = JSON.stringify(dryJournal(dialect));
//   } else {
//     snapshot = readdirSync(out)[0];
//   }

//   return { snapshot };
// };

export const prepareOutFolder = (out: string, dialect: Dialect) => {
	if (!existsSync(out)) {
		mkdirSync(out, { recursive: true });
	}

	const migrationTags = buildSnapshotChain(out);

	return { migrationTags };
};

const validatorForDialect = (dialect: Dialect) => {
	switch (dialect) {
		case 'postgresql':
			return { validator: backwardCompatiblePgSchema, version: 7 };
		case 'sqlite':
			return { validator: backwardCompatibleSqliteSchema, version: 6 };
		case 'turso':
			return { validator: backwardCompatibleSqliteSchema, version: 6 };
		case 'mysql':
			return { validator: backwardCompatibleMysqlSchema, version: 5 };
		case 'singlestore':
			return { validator: backwardCompatibleSingleStoreSchema, version: 1 };
		case 'gel':
			return { validator: backwardCompatibleGelSchema, version: 1 };
	}
};

export const validateWithReport = (migrationTags: string[], migrationsFolder: string, dialect: Dialect) => {
	// ✅ check if drizzle-kit can handle snapshot version
	// ✅ check if snapshot is of the last version
	// ✅ check if id of the snapshot is valid
	// ✅ collect {} of prev id -> snapshotName[], if there's more than one - tell about collision
	const { validator, version } = validatorForDialect(dialect);

	const result = migrationTags.reduce(
		(accum, tag) => {
			const snapshotPath = join(migrationsFolder, tag, 'snapshot.json');
			const raw = JSON.parse(readFileSync(snapshotPath).toString());

			accum.rawMap[tag] = raw;

			if (raw['version'] && Number(raw['version']) > version) {
				console.log(
					info(
						`${tag}/snapshot.json is of unsupported version, please update wizzle`,
					),
				);
				process.exit(0);
			}

			const result = validator.safeParse(raw);
			if (!result.success) {
				accum.malformed.push(tag);
				return accum;
			}

			const snapshot = result.data;
			if (snapshot.version !== String(version)) {
				accum.nonLatest.push(tag);
				return accum;
			}

			// only if latest version here
			const idEntry = accum.idsMap[snapshot['prevId']] ?? {
				parent: tag,
				snapshots: [],
			};
			idEntry.snapshots.push(tag);
			accum.idsMap[snapshot['prevId']] = idEntry;

			return accum;
		},
		{
			malformed: [],
			nonLatest: [],
			idToNameMap: {},
			idsMap: {},
			rawMap: {},
		} as {
			malformed: string[];
			nonLatest: string[];
			idsMap: Record<string, { parent: string; snapshots: string[] }>;
			rawMap: Record<string, any>;
		},
	);

	return result;
};

export const prepareMigrationFolder = (
	outFolder: string = 'drizzle',
	dialect: Dialect,
) => {
	const { migrationTags } = prepareOutFolder(outFolder, dialect);
	const report = validateWithReport(migrationTags, outFolder, dialect);
	if (report.nonLatest.length > 0) {
		console.log(
			report.nonLatest
				.map((it) => {
					return `${it}/snapshot.json is not of the latest version`;
				})
				.concat(`Run ${chalk.green.bold(`wizzle up`)}`)
				.join('\n'),
		);
		process.exit(0);
	}

	if (report.malformed.length) {
		const message = report.malformed
			.map((it) => {
				return `${it}/snapshot.json data is malformed`;
			})
			.join('\n');
		console.log(message);
	}

	const collisionEntries = Object.entries(report.idsMap).filter(
		(it) => it[1].snapshots.length > 1,
	);

	const message = collisionEntries
		.map((it) => {
			const data = it[1];
			return `[${
				data.snapshots.join(
					', ',
				)
			}] are pointing to a parent snapshot: ${data.parent}/snapshot.json which is a collision.`;
		})
		.join('\n')
		.trim();
	if (message) {
		console.log(chalk.red.bold('Error:'), message);
	}

	const abort = report.malformed.length!! || collisionEntries.length > 0;

	if (abort) {
		process.exit(0);
	}

	return { migrationTags };
};

export const prepareMigrationMeta = (
	schemas: { from: string; to: string }[],
	tables: { from: NamedWithSchema; to: NamedWithSchema }[],
	columns: {
		from: { table: string; schema: string; column: string };
		to: { table: string; schema: string; column: string };
	}[],
) => {
	const _meta = {
		schemas: {} as Record<string, string>,
		tables: {} as Record<string, string>,
		columns: {} as Record<string, string>,
	};

	schemas.forEach((it) => {
		const from = schemaRenameKey(it.from);
		const to = schemaRenameKey(it.to);
		_meta.schemas[from] = to;
	});
	tables.forEach((it) => {
		const from = tableRenameKey(it.from);
		const to = tableRenameKey(it.to);
		_meta.tables[from] = to;
	});

	columns.forEach((it) => {
		const from = columnRenameKey(it.from.table, it.from.schema, it.from.column);
		const to = columnRenameKey(it.to.table, it.to.schema, it.to.column);
		_meta.columns[from] = to;
	});

	return _meta;
};

export const schemaRenameKey = (it: string) => {
	return it;
};

export const tableRenameKey = (it: NamedWithSchema) => {
	const out = it.schema ? `"${it.schema}"."${it.name}"` : `"${it.name}"`;
	return out;
};

export const columnRenameKey = (
	table: string,
	schema: string,
	column: string,
) => {
	const out = schema
		? `"${schema}"."${table}"."${column}"`
		: `"${table}"."${column}"`;
	return out;
};

export const kloudMeta = () => {
	return {
		pg: [5],
		mysql: [] as number[],
		sqlite: [] as number[],
	};
};

export const normaliseSQLiteUrl = (
	it: string,
	type: 'libsql' | 'better-sqlite',
) => {
	if (type === 'libsql') {
		if (it.startsWith('file:')) {
			return it;
		}
		try {
			const url = parse(it);
			if (url.protocol === null) {
				return `file:${it}`;
			}
			return it;
		} catch (e) {
			return `file:${it}`;
		}
	}

	if (type === 'better-sqlite') {
		if (it.startsWith('file:')) {
			return it.substring(5);
		}

		return it;
	}

	assertUnreachable(type);
};

export const normalisePGliteUrl = (
	it: string,
) => {
	if (it.startsWith('file:')) {
		return it.substring(5);
	}

	return it;
};

export function isPgArrayType(sqlType: string) {
	return sqlType.match(/.*\[\d*\].*|.*\[\].*/g) !== null;
}

export function findAddedAndRemoved(columnNames1: string[], columnNames2: string[]) {
	const set1 = new Set(columnNames1);
	const set2 = new Set(columnNames2);

	const addedColumns = columnNames2.filter((it) => !set1.has(it));
	const removedColumns = columnNames1.filter((it) => !set2.has(it));

	return { addedColumns, removedColumns };
}

export function escapeSingleQuotes(str: string) {
	return str.replace(/'/g, "''");
}

export function unescapeSingleQuotes(str: string, ignoreFirstAndLastChar: boolean) {
	const regex = ignoreFirstAndLastChar ? /(?<!^)'(?!$)/g : /'/g;
	return str.replace(/''/g, "'").replace(regex, "\\'");
}
