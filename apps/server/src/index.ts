import type { CatalogEntry, Placement, TvSettings, WallTextureEntry } from '@repo/shared/items';
import { join, normalize } from 'node:path';
import { ASSET_DIR, catalog, importProducts, placements } from './catalog';
import { modelJobs, startModelJob } from './generate-model';
import { planGeometry } from '@repo/shared/plan';
import { usdzPath } from './usdz';
import { config } from './config';
import { ideaFile, ideasHtml } from './ideas';
import { textureJobs, textures } from './textures';
import {
	buildOption,
	FixtureError,
	importOption,
	isFixtureKey,
	itemFixtureFor,
	listFixtures,
	readFixture,
	removeOption,
	saveTv,
	selectOption,
} from './fixtures';

const isVec3 = (v: unknown): v is [number, number, number] =>
	Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

const productUrl = (url: unknown): url is string => typeof url === 'string' && /^https?:\/\//.test(url);
const failure = (error: unknown) => {
	if (!(error instanceof FixtureError)) console.error(error);
	return Response.json(
		{ error: error instanceof Error ? error.message : String(error) },
		{ status: error instanceof FixtureError ? 400 : 502 },
	);
};
const unknownFixture = (key: string) => Response.json({ error: `No fixture ${key}` }, { status: 404 });

const uiBuildPath = new URL('../../ui/build/', import.meta.url);

