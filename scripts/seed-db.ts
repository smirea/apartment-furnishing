// Copies production's rows into this checkout's local D1, once: `bun run dev` then shows the real apartment, and its
// photos and models come from production through the dev server's fallback. A database with rows is left alone.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readEnv, run, type Values } from './lib';

const SERVER = join(import.meta.dir, '../apps/server');
const PERSIST = ['--persist-to', '../../.wrangler/state'];
const TABLES = [
	'catalog_items',
	'placements',
	'wall_textures',
	'carpets',
	'tv_models',
	'settings',
	'layouts',
	'layout_carpets',
	'layout_hidden',
];

// Reading production needs its Cloudflare token, which only env-manager prod holds; without AWS access the copy is skipped.
let cloudflare: Values = {};
try {
	cloudflare = Object.fromEntries(Object.entries(readEnv('prod')).filter(([key]) => key.startsWith('CLOUDFLARE_')));
} catch {}
const wrangler = (args: string[]) => run(['bunx', 'wrangler', ...args], { cwd: SERVER, env: cloudflare });
const query = (where: '--local' | '--remote', sql: string) => {
	const out = wrangler([
		'd1',
		'execute',
		'apartment-furnishing',
		where,
		...(where === '--local' ? PERSIST : []),
		'--json',
		'--command',
		sql,
	]);
	return (JSON.parse(out.slice(out.indexOf('['))) as { results: Record<string, unknown>[] }[])[0]!.results;
};
const literal = (v: unknown) =>
	v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`;

wrangler(['d1', 'migrations', 'apply', 'apartment-furnishing', '--local', ...PERSIST]);
if (query('--local', 'SELECT count(*) AS n FROM catalog_items')[0]!.n) {
	console.log('The local database has rows, leaving it');
	process.exit(0);
}

let rows: Record<string, Record<string, unknown>[]>;
try {
	rows = Object.fromEntries(TABLES.map(t => [t, query('--remote', `SELECT * FROM ${t}`)]));
} catch (error) {
	console.log(
		`Could not read production (${error instanceof Error ? error.message.split('\n')[0] : error}); the local database stays empty`,
	);
	process.exit(0);
}
const inserts = TABLES.flatMap(t =>
	rows[t]!.map(row => {
		const columns = Object.keys(row);
		return `INSERT OR REPLACE INTO ${t} (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${columns.map(c => literal(row[c])).join(', ')});`;
	}),
);
const dir = mkdtempSync(join(tmpdir(), 'seed-'));
try {
	writeFileSync(join(dir, 'seed.sql'), inserts.join('\n'));
	wrangler(['d1', 'execute', 'apartment-furnishing', '--local', ...PERSIST, '--file', join(dir, 'seed.sql')]);
} finally {
	rmSync(dir, { recursive: true, force: true });
}
console.log(`Copied ${inserts.length} rows from production into the local database`);
