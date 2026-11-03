// Wall textures: wall-panel products imported like furniture (page capture, grok, photos), then turned into a
// seamless tile by Codex instead of a 3D model. Finishes record which texture each living-room surface wears.
import type { Finishes, FinishSurface, Job, WallTexture } from '@repo/shared/items';
import { copyFile, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	ASSET_DIR,
	DATA_DIR,
	downloadPhotos,
	fetchPages,
	grokStructured,
	pageContext,
	productKey,
	slug,
} from './catalog';
import { collectPhotos, runCodex } from './generate-model';

const TEXTURE_DIR = join(DATA_DIR, 'textures');
const FINISHES_FILE = join(DATA_DIR, 'finishes.json');
const PROMPT_FILE = Bun.file(join(import.meta.dir, 'texture-prompt.md'));
if (!(await PROMPT_FILE.exists())) throw new Error(`missing ${PROMPT_FILE.name}`);

export const FINISH_SURFACES: FinishSurface[] = ['tvWall', 'column'];

export async function listTextures(): Promise<WallTexture[]> {
	await mkdir(TEXTURE_DIR, { recursive: true });
	const files = (await readdir(TEXTURE_DIR)).filter(f => f.endsWith('.json'));
	const items: WallTexture[] = await Promise.all(files.map(f => Bun.file(join(TEXTURE_DIR, f)).json()));
	return items.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export const readTexture = (id: string): Promise<WallTexture> => Bun.file(join(TEXTURE_DIR, `${id}.json`)).json();

const saveTexture = (texture: WallTexture) =>
	writeFile(join(TEXTURE_DIR, `${texture.id}.json`), JSON.stringify(texture, null, '\t') + '\n');

export async function readFinishes(): Promise<Finishes> {
	const file = Bun.file(FINISHES_FILE);
	return (await file.exists()) ? file.json() : { tvWall: null, column: null };
}

export async function saveFinishes(finishes: Finishes) {
	await writeFile(FINISHES_FILE, JSON.stringify(finishes, null, '\t') + '\n');
}

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

type Panel = Omit<WallTexture, 'id' | 'url' | 'importedAt' | 'image' | 'texture'> & { imageUrl: string | null };

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
	await mkdir(TEXTURE_DIR, { recursive: true });
	log(`capturing ${urls.length} page(s)…`);
	const pages = await fetchPages(urls);
	// One unreadable page shouldn't throw away the rest of a store import: keep the others, report it at the end.
	const parsed = await mapLimit(pages, PARSE_CONCURRENCY, page =>
		grokStructured<Panel>(
			`Extract wall-panel product information from this retailer page capture. Use only facts in the input. Convert sizes to inches. Pick imageUrl from the image candidates exactly as written.\n\n${pageContext(page)}`,
			panelSchema,
		).catch((error: unknown) => (error instanceof Error ? error : new Error(String(error)))),
	);
	const failures: string[] = [];
	const known = await listTextures();
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
			texture: existing?.texture ?? null,
		};
		await saveTexture(texture);
		known.push(texture);
		imported.push(texture);
		log(
			`  saved texture ${id}: ${panel.price ?? '?'} ${panel.currency} for ${panel.panelsPerPack}, panel ${JSON.stringify(panel.panel)}, ${page.images.length} photo(s)`,
		);
	}
	if (failures.length)
		throw new Error(`Imported ${imported.length}, failed ${failures.length}:\n${failures.join('\n')}`);
	return imported;
}

export const importTexture = async (url: string, log?: (line: string) => void) =>
	(await importTextures([url], log))[0]!;

async function prompt(texture: WallTexture, photos: string[]) {
	const p = texture.panel;
	return (await PROMPT_FILE.text())
		.replace('{{name}}', texture.name)
		.replace('{{size}}', p ? `${p.width} in wide × ${p.height} in tall × ${p.depth} in thick` : 'not listed')
		.replace('{{summary}}', texture.summary)
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
	await saveTexture({
		...(await readTexture(texture.id)),
		texture: {
			map: `/api/assets/${texture.id}/texture.png?v=${v}`,
			normalMap: `/api/assets/${texture.id}/texture-normal.png?v=${v}`,
			...size,
		},
	});
	log(`codex: texture ${texture.id} done, ${JSON.stringify(size.repeat)} (${work})`);
}

export const textureJobs = new Map<string, Job>();

// Each job is a Codex session; a store import can queue dozens, so only a few run at once.
const TEXTURE_CONCURRENCY = 3;
const queue: WallTexture[] = [];
let active = 0;

export function startTextureJob(texture: WallTexture) {
	const state = textureJobs.get(texture.id)?.state;
	if (state === 'running' || state === 'queued') return;
	textureJobs.set(texture.id, { state: 'queued' });
	queue.push(texture);
	runQueue();
}

function runQueue() {
	while (active < TEXTURE_CONCURRENCY && queue.length) {
		const texture = queue.shift()!;
		active++;
		textureJobs.set(texture.id, { state: 'running' });
		generateTexture(texture, console.log)
			.then(
				() => textureJobs.delete(texture.id),
				(error: unknown) => {
					console.error(error);
					textureJobs.set(texture.id, {
						state: 'failed',
						error: error instanceof Error ? error.message : String(error),
					});
				},
			)
			.finally(() => {
				active--;
				runQueue();
			});
	}
}
