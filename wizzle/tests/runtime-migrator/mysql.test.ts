import { describe, expect, test } from 'vitest';

describe('MySQL runtime migrator', () => {
	test('migrate function exists for mysql2', async () => {
		const { migrate } = await import('../../src/runtime/drivers/mysql2');
		expect(typeof migrate).toBe('function');
	});

	test('migrate function exists for planetscale-serverless', async () => {
		const { migrate } = await import('../../src/runtime/drivers/planetscale-serverless');
		expect(typeof migrate).toBe('function');
	});

	test('migrate function exists for tidb-serverless', async () => {
		const { migrate } = await import('../../src/runtime/drivers/tidb-serverless');
		expect(typeof migrate).toBe('function');
	});

	test('all MySQL drivers export migrate function', async () => {
		const drivers = [
			'mysql2',
			'mysql-proxy',
			'planetscale-serverless',
			'tidb-serverless',
		];

		for (const driver of drivers) {
			const module = await import(`../../src/runtime/drivers/${driver}`);
			expect(module.migrate).toBeDefined();
			expect(typeof module.migrate).toBe('function');
		}
	});
});

describe('SingleStore runtime migrator', () => {
	test('migrate function exists for singlestore', async () => {
		const { migrate } = await import('../../src/runtime/drivers/singlestore');
		expect(typeof migrate).toBe('function');
	});

	test('migrate function exists for singlestore-proxy', async () => {
		const { migrate } = await import('../../src/runtime/drivers/singlestore-proxy');
		expect(typeof migrate).toBe('function');
	});

	test('all SingleStore drivers export migrate function', async () => {
		const drivers = [
			'singlestore',
			'singlestore-proxy',
		];

		for (const driver of drivers) {
			const module = await import(`../../src/runtime/drivers/${driver}`);
			expect(module.migrate).toBeDefined();
			expect(typeof module.migrate).toBe('function');
		}
	});
});
