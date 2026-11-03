// TV candidates: a pasted product link only yields the TV's name and screen size, which the TV panel can switch to.
import { tvSize, type TvModel } from '@repo/shared/items';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR, fetchPages, grokStructured, pageContext, productKey, slug } from './catalog';

const TVS_FILE = join(DATA_DIR, 'tvs.json');

export async function listTvs(): Promise<TvModel[]> {
	const file = Bun.file(TVS_FILE);
	return (await file.exists()) ? file.json() : [];
}

const saveTvs = (tvs: TvModel[]) => writeFile(TVS_FILE, JSON.stringify(tvs, null, '\t') + '\n');

// The TV panel models the screen, so a listing is read for the size it is sold by (its diagonal class) and aspect
// ratio rather than the overall body, whose bezel and depth vary between spec sheets.
export async function importTv(url: string): Promise<TvModel> {
	const [page] = await fetchPages([url]);
	const tv = await grokStructured<{ name: string; diagonalIn: number; ratioWidth: number; ratioHeight: number }>(
		`Read this TV listing's name, its screen size class (the diagonal it is sold as, in inches) and its aspect ratio (16:9 unless the listing says otherwise).\n\n${pageContext(page!)}`,
		{
			type: 'object',
			additionalProperties: false,
			required: ['name', 'diagonalIn', 'ratioWidth', 'ratioHeight'],
			properties: {
				name: { type: 'string', description: 'Short name with brand and model, without retailer noise' },
				diagonalIn: { type: 'number' },
				ratioWidth: { type: 'number' },
				ratioHeight: { type: 'number' },
			},
		},
	);
	if (!(tv.diagonalIn > 10 && tv.ratioWidth > 0 && tv.ratioHeight > 0))
		throw new Error(`No usable size on ${url}: ${JSON.stringify(tv)}`);
	const tvs = await listTvs();
	const existing = tvs.find(t => productKey(t.url) === productKey(page!.url));
	const saved: TvModel = {
		id: existing?.id ?? slug(tv.name),
		url: page!.url.split('?')[0]!,
		name: tv.name,
		...tvSize(tv.diagonalIn, [tv.ratioWidth, tv.ratioHeight]),
	};
	await saveTvs([saved, ...tvs.filter(t => t !== existing)]);
	return saved;
}

export const removeTv = async (id: string) => saveTvs((await listTvs()).filter(t => t.id !== id));
