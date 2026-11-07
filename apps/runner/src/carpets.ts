// Carpets: rug products imported from a link with every look (color, pattern) and size the listing sells, then each
// look turned into one top-down image of the whole rug by Codex. Which look and size a layout shows, and where it lies,
// is the Worker's.
import { sameSize, sizeLabel, type Carpet, type CarpetSize, type CarpetVariant } from '@repo/shared/carpets';
import { statement } from '@repo/shared/db';
import { productKey } from '@repo/shared/layouts';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadPhotos, fetchPages, grokStructured, pageContext, slug } from './catalog';
import { pagesToCapture, type Combo, type Look } from './carpet-pages';
import { collectPhotos, runCodex } from './generate-model';
import { assets, db } from './remote';

const PROMPT_FILE = Bun.file(join(import.meta.dir, 'carpet-prompt.md'));
if (!(await PROMPT_FILE.exists())) throw new Error(`missing ${PROMPT_FILE.name}`);

const { carpets } = db;

// The look of a listing that sells one, and of carpets imported before looks, keeps its photos at the carpet's root.
const SINGLE_LOOK = 'default';
const lookFolder = (carpetId: string, lookId: string) => (lookId === SINGLE_LOOK ? carpetId : `${carpetId}/${lookId}`);

const sizeSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['widthIn', 'lengthIn', 'price'],
	properties: { widthIn: { type: 'number' }, lengthIn: { type: 'number' }, price: { type: ['number', 'null'] } },
};

const carpetSchema = {
	type: 'object',
	additionalProperties: false,
	required: [
		'isRug',
		'name',
		'brand',
		'currency',
		'summary',
		'imageUrl',
		'sizes',
		'selectedSize',
		'sizeDimension',
		'sizeValues',
	],
	properties: {
		isRug: { type: 'boolean', description: 'Whether the product is a rug, carpet, runner or floor mat' },
		name: {
			type: 'string',
			description:
				'Short product name a person would say, without retailer noise, the size, or the color when the listing sells several looks',
		},
		brand: { type: ['string', 'null'] },
		currency: { type: 'string' },
		summary: { type: 'string', description: 'One or two plain sentences: construction, pile, material, colors' },
		imageUrl: { type: ['string', 'null'], description: 'Main product photo URL, copied exactly from the input' },
		sizes: {
			type: 'array',
			description:
				"Every size the page lists for the look it shows, in inches. Width is the shorter side; a round rug's width and length are both its diameter. price is that size's price when the page shows it, else null",
			items: sizeSchema,
		},
		selectedSize: {
			type: 'integer',
			description: 'Index in sizes of the size the page has selected, or the one its main price is for',
		},
		sizeDimension: {
			type: ['integer', 'null'],
			description:
				'Index of the variation dimension that is the rug size, or null when there is none or no variation dimensions are listed',
		},
		sizeValues: {
			type: 'array',
			description:
				"One entry per value of the size dimension, in the order listed, in inches. Width is the shorter side; a round rug's width and length are both its diameter. Both null for a value that is not one single rug, such as a set of two, a bundle or a sample",
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['value', 'widthIn', 'lengthIn'],
				properties: {
					value: { type: 'string' },
					widthIn: { type: ['number', 'null'] },
					lengthIn: { type: ['number', 'null'] },
				},
			},
		},
	},
};

type Parsed = Pick<Carpet, 'name' | 'brand' | 'currency' | 'summary'> & {
	isRug: boolean;
	imageUrl: string | null;
	sizes: CarpetSize[];
	selectedSize: number;
	sizeDimension: number | null;
	sizeValues: { value: string; widthIn: number | null; lengthIn: number | null }[];
};

const plausible = (s: { widthIn: number | null; lengthIn: number | null }): s is Omit<CarpetSize, 'price'> =>
	!!s.widthIn && !!s.lengthIn && s.widthIn > 0 && s.lengthIn > 0 && Math.max(s.widthIn, s.lengthIn) < 600;

// Width is the shorter side; one entry per size, the priced one where two read the same; smallest first.
function normalizeSizes(sizes: CarpetSize[]) {
	const valid = sizes
		.filter(plausible)
		.map(s => ({ widthIn: Math.min(s.widthIn, s.lengthIn), lengthIn: Math.max(s.widthIn, s.lengthIn), price: s.price }))
		.toSorted((a, b) => +(a.price === null) - +(b.price === null));
	return valid
		.filter((s, i) => valid.findIndex(other => sameSize(s, other)) === i)
		.toSorted((a, b) => a.widthIn * a.lengthIn - b.widthIn * b.lengthIn);
}

