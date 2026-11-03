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
import { DEFAULT_TV, tvDiagonal, type CatalogItem, type TvSettings } from '@repo/shared/items';
import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR, importProducts, listCatalog, readItem } from './catalog';
import { modelJobs, startModelJob } from './generate-model';
import { importTexture, listTextures, readTexture, startTextureJob, textureJobs } from './textures';
import { importTv, listTvs, removeTv } from './tvs';

const SELECTIONS_FILE = join(DATA_DIR, 'fixtures.json');
const TV_FILE = join(DATA_DIR, 'tv.json');

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

type Source = {
	options(): Promise<FixtureOption[]>;
	selected(options: FixtureOption[]): Promise<string | null>;
	// `id` is a ready option of this fixture, or null.
	select(id: string | null): Promise<void>;
	// Imports a product link as an option and returns its id.
	import(url: string): Promise<string>;
	// Restarts a failed or missing model or texture build.
	build?(id: string): Promise<void>;
	remove?(id: string): Promise<void>;
	extra?(): Promise<Pick<Fixture, 'tv'>>;
};

// Picks share one file; the TV's size and mount live in tv.json.
type Selections = Partial<Record<FixtureKey, string | null>>;

// One queue for both files: a TV pick changes both, and the hand-set TV size can land at the same time. Writes go
// through a rename, so the polls of both clients never read a half-written file.
let writes: Promise<unknown> = Promise.resolve();
function queued<T>(change: () => Promise<T>): Promise<T> {
	const run = writes.catch(() => {}).then(change);
	writes = run;
	return run;
}

async function writeJson(path: string, value: unknown) {
	await writeFile(`${path}.tmp`, JSON.stringify(value, null, '\t') + '\n');
	await rename(`${path}.tmp`, path);
}

async function readSelections(): Promise<Selections> {
	const file = Bun.file(SELECTIONS_FILE);
	return (await file.exists()) ? file.json() : {};
}

const writeSelection = async (key: FixtureKey, id: string | null) =>
	writeJson(SELECTIONS_FILE, { ...(await readSelections()), [key]: id });

const stored = (key: FixtureKey) => ({
	selected: async () => (await readSelections())[key] ?? null,
	select: (id: string | null) => queued(() => writeSelection(key, id)),
});

const round1 = (n: number) => Math.round(n * 10) / 10;
const money = (price: number | null, currency: string) =>
	price === null ? null : price.toLocaleString('en-US', { style: 'currency', currency });
const facts = (...parts: (string | null | false)[]) => parts.filter(Boolean).join(' · ');

function itemSource(key: FixtureKey, category: string, spot: WallSpot): Source {
	const option = (item: CatalogItem): FixtureOption => {
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
			job: modelJobs.get(item.id) ?? null,
			ready: true,
		};
	};
	return {
		options: async () => (await listCatalog()).filter(item => item.category === category).map(option),
		...stored(key),
		import: async url => {
			const [item] = await importProducts([url], console.log, category);
			if (!item!.model) startModelJob(item!);
			return item!.id;
		},
		build: async id => startModelJob(await readItem(id)),
	};
}

const tvMatches = (a: Pick<TvSettings, 'widthIn' | 'heightIn'>, b: Pick<TvSettings, 'widthIn' | 'heightIn'>) =>
	Math.abs(a.widthIn - b.widthIn) < 0.05 && Math.abs(a.heightIn - b.heightIn) < 0.05;

async function readTv(): Promise<TvSettings> {
	const file = Bun.file(TV_FILE);
	return (await file.exists()) ? file.json() : DEFAULT_TV;
}

export const saveTv = (tv: TvSettings) => queued(() => writeJson(TV_FILE, tv));

// The web plan can also size the TV by hand, so the selection is the picked TV while the size still matches it, else
// another imported TV of that size, else a `custom` option standing for the hand-entered one.
const CUSTOM_TV = 'custom';
const tvDetail = (tv: Pick<TvSettings, 'widthIn' | 'heightIn'>) =>
	`${round1(tvDiagonal(tv))}″ · ${round1(tv.widthIn)} × ${round1(tv.heightIn)}″`;

