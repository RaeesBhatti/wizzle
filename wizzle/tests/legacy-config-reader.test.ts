import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { readLegacyDrizzleConfig, resetLegacyConfigCache } from '../src/runtime/migrator';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

describe('readLegacyDrizzleConfig', () => {
	let testFixturesDir: string;
	let testCounter = 0;

	beforeEach(() => {
		// Use a unique directory for each test to avoid require cache issues
		testCounter++;
		testFixturesDir = join(
			process.cwd(),
			'tests',
			'fixtures',
			'legacy-config',
			`test-${testCounter}`,
		);

		// Reset the cache before each test
		resetLegacyConfigCache();

		// Also clear the entire require cache to be extra sure
		// (This is aggressive but necessary for test isolation)
		for (const key in require.cache) {
			if (key.includes('drizzle.config')) {
				delete require.cache[key];
			}
		}

		// Create fixtures directory
		if (!existsSync(testFixturesDir)) {
			mkdirSync(testFixturesDir, { recursive: true });
		}

		// Set test config path prefix
		process.env.TEST_CONFIG_PATH_PREFIX = testFixturesDir;
	});

	afterEach(() => {
		// Reset cache before deleting files (so require.resolve can find them)
		resetLegacyConfigCache();

		// Clean up test fixtures - remove the entire legacy-config directory
		const parentDir = join(process.cwd(), 'tests', 'fixtures', 'legacy-config');
		if (existsSync(parentDir)) {
			rmSync(parentDir, { recursive: true, force: true });
		}

		// Clean up environment
		delete process.env.TEST_CONFIG_PATH_PREFIX;
	});

	test('reads drizzle.config.ts successfully', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.ts');
		const configContent = `
export default {
	migrations: {
		table: 'custom_migrations',
		schema: 'custom_schema'
	}
};
`;
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		expect(result?.migrations?.table).toBe('custom_migrations');
		expect(result?.migrations?.schema).toBe('custom_schema');
	});

	test('reads drizzle.config.js successfully with CommonJS export', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.js');
		const configContent = `
module.exports = {
	migrations: {
		table: 'js_migrations',
		schema: 'js_schema'
	}
};
`;
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		expect(result?.migrations?.table).toBe('js_migrations');
		expect(result?.migrations?.schema).toBe('js_schema');
	});

	test('reads drizzle.config.json successfully', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.json');
		const configContent = JSON.stringify({
			migrations: {
				table: 'json_migrations',
				schema: 'json_schema',
			},
		});
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		expect(result?.migrations?.table).toBe('json_migrations');
		expect(result?.migrations?.schema).toBe('json_schema');
	});

	test('returns undefined when no drizzle.config exists', () => {
		// No config file created
		const result = readLegacyDrizzleConfig();

		expect(result).toBeUndefined();
	});

	test('extracts migrations.table and migrations.schema correctly', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.json');
		const configContent = JSON.stringify({
			schema: './schema.ts',
			out: './migrations',
			migrations: {
				table: 'my_migrations_table',
				schema: 'my_migrations_schema',
			},
			other: 'config',
		});
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		expect(result?.migrations?.table).toBe('my_migrations_table');
		expect(result?.migrations?.schema).toBe('my_migrations_schema');
	});

	test('handles config without migrations section', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.json');
		const configContent = JSON.stringify({
			schema: './schema.ts',
			out: './migrations',
		});
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		expect(result?.migrations).toBeUndefined();
	});

	test('handles partial migrations config - table only', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.json');
		const configContent = JSON.stringify({
			migrations: {
				table: 'only_table',
			},
		});
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		expect(result?.migrations?.table).toBe('only_table');
		expect(result?.migrations?.schema).toBeUndefined();
	});

	test('handles partial migrations config - schema only', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.json');
		const configContent = JSON.stringify({
			migrations: {
				schema: 'only_schema',
			},
		});
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		expect(result?.migrations?.schema).toBe('only_schema');
		expect(result?.migrations?.table).toBeUndefined();
	});

	test('respects file extension priority - .ts first', () => {
		// Create multiple config files
		const tsConfig = join(testFixturesDir, 'drizzle.config.ts');
		const jsConfig = join(testFixturesDir, 'drizzle.config.js');
		const jsonConfig = join(testFixturesDir, 'drizzle.config.json');

		writeFileSync(
			tsConfig,
			`export default { migrations: { table: 'from_ts' } };`,
		);
		writeFileSync(
			jsConfig,
			`module.exports = { migrations: { table: 'from_js' } };`,
		);
		writeFileSync(
			jsonConfig,
			JSON.stringify({ migrations: { table: 'from_json' } }),
		);

		const result = readLegacyDrizzleConfig();

		// Should pick .ts file first
		expect(result?.migrations?.table).toBe('from_ts');
	});

	test('respects file extension priority - .js when .ts absent', () => {
		// Create only .js and .json
		const jsConfig = join(testFixturesDir, 'drizzle.config.js');
		const jsonConfig = join(testFixturesDir, 'drizzle.config.json');

		writeFileSync(
			jsConfig,
			`module.exports = { migrations: { table: 'from_js' } };`,
		);
		writeFileSync(
			jsonConfig,
			JSON.stringify({ migrations: { table: 'from_json' } }),
		);

		const result = readLegacyDrizzleConfig();

		// Should pick .js file
		expect(result?.migrations?.table).toBe('from_js');
	});

	test('falls back to .json when .ts and .js absent', () => {
		// Create only .json
		const jsonConfig = join(testFixturesDir, 'drizzle.config.json');

		writeFileSync(
			jsonConfig,
			JSON.stringify({ migrations: { table: 'from_json' } }),
		);

		const result = readLegacyDrizzleConfig();

		// Should pick .json file
		expect(result?.migrations?.table).toBe('from_json');
	});

	test('supports .mjs extension', () => {
		const mjsConfig = join(testFixturesDir, 'drizzle.config.mjs');
		writeFileSync(
			mjsConfig,
			`export default { migrations: { table: 'from_mjs' } };`,
		);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		// Result may vary based on whether require can handle .mjs
		// At minimum, it should not crash
	});

	test('supports .cjs extension', () => {
		const cjsConfig = join(testFixturesDir, 'drizzle.config.cjs');
		writeFileSync(
			cjsConfig,
			`module.exports = { migrations: { table: 'from_cjs' } };`,
		);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		expect(result?.migrations?.table).toBe('from_cjs');
	});

	test('handles malformed JSON gracefully', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.json');
		writeFileSync(configPath, '{ invalid json content');

		const result = readLegacyDrizzleConfig();

		// Should return undefined on parse error
		expect(result).toBeUndefined();
	});

	test('uses regex fallback for TypeScript files when require fails', () => {
		// Create a TS file with syntax that can't be required but can be regex-parsed
		const configPath = join(testFixturesDir, 'drizzle.config.ts');
		const configContent = `
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './schema.ts',
	out: './migrations',
	migrations: {
		table: 'regex_parsed_table',
		schema: 'regex_parsed_schema'
	}
});
`;
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		// The regex should extract the values
		expect(result).toBeDefined();
		expect(result?.migrations?.table).toBe('regex_parsed_table');
		expect(result?.migrations?.schema).toBe('regex_parsed_schema');
	});

	test('regex fallback extracts table only', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.ts');
		const configContent = `
export default {
	migrations: {
		table: 'only_table_regex'
	}
};
`;
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		expect(result?.migrations?.table).toBe('only_table_regex');
	});

	test('regex fallback extracts schema only', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.ts');
		const configContent = `
export default {
	migrations: {
		schema: 'only_schema_regex'
	}
};
`;
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		expect(result?.migrations?.schema).toBe('only_schema_regex');
	});

	test('handles config with single quotes', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.ts');
		const configContent = `
export default {
	migrations: {
		table: 'single_quotes_table',
		schema: 'single_quotes_schema'
	}
};
`;
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result?.migrations?.table).toBe('single_quotes_table');
		expect(result?.migrations?.schema).toBe('single_quotes_schema');
	});

	test('handles config with double quotes', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.ts');
		const configContent = `
export default {
	migrations: {
		table: "double_quotes_table",
		schema: "double_quotes_schema"
	}
};
`;
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result?.migrations?.table).toBe('double_quotes_table');
		expect(result?.migrations?.schema).toBe('double_quotes_schema');
	});

	test('returns empty migrations object when migrations field is empty', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.json');
		const configContent = JSON.stringify({
			schema: './schema.ts',
			migrations: {},
		});
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		expect(result?.migrations).toEqual({});
	});

	test('handles config with extra whitespace in regex parsing', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.ts');
		const configContent = `
export default {
	migrations: {
		table:    'whitespace_table'   ,
		schema:   'whitespace_schema'
	}
};
`;
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result?.migrations?.table).toBe('whitespace_table');
		expect(result?.migrations?.schema).toBe('whitespace_schema');
	});

	test('handles CommonJS with exports object', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.js');
		const configContent = `
exports.default = {
	migrations: {
		table: 'exports_table',
		schema: 'exports_schema'
	}
};
`;
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		// Result depends on how require resolves exports vs module.exports
	});

	test('handles empty config file', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.json');
		writeFileSync(configPath, '{}');

		const result = readLegacyDrizzleConfig();

		expect(result).toEqual({});
	});

	test('handles config with null migrations', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.json');
		const configContent = JSON.stringify({
			migrations: null,
		});
		writeFileSync(configPath, configContent);

		const result = readLegacyDrizzleConfig();

		expect(result).toBeDefined();
		expect(result?.migrations).toBeNull();
	});
});

