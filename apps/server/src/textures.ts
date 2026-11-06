// Wall textures: wall-panel products imported like furniture (page capture, grok, photos), then turned into a
// seamless tile by Codex instead of a 3D model. The wallTexture fixture (fixtures.ts) picks which one the living room wears.
import type { WallTexture } from '@repo/shared/items';
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	ASSET_DIR,
	downloadPhotos,
	fetchPages,
	grokStructured,
	readDocuments,
	pageContext,
	productKey,
	slug,
} from './catalog';
import { table } from './db';
import { collectPhotos, runCodex } from './generate-model';
import { jobQueue } from './jobs';

// Spec-sheet text saved next to the photos at import, so texture builds (and rebuilds) get exact slat sizes.
const SPEC_FILE = 'spec.txt';
const PROMPT_FILE = Bun.file(join(import.meta.dir, 'texture-prompt.md'));
if (!(await PROMPT_FILE.exists())) throw new Error(`missing ${PROMPT_FILE.name}`);

export const textures = table<WallTexture>('wall_textures', {
	key: 'id',
	json: ['panel', 'texture'],
	order: 'importedAt DESC',
});

const panelSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['name', 'brand', 'price', 'currency', 'panelsPerPack', 'panel', 'summary', 'imageUrl'],
	properties: {
		name: {
			type: 'string',
			description:
				'Short product name a person would say, without retailer noise or the panel height. Include the product line, the wood or face finish and the backing color when the store sells several, e.g. "Ultralight White Oak Slats, Beige Felt"',
		},
		brand: { type: ['string', 'null'] },
		price: { type: ['number', 'null'], description: 'Current selling price of the listing as sold (the whole pack)' },
		currency: { type: 'string' },
		panelsPerPack: { type: 'integer', description: 'Panels included at that price; 1 if sold singly' },
		panel: {
			type: ['object', 'null'],
			additionalProperties: false,
			required: ['width', 'height', 'depth'],
			properties: { width: { type: 'number' }, height: { type: 'number' }, depth: { type: 'number' } },
			description:
				'One panel as installed, in inches: width side to side, height floor to ceiling (the long side for vertical slat panels), depth is its thickness',
		},
		summary: { type: 'string', description: 'One or two plain sentences: material, finish, color, backing' },
		imageUrl: { type: ['string', 'null'], description: 'Main product photo URL, copied exactly from the input' },
	},
};

type Panel = Omit<WallTexture, 'id' | 'url' | 'importedAt' | 'image' | 'texture' | 'group'> & {
	imageUrl: string | null;
};

// Parallel grok calls per batch: each takes 10 to 20 s and a store import can be dozens of pages.
const PARSE_CONCURRENCY = 6;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = [];
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i]!);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

export async function importTextures(urls: string[], log: (line: string) => void = () => {}): Promise<WallTexture[]> {
	log(`capturing ${urls.length} page(s)…`);
	const pages = await fetchPages(urls);
	const specs = await Promise.all(pages.map(page => readDocuments(page.documents)));
	// One unreadable page shouldn't throw away the rest of a store import: keep the others, report it at the end.
	const parsed = await mapLimit([...pages.entries()], PARSE_CONCURRENCY, ([i, page]) =>
		grokStructured<Panel>(
			`Extract wall-panel product information from this retailer page capture. Use only facts in the input; the manufacturer's spec sheets, when present, beat the page for sizes. Convert sizes to inches. Pick imageUrl from the image candidates exactly as written.\n\n${pageContext(page)}${specs[i] ? `\n\nSpec sheets:\n${specs[i]}` : ''}`,
			panelSchema,
		).catch((error: unknown) => (error instanceof Error ? error : new Error(String(error)))),
	);
	const failures: string[] = [];
	const known = textures.all();
	const imported: WallTexture[] = [];
	for (const [i, page] of pages.entries()) {
		const result = parsed[i]!;
		if (result instanceof Error) {
			failures.push(`${page.url}: ${result.message}`);
			continue;
		}
		const { imageUrl, ...panel } = result;
		const existing = known.find(t => productKey(t.url) === productKey(page.url));
		const brandPrefix =
			panel.brand && !panel.name.toLowerCase().startsWith(panel.brand.toLowerCase()) ? `${panel.brand} ` : '';
		let id = existing?.id ?? slug(brandPrefix + panel.name);
		// Colorways of one product line can come back with the same name; never let one overwrite another.
		for (let n = 2; !existing && known.some(t => t.id === id); n++) id = `${slug(brandPrefix + panel.name)}-${n}`;
		const texture: WallTexture = {
			id,
			url: page.url.split('?')[0]!,
			importedAt: new Date().toISOString(),
			...panel,
			image: await downloadPhotos(id, imageUrl, page.images),
			group: existing?.group ?? null,
			texture: existing?.texture ?? null,
		};
		textures.put(texture);
		await writeFile(join(ASSET_DIR, id, SPEC_FILE), specs[i]!);
		known.push(texture);
		imported.push(texture);
		log(
			`  saved texture ${id}: ${panel.price ?? '?'} ${panel.currency} for ${panel.panelsPerPack}, panel ${JSON.stringify(panel.panel)}, ${page.images.length} photo(s)`,
		);
	}
	await assignGroups(log);
	if (failures.length)
		throw new Error(`Imported ${imported.length}, failed ${failures.length}:\n${failures.join('\n')}`);
	return imported;
}

