import { carpetSpawn, savedLook, textureTarget, type Carpet, type CarpetEntry } from '@repo/shared/carpets';
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
import { authorized, loginPage, signIn } from './auth';
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
import {
	carpetStates,
	createLayout,
	deleteLayout,
	hiddenIn,
	layoutOf,
	LayoutError,
	listLayouts,
	putCarpetState,
	setActive,
	unhide,
} from './layouts';
import { clearAssets, findImported, removeProduct } from './products';
import { router } from './router';

const { catalog, placements, textures, carpets } = db;
const plan = planGeometry();

// The stored row without its layout, the shape clients know.
const placementOf = ({ key, itemId, position, rotation }: Placement): Placement => ({
	key,
	itemId,
	position,
	rotation,
});

const isVec3 = (v: unknown): v is [number, number, number] =>
	Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

const productUrl = (url: unknown): url is string => typeof url === 'string' && /^https?:\/\//.test(url);
const failure = (error: unknown) => {
	const fixable = error instanceof FixtureError || error instanceof CarpetError || error instanceof LayoutError;
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
		if (env.ASSETS_FALLBACK_URL)
			return fetch(new URL(new URL(request.url).pathname, env.ASSETS_FALLBACK_URL), {
				headers: { authorization: `Bearer ${env.ASSETS_FALLBACK_TOKEN}` },
			});
		return new Response('Not found', { status: 404 });
	}
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	// Every URL the catalog hands out carries a `?v=` version, so a changed file comes with a new URL.
	headers.set(
		'cache-control',
		new URL(request.url).searchParams.has('v') ? 'private, max-age=31536000, immutable' : 'private, no-cache',
	);
	if (!('body' in object)) return new Response(null, { status: 304, headers });
	return new Response(object.body, { headers });
}

