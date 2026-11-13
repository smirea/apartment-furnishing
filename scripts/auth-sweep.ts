// Checks that nothing on the server answers without the API token: every route in apps/server/src/worker.ts with
// every method it takes, the product media, the UI build and paths nobody routes. A request with no token or a wrong
// one must get 401 and nothing else; with the token, the GET routes must answer. Writes are only sent unsigned.
//
//   bun scripts/auth-sweep.ts          against SERVER_URL with the API_TOKEN in .env.local
//   bun scripts/auth-sweep.ts --prod   against production with env-manager prod's token
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readEnv } from './lib';

const prod = process.argv.includes('--prod');
const { SERVER_URL: base, API_TOKEN: token } = prod ? readEnv('prod') : process.env;
if (!base || !token) throw new Error('SERVER_URL and API_TOKEN must be set; run from the repo root or pass --prod');

const source = readFileSync(join(import.meta.dir, '../apps/server/src/worker.ts'), 'utf8');
const table = source.slice(source.indexOf('router({'));
const routes = [...table.matchAll(/^\t'(\/[^']+)': (\{[^]*?^\t\},|.*,)$/gm)].map(([, path, body]) => ({
	path: path!,
	methods: body!.startsWith('{') ? [...body!.matchAll(/^\t\t(GET|PUT|PATCH|POST|DELETE):/gm)].map(m => m[1]!) : ['GET'],
}));
if (routes.length < 15) throw new Error(`Read only ${routes.length} routes from worker.ts; the parser is out of date`);

const sample = (path: string) => path.replace(/:\w+/g, 'probe').replace('*', 'probe/image.jpg');
const get = (path: string, headers: Record<string, string> = {}) =>
	fetch(new URL(path, base), { headers, redirect: 'manual' });
const signed = { authorization: `Bearer ${token}` };

// Real media and UI paths, so a 401 can't hide behind a 404 for a file that doesn't exist.
const items = (await (await get('/api/catalog', signed)).json()) as {
	id: string;
	image: string | null;
	model: string | null;
}[];
const withModel = items.find(item => item.model)!;
const shell = await (await get('/', signed)).text();
const script = shell.match(/(\/_app\/immutable\/[^"]+\.js)/)?.[1];
if (!script) throw new Error('No /_app/ script in the signed-in UI shell');
const extra = [
	items.find(item => item.image)!.image!,
	withModel.model!,
	`/api/catalog/${withModel.id}/model.usdz`,
	'/',
	script,
	'/ideas/readme.html',
	'/no-such-page',
	'/api/no-such-route',
	'/login',
];

const failures: string[] = [];
let checked = 0;
async function expectDenied(method: string, path: string) {
	for (const [label, headers] of [
		['no token', {}],
		['wrong token', { authorization: 'Bearer wrong' }],
		['wrong cookie', { cookie: 'apartment_token=wrong' }],
	] as const) {
		const res = await fetch(new URL(path, base), { method, headers, redirect: 'manual' });
		const body = await res.text();
		checked++;
		if (res.status !== 401) failures.push(`${method} ${path} with ${label}: ${res.status}`);
		else if (body.includes('/_app/') || body.length > 4000)
			failures.push(`${method} ${path} with ${label}: 401 with content`);
	}
}

for (const { path, methods } of routes) for (const method of methods) await expectDenied(method, sample(path));
for (const path of extra) await expectDenied('GET', path);

for (const path of [
	...routes.filter(r => r.methods.includes('GET') && !r.path.includes(':')).map(r => r.path.replace('/*', '')),
	...extra.slice(0, 6),
]) {
	if (path === '/api/assets') continue;
	const res = await get(path, signed);
	checked++;
	if (res.status === 401) failures.push(`GET ${path} with the token: 401`);
	await res.arrayBuffer();
}

console.log(`${base}: ${routes.length} routes, ${checked} requests`);
if (failures.length) {
	console.error(failures.join('\n'));
	process.exit(1);
}
console.log('Every route, asset and page refuses requests without the token');
