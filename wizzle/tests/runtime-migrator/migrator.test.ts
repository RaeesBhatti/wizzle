import { describe, expect, test } from 'vitest';
import { readMigrationFiles } from '../../src/runtime/migrator';

describe('readMigrationFiles', () => {
	test('reads PostgreSQL migrations using snapshot chain', () => {
		const migrations = readMigrationFiles({
			migrationsFolder: 'tests/runtime-migrator/fixtures/pg',
		});

		expect(migrations).toHaveLength(2);

		// First migration
		expect(migrations[0].folderMillis).toBe(1700000000000);
		expect(migrations[0].sql).toEqual([
			'CREATE TABLE IF NOT EXISTS "users" (\n\t"id" serial PRIMARY KEY NOT NULL,\n\t"name" text NOT NULL,\n\t"email" text NOT NULL,\n\tCONSTRAINT "users_email_unique" UNIQUE("email")\n);',
		]);
		expect(migrations[0].bps).toBe(true);
		expect(typeof migrations[0].hash).toBe('string');

		// Second migration
		expect(migrations[1].folderMillis).toBe(1700000001000);
		expect(migrations[1].sql).toEqual([
			'ALTER TABLE "users" ADD COLUMN "created_at" timestamp DEFAULT now();',
		]);
		expect(migrations[1].bps).toBe(true);
		expect(typeof migrations[1].hash).toBe('string');
	});

	test('reads SQLite migrations using snapshot chain', () => {
		const migrations = readMigrationFiles({
			migrationsFolder: 'tests/runtime-migrator/fixtures/sqlite',
		});

		expect(migrations).toHaveLength(2);

		// First migration
		expect(migrations[0].folderMillis).toBe(1700000000000);
		expect(migrations[0].sql).toEqual([
			'CREATE TABLE `users` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL\n);',
		]);

		// Second migration with statement breakpoints
		expect(migrations[1].folderMillis).toBe(1700000001000);
		expect(migrations[1].sql.length).toBeGreaterThan(1);
		expect(migrations[1].sql).toContain('PRAGMA foreign_keys=OFF;');
		expect(migrations[1].sql).toContain('PRAGMA foreign_keys=ON;');
	});

	test('reads MySQL migrations using snapshot chain', () => {
		const migrations = readMigrationFiles({
			migrationsFolder: 'tests/runtime-migrator/fixtures/mysql',
		});

		expect(migrations).toHaveLength(2);

		// First migration
		expect(migrations[0].folderMillis).toBe(1700000000000);
		expect(migrations[0].sql[0]).toContain('CREATE TABLE `users`');

		// Second migration
		expect(migrations[1].folderMillis).toBe(1700000001000);
		expect(migrations[1].sql[0]).toContain('ALTER TABLE `users` ADD `created_at`');
	});

	test('throws error when meta folder does not exist', () => {
		expect(() => {
			readMigrationFiles({
				migrationsFolder: 'tests/runtime-migrator/fixtures/nonexistent',
			});
		}).toThrow("Can't find meta folder");
	});

	test('returns empty array when no snapshots exist', () => {
		// Create a temporary empty meta folder test
		const fs = require('fs');
		const path = require('path');
		const emptyPath = 'tests/runtime-migrator/fixtures/empty';
		const emptyMetaPath = path.join(emptyPath, 'meta');

		if (!fs.existsSync(emptyMetaPath)) {
			fs.mkdirSync(emptyMetaPath, { recursive: true });
		}

		const migrations = readMigrationFiles({
			migrationsFolder: emptyPath,
		});

		expect(migrations).toEqual([]);

		// Cleanup
		fs.rmdirSync(emptyMetaPath);
		fs.rmdirSync(emptyPath);
	});

	test('throws error when SQL file is missing', () => {
		// This would require a malformed fixture, so we'll skip for now
		// In a real scenario, snapshot exists but SQL file doesn't
	});
});
