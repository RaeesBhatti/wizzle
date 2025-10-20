import { describe, expect, test } from 'vitest';
import { generateSchemaFromSnapshot } from '../src/utils/schemaGenerator';
import type { PgSchema } from '../src/serializer/pgSchema';

describe('Schema Generator', () => {
	describe('combineSchemaAndRelations', () => {
		test('removes circular imports from combined schema file', () => {
			// Create a minimal PgSchema with foreign keys to trigger relations generation
			const snapshot: PgSchema = {
				version: '7',
				dialect: 'postgresql',
				id: 'test-id',
				prevId: '00000000-0000-0000-0000-000000000000',
				tables: {
					users: {
						name: 'users',
						schema: '',
						columns: {
							id: {
								name: 'id',
								type: 'serial',
								primaryKey: true,
								notNull: true,
							},
							name: {
								name: 'name',
								type: 'text',
								notNull: true,
							},
						},
						indexes: {},
						foreignKeys: {},
						compositePrimaryKeys: {},
						uniqueConstraints: {},
						checkConstraints: {},
						policies: {},
					},
					posts: {
						name: 'posts',
						schema: '',
						columns: {
							id: {
								name: 'id',
								type: 'serial',
								primaryKey: true,
								notNull: true,
							},
							user_id: {
								name: 'user_id',
								type: 'integer',
								notNull: true,
							},
							title: {
								name: 'title',
								type: 'text',
								notNull: true,
							},
						},
						indexes: {},
						foreignKeys: {
							posts_user_id_fkey: {
								name: 'posts_user_id_fkey',
								tableFrom: 'posts',
								tableTo: 'users',
								columnsFrom: ['user_id'],
								columnsTo: ['id'],
								onDelete: 'cascade',
								onUpdate: 'no action',
							},
						},
						compositePrimaryKeys: {},
						uniqueConstraints: {},
						checkConstraints: {},
						policies: {},
					},
				},
				enums: {},
				schemas: {},
				sequences: {},
				roles: {},
				policies: {},
				views: {},
				_meta: {
					columns: {},
					schemas: {},
					tables: {},
				},
			};

			const { combined } = generateSchemaFromSnapshot(snapshot, 'camel');

			// Check that circular import is NOT present
			expect(combined).not.toContain('from "./schema"');
			expect(combined).not.toContain("from './schema'");

			// Check that necessary imports ARE present
			expect(combined).toContain('drizzle-orm/pg-core');
			expect(combined).toContain('drizzle-orm/relations');

			// Check that schema code is present
			expect(combined).toContain('export const users');
			expect(combined).toContain('export const posts');

			// Check that relations code is present
			expect(combined).toContain('usersRelations');
			expect(combined).toContain('postsRelations');
			expect(combined).toContain('relations(users');
			expect(combined).toContain('relations(posts');
		});

		test('preserves all drizzle-orm imports', () => {
			const snapshot: PgSchema = {
				version: '7',
				dialect: 'postgresql',
				id: 'test-id',
				prevId: '00000000-0000-0000-0000-000000000000',
				tables: {
					users: {
						name: 'users',
						schema: '',
						columns: {
							id: {
								name: 'id',
								type: 'serial',
								primaryKey: true,
								notNull: true,
							},
						},
						indexes: {},
						foreignKeys: {},
						compositePrimaryKeys: {},
						uniqueConstraints: {},
						checkConstraints: {},
						policies: {},
					},
				},
				enums: {},
				schemas: {},
				sequences: {},
				roles: {},
				policies: {},
				views: {},
				_meta: {
					columns: {},
					schemas: {},
					tables: {},
				},
			};

			const { combined } = generateSchemaFromSnapshot(snapshot, 'camel');

			// Should have drizzle-orm imports
			expect(combined).toContain('drizzle-orm');

			// Should not have any empty import lines
			const lines = combined.split('\n');
			const importLines = lines.filter(line => line.trim().startsWith('import'));

			importLines.forEach(importLine => {
				expect(importLine).toMatch(/from\s+["'][^"']+["']/);
			});
		});

		test('handles schema with no foreign keys (no relations)', () => {
			const snapshot: PgSchema = {
				version: '7',
				dialect: 'postgresql',
				id: 'test-id',
				prevId: '00000000-0000-0000-0000-000000000000',
				tables: {
					users: {
						name: 'users',
						schema: '',
						columns: {
							id: {
								name: 'id',
								type: 'serial',
								primaryKey: true,
								notNull: true,
							},
						},
						indexes: {},
						foreignKeys: {},
						compositePrimaryKeys: {},
						uniqueConstraints: {},
						checkConstraints: {},
						policies: {},
					},
				},
				enums: {},
				schemas: {},
				sequences: {},
				roles: {},
				policies: {},
				views: {},
				_meta: {
					columns: {},
					schemas: {},
					tables: {},
				},
			};

			const { combined } = generateSchemaFromSnapshot(snapshot, 'camel');

			// Should not have circular import
			expect(combined).not.toContain('from "./schema"');

			// Should have table definition
			expect(combined).toContain('export const users');
		});
	});

	describe('separate schema and relations output', () => {
		test('provides separate schema and relations strings', () => {
			const snapshot: PgSchema = {
				version: '7',
				dialect: 'postgresql',
				id: 'test-id',
				prevId: '00000000-0000-0000-0000-000000000000',
				tables: {
					users: {
						name: 'users',
						schema: '',
						columns: {
							id: {
								name: 'id',
								type: 'serial',
								primaryKey: true,
								notNull: true,
							},
						},
						indexes: {},
						foreignKeys: {},
						compositePrimaryKeys: {},
						uniqueConstraints: {},
						checkConstraints: {},
						policies: {},
					},
					posts: {
						name: 'posts',
						schema: '',
						columns: {
							id: {
								name: 'id',
								type: 'serial',
								primaryKey: true,
								notNull: true,
							},
							user_id: {
								name: 'user_id',
								type: 'integer',
								notNull: true,
							},
						},
						indexes: {},
						foreignKeys: {
							posts_user_id_fkey: {
								name: 'posts_user_id_fkey',
								tableFrom: 'posts',
								tableTo: 'users',
								columnsFrom: ['user_id'],
								columnsTo: ['id'],
							},
						},
						compositePrimaryKeys: {},
						uniqueConstraints: {},
						checkConstraints: {},
						policies: {},
					},
				},
				enums: {},
				schemas: {},
				sequences: {},
				roles: {},
				policies: {},
				views: {},
				_meta: {
					columns: {},
					schemas: {},
					tables: {},
				},
			};

			const result = generateSchemaFromSnapshot(snapshot, 'camel');

			// Check that all three outputs are provided
			expect(result.schema).toBeDefined();
			expect(result.relations).toBeDefined();
			expect(result.combined).toBeDefined();

			// Schema should contain table definitions
			expect(result.schema).toContain('export const users');
			expect(result.schema).toContain('export const posts');

			// Relations should contain relation definitions (with the import to ./schema)
			expect(result.relations).toContain('Relations');

			// Combined should have everything without circular import
			expect(result.combined).toContain('export const users');
			expect(result.combined).toContain('Relations');
			expect(result.combined).not.toContain('from "./schema"');
		});
	});
});
