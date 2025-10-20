import chalk from 'chalk';
import { rmSync } from 'fs';
import fs from 'fs';
import { render } from 'hanji';
import { basename, join } from 'path';
import { buildSnapshotChain } from '../../utils';
import { DropMigrationView } from '../views';
import { embeddedMigrations } from './migrate';

export const dropMigration = async ({
	out,
	bundle,
}: {
	out: string;
	bundle: boolean;
}) => {
	const orderedTags = buildSnapshotChain(out);

	if (orderedTags.length === 0) {
		console.log(
			`[${chalk.blue('i')}] no migration folders found in ${out}`,
		);
		return;
	}

	// Convert tags to entries for the view
	const entries = orderedTags.map((tag, idx) => {
		return {
			idx,
			tag,
			when: 0, // Not used in drop view
		};
	});

	const result = await render(new DropMigrationView(entries));
	if (result.status === 'aborted') return;

	const selectedTag = result.data.tag;
	const migrationFolderPath = join(out, selectedTag);

	// Delete entire migration folder
	rmSync(migrationFolderPath, { recursive: true });

	if (bundle) {
		fs.writeFileSync(
			join(out, `migrations.js`),
			embeddedMigrations(out),
		);
	}

	console.log(
		`[${chalk.green('✓')}] ${
			chalk.bold(
				selectedTag,
			)
		} migration successfully dropped`,
	);
};
