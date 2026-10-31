// Usage: bun scripts/import-item.ts <product-url> [more urls...]
//
// Captures each page with a headless Camoufox browser, has the grok CLI turn it
// into structured product info, downloads the image and any 3D model, and writes
// apps/ui/src/lib/catalog/<id>.json plus apps/ui/static/items/<id>/.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const CATALOG_DIR = join(ROOT, 'apps/ui/src/lib/catalog');
const ASSET_DIR = join(ROOT, 'apps/ui/static/items');
const GROK_MODEL = 'grok-4.7-build-fast';

const urls = process.argv.slice(2);
if (!urls.length) {
	console.error('usage: bun scripts/import-item.ts <product-url> [...]');
	process.exit(1);
}
for (const bin of ['grok', 'uv']) if (!Bun.which(bin)) throw new Error(`${bin} CLI not found on PATH`);

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
			join(import.meta.dir, 'fetch-pages.py'),
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

async function parseWithGrok(page: PageData): Promise<Product> {
	const prompt = `Extract product information from this retailer page capture. Use only facts in the input. If width/height/depth are not all listed but can be derived (for example a TV's width from its diagonal and 16:9 aspect), derive them and explain in dimensionsNote; otherwise use null. Convert sizes to inches and weight to pounds. Pick imageUrl from the image candidates and modelUrl from the 3D model candidates exactly as written.

URL: ${page.url}
Title: ${page.title}
Image candidates: ${[page.ogImage, page.mainImage].filter(Boolean).join(' ') || 'none'}
3D model candidates: ${page.models.join(' ') || 'none'}

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

await mkdir(CATALOG_DIR, { recursive: true });
console.log(`capturing ${urls.length} page(s)…`);
for (const page of await fetchPages(urls)) {
	console.log(`→ ${page.title.slice(0, 80)} (${page.models.length} model candidate(s))`);
	const product = await parseWithGrok(page);
	const brandPrefix =
		product.brand && !product.name.toLowerCase().startsWith(product.brand.toLowerCase()) ? `${product.brand} ` : '';
	const id = slug(brandPrefix + product.name);
	const dir = join(ASSET_DIR, id);
	await mkdir(dir, { recursive: true });

	let image: string | null = null;
	if (product.imageUrl) {
		const ext = product.imageUrl.match(/\.(png|webp|jpe?g)/i)?.[1] ?? 'jpg';
		await download(product.imageUrl, join(dir, `image.${ext}`));
		image = `/items/${id}/image.${ext}`;
	}
	let model: string | null = null;
	if (product.modelUrl) {
		await download(product.modelUrl, join(dir, 'model.glb'));
		model = `/items/${id}/model.glb`;
	}

	const entry = { id, url: page.url.split('?')[0], importedAt: new Date().toISOString(), ...product, image, model };
	await writeFile(join(CATALOG_DIR, `${id}.json`), JSON.stringify(entry, null, '\t') + '\n');
	console.log(
		`  saved ${id}: ${product.price ?? '?'} ${product.currency}, dims ${JSON.stringify(product.dimensions)}, model ${model ? 'yes' : 'no'}`,
	);
}
