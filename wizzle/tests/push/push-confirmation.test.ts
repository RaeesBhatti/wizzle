import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mock functions to be accessible in vi.mock factories
const { mockRender, mockSelect } = vi.hoisted(() => {
	return {
		mockRender: vi.fn(),
		mockSelect: vi.fn(),
	};
});

// Mock hanji before importing push functions
vi.mock('hanji', () => ({
	render: mockRender,
	Prompt: class Prompt {},
	SelectState: {},
	TaskView: class TaskView {},
	renderWithTask: vi.fn(),
}));

vi.mock('../../src/cli/selector-ui', () => ({
	Select: class Select {
		constructor(public options: string[]) {
			mockSelect(options);
		}
	},
}));

describe('Push Confirmation Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('confirmation shows proper warning message when user aborts', async () => {
		// Mock user selecting "No, abort" (index 0)
		mockRender.mockResolvedValueOnce({
			status: 'completed',
			data: { index: 0 },
		});

		// Mock render for abort message
		mockRender.mockResolvedValueOnce({ status: 'completed' });

		// Mock process.exit to prevent actual exit
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

		// Import confirmPushOperation directly to test it
		const { confirmPushOperation } = await import('../../src/cli/commands/push');

		await confirmPushOperation(false);

		// Verify confirmation prompt was shown with correct options
		expect(mockSelect).toHaveBeenCalledWith(['No, abort', 'Yes, proceed with push']);

		// Verify exit was called when user aborted
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	test('confirmation allows proceeding when user selects yes', async () => {
		// Mock user selecting "Yes, proceed with push" (index 1)
		mockRender.mockResolvedValueOnce({
			status: 'completed',
			data: { index: 1 },
		});

		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

		const { confirmPushOperation } = await import('../../src/cli/commands/push');

		await confirmPushOperation(false);

		// Verify confirmation prompt was shown
		expect(mockSelect).toHaveBeenCalledWith(['No, abort', 'Yes, proceed with push']);

		// Verify exit was NOT called (user proceeded)
		expect(exitSpy).not.toHaveBeenCalled();
	});

	test('--force flag skips confirmation but shows warning', async () => {
		// Spy on console.log to verify warning is shown
		const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		const { confirmPushOperation } = await import('../../src/cli/commands/push');

		await confirmPushOperation(true);

		// Verify NO confirmation prompt was shown
		expect(mockSelect).not.toHaveBeenCalled();

		// Verify warning was logged
		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining('WARNING'),
		);

		// Verify it mentions the force flag
		const calls = consoleLogSpy.mock.calls.flat().join(' ');
		expect(calls).toContain('--force');
	});

	test('warning message mentions migrate command is safer', async () => {
		// Mock user selecting "Yes, proceed with push" (index 1)
		mockRender.mockResolvedValueOnce({
			status: 'completed',
			data: { index: 1 },
		});

		const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		const { confirmPushOperation } = await import('../../src/cli/commands/push');

		await confirmPushOperation(false);

		// Verify migrate command is mentioned in the warning
		const calls = consoleLogSpy.mock.calls.flat().join(' ');
		expect(calls).toContain('migrate');
		expect(calls).toContain('production');
	});

	test('warning message explains benefits of migrate command', async () => {
		// Mock user selecting "Yes, proceed with push" (index 1)
		mockRender.mockResolvedValueOnce({
			status: 'completed',
			data: { index: 1 },
		});

		const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		const { confirmPushOperation } = await import('../../src/cli/commands/push');

		await confirmPushOperation(false);

		// Verify benefits are mentioned
		const calls = consoleLogSpy.mock.calls.flat().join(' ');
		expect(calls).toContain('versioned migration files');
		expect(calls).toContain('rollback');
		expect(calls).toContain('migration history');
		expect(calls).toContain('team collaboration');
	});
});
