// Usage: bun run import-textures [--rebuild] <product-url> [more urls...]
// --rebuild also rebuilds the textures these products already have, e.g. after the texture prompt improves.
// Bulk version of the wall texture Import box: captures every page in one browser session, then has the running
// runner build the textures, so the app shows them queueing and building.
import env from '@repo/shared/env';
import type { WallTextureEntry } from '@repo/shared/items';
import { importTextures } from '../apps/runner/src/textures';

const args = process.argv.slice(2);
const rebuild = args.includes('--rebuild');
const urls = args.filter(a => a !== '--rebuild');
if (!urls.length) {
	console.error('usage: bun run import-textures [--rebuild] <product-url> [...]');
	process.exit(1);
}
const auth = { authorization: `Bearer ${env.API_TOKEN}` };
const status = await fetch(new URL('/api/status', env.SERVER_URL)).catch(() => null);
if (!status?.ok) throw new Error(`The server at ${env.SERVER_URL} is not answering; start it with bun run dev`);

// Queue whatever imported even when some pages failed, then report the failures.
let imported: string[] = [];
const failure = await importTextures(urls, console.log).then(
	textures => ((imported = textures.map(t => t.id)), null),
	(error: unknown) => error,
);
const textures = (await (
	await fetch(new URL('/api/textures', env.SERVER_URL), { headers: auth })
).json()) as WallTextureEntry[];
for (const texture of textures) {
	if (texture.textureJob || (texture.texture && !(rebuild && imported.includes(texture.id)))) continue;
	const res = await fetch(new URL(`/api/fixtures/wallTexture/options/${texture.id}/build`, env.SERVER_URL), {
		method: 'POST',
		headers: auth,
	});
	if (!res.ok) throw new Error(`queueing ${texture.id}: ${res.status} ${await res.text()}`);
}
if (failure) throw failure;
console.log('queued; watch the Living room wall texture panel');
