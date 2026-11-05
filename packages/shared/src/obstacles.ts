export type Box = { x1: number; z1: number; x2: number; z2: number };
export type Segment = [x1: number, z1: number, x2: number, z2: number];
export type Circle = { x: number; z: number; r: number };
export type Obstacles = { boxes: readonly Box[]; circles: readonly Circle[]; segments: readonly Segment[] };

const EPS = 1e-6;

// How far along the floor path from a to b, as a fraction, before it runs into an obstacle; 1 when the path is clear.
// A path that starts inside a box or circle ignores it, so a point dropped on top of a wall can still be measured from.
// Running along a box's face doesn't count as entering it.
export function clearFraction(ax: number, az: number, bx: number, bz: number, { boxes, circles, segments }: Obstacles) {
	const dx = bx - ax;
	const dz = bz - az;
	let t = 1;
	for (const b of boxes) {
		let enter = -Infinity;
		let exit = Infinity;
		for (const [p, d, lo, hi] of [
			[ax, dx, b.x1, b.x2],
			[az, dz, b.z1, b.z2],
		] as const) {
			if (Math.abs(d) < EPS) {
				if (p <= lo || p >= hi) enter = Infinity;
				continue;
			}
			const t1 = (lo - p) / d;
			const t2 = (hi - p) / d;
			enter = Math.max(enter, Math.min(t1, t2));
			exit = Math.min(exit, Math.max(t1, t2));
		}
		if (enter < exit && enter >= -EPS && exit > EPS && enter < t) t = Math.max(enter, 0);
	}
	const a = dx * dx + dz * dz;
	for (const c of circles) {
		if (a < EPS) break;
		const fx = ax - c.x;
		const fz = az - c.z;
		const b = fx * dx + fz * dz;
		const disc = b * b - a * (fx * fx + fz * fz - c.r * c.r);
		if (disc <= 0) continue;
		const enter = (-b - Math.sqrt(disc)) / a;
		const exit = (-b + Math.sqrt(disc)) / a;
		if (enter >= -EPS && exit > EPS && enter < t) t = Math.max(enter, 0);
	}
	for (const [sx1, sz1, sx2, sz2] of segments) {
		const ex = sx2 - sx1;
		const ez = sz2 - sz1;
		const denom = dx * ez - dz * ex;
		if (Math.abs(denom) < EPS) continue;
		const along = ((sx1 - ax) * ez - (sz1 - az) * ex) / denom;
		const on = ((sx1 - ax) * dz - (sz1 - az) * dx) / denom;
		if (along > EPS && along < t && on >= 0 && on <= 1) t = along;
	}
	return t;
}
