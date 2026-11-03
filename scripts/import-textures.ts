// Usage: bun run import-textures <product-url> [more urls...]
// Bulk version of the wall texture Import box: captures every page in one browser session, then has the running
// server build the textures, so the app shows them queueing and building.
import env from '@repo/shared/env';
import type { WallTextureEntry } from '@repo/shared/items';
import { importTextures } from '../apps/server/src/textures';

const urls = process.argv.slice(2);
if (!urls.length) {
	console.error('usage: bun run import-textures <product-url> [...]');
	process.exit(1);
}
const status = await fetch(new URL('/api/status', env.SERVER_URL)).catch(() => null);
if (!status?.ok) throw new Error(`The server at ${env.SERVER_URL} is not answering; start it with bun run dev`);

// Queue whatever imported even when some pages failed, then report the failures.
const failure = await importTextures(urls, console.log).then(
	() => null,
	(error: unknown) => error,
);
const textures = (await (await fetch(new URL('/api/textures', env.SERVER_URL))).json()) as WallTextureEntry[];
for (const texture of textures) {
	if (texture.texture || texture.textureJob) continue;
	const res = await fetch(new URL(`/api/textures/${texture.id}/generate`, env.SERVER_URL), { method: 'POST' });
	if (!res.ok) throw new Error(`queueing ${texture.id}: ${res.status} ${await res.text()}`);
}
if (failure) throw failure;
console.log('queued; watch the Living room wall texture panel');
