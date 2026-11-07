// The registry behind /api/fixtures. Each fixture lists its options, reads and saves its selection, and imports a
// pasted link as a new option; the routes and both clients treat every fixture alike through it. Adding a fixture is a
// new FIXTURES entry, and for an item fixture nothing else: the web plan and the AR app place any catalog item at its
// spot.
import { bedWallFace, ft } from '@repo/shared/floorplan';
import {
	FIXTURE_KEYS,
	type Fixture,
	type FixtureKey,
	type FixtureOption,
	type FixtureSpec,
	type WallSpot,
} from '@repo/shared/fixtures';
import { tvDiagonal, type CatalogItem, type Job, type TvSettings } from '@repo/shared/items';
import { db } from './db';
import { runImport, startBuild } from './jobs';
import { hiddenIn, picksOf, tvOf, unhide, type ProductKind } from './layouts';
import { findImported, removeProduct } from './products';

const { catalog, textures, tvs } = db;

// Narrow nightstands start around 18 in; less than that beside the bed is a squeeze.
const NIGHTSTAND_MIN_IN = 18;

// The middle of a wall face running east-west at plan y, with the item's front facing south into the room below it.
const southFacing = (face: { y: number; x1: number; x2: number }): WallSpot => ({
	x: ft((face.x1 + face.x2) / 2),
	z: ft(face.y),
	yaw: 0,
	span: ft(face.x2 - face.x1),
});

export const FIXTURES: Record<FixtureKey, FixtureSpec> = {
	tv: { kind: 'tv', title: 'TV', room: 'Living room', importLabel: 'Paste a TV link for its size' },
	bed: {
		kind: 'item',
		title: 'Bed',
		room: 'Bedroom',
		importLabel: 'Paste a bed link',
		category: 'bed',
		spot: southFacing(bedWallFace),
	},
	wallTexture: {
		kind: 'wallTexture',
		title: 'Wall texture',
		room: 'Living room',
		importLabel: 'Paste a wall panel link',
	},
};

export const isFixtureKey = (key: string): key is FixtureKey => Object.hasOwn(FIXTURES, key);

// The item fixture an imported product belongs to, so a bed pasted among the furniture becomes the bed.
export const itemFixtureFor = (category: string) =>
	FIXTURE_KEYS.find(key => {
		const spec = FIXTURES[key];
		return spec.kind === 'item' && spec.category === category;
	}) ?? null;

// Every method that reads or changes the room takes the layout it acts on; options leave out the layout's deleted
// products.
type Source = {
	kind: ProductKind;
	options(layout: string): Promise<FixtureOption[]>;
	selected(options: FixtureOption[], layout: string): Promise<string | null>;
	// `id` is a ready option of this fixture, or null.
	select(id: string | null, layout: string): Promise<void>;
	// Imports a product link as an option and returns its id.
	import(url: string): Promise<string>;
	// Whether an already imported product of this kind is one of this fixture's options, like a bed for the bed.
	owns?(id: string): Promise<boolean>;
	// Restarts a failed or missing model or texture build.
	build?(id: string): Promise<void>;
	extra?(layout: string): Promise<Pick<Fixture, 'tv'>>;
};

const stored = (key: FixtureKey) => ({
	selected: async (_: FixtureOption[], layout: string) => (await picksOf(layout).get())[key] ?? null,
	select: (id: string | null, layout: string) => picksOf(layout).patch({ [key]: id }),
});

const round1 = (n: number) => Math.round(n * 10) / 10;
const money = (price: number | null, currency: string) =>
	price === null ? null : price.toLocaleString('en-US', { style: 'currency', currency });
const facts = (...parts: (string | null | false)[]) => parts.filter(Boolean).join(' · ');

