// Product import pipeline shared by the API (POST /api/catalog/import) and scripts/import-item.ts.
// Captures each page with a headless Camoufox browser, has the grok CLI turn it into
// structured product info, downloads the image and any 3D model, and writes data/catalog/<id>.json.
import type { CatalogItem, Placement } from '@repo/shared/items';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '../../..');
export const DATA_DIR = join(ROOT, 'data');
const CATALOG_DIR = join(DATA_DIR, 'catalog');
export const ASSET_DIR = join(DATA_DIR, 'items');
const PLACEMENTS_FILE = join(DATA_DIR, 'placements.json');
const GROK_MODEL = 'grok-4.7-build-fast';

for (const bin of ['grok', 'uv']) if (!Bun.which(bin)) throw new Error(`${bin} CLI not found on PATH`);

export async function listCatalog(): Promise<CatalogItem[]> {
	await mkdir(CATALOG_DIR, { recursive: true });
	const files = (await readdir(CATALOG_DIR)).filter(f => f.endsWith('.json'));
	const items: CatalogItem[] = await Promise.all(files.map(f => Bun.file(join(CATALOG_DIR, f)).json()));
	return items.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function readPlacements(): Promise<Placement[]> {
	const file = Bun.file(PLACEMENTS_FILE);
	return (await file.exists()) ? file.json() : [];
}

export async function writePlacements(placements: Placement[]) {
	await writeFile(PLACEMENTS_FILE, JSON.stringify(placements, null, '\t') + '\n');
}

const productSchema = {
	type: 'object',
	additionalProperties: false,
	required: [
		'name',
		'brand',
		'price',
		'currency',
		'category',
		'dimensions',
		'dimensionsNote',
		'weightLb',
		'summary',
		'highlights',
		'imageUrl',
		'modelUrl',
		'mount',
		'defaultElevationIn',
		'removeNodes',
	],
	properties: {
		name: { type: 'string', description: 'Short product name a person would say, without retailer noise' },
		brand: { type: ['string', 'null'] },
		price: { type: ['number', 'null'], description: 'Current selling price' },
		currency: { type: 'string' },
		category: {
			type: 'string',
			enum: ['tv', 'sofa', 'chair', 'table', 'desk', 'bed', 'storage', 'lamp', 'rug', 'decor', 'appliance', 'other'],
		},
		dimensions: {
			type: ['object', 'null'],
			additionalProperties: false,
			required: ['width', 'height', 'depth'],
			properties: { width: { type: 'number' }, height: { type: 'number' }, depth: { type: 'number' } },
			description:
				'Assembled size in inches as placed in a room (for TVs: without stand). Width is side to side seen from the front.',
		},
		dimensionsNote: {
			type: ['string', 'null'],
			description: 'Say which values were derived rather than listed, and how',
		},
		weightLb: { type: ['number', 'null'] },
		summary: { type: 'string', description: 'One or two plain sentences' },
		highlights: { type: 'array', items: { type: 'string' }, maxItems: 5 },
		imageUrl: { type: ['string', 'null'], description: 'Main product photo URL, copied exactly from the input' },
		mount: {
			type: 'string',
			enum: ['floor', 'wall', 'ceiling', 'surface'],
			description:
				'How this is normally placed in a home: floor (sofas, beds, floor lamps, TV stands), wall (wall-mounted TVs, art, mirrors, shelves), ceiling (pendants, fans), surface (table lamps, decor that sits on furniture). Large TVs default to wall.',
		},
		defaultElevationIn: {
			type: 'number',
			description:
				'Typical height of the item bottom above the floor for that mount, in inches: 0 for floor, about 30 for an 85in wall TV, 0 for surface items (they sit on whatever is below)',
		},
		removeNodes: {
			type: 'array',
			items: { type: 'string' },
			description:
				"Names from the chosen 3D model's node list to remove for that mount, e.g. a stand node when wall mounted. Empty if none or no model.",
		},
		modelUrl: {
			type: ['string', 'null'],
			description: 'GLB 3D model URL, copied exactly from the input candidates, or null',
		},
	},
};
type Product = {
	name: string;
	brand: string | null;
	price: number | null;
	currency: string;
	category: string;
	dimensions: { width: number; height: number; depth: number } | null;
	dimensionsNote: string | null;
	weightLb: number | null;
	summary: string;
	highlights: string[];
	imageUrl: string | null;
	modelUrl: string | null;
	mount: 'floor' | 'wall' | 'ceiling' | 'surface';
	defaultElevationIn: number;
	removeNodes: string[];
};

type PageData = {
	url: string;
	title: string;
	ogImage: string | null;
	mainImage: string | null;
	models: string[];
	specs: string[];
	jsonLd: string;
	text: string;
};

async function fetchPages(urls: string[]): Promise<PageData[]> {
	const proc = Bun.spawn(
		[
			'uv',
			'run',
			'-q',
			'-p',
			'3.12',
			'--with',
			'camoufox[geoip]',
			'python',
			'-I',
			join(ROOT, 'scripts/fetch-pages.py'),
			...urls,
		],
		{ stdout: 'pipe', stderr: 'pipe' },
	);
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw new Error(`fetch-pages.py exited ${code}: ${err.slice(-2000)}`);
	const pages: PageData[] = JSON.parse(out);
	for (const page of pages)
		if (/robot or human|captcha|access denied/i.test(page.title))
			throw new Error(`Blocked by bot check on ${page.url} (page title "${page.title}")`);
	return pages;
}

// glTF binary: 12-byte header, then a JSON chunk (length, type, data) describing the scene graph.
async function glbNodeNames(url: string): Promise<string[]> {
	try {
		const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
		if (!res.ok) return [];
		const bytes = new Uint8Array(await res.arrayBuffer());
		const length = new DataView(bytes.buffer).getUint32(12, true);
		const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
		return (gltf.nodes ?? []).map((n: { name?: string }) => n.name).filter(Boolean);
	} catch {
		return [];
	}
}

async function parseWithGrok(page: PageData): Promise<Product> {
	const modelLines = await Promise.all(
		page.models.slice(0, 3).map(async url => `${url} (nodes: ${(await glbNodeNames(url)).join(', ') || 'unknown'})`),
	);
	const prompt = `Extract product information from this retailer page capture. Use only facts in the input. If width/height/depth are not all listed but can be derived (for example a TV's width from its diagonal and 16:9 aspect), derive them and explain in dimensionsNote; otherwise use null. Convert sizes to inches and weight to pounds. Pick imageUrl from the image candidates and modelUrl from the 3D model candidates exactly as written. Decide how the item mounts in a home and which model nodes to drop for that mount.

URL: ${page.url}
Title: ${page.title}
Image candidates: ${[page.ogImage, page.mainImage].filter(Boolean).join(' ') || 'none'}
3D model candidates:
${modelLines.join('\n') || 'none'}

Spec pairs:
${page.specs.join('\n')}

JSON-LD:
${page.jsonLd}

Visible page text:
${page.text}`;
	const promptFile = join(ROOT, '.cache', `grok-prompt-${Date.now()}.txt`);
	await mkdir(join(ROOT, '.cache'), { recursive: true });
	await writeFile(promptFile, prompt);
	const proc = Bun.spawn(
		[
			'grok',
			'--prompt-file',
			promptFile,
			'-m',
			GROK_MODEL,
			'--disable-web-search',
			'--no-subagents',
			'--tools',
			'',
			'--max-turns',
			'3',
			'--output-format',
			'json',
			'--json-schema',
			JSON.stringify(productSchema),
		],
		{ cwd: join(ROOT, '.cache'), stdout: 'pipe', stderr: 'pipe' },
	);
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	await Bun.file(promptFile).delete();
	if (code !== 0) throw new Error(`grok exited ${code}: ${err || out}`);
	const result = JSON.parse(out);
	if (!result.structuredOutput) throw new Error(`grok returned no structured output: ${out.slice(0, 500)}`);
	return result.structuredOutput;
}

async function download(url: string, path: string) {
	const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
	if (!res.ok) throw new Error(`${res.status} downloading ${url}`);
	await Bun.write(path, res);
}

const slug = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60);