export async function importCarpet(url: string, log: (line: string) => void = () => {}): Promise<Carpet> {
	log(`capturing ${url}…`);
	const [main] = await fetchPages([url]);
	if (main!.variationsError) log(`  could not read the listing's other looks: ${main!.variationsError}`);
	const variations = main!.variations;
	const dimensions = variations?.dimensions.map(
		(d, i) => `${i}. ${d}: ${[...new Set(variations.combos.map(c => c.values[i]))].join(' | ')}`,
	);
	const parsed = await grokStructured<Parsed>(
		`Extract rug product information from this retailer page capture. Use only facts in the input. Convert sizes to inches (8' x 10' is 96 x 120). Pick imageUrl from the image candidates exactly as written.

Variation dimensions the listing sells, with their values:
${dimensions?.join('\n') ?? 'none'}

${pageContext(main!)}`,
		carpetSchema,
	);
	if (!parsed.isRug) throw new Error(`${parsed.name} is not a rug or carpet`);

	const sizeDim =
		variations && parsed.sizeDimension !== null && parsed.sizeDimension < variations.dimensions.length
			? parsed.sizeDimension
			: null;
	const sizeTable = new Map(parsed.sizeValues.map(v => [v.value, v]));
	const sizeOf = (c: Combo) => (sizeDim === null ? null : c.values[sizeDim]!);
	const lookDims = (variations?.dimensions ?? []).flatMap((d, i) => (i === sizeDim ? [] : [{ i, label: d }]));
	const lookName = (c: Combo) => lookDims.map(d => c.values[d.i]).join(' / ');
	const combos = variations?.combos ?? [{ url: main!.url, values: [], price: null }];
	const current = combos.find(c => c.url === variations?.current) ?? combos[0]!;

	const looks: Look[] = [];
	for (const combo of combos) {
		const name = lookName(combo);
		let look = looks.find(l => l.name === name);
		if (!look) {
			const base = name ? slug(name) || 'look' : SINGLE_LOOK;
			let id = base;
			for (let n = 2; looks.some(l => l.id === id); n++) id = `${base}-${n}`;
			look = { id, name, combos: [], url: combo.url, page: null };
			looks.push(look);
		}
		look.combos.push(combo);
	}
	const mainLook = looks.find(l => l.combos.includes(current))!;
	mainLook.page = main!;
	mainLook.url = main!.url.split('?')[0]!;

	const extra = variations?.perLook ? pagesToCapture(looks, current, sizeOf) : [];
	const prices = new Map(combos.filter(c => c.price !== null).map(c => [c.url, c.price]));
	if (extra.length) {
		log(`  capturing ${extra.length} more page(s) for ${looks.length} looks and their prices…`);
		const pages = await fetchPages(extra.map(p => p.combo.url));
		pages.forEach((page, i) => {
			const { look, combo } = extra[i]!;
			if (!look.page) {
				look.page = page;
				look.url = combo.url;
			}
			for (const c of page.variations?.combos ?? []) if (c.price !== null) prices.set(c.url, c.price);
		});
	}

	const existing = (await carpets.all()).find(c => productKey(c.url) === productKey(main!.url));
	const brandPrefix =
		parsed.brand && !parsed.name.toLowerCase().startsWith(parsed.brand.toLowerCase()) ? `${parsed.brand} ` : '';
	let id = existing?.id ?? slug(brandPrefix + parsed.name);
	// Furniture and wall textures keep their photos under the same items/<id>/ folders.
	for (let n = 2; !existing && ((await carpets.get(id)) || (await assets.list(`${id}/`)).length); n++)
		id = `${slug(brandPrefix + parsed.name)}-${n}`;

	const fallbackSizes = normalizeSizes(parsed.sizes);
	const variants: CarpetVariant[] = [];
	for (const look of looks) {
		const sizes =
			sizeDim === null
				? fallbackSizes
				: normalizeSizes(
						look.combos.flatMap(c => {
							const size = sizeTable.get(sizeOf(c)!);
							return size && plausible(size) ? [{ ...size, price: prices.get(c.url) ?? null }] : [];
						}),
					);
		if (!sizes.length) {
			log(`  skipping ${look.name || 'the only look'}: no single-rug size`);
			continue;
		}
		const page = look.page ?? main!;
		const photo = look === mainLook ? parsed.imageUrl : (page.images[0] ?? page.mainImage ?? page.ogImage);
		const kept =
			existing?.variants.find(v => v.id === look.id) ??
			(look === mainLook ? existing?.variants.find(v => v.id === SINGLE_LOOK) : undefined);
		variants.push({
			id: look.id,
			name: look.name,
			url: look.url,
			image: await downloadPhotos(lookFolder(id, look.id), photo, page.images),
			sizes,
			texture: kept?.texture ?? null,
		});
	}
	const listed = variants.find(v => v.id === mainLook.id) ?? variants[0];
	if (!listed) throw new Error(`${parsed.name}: the page lists no rug size`);

	const currentSize = sizeDim === null ? fallbackSizes[parsed.selectedSize] : sizeTable.get(sizeOf(current)!);
	const size =
		(existing && listed.sizes.find(s => sameSize(s, existing.size))) ??
		(currentSize && plausible(currentSize) ? listed.sizes.find(s => sameSize(s, currentSize)) : undefined) ??
		listed.sizes[0]!;
	const carpet: Carpet = {
		id,
		url: main!.url.split('?')[0]!,
		importedAt: existing?.importedAt ?? new Date().toISOString(),
		name: parsed.name,
		brand: parsed.brand,
		currency: parsed.currency,
		summary: parsed.summary,
		variantLabel: lookDims.map(d => d.label.replace(/^actual /i, '')).join(' / ') || 'Color',
		variants,
		variant: listed.id,
		size,
	};
	await carpets.put(carpet);
	log(
		`  saved carpet ${id}: ${variants.length} look(s) (${variants.map(v => v.name || '-').join(', ')}); ${listed.sizes.map(sizeLabel).join(', ')}; showing ${listed.name} ${sizeLabel(size)}`,
	);
	return carpet;
}

