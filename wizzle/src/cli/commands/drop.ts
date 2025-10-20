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
	const metaFolder = join(out, 'meta');
	const orderedSnapshots = buildSnapshotChain(metaFolder);

	if (orderedSnapshots.length === 0) {
		console.log(
			`[${chalk.blue('i')}] no migration snapshots found in ${metaFolder}`,
		);
		return;
	}

	// Convert snapshot paths to entries for the view
	const entries = orderedSnapshots.map((snapshotPath, idx) => {
		const filename = basename(snapshotPath, '.json');
		const tag = filename.replace('_snapshot', '');
		return {
			idx,
			tag,
			when: 0, // Not used in drop view
		};
	});

	const result = await render(new DropMigrationView(entries));
	if (result.status === 'aborted') return;

	const selectedTag = result.data.tag;
	const snapshotFilePath = join(metaFolder, `${selectedTag}_snapshot.json`);
	const sqlFilePath = join(out, `${selectedTag}.sql`);

	rmSync(snapshotFilePath);
	rmSync(sqlFilePath);

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