const tvSource: Source = {
	options: async () => {
		const [tvs, tv] = await Promise.all([listTvs(), readTv()]);
		const options = tvs.map((m): FixtureOption => ({
			id: m.id,
			name: m.name,
			url: m.url,
			image: null,
			detail: tvDetail(m),
			warning: null,
			group: null,
			job: null,
			ready: true,
		}));
		if (tvs.some(m => tvMatches(m, tv))) return options;
		const custom = { name: 'Custom size', url: '', image: null, warning: null, group: null, job: null, ready: true };
		return [{ ...custom, id: CUSTOM_TV, detail: tvDetail(tv) }, ...options];
	},
	selected: async options => {
		const tv = await readTv();
		if (!tv.visible) return null;
		const [tvs, picked] = await Promise.all([listTvs(), readSelections().then(s => s.tv)]);
		const matching = tvs.filter(m => tvMatches(m, tv));
		return (
			(matching.find(m => m.id === picked) ?? matching[0])?.id ??
			(options.some(o => o.id === CUSTOM_TV) ? CUSTOM_TV : null)
		);
	},
	select: id =>
		queued(async () => {
			const tv = await readTv();
			const model = id && (await listTvs()).find(m => m.id === id);
			await writeJson(TV_FILE, {
				...tv,
				visible: id !== null,
				...(model && { widthIn: model.widthIn, heightIn: model.heightIn }),
			});
			if (model) await writeSelection('tv', model.id);
		}),
	import: async url => (await importTv(url)).id,
	remove: removeTv,
	extra: async () => ({ tv: await readTv() }),
};

const wallTextureSource: Source = {
	options: async () =>
		(await listTextures()).map(t => ({
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
			job: textureJobs.get(t.id) ?? null,
			ready: !!t.texture,
		})),
	...stored('wallTexture'),
	import: async url => {
		const texture = await importTexture(url, console.log);
		if (!texture.texture) startTextureJob(texture);
		return texture.id;
	},
	build: async id => startTextureJob(await readTexture(id)),
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

export async function readFixture(key: FixtureKey): Promise<Fixture> {
	const source = SOURCES[key];
	const options = await source.options();
	const selected = await source.selected(options);
	return {
		...FIXTURES[key],
		key,
		// A pick whose option was deleted since reads as nothing picked.
		selected: options.some(o => o.id === selected) ? selected : null,
		removable: !!source.remove,
		options,
		...(await source.extra?.()),
	};
}

export const listFixtures = () => Promise.all(FIXTURE_KEYS.map(readFixture));

export class FixtureError extends Error {}

export async function selectOption(key: FixtureKey, id: string | null) {
	if (id !== null) {
		const option = (await SOURCES[key].options()).find(o => o.id === id);
		if (!option) throw new FixtureError(`${FIXTURES[key].title} has no option ${id}`);
		if (!option.ready) throw new FixtureError(`${option.name} isn't ready yet`);
	}
	await SOURCES[key].select(id);
}

// The new option becomes the pick when it can be shown right away, since that is why its link was pasted.
export async function importOption(key: FixtureKey, url: string) {
	const id = await SOURCES[key].import(url);
	const option = (await SOURCES[key].options()).find(o => o.id === id);
	if (option?.ready) await SOURCES[key].select(id);
}

export async function buildOption(key: FixtureKey, id: string) {
	const { build } = SOURCES[key];
	if (!build) throw new FixtureError(`${FIXTURES[key].title} options have nothing to build`);
	if (!(await SOURCES[key].options()).some(o => o.id === id))
		throw new FixtureError(`${FIXTURES[key].title} has no option ${id}`);
	await build(id);
}

export async function removeOption(key: FixtureKey, id: string) {
	const { remove } = SOURCES[key];
	if (!remove) throw new FixtureError(`${FIXTURES[key].title} options can't be removed`);
	await remove(id);
}
