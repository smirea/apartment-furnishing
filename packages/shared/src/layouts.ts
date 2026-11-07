// A layout is one arrangement of the apartment: its placements, fixture picks, TV, carpets on the floor, and the
// products deleted from it. Imported products belong to every layout.
export type Layout = { id: string; name: string };

// `active` is the layout a client that names none gets, like the AR app: the one last picked in the web plan.
export type LayoutList = { active: string; layouts: Layout[] };

// The web plan names its layout on every request, so a save still in flight when it switches lands where it was made.
export const LAYOUT_HEADER = 'x-layout';

// The first migration put the apartment as it was into this layout.
export const FIRST_LAYOUT = 'main';

// Two links to the same listing, like an Amazon URL with or without its slug and tracking query, share a key.
export function productKey(url: string) {
	const u = new URL(url);
	const id =
		u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] ?? u.pathname.match(/\/ip\/(?:[^/]+\/)?(\d+)/)?.[1];
	return `${u.hostname.replace(/^www\./, '')}:${id ?? u.pathname}`;
}
