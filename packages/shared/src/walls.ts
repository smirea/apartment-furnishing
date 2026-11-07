// Where wall pieces (art, mirrors, shelves) can hang: the faces of the solid walls that look into a room of the
// apartment, and the spot on one of them nearest to where a piece is dragged.
import { ft, rooms, type Rect } from './floorplan';
import type { Box } from './obstacles';

// Every room of the apartment in feet; the balcony is outdoors.
export const indoorRooms: Rect[] = rooms.filter(r => r.name !== 'Balcony').map(r => r.rect.map(ft) as Rect);

// A stretch of wall face in plan feet: it lies at `at` along `axis` and runs from `from` to `to` along the other axis.
// `normal` (±1 along `axis`) points out into the room.
export type WallFace = { axis: 'x' | 'z'; at: number; from: number; to: number; normal: 1 | -1 };

const STEP_FT = 1 / 12;
// Shorter stretches are wall ends and door jambs, too narrow to hang anything on.
const MIN_FT = 1;
// How far out from a face the room is checked.
const PROBE_FT = 0.05;

const within = (x: number, z: number, [x1, z1, x2, z2]: Rect) => x > x1 && x < x2 && z > z1 && z < z2;

// The faces of `walls` with a room on their side, minus the stretches another wall covers, like where two walls meet.
export function wallFaces(walls: readonly Box[], rooms: readonly Rect[]): WallFace[] {
	const open = (x: number, z: number) =>
		rooms.some(r => within(x, z, r)) && !walls.some(w => within(x, z, [w.x1, w.z1, w.x2, w.z2]));
	const faces: WallFace[] = [];
	for (const w of walls) {
		const sides: [WallFace['axis'], number, 1 | -1, number, number][] = [
			['x', w.x1, -1, w.z1, w.z2],
			['x', w.x2, 1, w.z1, w.z2],
			['z', w.z1, -1, w.x1, w.x2],
			['z', w.z2, 1, w.x1, w.x2],
		];
		for (const [axis, at, normal, from, to] of sides) {
			const steps = Math.max(1, Math.round((to - from) / STEP_FT));
			const step = (to - from) / steps;
			let start: number | null = null;
			for (let i = 0; i <= steps; i++) {
				const s = from + (i + 0.5) * step;
				const probe = at + normal * PROBE_FT;
				const ok = i < steps && (axis === 'x' ? open(probe, s) : open(s, probe));
				if (ok && start === null) start = from + i * step;
				if (!ok && start !== null) {
					const end = from + i * step;
					if (end - start >= MIN_FT) faces.push({ axis, at, from: start, to: end, normal });
					start = null;
				}
			}
		}
	}
	return faces;
}

// The spot on a face nearest to (x, z) where a piece `width` feet wide hangs entirely on that face: the point on the
// face behind the piece's center, and its yaw (Placement.rotation[1]) facing out of the wall. A piece wider than every
// face goes to the middle of the nearest one.
export function hangOnWall(faces: readonly WallFace[], x: number, z: number, width: number) {
	let best: { x: number; z: number; yaw: number; face: WallFace; cost: number } | null = null;
	for (const face of faces) {
		const fits = face.to - face.from >= width;
		const target = face.axis === 'x' ? z : x;
		const along = fits
			? Math.min(Math.max(target, face.from + width / 2), face.to - width / 2)
			: (face.from + face.to) / 2;
		const [px, pz] = face.axis === 'x' ? [face.at, along] : [along, face.at];
		const cost = Math.hypot(px - x, pz - z) + (fits ? 0 : 1e6);
		if (best && cost >= best.cost) continue;
		const yaw = face.axis === 'x' ? face.normal * 90 : face.normal === 1 ? 0 : 180;
		best = { x: px, z: pz, yaw, face, cost };
	}
	if (!best) throw new Error('The plan has no wall faces to hang on');
	const { cost: _, ...spot } = best;
	return spot;
}
