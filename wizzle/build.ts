/// <reference types="bun-types" />
import * as esbuild from 'esbuild';
import { mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { sync as globSync } from 'glob';
import * as tsup from 'tsup';
import pkg from './package.json';

const driversPackages = [
	// postgres drivers
	'pg',
	'postgres',
	'@vercel/postgres',
	'@neondatabase/serverless',
	'@electric-sql/pglite',
	//  mysql drivers
	'mysql2',
	'@planetscale/database',
	// sqlite drivers
	'@libsql/client',
	'better-sqlite3',
	'bun:sqlite',
];

esbuild.buildSync({
	entryPoints: ['./src/utils.ts'],
	bundle: true,
	outfile: 'dist/utils.js',
	format: 'cjs',
	target: 'node16',
	platform: 'node',
	external: [
		'commander',
		'json-diff',
		'glob',
		'esbuild',
		'drizzle-orm',
		...driversPackages,
	],
	banner: {
		js: `#!/usr/bin/env node`,
	},
});

esbuild.buildSync({
	entryPoints: ['./src/utils.ts'],
	bundle: true,
	outfile: 'dist/utils.mjs',
	format: 'esm',
	target: 'node16',
	platform: 'node',
	external: [
		'commander',
		'json-diff',
		'glob',
		'esbuild',
		'drizzle-orm',
		...driversPackages,
	],
	banner: {
		js: `#!/usr/bin/env node`,
	},
});

esbuild.buildSync({
	entryPoints: ['./src/cli/index.ts'],
	bundle: true,
	outfile: 'dist/bin.cjs',
	format: 'cjs',
	target: 'node16',
	platform: 'node',
	define: {
		'process.env.DRIZZLE_KIT_VERSION': `"${pkg.version}"`,
	},
	external: [
		'esbuild',
		'drizzle-orm',
		...driversPackages,
	],
	banner: {
		js: `#!/usr/bin/env node`,
	},
});

const main = async () => {
	await tsup.build({
		entryPoints: ['./src/index.ts', './src/api.ts'],
		outDir: './dist',
		external: ['bun:sqlite'],
		splitting: false,
		dts: true,
		format: ['cjs', 'esm'],
		outExtension: (ctx) => {
			if (ctx.format === 'cjs') {
				return {
					dts: '.d.ts',
					js: '.js',
				};
			}
			return {
				dts: '.d.mts',
				js: '.mjs',
			};
		},
	});

	const apiCjs = readFileSync('./dist/api.js', 'utf8').replace(/await import\(/g, 'require(');
	writeFileSync('./dist/api.js', apiCjs);

	// Build runtime migrator and drivers
	const driverFiles = globSync('./src/runtime/drivers/*.ts');

	await tsup.build({
		entryPoints: ['./src/runtime/migrator.ts', './src/runtime/logger.ts', ...driverFiles],
		outDir: './dist',
		external: [
			'drizzle-orm',
			'bun:sqlite',
			...driversPackages,
		],
		bundle: false, // Important: preserve directory structure like drizzle-orm
		splitting: false,
		dts: true,
		format: ['cjs', 'esm'],
		outExtension: (ctx) => {
			if (ctx.format === 'cjs') {
				return {
					dts: '.d.ts',
					js: '.js',
				};
			}
			return {
				dts: '.d.mts',
				js: '.mjs',
			};
		},
	});

	// Move files to correct location for package.json exports
	// tsup outputs to dist/migrator.* and dist/drivers/*, but we need dist/runtime/
	mkdirSync('./dist/runtime', { recursive: true });
	mkdirSync('./dist/runtime/drivers', { recursive: true });

	// Move migrator files
	const migratorFiles = globSync('./dist/migrator.*');
	migratorFiles.forEach((file: string) => {
		const basename = path.basename(file);
		renameSync(file, `./dist/runtime/${basename}`);
	});

	// Move logger files
	const loggerFiles = globSync('./dist/logger.*');
	loggerFiles.forEach((file: string) => {
		const basename = path.basename(file);
		renameSync(file, `./dist/runtime/${basename}`);
	});

	// Move driver files
	const builtDriverFiles = globSync('./dist/drivers/*');
	builtDriverFiles.forEach((file: string) => {
		const basename = path.basename(file);
		renameSync(file, `./dist/runtime/drivers/${basename}`);
	});

	// Remove empty drivers directory
	rmdirSync('./dist/drivers');
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
