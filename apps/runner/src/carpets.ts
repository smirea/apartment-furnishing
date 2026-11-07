// Carpets: rug products imported from a link (page capture, grok, photos), then turned into one top-down image of the
// whole rug by Codex. Where each lies is the Worker's, per layout.
import { sizeLabel, type Carpet, type CarpetSize } from '@repo/shared/carpets';
import { productKey } from '@repo/shared/layouts';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadPhotos, fetchPages, grokStructured, pageContext, slug } from './catalog';
import { collectPhotos, runCodex } from './generate-model';
import { assets, db } from './remote';

const PROMPT_FILE = Bun.file(join(import.meta.dir, 'carpet-prompt.md'));
if (!(await PROMPT_FILE.exists())) throw new Error(`missing ${PROMPT_FILE.name}`);

const { carpets } = db;

const carpetSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['isRug', 'name', 'brand', 'currency', 'summary', 'imageUrl', 'sizes', 'selectedSize'],
	properties: {
		isRug: { type: 'boolean', description: 'Whether the product is a rug, carpet, runner or floor mat' },
		name: {
			type: 'string',
			description:
				'Short product name a person would say, without retailer noise or the size. Include the color when the store sells several',
		},
		brand: { type: ['string', 'null'] },
		currency: { type: 'string' },
		summary: { type: 'string', description: 'One or two plain sentences: construction, pile, material, colors' },
		imageUrl: { type: ['string', 'null'], description: 'Main product photo URL, copied exactly from the input' },
		sizes: {
			type: 'array',
			description:
				"Every size the listing sells, in inches. Width is the shorter side; a round rug's width and length are both its diameter. price is that size's price when the page shows it, else null",
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['widthIn', 'lengthIn', 'price'],
				properties: {
					widthIn: { type: 'number' },
					lengthIn: { type: 'number' },
					price: { type: ['number', 'null'] },
				},
			},
		},
		selectedSize: {
			type: 'integer',
			description: 'Index in sizes of the size the page has selected, or the one its main price is for',
		},
	},
};

type Parsed = Pick<Carpet, 'name' | 'brand' | 'currency' | 'summary'> & {
	isRug: boolean;
	imageUrl: string | null;
	sizes: CarpetSize[];
	selectedSize: number;
};

const sameSize = (a: Pick<CarpetSize, 'widthIn' | 'lengthIn'>, b: Pick<CarpetSize, 'widthIn' | 'lengthIn'>) =>
	Math.abs(a.widthIn - b.widthIn) < 0.5 && Math.abs(a.lengthIn - b.lengthIn) < 0.5;

function normalizeSizes(parsed: Parsed) {
	const valid = parsed.sizes
		.filter(s => s.widthIn > 0 && s.lengthIn > 0 && Math.max(s.widthIn, s.lengthIn) < 600)
		.map(s => ({ ...s, widthIn: Math.min(s.widthIn, s.lengthIn), lengthIn: Math.max(s.widthIn, s.lengthIn) }));
	const sizes = valid
		.filter((s, i) => valid.findIndex(other => sameSize(s, other)) === i)
		.toSorted((a, b) => a.widthIn * a.lengthIn - b.widthIn * b.lengthIn);
	if (!sizes.length) throw new Error(`${parsed.name}: the page lists no rug size`);
	const picked = valid[parsed.selectedSize];
	return { sizes, selected: (picked && sizes.find(s => sameSize(s, picked))) ?? sizes[0]! };
}

export async function importCarpet(url: string, log: (line: string) => void = () => {}): Promise<Carpet> {
	log(`capturing ${url}…`);
	const [page] = await fetchPages([url]);
	const parsed = await grokStructured<Parsed>(
		`Extract rug product information from this retailer page capture. Use only facts in the input. Convert sizes to inches (8' x 10' is 96 x 120). Pick imageUrl from the image candidates exactly as written.\n\n${pageContext(page!)}`,
		carpetSchema,
	);
	if (!parsed.isRug) throw new Error(`${parsed.name} is not a rug or carpet`);
	const { sizes, selected } = normalizeSizes(parsed);
	const existing = (await carpets.all()).find(c => productKey(c.url) === productKey(page!.url));
	const brandPrefix =
		parsed.brand && !parsed.name.toLowerCase().startsWith(parsed.brand.toLowerCase()) ? `${parsed.brand} ` : '';
	let id = existing?.id ?? slug(brandPrefix + parsed.name);
	// Furniture and wall textures keep their photos under the same data/items/<id>/ folders.
	for (let n = 2; !existing && ((await carpets.get(id)) || (await assets.list(`${id}/`)).length); n++)
		id = `${slug(brandPrefix + parsed.name)}-${n}`;
	const size = (existing && sizes.find(s => sameSize(s, existing.size))) ?? selected;
	const carpet: Carpet = {
		id,
		url: page!.url.split('?')[0]!,
		importedAt: existing?.importedAt ?? new Date().toISOString(),
		name: parsed.name,
		brand: parsed.brand,
		currency: parsed.currency,
		summary: parsed.summary,
		sizes,
		size,
		image: await downloadPhotos(id, parsed.imageUrl, page!.images),
		texture: existing?.texture ?? null,
	};
	await carpets.put(carpet);
	log(`  saved carpet ${id}: ${sizes.map(sizeLabel).join(', ')}, showing ${sizeLabel(size)}`);
	return carpet;
}

async function prompt(carpet: Carpet, photos: string[]) {
	return (await PROMPT_FILE.text())
		.replace('{{name}}', carpet.name)
		.replace('{{size}}', `${carpet.size.widthIn} × ${carpet.size.lengthIn} in`)
		.replace('{{summary}}', carpet.summary)
		.replace('{{photos}}', photos.map((name, i) => `${i + 1}. ${name}`).join('\n'));
}

export async function generateCarpetTexture(carpet: Carpet) {
	const work = await mkdtemp(join(tmpdir(), `carpet-${carpet.id}-`));
	const photos = await collectPhotos(carpet.id, work);
	console.log(`codex: drawing carpet ${carpet.id} from ${photos.length} photo(s) in ${work}`);
	await runCodex(work, photos, await prompt(carpet, photos), ['texture.png', 'build.py', 'preview.png']);
	const raw = await Bun.file(join(work, 'texture.json'))
		.json()
		.catch(() => null);
	if (typeof raw?.note !== 'string') throw new Error(`codex wrote no valid texture.json: ${JSON.stringify(raw)}`);
	// Read before uploading, so a build of an item deleted meanwhile fails without leaving files behind.
	const current = await carpets.read(carpet.id);
	const outputs = { 'texture.png': 'carpet.png', 'build.py': 'carpet.py', 'preview.png': 'carpet-preview.png' };
	await Promise.all(
		Object.entries(outputs).map(async ([from, to]) =>
			assets.put(`${carpet.id}/${to}`, await Bun.file(join(work, from)).bytes()),
		),
	);
	await carpets.put({
		...current,
		// Cache-busting version: the path stays the same across rebuilds.
		texture: { map: `/api/assets/${carpet.id}/carpet.png?v=${Date.now()}`, note: raw.note },
	});
	console.log(`codex: carpet ${carpet.id} done (${work})`);
}
