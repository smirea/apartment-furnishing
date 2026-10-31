export type Mount = 'floor' | 'wall' | 'ceiling' | 'surface';

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
	// How the item sits in a room, decided at import: drives snapping and the default height.
	mount: Mount;
	defaultElevationIn: number;
	// GLB node names to drop for that mount, e.g. a TV stand when wall mounted.
	removeNodes: string[];
	// Served by the API under /api/assets/<id>/.
	image: string | null;
	model: string | null;
	// `generated` models are procedural approximations Codex builds from the product photo when the listing has none.
	modelSource: 'listing' | 'generated' | null;
};

export type ModelJob = { state: 'running' } | { state: 'failed'; error: string };

// What GET /api/catalog returns: the stored item plus any in-flight model generation.
export type CatalogEntry = CatalogItem & { modelJob: ModelJob | null };

// One copy of a catalog item in the apartment. World units are feet, +x east, +z south,
// y is the height of the item's bottom. The model's front is +z before rotation.
export type Placement = {
	key: string;
	itemId: string;
	position: [x: number, y: number, z: number];
	// Euler XYZ in degrees; y = 90 faces east, -90 west, 180 north.
	rotation: [x: number, y: number, z: number];
};
