import {
	balconyGlassFace,
	CEILING_FT,
	columns,
	finishAreasIn,
	fixtures,
	ft,
	rooms,
	tvWallFace,
	walls,
	type Rect,
} from './floorplan';
import type { TvPlacement, TvSettings } from './items';

// A spot the TV can hang at, in plan feet: the point on the bare wall behind the screen's center and the way the screen
// faces, as Placement.rotation[1] (-90 west, 90 east, 180 north). `onBackWall` spots move out with a wall texture on the back
// wall. A `corner` spot is the corner itself, and the TV stands out from it until its back edges clear both walls.
export type TvSpot = { x: number; z: number; yaw: number; onBackWall: boolean; corner: boolean };

export const TV_DEPTH_IN = 1.2;
export const TV_MOUNT_IN = 2.5;

// The floor plan as the AR app needs it, in feet (+x east, +z south): the floor footprint of every wall run between
// door openings, so the outline's edges are the wall faces you can line up against in the room.
export type PlanGeometry = {
	walls: { rect: Rect; glass: boolean }[];
	columns: { x: number; z: number; radius: number }[];
	rooms: { name: string; rect: Rect }[];
	ceiling: number;
	// Surfaces a wall texture can cover (see the wallTexture fixture): the TV wall's living-room face, a plane at `x` facing west
	// from z1 to z2, and the column the sleeve wraps.
	finishSurfaces: {
		tvWall: { x: number; z1: number; z2: number };
		column: { x: number; z: number; radius: number };
	};
	tvSpots: Record<TvPlacement, TvSpot>;
	// The switch, outlets, data jack and smoke alarm on the TV wall, which move out onto any wall texture there. `rect`
	// is their footprint against the bare wall, `y` the bottom edge, `color` 0xRRGGBB.
	tvWallDevices: { rect: Rect; y: number; height: number; color: number }[];
};

const round = (n: number) => Math.round(n * 1000) / 1000;
const toFeet = (rect: Rect) => rect.map(px => round(ft(px))) as Rect;

// The back wall is the TV wall; the pillar wall is the south wall the column stands against, whose solid pier meets the
// back wall at the corner.
const column = columns[0]!;
const backX = round(ft(tvWallFace.x));
const pillarZ = round(ft(tvWallFace.y2));
export const tvSpots: Record<TvPlacement, TvSpot> = {
	backWall: {
		x: backX,
		z: round(ft(tvWallFace.y2) - finishAreasIn.tvWall.width / 24),
		yaw: -90,
		onBackWall: true,
		corner: false,
	},
	pillarWall: {
		x: round(ft((column.x + column.r + tvWallFace.x) / 2)),
		z: pillarZ,
		yaw: 180,
		onBackWall: false,
		corner: false,
	},
	corner: { x: backX, z: pillarZ, yaw: -135, onBackWall: true, corner: true },
	balconyWindow: {
		x: round(ft(balconyGlassFace.x)),
		z: round(ft((balconyGlassFace.y1 + balconyGlassFace.y2) / 2)),
		yaw: 90,
		onBackWall: false,
		corner: false,
	},
};

// The TV body's center in plan feet and its yaw in degrees. `backWallDepthFt` is how far a wall texture stands out from
// the back wall. Tilting about the center swings the bottom edge toward the wall, so the mount holds it out by that much.
export function tvPose(tv: TvSettings, backWallDepthFt: number) {
	const spot = tvSpots[tv.placement];
	const out =
		(TV_MOUNT_IN + TV_DEPTH_IN / 2 + (spot.corner ? tv.widthIn / 2 : 0)) / 12 +
		(tv.heightIn / 24) * Math.sin((tv.tiltDeg * Math.PI) / 180);
	const yaw = (spot.yaw * Math.PI) / 180;
	return {
		x: spot.x - (spot.onBackWall ? backWallDepthFt : 0) + out * Math.sin(yaw),
		y: tv.centerIn / 12,
		z: spot.z + out * Math.cos(yaw),
		yaw: spot.yaw,
	};
}

export function planGeometry(): PlanGeometry {
	return {
		walls: walls.flatMap(({ line: [x1, y1, x2, y2], thickness = 10, gaps = [], glass = false }) => {
			const horizontal = y1 === y2;
			const fixed = horizontal ? y1 : x1;
			const half = thickness / 2;
			let cursor = horizontal ? Math.min(x1, x2) : Math.min(y1, y2);
			const end = horizontal ? Math.max(x1, x2) : Math.max(y1, y2);
			const runs: [number, number][] = [];
			for (const [from, to] of [...gaps].sort((a, b) => a[0] - b[0])) {
				runs.push([cursor, from]);
				cursor = to;
			}
			runs.push([cursor, end]);
			return runs
				.filter(([a, b]) => b - a >= 1)
				.map(([a, b]) => ({
					rect: toFeet(horizontal ? [a, fixed - half, b, fixed + half] : [fixed - half, a, fixed + half, b]),
					glass,
				}));
		}),
		columns: columns.map(c => ({ x: round(ft(c.x)), z: round(ft(c.y)), radius: round(ft(c.r)) })),
		rooms: rooms.filter(r => r.name).map(r => ({ name: r.name, rect: toFeet(r.rect) })),
		ceiling: CEILING_FT,
		finishSurfaces: {
			tvWall: { x: round(ft(tvWallFace.x)), z1: round(ft(tvWallFace.y1)), z2: round(ft(tvWallFace.y2)) },
			column: { x: round(ft(column.x)), z: round(ft(column.y)), radius: round(ft(column.r)) },
		},
		tvSpots,
		tvWallDevices: fixtures
			.filter(f => f.tvWall)
			.map(f => ({ rect: toFeet(f.rect), y: f.y ?? 0, height: f.height, color: f.color })),
	};
}
