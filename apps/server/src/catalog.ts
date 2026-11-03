// Product import pipeline shared by the API (POST /api/catalog/import) and scripts/import-item.ts.
// Captures each page with a headless Camoufox browser, has the grok CLI turn it into
// structured product info, downloads the photos and any 3D model, and saves the item to the catalog table.
import type { CatalogItem, Placement } from '@repo/shared/items';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { table } from './db';

export const ROOT = join(import.meta.dir, '../../..');
export const ASSET_DIR = join(ROOT, 'data/items');
export const GALLERY_DIR = 'gallery';
const GROK_MODEL = 'grok-4.7-build-fast';

for (const bin of ['grok', 'uv', 'pdftotext']) if (!Bun.which(bin)) throw new Error(`${bin} CLI not found on PATH`);

export const catalog = table<CatalogItem>('catalog_items', {
	key: 'id',
	json: ['dimensions', 'highlights', 'removeNodes'],
	order: 'importedAt DESC',
});

export const placements = table<Placement>('placements', {
	key: 'key',
	json: ['position', 'rotation'],
	order: 'rowid',
});

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
				'Overall assembled size in inches as placed in a room (for TVs: without stand). Width is side to side seen from the front. For sectionals and L-shapes this is the whole footprint.',
		},
		dimensionsNote: {
			type: ['string', 'null'],
			description:
				'Say which values were derived rather than listed, and how. Retail spec tables often give the seat depth or one module as the product depth; flag values that look implausible for the product.',
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
	images: string[];
	// Linked PDFs, spec sheets first.
	documents: string[];
	specs: string[];
	jsonLd: string;
	text: string;
};

export async function fetchPages(urls: string[]): Promise<PageData[]> {
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

export const pageContext = (page: PageData) => `URL: ${page.url}
Title: ${page.title}
Image candidates: ${[page.ogImage, page.mainImage].filter(Boolean).join(' ') || 'none'}

Spec pairs:
${page.specs.join('\n')}

JSON-LD:
${page.jsonLd}

Visible page text:
${page.text}`;

async function parseWithGrok(page: PageData): Promise<Product> {
	const modelLines = await Promise.all(
		page.models.slice(0, 3).map(async url => `${url} (nodes: ${(await glbNodeNames(url)).join(', ') || 'unknown'})`),
	);
	return grokStructured<Product>(
		`Extract product information from this retailer page capture. Use only facts in the input. If width/height/depth are not all listed but can be derived (for example a TV's width from its diagonal and 16:9 aspect), derive them and explain in dimensionsNote; otherwise use null. Convert sizes to inches and weight to pounds. Pick imageUrl from the image candidates and modelUrl from the 3D model candidates exactly as written. Decide how the item mounts in a home and which model nodes to drop for that mount.

3D model candidates:
${modelLines.join('\n') || 'none'}

${pageContext(page)}`,
		productSchema,
	);
}

export async function grokStructured<T>(prompt: string, schema: object): Promise<T> {
	const promptFile = join(ROOT, '.cache', `grok-prompt-${crypto.randomUUID()}.txt`);
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
			JSON.stringify(schema),
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

// Text of the page's linked spec sheets, for prompts that need exact dimensions.
export async function readDocuments(urls: string[]): Promise<string> {
	const texts = await Promise.all(
		urls.map(async url => {
			const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
			if (!res.ok) throw new Error(`${res.status} downloading ${url}`);
			const proc = Bun.spawn(['pdftotext', '-layout', '-', '-'], {
				stdin: new Uint8Array(await res.arrayBuffer()),
				stdout: 'pipe',
				stderr: 'pipe',
			});
			const [out, err, code] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]);
			if (code !== 0) throw new Error(`pdftotext failed on ${url}: ${err}`);
			return `Document ${url}:\n${out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')}`;
		}),
	);
	return texts.join('\n\n').slice(0, 30000);
}

async function download(url: string, path: string) {
	const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
	if (!res.ok) throw new Error(`${res.status} downloading ${url}`);
	await Bun.write(path, res);
}

const extension = (url: string) => url.match(/\.(png|webp|jpe?g)/i)?.[1] ?? 'jpg';

export const slug = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60);

// Same product, same entry: re-importing a link updates it instead of adding a near-duplicate
// under whatever name the LLM picks this time.
export function productKey(url: string) {
	const u = new URL(url);
	const id =
		u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] ?? u.pathname.match(/\/ip\/(?:[^/]+\/)?(\d+)/)?.[1];
	return `${u.hostname.replace(/^www\./, '')}:${id ?? u.pathname}`;
}

// Main photo as image.<ext> plus the listing gallery, into data/items/<id>/. Returns the main photo's asset URL.
export async function downloadPhotos(id: string, imageUrl: string | null, gallery: string[]): Promise<string | null> {
	const dir = join(ASSET_DIR, id);
	await rm(join(dir, GALLERY_DIR), { recursive: true, force: true });
	await mkdir(join(dir, GALLERY_DIR), { recursive: true });
	await Promise.all(
		gallery.map((url, i) =>
			download(url, join(dir, GALLERY_DIR, `${String(i + 1).padStart(2, '0')}.${extension(url)}`)),
		),
	);
	if (!imageUrl) return null;
	const ext = extension(imageUrl);
	await download(imageUrl, join(dir, `image.${ext}`));
	return `/api/assets/${id}/image.${ext}`;
}

// `category` limits an import to one kind of product, so a link pasted in the Bed panel can't add a lamp nobody sees.
export async function importProducts(
	urls: string[],
	log: (line: string) => void = () => {},
	category?: string,
): Promise<CatalogItem[]> {
	log(`capturing ${urls.length} page(s)…`);
	const imported: CatalogItem[] = [];
	for (const page of await fetchPages(urls)) {
		log(`→ ${page.title.slice(0, 80)} (${page.models.length} model candidate(s))`);
		const { imageUrl, modelUrl, ...product } = await parseWithGrok(page);
		// TVs are built into the plan; the TV panel only needs their size.
		if (product.category === 'tv')
			throw new Error(`${product.name} is a TV: paste its link in the TV panel, which reads its size`);
		if (category && product.category !== category)
			throw new Error(`${product.name} is not a ${category} (read as ${product.category})`);
		const brandPrefix =
			product.brand && !product.name.toLowerCase().startsWith(product.brand.toLowerCase()) ? `${product.brand} ` : '';
		const existing = catalog.all().find(item => productKey(item.url) === productKey(page.url));
		const id = existing?.id ?? slug(brandPrefix + product.name);
		const dir = join(ASSET_DIR, id);

		const image = await downloadPhotos(id, imageUrl, page.images);
		let model: string | null = null;
		let modelSource: CatalogItem['modelSource'] = null;
		if (modelUrl) {
			await download(modelUrl, join(dir, 'model.glb'));
			model = `/api/assets/${id}/model.glb`;
			modelSource = 'listing';
		} else if (existing?.modelSource === 'generated') {
			({ model, modelSource } = existing);
			// The generated model was sized from the photos, which beat the spec table it was read from.
			({ dimensions: product.dimensions, dimensionsNote: product.dimensionsNote } = existing);
		}

		const item: CatalogItem = {
			id,
			url: page.url.split('?')[0]!,
			importedAt: new Date().toISOString(),
			...product,
			image,
			model,
			modelSource,
		};
		catalog.put(item);
		log(
			`  saved ${id}: ${product.price ?? '?'} ${product.currency}, dims ${JSON.stringify(product.dimensions)}, ${page.images.length} photo(s), model ${model ? 'yes' : 'no'}`,
		);
		imported.push(item);
	}
	return imported;
}