// Names the product type of every texture that has none, in one call over the whole collection so colorways of a
// line share a group and new imports join the groups already in use.
export async function assignGroups(log: (line: string) => void = () => {}) {
	const all = textures.all();
	const missing = all.filter(t => !t.group);
	if (!missing.length) return;
	const groups = [...new Set(all.map(t => t.group).filter(Boolean))];
	const { assignments } = await grokStructured<{ assignments: { id: string; group: string }[] }>(
		`Group these wall-panel products by product type, so a wall-texture picker can show each type as one row of color swatches. A type is the product line and construction, never the color or the felt: for example "Ultralight slats", "Ultralight wide slats", "Full accent panels", "Truewood Lite slats", "Solid wood slats", "Paint-ready fluted", "Hexagon tiles". Keep names short and in sentence case. Reuse these existing groups where a product fits: ${groups.join(', ') || 'none yet'}.

${missing.map(t => `${t.id}: ${t.name} (${t.url}). ${t.summary}`).join('\n')}`,
		{
			type: 'object',
			additionalProperties: false,
			required: ['assignments'],
			properties: {
				assignments: {
					type: 'array',
					items: {
						type: 'object',
						additionalProperties: false,
						required: ['id', 'group'],
						properties: { id: { type: 'string' }, group: { type: 'string' } },
					},
				},
			},
		},
	);
	const byId = new Map(assignments.map(a => [a.id, a.group]));
	for (const t of missing) {
		const group = byId.get(t.id);
		if (!group) throw new Error(`grok assigned no group to ${t.id}`);
		textures.put({ ...textures.read(t.id), group });
	}
	log(`grouped ${missing.length} texture(s): ${[...new Set(byId.values())].join(', ')}`);
}

export const importTexture = async (url: string, log?: (line: string) => void) =>
	(await importTextures([url], log))[0]!;

async function prompt(texture: WallTexture, photos: string[]) {
	const p = texture.panel;
	const spec = Bun.file(join(ASSET_DIR, texture.id, SPEC_FILE));
	return (await PROMPT_FILE.text())
		.replace('{{name}}', texture.name)
		.replace('{{size}}', p ? `${p.width} in wide × ${p.height} in tall × ${p.depth} in thick` : 'not listed')
		.replace('{{summary}}', texture.summary)
		.replace('{{spec}}', ((await spec.exists()) && (await spec.text()).trim()) || 'none published')
		.replace('{{photos}}', photos.map((name, i) => `${i + 1}. ${name}`).join('\n'));
}

async function readRepeat(path: string) {
	const raw = await Bun.file(path)
		.json()
		.catch(() => null);
	const sizes = [raw?.repeatWidthIn, raw?.repeatHeightIn, raw?.depthIn];
	if (!sizes.every(n => typeof n === 'number' && n > 0 && n < 200) || typeof raw.note !== 'string')
		throw new Error(`codex wrote no valid texture.json: ${JSON.stringify(raw)}`);
	return { repeat: { width: raw.repeatWidthIn, height: raw.repeatHeightIn }, depthIn: raw.depthIn, note: raw.note };
}

export async function generateTexture(texture: WallTexture, log: (line: string) => void = () => {}) {
	const dir = join(ASSET_DIR, texture.id);
	const work = await mkdtemp(join(tmpdir(), `texture-${texture.id}-`));
	const photos = await collectPhotos(dir, work);
	log(`codex: texturing ${texture.id} from ${photos.length} photo(s) in ${work}`);
	await runCodex(work, photos, await prompt(texture, photos), ['texture.png', 'normal.png', 'build.py', 'preview.png']);
	const size = await readRepeat(join(work, 'texture.json'));
	const outputs = {
		'texture.png': 'texture.png',
		'normal.png': 'texture-normal.png',
		'build.py': 'texture.py',
		'preview.png': 'texture-preview.png',
	};
	await Promise.all(Object.entries(outputs).map(([from, to]) => copyFile(join(work, from), join(dir, to))));
	// Cache-busting version: the paths stay the same across regenerations.
	const v = Date.now();
	textures.put({
		...textures.read(texture.id),
		texture: {
			map: `/api/assets/${texture.id}/texture.png?v=${v}`,
			normalMap: `/api/assets/${texture.id}/texture-normal.png?v=${v}`,
			...size,
		},
	});
	log(`codex: texture ${texture.id} done, ${JSON.stringify(size.repeat)} (${work})`);
}

const queue = jobQueue<WallTexture>(3, texture => generateTexture(texture, console.log));
export const textureJobs = queue.jobs;
export const startTextureJob = queue.start;
