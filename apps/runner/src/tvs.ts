// TV candidates: a pasted product link yields the TV's name, screen size, price and photo, which the TV panel can switch to.
import { productKey } from '@repo/shared/layouts';
import { tvSize, type TvModel } from '@repo/shared/items';
import { downloadPhotos, fetchPages, pageContext, slug } from './catalog';
import { codexStructured } from './codex';
import { db } from './remote';

const { tvs } = db;

// The TV panel models the screen, so a listing is read for the size it is sold by (its diagonal class) and aspect
// ratio rather than the overall body, whose bezel and depth vary between spec sheets.
export async function importTv(url: string): Promise<TvModel> {
	const [page] = await fetchPages([url]);
	const tv = await codexStructured<{
		isTv: boolean;
		name: string;
		brand: string | null;
		price: number | null;
		currency: string;
		imageUrl: string | null;
		diagonalIn: number;
		ratioWidth: number;
		ratioHeight: number;
	}>(
		`Read this TV listing's name, its screen size class (the diagonal it is sold as, in inches) and its aspect ratio (16:9 unless the listing says otherwise), its brand, price and currency. Use only facts in the input. Pick imageUrl from the image candidates exactly as written.\n\n${pageContext(page!)}`,
		{
			type: 'object',
			additionalProperties: false,
			required: ['isTv', 'name', 'brand', 'price', 'currency', 'imageUrl', 'diagonalIn', 'ratioWidth', 'ratioHeight'],
			properties: {
				isTv: {
					type: 'boolean',
					description: 'Whether the product is a television (not a monitor, projector or TV mount)',
				},
				name: { type: 'string', description: 'Short name with brand and model, without retailer noise' },
				brand: { type: ['string', 'null'] },
				price: { type: ['number', 'null'], description: 'Current price, null when the page shows none' },
				currency: { type: 'string' },
				imageUrl: { type: ['string', 'null'], description: 'Main product photo URL, copied exactly from the input' },
				diagonalIn: { type: 'number' },
				ratioWidth: { type: 'number' },
				ratioHeight: { type: 'number' },
			},
		},
	);
	if (!tv.isTv) throw new Error(`${tv.name} is not a TV`);
	if (!(tv.diagonalIn > 10 && tv.ratioWidth > 0 && tv.ratioHeight > 0))
		throw new Error(`No usable size on ${url}: ${JSON.stringify(tv)}`);
	const existing = (await tvs.all()).find(t => productKey(t.url) === productKey(page!.url));
	const id = existing?.id ?? slug(tv.name);
	const saved: TvModel = {
		id,
		url: page!.url.split('?')[0]!,
		importedAt: existing?.importedAt ?? new Date().toISOString(),
		name: tv.name,
		brand: tv.brand,
		price: tv.price,
		currency: tv.currency,
		image: await downloadPhotos(id, tv.imageUrl, page!.images),
		// Layouts picked this TV by its size, so a second read of the listing must not move it.
		...(existing
			? { widthIn: existing.widthIn, heightIn: existing.heightIn }
			: tvSize(tv.diagonalIn, [tv.ratioWidth, tv.ratioHeight])),
	};
	await tvs.put(saved);
	return saved;
}