const server = Bun.serve({
	development: config.environment === 'development',
	// Imports run a headless browser and an LLM call, which takes about a minute.
	idleTimeout: 240,
	port: config.port,
	routes: {
		'/api/status': Response.json({ ok: true, now: new Date().toISOString() }),
		'/api/catalog': {
			GET: async () =>
				Response.json(
					catalog.all().map((item): CatalogEntry => ({ ...item, modelJob: modelJobs.get(item.id) ?? null })),
				),
		},
		'/api/catalog/:id/model': {
			POST: async request => {
				const item = catalog.get(request.params.id);
				if (!item) return Response.json({ error: 'Unknown item' }, { status: 404 });
				startModelJob(item);
				return Response.json({ ok: true });
			},
		},
		'/api/catalog/import': {
			POST: async request => {
				const { url } = (await request.json()) as { url?: string };
				if (!productUrl(url)) return Response.json({ error: 'Paste a product URL' }, { status: 400 });
				try {
					const [item] = await importProducts([url], console.log);
					if (!item!.model) startModelJob(item!);
					// A product that has a fixture, like a bed, becomes that fixture's pick instead of furniture to place.
					const fixture = itemFixtureFor(item!.category);
					if (fixture) await selectOption(fixture, item!.id);
					return Response.json(item);
				} catch (error) {
					return failure(error);
				}
			},
		},
		'/api/textures': {
			GET: async () =>
				Response.json(
					textures.all().map((t): WallTextureEntry => ({ ...t, textureJob: textureJobs.get(t.id) ?? null })),
				),
		},
		'/api/fixtures': { GET: async () => Response.json(await listFixtures()) },
		'/api/fixtures/:key': {
			GET: async request => {
				const { key } = request.params;
				return isFixtureKey(key) ? Response.json(await readFixture(key)) : unknownFixture(key);
			},
			PUT: async request => {
				const { key } = request.params;
				if (!isFixtureKey(key)) return unknownFixture(key);
				const { selected } = ((await request.json().catch(() => null)) ?? {}) as { selected?: unknown };
				if (selected !== null && typeof selected !== 'string')
					return Response.json({ error: 'Expected selected: an option id or null' }, { status: 400 });
				try {
					await selectOption(key, selected);
					return Response.json(await readFixture(key));
				} catch (error) {
					return failure(error);
				}
			},
		},
		'/api/fixtures/:key/import': {
			POST: async request => {
				const { key } = request.params;
				if (!isFixtureKey(key)) return unknownFixture(key);
				const { url } = ((await request.json().catch(() => null)) ?? {}) as { url?: unknown };
				if (!productUrl(url)) return Response.json({ error: 'Paste a product URL' }, { status: 400 });
				try {
					await importOption(key, url);
					return Response.json(await readFixture(key));
				} catch (error) {
					return failure(error);
				}
			},
		},
		'/api/fixtures/:key/options/:id/build': {
			POST: async request => {
				const { key, id } = request.params;
				if (!isFixtureKey(key)) return unknownFixture(key);
				try {
					await buildOption(key, id);
					return Response.json(await readFixture(key));
				} catch (error) {
					return failure(error);
				}
			},
		},
		'/api/fixtures/:key/options/:id': {
			DELETE: async request => {
				const { key, id } = request.params;
				if (!isFixtureKey(key)) return unknownFixture(key);
				try {
					await removeOption(key, id);
					return Response.json(await readFixture(key));
				} catch (error) {
					return failure(error);
				}
			},
		},
		// The TV's hand-set size and mount; picking an imported TV goes through /api/fixtures/tv.
		'/api/tv': {
			PUT: async request => {
				const tv = ((await request.json().catch(() => null)) ?? {}) as Partial<TvSettings>;
				const sizes = [tv.widthIn, tv.heightIn, tv.centerIn];
				if (
					typeof tv.visible !== 'boolean' ||
					!sizes.every(n => typeof n === 'number' && n > 0 && n < 240) ||
					typeof tv.tiltDeg !== 'number' ||
					tv.tiltDeg < 0 ||
					tv.tiltDeg > 30
				)
					return Response.json(
						{ error: 'Expected visible, widthIn, heightIn, centerIn and a 0–30° tiltDeg' },
						{ status: 400 },
					);
				const saved: TvSettings = {
					visible: tv.visible,
					widthIn: tv.widthIn!,
					heightIn: tv.heightIn!,
					centerIn: tv.centerIn!,
					tiltDeg: tv.tiltDeg,
				};
				await saveTv(saved);
				return Response.json(await readFixture('tv'));
			},
		},
		'/api/plan': Response.json(planGeometry()),
		'/api/catalog/:id/model.usdz': async request => {
			const item = catalog.get(request.params.id);
			const path = item && (await usdzPath(item));
			return path ? new Response(Bun.file(path)) : Response.json({ error: 'No model' }, { status: 404 });
		},
		'/api/placements': { GET: () => Response.json(placements.all()) },
		// Clients save only the items they changed, so a client holding an older copy of the rest can't revert edits
		// another client (the web plan or the AR app) made meanwhile.
		'/api/placements/:key': {
			PUT: async request => {
				const { key } = request.params;
				const { itemId, position, rotation } = (await request.json()) as Partial<Placement>;
				if (!isVec3(position) || !isVec3(rotation))
					return Response.json({ error: 'Expected a finite position and rotation' }, { status: 400 });
				const existing = placements.get(key);
				let saved: Placement;
				if (existing) saved = { ...existing, position, rotation };
				else if (!itemId) return Response.json({ error: 'Unknown placement' }, { status: 404 });
				else if (!catalog.get(itemId)) return Response.json({ error: `No catalog item ${itemId}` }, { status: 400 });
				else saved = { key, itemId, position, rotation };
				placements.put(saved);
				return Response.json(saved);
			},
			DELETE: request => {
				placements.remove(request.params.key);
				return Response.json({ ok: true });
			},
		},
		'/api/ideas': async () =>
			new Response(await ideasHtml(), { headers: { 'content-type': 'text/html; charset=utf-8' } }),
		'/api/ideas/files/*': request => ideaFile(new URL(request.url).pathname),
		'/api/assets/*': async request => {
			const rel = normalize(decodeURIComponent(new URL(request.url).pathname.slice('/api/assets/'.length)));
			if (rel.startsWith('..')) return new Response('Bad path', { status: 400 });
			const file = Bun.file(join(ASSET_DIR, rel));
			return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 });
		},
	},
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname.startsWith('/api/')) {
			return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
		}

		return staticFile(url.pathname);
	},
});

async function staticFile(pathname: string) {
	const path = pathname === '/' ? '/index.html' : pathname;
	const file = Bun.file(new URL(`.${path}`, uiBuildPath));

	if (await file.exists()) {
		return new Response(file);
	}

	const index = Bun.file(new URL('./index.html', uiBuildPath));
	if (await index.exists()) {
		return new Response(index);
	}

	return new Response('UI build not found. Run `bun run build` or use `bun run dev`.', {
		status: 404,
	});
}

console.log(`server listening on http://${server.hostname}:${server.port}`);
