import type { CarpetEntry } from '@repo/shared/carpets';
import type { Statement } from '@repo/shared/db';
import {
	isTvPlacement,
	TV_PLACEMENTS,
	type CatalogEntry,
	type Placement,
	type TvSettings,
	type WallTextureEntry,
} from '@repo/shared/items';
import { planGeometry } from '@repo/shared/plan';
import { env } from 'cloudflare:workers';
import { authorized, isPublic, loginPage, signIn } from './auth';
import { CarpetError, updateCarpet } from './carpets';
import { db } from './db';
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
import { RunnerOffline, runImport, startBuild } from './jobs';
import { router } from './router';

const { catalog, placements, textures, carpets } = db;

const isVec3 = (v: unknown): v is [number, number, number] =>
	Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

const productUrl = (url: unknown): url is string => typeof url === 'string' && /^https?:\/\//.test(url);
const failure = (error: unknown) => {
	const fixable = error instanceof FixtureError || error instanceof CarpetError;
	if (!fixable) console.error(error);
	return Response.json(
		{ error: error instanceof Error ? error.message : String(error) },
		{ status: fixable ? 400 : error instanceof RunnerOffline ? 503 : 502 },
	);
};
const unknownFixture = (key: string) => Response.json({ error: `No fixture ${key}` }, { status: 404 });
const body = async <T>(request: Request) => ((await request.json().catch(() => null)) ?? {}) as Partial<T>;

// Asset paths are `<item id>/<file>` under `items/` in the bucket, the layout data/items/ had on the laptop.
const assetKey = (path: string) => {
	const rel = decodeURIComponent(path);
	const parts = rel.split('/');
	// A trailing slash is a folder prefix, for listing and clearing a gallery.
	return parts.some((part, i) => part === '..' || (part === '' && i < parts.length - 1)) ? null : `items/${rel}`;
};

async function serveAsset(request: Request, key: string) {
	const object = await env.FILES.get(key, { onlyIf: request.headers });
	if (!object) {
		// `wrangler dev` starts with an empty bucket, so a local server reads the photos and models production has.
		if (env.ASSETS_FALLBACK_URL) return fetch(new URL(new URL(request.url).pathname, env.ASSETS_FALLBACK_URL));
		return new Response('Not found', { status: 404 });
	}
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	// Every URL the catalog hands out carries a `?v=` version, so a changed file comes with a new URL.
	headers.set(
		'cache-control',
		new URL(request.url).searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'no-cache',
	);
	if (!('body' in object)) return new Response(null, { status: 304, headers });
	return new Response(object.body, { headers });
}