function itemSource(key: FixtureKey, category: string, spot: WallSpot): Source {
	const option = (item: CatalogItem, job: Job | null): FixtureOption => {
		const d = item.dimensions;
		const side = d && (spot.span * 12 - d.width) / 2;
		return {
			id: item.id,
			name: item.name,
			url: item.url,
			image: item.image,
			detail: facts(
				d && `${round1(d.width)} × ${round1(d.depth)} × ${round1(d.height)}″`,
				money(item.price, item.currency),
				side !== null && `${round1(side)}″ each side`,
			),
			warning: side !== null && side < NIGHTSTAND_MIN_IN ? `Only ${round1(side)}″ each side` : null,
			group: null,
			job,
			ready: true,
		};
	};
	return {
		kind: 'item',
		options: async layout => {
			const [items, jobs, hidden] = await Promise.all([
				catalog.all(),
				db.jobs.states('buildModel'),
				hiddenIn(layout, 'item'),
			]);
			return items
				.filter(item => item.category === category && !hidden.has(item.id))
				.map(item => option(item, jobs.get(item.id) ?? null));
		},
		...stored(key),
		import: async url => {
			const item = await catalog.read(await runImport('importItem', url, category));
			if (!item.model) await startBuild('buildModel', item.id);
			return item.id;
		},
		owns: async id => (await catalog.get(id))?.category === category,
		build: async id => void (await startBuild('buildModel', (await catalog.read(id)).id)),
	};
}

const tvMatches = (a: Pick<TvSettings, 'widthIn' | 'heightIn'>, b: Pick<TvSettings, 'widthIn' | 'heightIn'>) =>
	Math.abs(a.widthIn - b.widthIn) < 0.05 && Math.abs(a.heightIn - b.heightIn) < 0.05;

export const saveTv = (tv: TvSettings, layout: string) => tvOf(layout).set(tv);

// The web plan can also size the TV by hand, so the selection is the picked TV while the size still matches it, else
// another imported TV of that size, else a `custom` option standing for the hand-entered one.
// Not a slug, so no imported TV can share it.
const CUSTOM_TV = ':custom';
const tvDetail = (tv: Pick<TvSettings, 'widthIn' | 'heightIn'>) =>
	`${round1(tvDiagonal(tv))}″ · ${round1(tv.widthIn)} × ${round1(tv.heightIn)}″`;

const tvSource: Source = {
	kind: 'tv',
	options: async layout => {
		const [all, tv, hidden] = await Promise.all([tvs.all(), tvOf(layout).get(), hiddenIn(layout, 'tv')]);
		const models = all.filter(m => !hidden.has(m.id));
		const options = models.map((m): FixtureOption => ({
			id: m.id,
			name: m.name,
			url: m.url,
			image: m.image,
			detail: facts(tvDetail(m), money(m.price, m.currency)),
			warning: null,
			group: null,
			job: null,
			ready: true,
		}));
		if (models.some(m => tvMatches(m, tv))) return options;
		const custom = { name: 'Custom size', url: '', image: null, warning: null, group: null, job: null, ready: true };
		return [{ ...custom, id: CUSTOM_TV, detail: tvDetail(tv) }, ...options];
	},
	selected: async (options, layout) => {
		const [tv, models, picked] = await Promise.all([tvOf(layout).get(), tvs.all(), picksOf(layout).get()]);
		if (!tv.visible) return null;
		const matching = models.filter(m => tvMatches(m, tv) && options.some(o => o.id === m.id));
		return (
			(matching.find(m => m.id === picked.tv) ?? matching[0])?.id ??
			(options.some(o => o.id === CUSTOM_TV) ? CUSTOM_TV : null)
		);
	},
	select: async (id, layout) => {
		const model = id ? await tvs.get(id) : null;
		await tvOf(layout).patch({
			visible: id !== null,
			...(model && { widthIn: model.widthIn, heightIn: model.heightIn }),
		});
		if (model) await picksOf(layout).patch({ tv: model.id });
	},
	import: url => runImport('importTv', url),
	extra: async layout => ({ tv: await tvOf(layout).get() }),
};

