export interface MigrationLogger {
	logStart(totalMigrations: number): void;
	logMigration(tag: string, index: number, total: number): void;
	logComplete(appliedCount: number, duration: number): void;
	logSkipped(skippedCount: number): void;
}

export class ConsoleMigrationLogger implements MigrationLogger {
	private startTime?: number;

	logStart(totalMigrations: number): void {
		this.startTime = Date.now();
		if (totalMigrations === 0) {
			console.log('No migrations to apply');
		} else {
			console.log(`Applying ${totalMigrations} migration(s)...`);
		}
	}

	logMigration(tag: string, index: number, total: number): void {
		console.log(`  [${index + 1}/${total}] ${tag}`);
	}

	logComplete(appliedCount: number, duration: number): void {
		if (appliedCount > 0) {
			console.log(`✓ ${appliedCount} migration(s) applied successfully in ${duration}ms`);
		}
	}

	logSkipped(skippedCount: number): void {
		if (skippedCount > 0) {
			console.log(`  ${skippedCount} migration(s) already applied (skipped)`);
		}
	}
}

export const defaultLogger = new ConsoleMigrationLogger();
