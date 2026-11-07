// `wrangler dev` with local D1 and R2 under the repo's .wrangler/state, the dev API_TOKEN, and photos and models read
// from production when the local bucket lacks them.
import env from '@repo/shared/env';
import { mkdirSync, writeFileSync } from 'node:fs';

if (!env.API_TOKEN) throw new Error('API_TOKEN is not set in .env.local: env-manager down');
const PERSIST = '../../.wrangler/state';
const PRODUCTION = 'https://apartment.stf.lol';

writeFileSync('.dev.vars', `API_TOKEN=${env.API_TOKEN}\nASSETS_FALLBACK_URL=${PRODUCTION}\n`, { mode: 0o600 });
// The Worker serves the UI build; `bun run dev` serves the UI from Vite instead, so an empty folder will do.
mkdirSync('../ui/build', { recursive: true });

const migrate = Bun.spawn(
	['bunx', 'wrangler', 'd1', 'migrations', 'apply', 'apartment-furnishing', '--local', '--persist-to', PERSIST],
	{ stdio: ['inherit', 'inherit', 'inherit'] },
);
if ((await migrate.exited) !== 0) throw new Error('Applying the D1 migrations locally failed');
const server = Bun.spawn(
	['bunx', 'wrangler', 'dev', '--port', String(env.PORT), '--ip', '127.0.0.1', '--persist-to', PERSIST],
	{ stdio: ['inherit', 'pipe', 'inherit'] },
);
process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));
// The runner polls every few seconds; its successful polls would bury every other request in the log.
const quiet = /POST \/api\/runner\/sql 200 /;
let rest = '';
for await (const chunk of server.stdout.pipeThrough(new TextDecoderStream())) {
	const lines = (rest + chunk).split('\n');
	rest = lines.pop()!;
	for (const line of lines) if (!quiet.test(line)) process.stdout.write(`${line}\n`);
}
process.exit(await server.exited);
