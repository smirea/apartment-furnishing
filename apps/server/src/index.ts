import {
	DEFAULT_TV,
	type BedSettings,
	type CatalogEntry,
	type Finishes,
	type Placement,
	type TvSettings,
	type WallTextureEntry,
} from '@repo/shared/items';
import { join, normalize } from 'node:path';
import {
	ASSET_DIR,
	DATA_DIR,
	importProducts,
	listCatalog,
	readItem,
	readPlacements,
	updatePlacements,
} from './catalog';
import { modelJobs, startModelJob } from './generate-model';
import { planGeometry } from '@repo/shared/plan';
import { usdzPath } from './usdz';
import { config } from './config';
import { importTv, listTvs, removeTv } from './tvs';
import { ideaFile, ideasHtml } from './ideas';
import {
	FINISH_SURFACES,
	importTexture,
	listTextures,
	readFinishes,
	readTexture,
	saveFinishes,
	startTextureJob,
	textureJobs,
} from './textures';

const isVec3 = (v: unknown): v is [number, number, number] =>
	Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

const TV_FILE = join(DATA_DIR, 'tv.json');
const BED_FILE = join(DATA_DIR, 'bed.json');

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
					(await listCatalog()).map((item): CatalogEntry => ({ ...item, modelJob: modelJobs.get(item.id) ?? null })),
				),
		},
		'/api/catalog/:id/model': {
			POST: async request => {
				const item = await readItem(request.params.id).catch(() => null);
				if (!item) return Response.json({ error: 'Unknown item' }, { status: 404 });
				startModelJob(item);
				return Response.json({ ok: true });
			},
		},
		'/api/catalog/import': {
			POST: async request => {
				const { url, category } = (await request.json()) as { url?: string; category?: string };
				if (!url || !/^https?:\/\//.test(url)) return Response.json({ error: 'Paste a product URL' }, { status: 400 });
				try {
					const [item] = await importProducts([url], console.log, category);
					if (!item!.model) startModelJob(item!);
					return Response.json(item);
				} catch (error) {
					console.error(error);
					return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
				}
			},
		},
		'/api/textures': {
			GET: async () =>
				Response.json(
					(await listTextures()).map((t): WallTextureEntry => ({ ...t, textureJob: textureJobs.get(t.id) ?? null })),
				),
		},
		'/api/textures/import': {
			POST: async request => {
				const { url } = (await request.json()) as { url?: string };
				if (!url || !/^https?:\/\//.test(url)) return Response.json({ error: 'Paste a product URL' }, { status: 400 });
				try {
					const texture = await importTexture(url, console.log);
					if (!texture.texture) startTextureJob(texture);
					return Response.json(texture);
				} catch (error) {
					console.error(error);
					return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
				}
			},
		},
		'/api/textures/:id/generate': {
			POST: async request => {
				const texture = await readTexture(request.params.id).catch(() => null);
				if (!texture) return Response.json({ error: 'Unknown texture' }, { status: 404 });
				startTextureJob(texture);
				return Response.json({ ok: true });
			},
		},
		'/api/finishes': {
			GET: async () => Response.json(await readFinishes()),
			PUT: async request => {
				const body = (await request.json()) as Partial<Finishes>;
				const known = new Set((await listTextures()).filter(t => t.texture).map(t => t.id));
				const finishes = await readFinishes();
				for (const surface of FINISH_SURFACES) {
					const id = body[surface];
					if (id === undefined) continue;
					if (id !== null && !known.has(id))
						return Response.json({ error: `No finished texture ${id}` }, { status: 400 });
					finishes[surface] = id;
				}
				await saveFinishes(finishes);
				return Response.json(finishes);
			},
		},
		'/api/tvs': { GET: async () => Response.json(await listTvs()) },
		'/api/tvs/import': {
			POST: async request => {
				const { url } = (await request.json()) as { url?: string };
				if (!url || !/^https?:\/\//.test(url)) return Response.json({ error: 'Paste a product URL' }, { status: 400 });
				try {
					return Response.json(await importTv(url));
				} catch (error) {
					console.error(error);
					return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
				}
			},
		},
		'/api/tvs/:id': {
			DELETE: async request => {
				await removeTv(request.params.id);
				return Response.json({ ok: true });
			},
		},
		'/api/tv': {
			GET: async () => {
				const file = Bun.file(TV_FILE);
				return Response.json((await file.exists()) ? await file.json() : DEFAULT_TV);
			},
			PUT: async request => {
				const tv = (await request.json()) as Partial<TvSettings>;
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
				await Bun.write(TV_FILE, JSON.stringify(saved, null, '\t') + '\n');
				return Response.json(saved);
			},
		},
		'/api/bed': {
			GET: async () => {
				const file = Bun.file(BED_FILE);
				if (await file.exists()) return Response.json(await file.json());
				const newest = (await listCatalog()).find(item => item.category === 'bed');
				return Response.json({ itemId: newest?.id ?? null } satisfies BedSettings);
			},
			PUT: async request => {
				const { itemId } = (await request.json()) as Partial<BedSettings>;
				const item = typeof itemId === 'string' ? await readItem(itemId).catch(() => null) : null;
				if (itemId !== null && item?.category !== 'bed')
					return Response.json({ error: `No bed ${itemId}` }, { status: 400 });
				const saved: BedSettings = { itemId: item?.id ?? null };
				await Bun.write(BED_FILE, JSON.stringify(saved, null, '\t') + '\n');
				return Response.json(saved);
			},
		},
		'/api/plan': Response.json(planGeometry()),
		'/api/catalog/:id/model.usdz': async request => {
			const item = await readItem(request.params.id).catch(() => null);
			const path = item && (await usdzPath(item));
			return path ? new Response(Bun.file(path)) : Response.json({ error: 'No model' }, { status: 404 });
		},
		'/api/placements': { GET: async () => Response.json(await readPlacements()) },
		// Clients save only the items they changed, so a client holding an older copy of the rest can't revert edits
		// another client (the web plan or the AR app) made meanwhile.
		'/api/placements/:key': {
			PUT: async request => {
				const { key } = request.params;
				const { itemId, position, rotation } = (await request.json()) as Partial<Placement>;
				if (!isVec3(position) || !isVec3(rotation))
					return Response.json({ error: 'Expected a finite position and rotation' }, { status: 400 });
				let saved: Placement | undefined;
				await updatePlacements(placements => {
					const existing = placements.find(p => p.key === key);
					if (existing) {
						saved = { ...existing, position, rotation };
						return placements.map(p => (p.key === key ? saved! : p));
					}
					if (!itemId) return placements;
					saved = { key, itemId, position, rotation };
					return [...placements, saved];
				});
				return saved ? Response.json(saved) : Response.json({ error: 'Unknown placement' }, { status: 404 });
			},
			DELETE: async request => {
				await updatePlacements(placements => placements.filter(p => p.key !== request.params.key));
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
