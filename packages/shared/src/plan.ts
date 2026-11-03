import { CEILING_FT, columns, finishAreasIn, fixtures, ft, rooms, tvWallFace, walls, type Rect } from './floorplan';

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
	// Where the TV hangs: the middle of the TV wall's measured span on its living-room face, before any wall texture.
	tvMount: { x: number; z: number };
	// The switch, outlets, data jack and smoke alarm on the TV wall, which move out onto any wall texture there. `rect`
	// is their footprint against the bare wall, `y` the bottom edge, `color` 0xRRGGBB.
	tvWallDevices: { rect: Rect; y: number; height: number; color: number }[];
};

const round = (n: number) => Math.round(n * 1000) / 1000;
const toFeet = (rect: Rect) => rect.map(px => round(ft(px))) as Rect;

export function planGeometry(): PlanGeometry {
	const column = columns[0]!;
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
		tvMount: { x: round(ft(tvWallFace.x)), z: round(ft(tvWallFace.y2) - finishAreasIn.tvWall.width / 24) },
		tvWallDevices: fixtures
			.filter(f => f.tvWall)
			.map(f => ({ rect: toFeet(f.rect), y: f.y ?? 0, height: f.height, color: f.color })),
	};
}
