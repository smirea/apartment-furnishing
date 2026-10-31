// Product data is written by `bun scripts/import-item.ts <url>` into ./catalog/<id>.json.
// This file only decides where catalog items go in the apartment.
export type Facing = 'north' | 'south' | 'east' | 'west';

export type CatalogItem = {
	id: string;
	url: string;
	importedAt: string;
	name: string;
	brand: string | null;
	price: number | null;
	currency: string;
	category: string;
	// Inches; width runs side to side as seen from the front.
	dimensions: { width: number; height: number; depth: number } | null;
	dimensionsNote: string | null;
	weightLb: number | null;
	summary: string;
	highlights: string[];
	image: string | null;
	model: string | null;
};

export type Placement = {
	id: string;
	// Plan pixel coordinates (see floorplan.ts) of the item's footprint center.
	at: [x: number, y: number];
	facing: Facing;
	elevationIn?: number;
	// GLB node names to drop, e.g. a TV stand when wall mounting.
	removeNodes?: string[];
};

export const catalog: Record<string, CatalogItem> = Object.fromEntries(
	Object.values(import.meta.glob<CatalogItem>('./catalog/*.json', { eager: true, import: 'default' })).map(item => [
		item.id,
		item,
	]),
);

export const placements: Placement[] = [
	// On the solid living/bedroom-2 wall where the floor plan draws a media console.
	{
		id: 'samsung-85-m70hb-mini-led-4k-smart-tv',
		at: [570, 765],
		facing: 'west',
		elevationIn: 30,
		removeNodes: ['StandEntity'],
	},
];

for (const p of placements) if (!catalog[p.id]) throw new Error(`Placement references unknown catalog item "${p.id}"`);