const wallTextureSource: Source = {
	kind: 'texture',
	options: async layout => {
		const [all, jobs, hidden] = await Promise.all([
			textures.all(),
			db.jobs.states('buildTexture'),
			hiddenIn(layout, 'texture'),
		]);
		return all
			.filter(t => !hidden.has(t.id))
			.map(t => ({
				id: t.id,
				name: t.name,
				url: t.url,
				image: t.image ?? t.texture?.map ?? null,
				detail: facts(
					t.brand,
					money(t.price, t.currency) &&
						`${money(t.price, t.currency)}${t.panelsPerPack > 1 ? ` per ${t.panelsPerPack}` : ''}`,
					t.panel && `${round1(t.panel.width)} × ${round1(t.panel.height)}″ panels`,
				),
				warning: null,
				group: t.group,
				job: jobs.get(t.id) ?? null,
				ready: !!t.texture,
			}));
	},
	...stored('wallTexture'),
	import: async url => {
		const texture = await textures.read(await runImport('importTexture', url));
		if (!texture.texture) await startBuild('buildTexture', texture.id);
		return texture.id;
	},
	build: async id => void (await startBuild('buildTexture', (await textures.read(id)).id)),
};

const SOURCES: Record<FixtureKey, Source> = Object.fromEntries(
	FIXTURE_KEYS.map(key => {
		const spec = FIXTURES[key];
		return [
			key,
			spec.kind === 'item'
				? itemSource(key, spec.category, spec.spot)
				: spec.kind === 'tv'
					? tvSource
					: wallTextureSource,
		];
	}),
) as Record<FixtureKey, Source>;

export async function readFixture(key: FixtureKey, layout: string): Promise<Fixture> {
	const source = SOURCES[key];
	const options = await source.options(layout);
	const selected = await source.selected(options, layout);
	return {
		...FIXTURES[key],
		key,
		// A pick whose option was deleted since reads as nothing picked.
		selected: options.some(o => o.id === selected) ? selected : null,
		removable: true,
		options,
		...(await source.extra?.(layout)),
	};
}

export const listFixtures = (layout: string) => Promise.all(FIXTURE_KEYS.map(key => readFixture(key, layout)));

export class FixtureError extends Error {}

export async function selectOption(key: FixtureKey, id: string | null, layout: string) {
	if (id !== null) {
		const option = (await SOURCES[key].options(layout)).find(o => o.id === id);
		if (!option) throw new FixtureError(`${FIXTURES[key].title} has no option ${id}`);
		if (!option.ready) throw new FixtureError(`${option.name} isn't ready yet`);
	}
	await SOURCES[key].select(id, layout);
}

// A link imported before is reused, and comes back to this layout if it was deleted here. The new option becomes the
// pick when it can be shown right away, since that is why its link was pasted. A pick made during the minute the
// import took wins over it.
export async function importOption(key: FixtureKey, url: string, layout: string) {
	const source = SOURCES[key];
	const before = await source.selected(await source.options(layout), layout);
	const existing = await findImported(source.kind, url);
	if (existing && source.owns && !(await source.owns(existing)))
		throw new FixtureError(`That link is already imported, and it isn't a ${FIXTURES[key].title.toLowerCase()}`);
	const id = existing ?? (await source.import(url));
	await unhide(layout, source.kind, id);
	const options = await source.options(layout);
	const option = options.find(o => o.id === id);
	if (option?.ready && (await source.selected(options, layout)) === before) await source.select(id, layout);
}

export async function buildOption(key: FixtureKey, id: string, layout: string) {
	const { build } = SOURCES[key];
	if (!build) throw new FixtureError(`${FIXTURES[key].title} options have nothing to build`);
	if (!(await SOURCES[key].options(layout)).some(o => o.id === id))
		throw new FixtureError(`${FIXTURES[key].title} has no option ${id}`);
	await build(id);
}

export async function removeOption(key: FixtureKey, id: string, layout: string) {
	const option = (await SOURCES[key].options(layout)).find(o => o.id === id);
	if (!option) throw new FixtureError(`${FIXTURES[key].title} has no option ${id}`);
	if (!option.url) throw new FixtureError(`${option.name} isn't an imported product`);
	return removeProduct(SOURCES[key].kind, id, layout);
}
