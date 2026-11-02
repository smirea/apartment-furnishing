import { columns, ft, rooms, walls, type Rect } from './floorplan';

// The floor plan as the AR app needs it, in feet (+x east, +z south): the floor footprint of every wall run between
// door openings, so the outline's edges are the wall faces you can line up against in the room.
export type PlanGeometry = {
	walls: { rect: Rect; glass: boolean }[];
	columns: { x: number; z: number; radius: number }[];
	rooms: { name: string; rect: Rect }[];
};

const round = (n: number) => Math.round(n * 1000) / 1000;
const toFeet = (rect: Rect) => rect.map(px => round(ft(px))) as Rect;

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
	};
}
