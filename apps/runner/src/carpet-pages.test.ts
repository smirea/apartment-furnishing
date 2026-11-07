import { expect, test } from 'bun:test';
import { pagesToCapture, type Combo, type Look } from './carpet-pages';

const combo = (color: string, size: string): Combo => ({ url: `${color}-${size}`, values: [color, size], price: null });
const look = (color: string, sizes: string[]): Look => ({
	id: color,
	name: color,
	combos: sizes.map(size => combo(color, size)),
	url: '',
	page: null,
});
const sizeOf = (c: Combo) => c.values[1]!;
const urls = (pages: ReturnType<typeof pagesToCapture>) => pages.map(p => p.combo.url);

test('captures each other look once, at a size the first page did not show, so every size gets a price', () => {
	const looks = [
		look('beige', ['5x7', '8x10', '9x12']),
		look('black', ['5x7', '8x10', '9x12']),
		look('cream', ['5x7', '8x10', '9x12']),
	];
	const current = looks[0]!.combos[1]!;
	expect(urls(pagesToCapture(looks, current, sizeOf))).toEqual(['black-5x7', 'cream-9x12']);
});

test('with more sizes than looks, adds pages for the sizes still unpriced', () => {
	const looks = [look('brown', ['20x32', '20x39', '20x48']), look('grey', ['20x32', '20x39', '20x48'])];
	const current = looks[0]!.combos[0]!;
	expect(urls(pagesToCapture(looks, current, sizeOf))).toEqual(['grey-20x39', 'brown-20x48']);
});

test('a look sold only in sizes already covered is captured at the size of the first page', () => {
	const looks = [look('navy', ['5x7', '8x10']), look('sand', ['8x10'])];
	const current = looks[0]!.combos[1]!;
	const pages = pagesToCapture(looks, current, sizeOf);
	expect(urls(pages)).toEqual(['sand-8x10', 'navy-5x7']);
	expect(pages.map(p => p.look.id)).toEqual(['sand', 'navy']);
});
