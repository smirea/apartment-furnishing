import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { worktrees } from './lib';

const target = join(import.meta.dir, '../data/app.db');
const source = join(worktrees(import.meta.dir)[0]!.path, 'data/app.db');

if (existsSync(target)) console.log(`${target} exists, leaving it`);
else if (!existsSync(source)) console.log(`No ${source} to copy, the server will create an empty database`);
else {
	// VACUUM INTO takes a consistent snapshot even while the main checkout's server is writing.
	new Database(source, { readonly: true }).run('VACUUM INTO ?', [target]);
	console.log(`Copied ${source} to ${target}`);
}