const api = router({
	'/api/status': () => Response.json({ ok: true, now: new Date().toISOString() }),
	'/api/catalog': {
		GET: async () => {
			const [items, jobs, importing] = await Promise.all([
				catalog.all(),
				db.jobs.states('buildModel'),
				db.jobs.active('importItem'),
			]);
			return Response.json(
				items.map((item): CatalogEntry => ({
					...item,
					modelJob: jobs.get(item.id) ?? null,
					grouping: !item.group && importing,
				})),
			);
		},
	},
	'/api/catalog/:id/model': {
		POST: async request => {
			const item = await catalog.get(request.params.id!);
			if (!item) return Response.json({ error: 'Unknown item' }, { status: 404 });
			await startBuild('buildModel', item.id);
			return Response.json({ ok: true });
		},
	},
	'/api/catalog/import': {
		POST: async request => {
			const { url } = await body<{ url: string }>(request);
			if (!productUrl(url)) return Response.json({ error: 'Paste a product URL' }, { status: 400 });
			try {
				const item = await catalog.read(await runImport('importItem', url));
				if (!item.model) await startBuild('buildModel', item.id);
				// A product that has a fixture, like a bed, becomes that fixture's pick instead of furniture to place.
				const fixture = itemFixtureFor(item.category);
				if (fixture) await selectOption(fixture, item.id);
				return Response.json(item);
			} catch (error) {
				return failure(error);
			}
		},
	},
	'/api/catalog/:id/model.usdz': async request => serveAsset(request, `items/${request.params.id}/model.usdz`),
	'/api/textures': {
		GET: async () => {
			const [all, jobs] = await Promise.all([textures.all(), db.jobs.states('buildTexture')]);
			return Response.json(all.map((t): WallTextureEntry => ({ ...t, textureJob: jobs.get(t.id) ?? null })));
		},
	},
	'/api/carpets': {
		GET: async () => {
			const [all, jobs] = await Promise.all([carpets.all(), db.jobs.states('buildCarpet')]);
			return Response.json(all.map((c): CarpetEntry => ({ ...c, textureJob: jobs.get(c.id) ?? null })));
		},
	},
	'/api/carpets/import': {
		POST: async request => {
			const { url } = await body<{ url: unknown }>(request);
			if (!productUrl(url)) return Response.json({ error: 'Paste a rug product URL' }, { status: 400 });
			try {
				const carpet = await carpets.read(await runImport('importCarpet', url));
				if (!carpet.texture) await startBuild('buildCarpet', carpet.id);
				return Response.json(await carpetEntry(carpet.id));
			} catch (error) {
				return failure(error);
			}
		},
	},
	'/api/carpets/:id': {
		PUT: async request => {
			const { id } = request.params as { id: string };
			if (!(await carpets.get(id))) return Response.json({ error: `No carpet ${id}` }, { status: 404 });
			try {
				await updateCarpet(id, await body<{ size: unknown; placement: unknown }>(request));
				return Response.json(await carpetEntry(id));
			} catch (error) {
				return failure(error);
			}
		},
	},
	'/api/carpets/:id/build': {
		POST: async request => {
			const { id } = request.params as { id: string };
			if (!(await carpets.get(id))) return Response.json({ error: `No carpet ${id}` }, { status: 404 });
			await startBuild('buildCarpet', id);
			return Response.json(await carpetEntry(id));
		},
	},
	'/api/fixtures': { GET: async () => Response.json(await listFixtures()) },
	'/api/fixtures/:key': {
		GET: async request => {
			const { key } = request.params as { key: string };
			return isFixtureKey(key) ? Response.json(await readFixture(key)) : unknownFixture(key);
		},
		PUT: async request => {
			const { key } = request.params as { key: string };
			if (!isFixtureKey(key)) return unknownFixture(key);
			const { selected } = await body<{ selected: unknown }>(request);
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
			const { key } = request.params as { key: string };
			if (!isFixtureKey(key)) return unknownFixture(key);
			const { url } = await body<{ url: unknown }>(request);
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
			const { key, id } = request.params as { key: string; id: string };
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
			const { key, id } = request.params as { key: string; id: string };
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
			const tv = await body<TvSettings>(request);
			const sizes = [tv.widthIn, tv.heightIn, tv.centerIn];
			if (
				typeof tv.visible !== 'boolean' ||
				!isTvPlacement(tv.placement) ||
				!sizes.every(n => typeof n === 'number' && n > 0 && n < 240) ||
				typeof tv.tiltDeg !== 'number' ||
				tv.tiltDeg < 0 ||
				tv.tiltDeg > 30
			)
				return Response.json(
					{
						error: `Expected visible, a placement (${Object.keys(TV_PLACEMENTS).join(', ')}), widthIn, heightIn, centerIn and a 0–30° tiltDeg`,
					},
					{ status: 400 },
				);
			await saveTv({
				visible: tv.visible,
				placement: tv.placement,
				widthIn: tv.widthIn!,
				heightIn: tv.heightIn!,
				centerIn: tv.centerIn!,
				tiltDeg: tv.tiltDeg,
			});
			return Response.json(await readFixture('tv'));
		},
	},
	'/api/plan': () => Response.json(planGeometry()),
	'/api/placements': { GET: async () => Response.json(await placements.all()) },
	// Clients save only the items they changed, so a client holding an older copy of the rest can't revert edits
	// another client (the web plan or the AR app) made meanwhile.
	'/api/placements/:key': {
		PUT: async request => {
			const { key } = request.params as { key: string };
			const { itemId, position, rotation } = await body<Placement>(request);
			if (!isVec3(position) || !isVec3(rotation))
				return Response.json({ error: 'Expected a finite position and rotation' }, { status: 400 });
			const existing = await placements.get(key);
			let saved: Placement;
			if (existing) saved = { ...existing, position, rotation };
			else if (!itemId) return Response.json({ error: 'Unknown placement' }, { status: 404 });
			else if (!(await catalog.get(itemId)))
				return Response.json({ error: `No catalog item ${itemId}` }, { status: 400 });
			else saved = { key, itemId, position, rotation };
			await placements.put(saved);
			return Response.json(saved);
		},
		DELETE: async request => {
			await placements.remove(request.params.key!);
			return Response.json({ ok: true });
		},
	},
	'/api/assets/*': {
		GET: request => {
			const key = assetKey(request.params[0]!);
			return key ? serveAsset(request, key) : new Response('Bad path', { status: 400 });
		},
		PUT: async request => {
			const key = assetKey(request.params[0]!);
			if (!key) return new Response('Bad path', { status: 400 });
			await env.FILES.put(key, request.body, {
				httpMetadata: { contentType: request.headers.get('content-type') ?? 'application/octet-stream' },
			});
			return Response.json({ ok: true });
		},
	},
	// The laptop runner's view of the database and the bucket.
	'/api/runner/sql': {
		POST: async request => {
			const { statements } = await body<{ statements: Statement[] }>(request);
			if (!Array.isArray(statements)) return Response.json({ error: 'Expected statements' }, { status: 400 });
			return Response.json(await db.sql(statements));
		},
	},
	'/api/runner/assets': {
		GET: async request => {
			const prefix = assetKey(new URL(request.url).searchParams.get('prefix') ?? '');
			if (!prefix) return new Response('Bad prefix', { status: 400 });
			const keys: string[] = [];
			let cursor: string | undefined;
			do {
				const page = await env.FILES.list({ prefix, cursor });
				keys.push(...page.objects.map(o => o.key.slice('items/'.length)));
				cursor = page.truncated ? page.cursor : undefined;
			} while (cursor);
			return Response.json(keys);
		},
		DELETE: async request => {
			const prefix = assetKey(new URL(request.url).searchParams.get('prefix') ?? '');
			if (!prefix?.endsWith('/')) return new Response('Bad prefix', { status: 400 });
			let page;
			do {
				page = await env.FILES.list({ prefix });
				if (page.objects.length) await env.FILES.delete(page.objects.map(o => o.key));
			} while (page.truncated);
			return Response.json({ ok: true });
		},
	},
});

async function carpetEntry(id: string): Promise<CarpetEntry> {
	const [carpet, jobs] = await Promise.all([carpets.read(id), db.jobs.states('buildCarpet')]);
	return { ...carpet, textureJob: jobs.get(id) ?? null };
}

export default {
	async fetch(request) {
		if (!env.API_TOKEN) throw new Error('API_TOKEN is not set: bun run secrets:push');
		const url = new URL(request.url);
		const path = url.pathname;

		if (path === '/login' && request.method === 'POST') return signIn(request, env.API_TOKEN);
		if (!isPublic(request, path) && !authorized(request, env.API_TOKEN))
			return path.startsWith('/api/') ? Response.json({ error: 'Sign in first' }, { status: 401 }) : loginPage();

		if (path.startsWith('/api/'))
			return (await api(request)) ?? Response.json({ ok: false, error: 'Not found' }, { status: 404 });
		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
