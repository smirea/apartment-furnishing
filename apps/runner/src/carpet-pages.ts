// Which listing pages a rug import captures, kept apart from the import so it can be tested without the runner's tools.
import type { PageData, Variations } from './catalog';

export type Combo = Variations['combos'][number];

// One look's combinations, and the page its photos come from, while importing.
export type Look = { id: string; name: string; combos: Combo[]; url: string; page: PageData | null };

// Which pages to capture so each look's photos and every size's prices get seen. A captured page shows each look's
// price at that page's size, so the extra pages spread across the sizes the first page didn't show.
export function pagesToCapture(looks: Look[], current: Combo, sizeOf: (c: Combo) => string | null) {
	const unpriced = new Set(looks.flatMap(l => l.combos.map(sizeOf)).filter(s => s !== null && s !== sizeOf(current)));
	const pages: { look: Look; combo: Combo }[] = [];
	for (const look of looks) {
		if (look.combos.includes(current)) continue;
		const combo =
			look.combos.find(c => unpriced.has(sizeOf(c))) ??
			look.combos.find(c => sizeOf(c) === sizeOf(current)) ??
			look.combos[0]!;
		unpriced.delete(sizeOf(combo));
		pages.push({ look, combo });
	}
	// More sizes than looks: the rest are read from pages of looks already captured, for their prices only.
	for (const size of unpriced) {
		const combo = looks.flatMap(l => l.combos).find(c => sizeOf(c) === size);
		if (combo) pages.push({ look: looks.find(l => l.combos.includes(combo))!, combo });
	}
	return pages;
}