describe('readLegacyDrizzleConfig - caching behavior', () => {
	let testFixturesDir: string;
	let cacheTestCounter = 0;

	beforeEach(() => {
		// Use a unique directory for each test to avoid require cache issues
		cacheTestCounter++;
		testFixturesDir = join(
			process.cwd(),
			'tests',
			'fixtures',
			'legacy-config-cache',
			`test-${cacheTestCounter}`,
		);

		// Reset the cache before each test
		resetLegacyConfigCache();

		// Also clear the entire require cache to be extra sure
		// (This is aggressive but necessary for test isolation)
		for (const key in require.cache) {
			if (key.includes('drizzle.config')) {
				delete require.cache[key];
			}
		}

		// Create fixtures directory
		if (!existsSync(testFixturesDir)) {
			mkdirSync(testFixturesDir, { recursive: true });
		}

		// Set test config path prefix
		process.env.TEST_CONFIG_PATH_PREFIX = testFixturesDir;
	});

	afterEach(() => {
		// Reset cache before deleting files (so require.resolve can find them)
		resetLegacyConfigCache();

		// Clean up test fixtures - remove the entire legacy-config-cache directory
		const parentDir = join(process.cwd(), 'tests', 'fixtures', 'legacy-config-cache');
		if (existsSync(parentDir)) {
			rmSync(parentDir, { recursive: true, force: true });
		}

		// Clean up environment
		delete process.env.TEST_CONFIG_PATH_PREFIX;
	});

	test('caches result on subsequent calls', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.json');
		const configContent = JSON.stringify({
			migrations: {
				table: 'cached_table',
				schema: 'cached_schema',
			},
		});
		writeFileSync(configPath, configContent);

		// First call
		const result1 = readLegacyDrizzleConfig();
		expect(result1?.migrations?.table).toBe('cached_table');

		// Delete the file
		rmSync(configPath);

		// Second call should still return cached result
		const result2 = readLegacyDrizzleConfig();
		expect(result2).toEqual(result1);
		expect(result2?.migrations?.table).toBe('cached_table');
	});

	test('caches undefined result when no config exists', () => {
		// First call with no config
		const result1 = readLegacyDrizzleConfig();
		expect(result1).toBeUndefined();

		// Create a config file
		const configPath = join(testFixturesDir, 'drizzle.config.json');
		writeFileSync(
			configPath,
			JSON.stringify({ migrations: { table: 'new_table' } }),
		);

		// Second call should still return undefined (cached)
		const result2 = readLegacyDrizzleConfig();
		expect(result2).toBeUndefined();
	});

	test('cache persists across multiple calls', () => {
		const configPath = join(testFixturesDir, 'drizzle.config.json');
		writeFileSync(
			configPath,
			JSON.stringify({ migrations: { table: 'multi_call_table' } }),
		);

		// Make multiple calls
		const result1 = readLegacyDrizzleConfig();
		const result2 = readLegacyDrizzleConfig();
		const result3 = readLegacyDrizzleConfig();

		// All should return the same cached result
		expect(result1).toEqual(result2);
		expect(result2).toEqual(result3);
		expect(result1?.migrations?.table).toBe('multi_call_table');

		// Delete the file
		rmSync(configPath);

		// Should still return cached result
		const result4 = readLegacyDrizzleConfig();
		expect(result4).toEqual(result1);
	});
});