// Same product, same entry: re-importing a link updates it instead of adding a near-duplicate
// under whatever name the LLM picks this time.
function productKey(url: string) {
	const u = new URL(url);
	const id =
		u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] ?? u.pathname.match(/\/ip\/(?:[^/]+\/)?(\d+)/)?.[1];
	return `${u.hostname.replace(/^www\./, '')}:${id ?? u.pathname}`;
}

export async function importProducts(urls: string[], log: (line: string) => void = () => {}): Promise<CatalogItem[]> {
	await mkdir(CATALOG_DIR, { recursive: true });
	log(`capturing ${urls.length} page(s)…`);
	const imported: CatalogItem[] = [];
	for (const page of await fetchPages(urls)) {
		log(`→ ${page.title.slice(0, 80)} (${page.models.length} model candidate(s))`);
		const { imageUrl, modelUrl, ...product } = await parseWithGrok(page);
		const brandPrefix =
			product.brand && !product.name.toLowerCase().startsWith(product.brand.toLowerCase()) ? `${product.brand} ` : '';
		const existing = (await listCatalog()).find(item => productKey(item.url) === productKey(page.url));
		const id = existing?.id ?? slug(brandPrefix + product.name);
		const dir = join(ASSET_DIR, id);
		await mkdir(dir, { recursive: true });

		let image: string | null = null;
		if (imageUrl) {
			const ext = imageUrl.match(/\.(png|webp|jpe?g)/i)?.[1] ?? 'jpg';
			await download(imageUrl, join(dir, `image.${ext}`));
			image = `/api/assets/${id}/image.${ext}`;
		}
		let model: string | null = null;
		if (modelUrl) {
			await download(modelUrl, join(dir, 'model.glb'));
			model = `/api/assets/${id}/model.glb`;
		}

		const item: CatalogItem = {
			id,
			url: page.url.split('?')[0]!,
			importedAt: new Date().toISOString(),
			...product,
			image,
			model,
		};
		await writeFile(join(CATALOG_DIR, `${id}.json`), JSON.stringify(item, null, '\t') + '\n');
		log(
			`  saved ${id}: ${product.price ?? '?'} ${product.currency}, dims ${JSON.stringify(product.dimensions)}, model ${model ? 'yes' : 'no'}`,
		);
		imported.push(item);
	}
	return imported;
}