async function prompt(carpet: Carpet, look: CarpetVariant, photos: string[]) {
	const size = look.sizes.find(s => sameSize(s, carpet.size)) ?? look.sizes[Math.floor(look.sizes.length / 2)]!;
	return (await PROMPT_FILE.text())
		.replace('{{name}}', look.name ? `${carpet.name}, ${look.name}` : carpet.name)
		.replace('{{size}}', `${size.widthIn} × ${size.lengthIn} in`)
		.replace('{{summary}}', carpet.summary)
		.replace('{{photos}}', photos.map((name, i) => `${i + 1}. ${name}`).join('\n'));
}

// Draws one look. `target` is the job's `<carpet id>/<look id>`.
export async function generateCarpetTexture(target: string) {
	const [carpetId, lookId] = target.split('/') as [string, string];
	const carpet = await carpets.read(carpetId);
	const look = carpet.variants.find(v => v.id === lookId);
	if (!look) throw new Error(`${carpetId} has no look ${lookId}`);
	const folder = lookFolder(carpetId, lookId);
	const work = await mkdtemp(join(tmpdir(), `carpet-${carpetId}-${lookId}-`));
	const photos = await collectPhotos(folder, work);
	console.log(`codex: drawing carpet ${target} from ${photos.length} photo(s) in ${work}`);
	await runCodex(work, photos, await prompt(carpet, look, photos), ['texture.png', 'build.py', 'preview.png']);
	const raw = await Bun.file(join(work, 'texture.json'))
		.json()
		.catch(() => null);
	if (typeof raw?.note !== 'string') throw new Error(`codex wrote no valid texture.json: ${JSON.stringify(raw)}`);
	// Read before uploading, so a build of a carpet deleted meanwhile fails without leaving files behind.
	if (!(await carpets.read(carpetId)).variants.some(v => v.id === lookId))
		throw new Error(`${carpetId} lost its look ${lookId} while it was drawn`);
	const outputs = { 'texture.png': 'carpet.png', 'build.py': 'carpet.py', 'preview.png': 'carpet-preview.png' };
	await Promise.all(
		Object.entries(outputs).map(async ([from, to]) =>
			assets.put(`${folder}/${to}`, await Bun.file(join(work, from)).bytes()),
		),
	);
	// Several looks of one carpet are drawn at once, so each sets its own texture in place rather than writing back the
	// whole row it read.
	const texture = { map: `/api/assets/${folder}/carpet.png?v=${Date.now()}`, note: raw.note };
	await db.sql([
		statement(
			`UPDATE carpets SET variants = (
				SELECT json_group_array(CASE WHEN json_extract(value, '$.id') = ?2
					THEN json_set(value, '$.texture', json(?3)) ELSE json(value) END)
				FROM json_each(carpets.variants)
			) WHERE id = ?1`,
			carpetId,
			lookId,
			JSON.stringify(texture),
		),
	]);
	console.log(`codex: carpet ${target} done (${work})`);
}
