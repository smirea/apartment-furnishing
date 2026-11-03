// TV candidates: a pasted product link only yields the TV's name and screen size, which the TV panel can switch to.
import { tvSize, type TvModel } from '@repo/shared/items';
import { fetchPages, grokStructured, pageContext, productKey, slug } from './catalog';
import { table } from './db';

export const tvs = table<TvModel>('tv_models', { key: 'id', json: [], order: 'importedAt DESC' });

// The TV panel models the screen, so a listing is read for the size it is sold by (its diagonal class) and aspect
// ratio rather than the overall body, whose bezel and depth vary between spec sheets.
export async function importTv(url: string): Promise<TvModel> {
	const [page] = await fetchPages([url]);
	const tv = await grokStructured<{
		isTv: boolean;
		name: string;
		diagonalIn: number;
		ratioWidth: number;
		ratioHeight: number;
	}>(
		`Read this TV listing's name, its screen size class (the diagonal it is sold as, in inches) and its aspect ratio (16:9 unless the listing says otherwise).\n\n${pageContext(page!)}`,
		{
			type: 'object',
			additionalProperties: false,
			required: ['isTv', 'name', 'diagonalIn', 'ratioWidth', 'ratioHeight'],
			properties: {
				isTv: {
					type: 'boolean',
					description: 'Whether the product is a television (not a monitor, projector or TV mount)',
				},
				name: { type: 'string', description: 'Short name with brand and model, without retailer noise' },
				diagonalIn: { type: 'number' },
				ratioWidth: { type: 'number' },
				ratioHeight: { type: 'number' },
			},
		},
	);
	if (!tv.isTv) throw new Error(`${tv.name} is not a TV`);
	if (!(tv.diagonalIn > 10 && tv.ratioWidth > 0 && tv.ratioHeight > 0))
		throw new Error(`No usable size on ${url}: ${JSON.stringify(tv)}`);
	const existing = tvs.all().find(t => productKey(t.url) === productKey(page!.url));
	const saved: TvModel = {
		id: existing?.id ?? slug(tv.name),
		url: page!.url.split('?')[0]!,
		importedAt: new Date().toISOString(),
		name: tv.name,
		...tvSize(tv.diagonalIn, [tv.ratioWidth, tv.ratioHeight]),
	};
	tvs.put(saved);
	return saved;
}
