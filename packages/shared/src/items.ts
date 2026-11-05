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

export type Job = { state: 'queued' } | { state: 'running' } | { state: 'failed'; error: string };

// What GET /api/catalog returns: the stored item plus any in-flight model generation.
export type CatalogEntry = CatalogItem & { modelJob: Job | null };

// One copy of a catalog item in the apartment. World units are feet, +x east, +z south,
// y is the height of the item's bottom. The model's front is +z before rotation.
export type Placement = {
	key: string;
	itemId: string;
	position: [x: number, y: number, z: number];
	// Euler XYZ in degrees; y = 90 faces east, -90 west, 180 north.
	rotation: [x: number, y: number, z: number];
};

// A wall-panel product (wood slats and the like) imported for the living room's TV wall and column. Codex turns the
// listing photos into a seamless tile; three.js repeats it at real scale over whichever surfaces use it.
export type WallTexture = {
	id: string;
	url: string;
	importedAt: string;
	name: string;
	brand: string | null;
	// Per listing, which may be a pack of several panels.
	price: number | null;
	currency: string;
	panelsPerPack: number;
	// One panel as installed, in inches; height runs floor to ceiling for vertical slats.
	panel: { width: number; height: number; depth: number } | null;
	summary: string;
	// Product type the swatches group under, e.g. "Ultralight slats" or "Hexagon tiles"; one grok call names them
	// across the whole collection so colorways of a line land together.
	group: string | null;
	image: string | null;
	texture: {
		map: string;
		normalMap: string;
		// Inches of wall one copy of the tile covers.
		repeat: { width: number; height: number };
		depthIn: number;
		note: string;
	} | null;
};

export type WallTextureEntry = WallTexture & { textureJob: Job | null };

export type FinishSurface = 'tvWall' | 'column';

// Panels to buy for a surface. Full-height columns of panels across the width; when the panel is shorter than the
// surface, the strips that top up each column are cut from shared panels.
export function panelsNeeded(panel: { width: number; height: number }, area: { width: number; height: number }) {
	const columns = Math.ceil(area.width / panel.width);
	const full = Math.floor(area.height / panel.height);
	const rest = area.height - full * panel.height;
	if (rest < 0.5) return columns * full;
	return columns * full + Math.ceil(columns / Math.floor(panel.height / rest));
}

// Where the living-room TV hangs: centered on the back (TV) wall's measured span, on the pillar wall centered between
// the column and the back wall, or across the corner where those two walls meet.
export const TV_PLACEMENTS = { backWall: 'Back wall', pillarWall: 'Pillar wall', corner: 'Corner' } as const;
export type TvPlacement = keyof typeof TV_PLACEMENTS;
export const isTvPlacement = (value: unknown): value is TvPlacement =>
	typeof value === 'string' && Object.hasOwn(TV_PLACEMENTS, value);

// The living-room TV, always wall-mounted. Width and height are the source of truth; the diagonal and the aspect ratio
// are derived from them.
export type TvSettings = {
	visible: boolean;
	placement: TvPlacement;
	widthIn: number;
	heightIn: number;
	// Height of the screen's center above the floor.
	centerIn: number;
	// Forward tilt of the mount, top away from the wall.
	tiltDeg: number;
};

export const TV_RATIOS = [
	[16, 9],
	[21, 9],
	[4, 3],
] as const;

export const tvDiagonal = (tv: Pick<TvSettings, 'widthIn' | 'heightIn'>) => Math.hypot(tv.widthIn, tv.heightIn);

export function tvSize(diagonalIn: number, [w, h]: readonly [number, number]) {
	const k = diagonalIn / Math.hypot(w, h);
	return { widthIn: k * w, heightIn: k * h };
}

export const DEFAULT_TV: TvSettings = {
	visible: true,
	placement: 'backWall',
	...tvSize(98, [16, 9]),
	centerIn: 48,
	tiltDeg: 0,
};

// A TV whose size was read off a product page, kept so the TV panel can switch between candidates.
export type TvModel = { id: string; url: string; importedAt: string; name: string; widthIn: number; heightIn: number };
