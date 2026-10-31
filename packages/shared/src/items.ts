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
	// Served by the API under /api/assets/<id>/.
	image: string | null;
	model: string | null;
};

// One copy of a catalog item in the apartment. World units are feet, +x east, +z south.
export type Placement = {
	key: string;
	itemId: string;
	x: number;
	z: number;
	// 0 faces south (the model's +z front), 90 faces east.
	rotationDeg: number;
	elevationIn: number;
	// GLB node names to drop, e.g. a TV stand when wall mounting.
	removeNodes?: string[];
};