const api = router({
	'/api/status': () => Response.json({ ok: true, now: new Date().toISOString() }),
	'/api/layouts': {
		GET: async () => Response.json(await listLayouts()),
		// `from` copies that layout; without it the new layout starts empty.
		POST: async request => {
			const { name, from } = await body<{ name: unknown; from: unknown }>(request);
			if (typeof name !== 'string' || !name.trim() || (from != null && typeof from !== 'string'))
				return Response.json({ error: 'Expected a name and an optional layout id to copy' }, { status: 400 });
			await createLayout(name.trim(), from ?? null);
			return Response.json(await listLayouts());
		},
	},
	'/api/layouts/active': {
		PUT: async request => {
			const { id } = await body<{ id: unknown }>(request);
			if (typeof id !== 'string') return Response.json({ error: 'Expected a layout id' }, { status: 400 });
			await setActive(id);
			return Response.json(await listLayouts());
		},
	},
	// After /active, which the :id pattern would match too.
	'/api/layouts/:id': {
		DELETE: async request => {
			await deleteLayout(request.params.id!);
			return Response.json(await listLayouts());
		},
	},
	'/api/catalog': {
		GET: async request => {
			const [items, jobs, importing, hidden] = await Promise.all([
				catalog.all(),
				db.jobs.states('buildModel'),
				db.jobs.active('importItem'),
				hiddenIn(await layoutOf(request), 'item'),
			]);
			return Response.json(
				items
					.filter(item => !hidden.has(item.id))
					.map((item): CatalogEntry => ({
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
				const layout = await layoutOf(request);
				const item = await catalog.read((await findImported('item', url)) ?? (await runImport('importItem', url)));
				await unhide(layout, 'item', item.id);
				if (!item.model) await startBuild('buildModel', item.id);
				// A product that has a fixture, like a bed, becomes that fixture's pick instead of furniture to place.
				const fixture = itemFixtureFor(item.category);
				if (fixture) await selectOption(fixture, item.id, layout);
				return Response.json(item);
			} catch (error) {
				return failure(error);
			}
		},
	},
	// After /import, which the :id pattern would match too.
	'/api/catalog/:id': {
		DELETE: async request => {
			const { id } = request.params as { id: string };
			if (!(await catalog.get(id))) return Response.json({ error: `No catalog item ${id}` }, { status: 404 });
			return Response.json({ deleted: await removeProduct('item', id, await layoutOf(request)) });
		},
	},
	'/api/catalog/:id/model.usdz': async request => serveAsset(request, `items/${request.params.id}/model.usdz`),
	'/api/textures': {
		GET: async request => {
			const [all, jobs, hidden] = await Promise.all([
				textures.all(),
				db.jobs.states('buildTexture'),
				hiddenIn(await layoutOf(request), 'texture'),
			]);
			return Response.json(
				all.filter(t => !hidden.has(t.id)).map((t): WallTextureEntry => ({ ...t, textureJob: jobs.get(t.id) ?? null })),
			);
		},
	},
	'/api/carpets': { GET: async request => Response.json(await carpetEntries(await layoutOf(request))) },
	'/api/carpets/import': {
		POST: async request => {
			const { url } = await body<{ url: unknown }>(request);
			if (!productUrl(url)) return Response.json({ error: 'Paste a rug product URL' }, { status: 400 });
			try {
				const layout = await layoutOf(request);
				const carpet = await carpets.read(
					(await findImported('carpet', url)) ?? (await runImport('importCarpet', url)),
				);
				await unhide(layout, 'carpet', carpet.id);
				await drawLooks(carpet);
				// Pasting a rug lays it in the middle of the living room, unless it is on this layout's floor already.
				const state = (await carpetStates(layout)).get(carpet.id);
				if (!state?.placement) {
					const size = state?.size ?? carpet.size;
					await putCarpetState(layout, carpet.id, {
						variant: state?.variant ?? carpet.variant,
						size,
						placement: carpetSpawn(size, plan),
					});
				}
				return Response.json(await carpetEntry(carpet.id, layout));
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
				const layout = await layoutOf(request);
				await updateCarpet(id, await body<{ variant: unknown; size: unknown; placement: unknown }>(request), layout);
				return Response.json(await carpetEntry(id, layout));
			} catch (error) {
				return failure(error);
			}
		},
		DELETE: async request => {
			const { id } = request.params as { id: string };
			if (!(await carpets.get(id))) return Response.json({ error: `No carpet ${id}` }, { status: 404 });
			return Response.json({ deleted: await removeProduct('carpet', id, await layoutOf(request)) });
		},
	},
	// Draws one look again, or for the first time after a failed build.
	'/api/carpets/:id/build': {
		POST: async request => {
			const { id } = request.params as { id: string };
			const carpet = await carpets.get(id);
			if (!carpet) return Response.json({ error: `No carpet ${id}` }, { status: 404 });
			const { variant } = await body<{ variant: unknown }>(request);
			if (!carpet.variants.some(v => v.id === variant))
				return Response.json({ error: `Expected variant: one of ${id}'s looks` }, { status: 400 });
			await startBuild('buildCarpet', textureTarget(id, variant as string));
			return Response.json(await carpetEntry(id, await layoutOf(request)));
		},
	},
	'/api/fixtures': { GET: async request => Response.json(await listFixtures(await layoutOf(request))) },
	'/api/fixtures/:key': {
		GET: async request => {
			const { key } = request.params as { key: string };
			return isFixtureKey(key) ? Response.json(await readFixture(key, await layoutOf(request))) : unknownFixture(key);
		},
		PUT: async request => {
			const { key } = request.params as { key: string };
			if (!isFixtureKey(key)) return unknownFixture(key);
			const { selected } = await body<{ selected: unknown }>(request);
			if (selected !== null && typeof selected !== 'string')
				return Response.json({ error: 'Expected selected: an option id or null' }, { status: 400 });
			try {
				const layout = await layoutOf(request);
				await selectOption(key, selected, layout);
				return Response.json(await readFixture(key, layout));
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
				const layout = await layoutOf(request);
				await importOption(key, url, layout);
				return Response.json(await readFixture(key, layout));
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
				const layout = await layoutOf(request);
				await buildOption(key, id, layout);
				return Response.json(await readFixture(key, layout));
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
				const layout = await layoutOf(request);
				await removeOption(key, id, layout);
				return Response.json(await readFixture(key, layout));
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
			const layout = await layoutOf(request);
			await saveTv(
				{
					visible: tv.visible,
					placement: tv.placement,
					widthIn: tv.widthIn!,
					heightIn: tv.heightIn!,
					centerIn: tv.centerIn!,
					tiltDeg: tv.tiltDeg,
				},
				layout,
			);
			return Response.json(await readFixture('tv', layout));
		},
	},
	'/api/plan': () => Response.json(plan),
	'/api/placements': {
		GET: async request => Response.json((await placements.where('layoutId', await layoutOf(request))).map(placementOf)),
	},
	// Clients save only the items they changed, so a client holding an older copy of the rest can't revert edits
	// another client (the web plan or the AR app) made meanwhile.
	'/api/placements/:key': {
		PUT: async request => {
			const { key } = request.params as { key: string };
			const { itemId, position, rotation } = await body<Placement>(request);
			if (!isVec3(position) || !isVec3(rotation))
				return Response.json({ error: 'Expected a finite position and rotation' }, { status: 400 });
			const existing = await placements.get(key);
			let saved: Placement & { layoutId: string };
			if (existing) saved = { ...existing, position, rotation };
			else if (!itemId) return Response.json({ error: 'Unknown placement' }, { status: 404 });
			else if (!(await catalog.get(itemId)))
				return Response.json({ error: `No catalog item ${itemId}` }, { status: 400 });
			else saved = { key, layoutId: await layoutOf(request), itemId, position, rotation };
			await placements.put(saved);
			return Response.json(placementOf(saved));
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
			await clearAssets(prefix);
			return Response.json({ ok: true });
		},
	},
});

async function carpetEntries(layout: string): Promise<CarpetEntry[]> {
	const [all, jobs, states, hidden] = await Promise.all([
		carpets.all(),
		db.jobs.states('buildCarpet'),
		carpetStates(layout),
		hiddenIn(layout, 'carpet'),
	]);
	return all
		.filter(c => !hidden.has(c.id))
		.map((c): CarpetEntry => {
			const state = states.get(c.id);
			return {
				...c,
				variant: savedLook(c, state?.variant ?? c.variant).id,
				size: state?.size ?? c.size,
				placement: state?.placement ?? null,
				textureJobs: Object.fromEntries(
					c.variants.flatMap(v => {
						const job = jobs.get(textureTarget(c.id, v.id));
						return job ? [[v.id, job]] : [];
					}),
				),
			};
		});
}

// Every look still without an image gets drawn, the listing's own look first.
async function drawLooks(carpet: Carpet) {
	const looks = carpet.variants
		.filter(v => !v.texture)
		.toSorted((a, b) => +(b.id === carpet.variant) - +(a.id === carpet.variant));
	for (const look of looks) await startBuild('buildCarpet', textureTarget(carpet.id, look.id));
}

const carpetEntry = async (id: string, layout: string) => (await carpetEntries(layout)).find(c => c.id === id)!;

export default {
	async fetch(request) {
		if (!env.API_TOKEN) throw new Error('API_TOKEN is not set: bun run secrets:push');
		const url = new URL(request.url);
		const path = url.pathname;

		// The sign-in cookie is Secure, so a browser on plain http drops it and lands back on the sign-in form. The edge
		// names the scheme the visitor used; `wrangler dev` rewrites request.url to the production host and sends no such
		// header, so local http keeps working.
		if (request.headers.get('x-forwarded-proto') === 'http') {
			url.protocol = 'https:';
			return Response.redirect(url.toString(), 308);
		}

		if (path === '/login' && request.method === 'POST') return signIn(request, env.API_TOKEN);
		if (!authorized(request, env.API_TOKEN))
			return path.startsWith('/api/') ? Response.json({ error: 'Sign in first' }, { status: 401 }) : loginPage();

		if (path.startsWith('/api/'))
			try {
				return (await api(request)) ?? Response.json({ ok: false, error: 'Not found' }, { status: 404 });
			} catch (error) {
				return failure(error);
			}
		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
