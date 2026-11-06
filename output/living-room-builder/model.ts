// Inches. x grows east from the west glass, y grows north from the south glass. Headings are compass degrees
// for the direction a piece faces (0 = north, 90 = east), so a sofa watching the TV wall has rot 90.
// Fixed geometry: tape measures from README.md where they exist, otherwise the floorplan trace in
// packages/shared/src/floorplan.ts at 23.7 px/ft (0.506 in/px) measured from the west and south glass lines.

export type Vec = { x: number; y: number };
export type Poly = Vec[];
export type Rect = [x1: number, y1: number, x2: number, y2: number];

export const ROOM = {
	w: 199, // 16'7" west glass to TV wall
	d: 204, // 17'0" south glass to the end of the kitchen counter
	ceiling: 120,
	column: { x: 61.5, y: 20.5, r: 16.5 }, // 33" across, west edge 3'9" from the glass; y from the trace
	island: [78, 195.4, 149, 236.4] as Rect, // 71" x 41", south face 13'3" north of the column
	counter: [0, 204, 35, 300] as Rect, // west kitchen counter run, its end is where the 17'0" was taped to
	southGlassEnd: 146, // south wall is glass x 0..146, solid x 146..199
	balconyDoor: [144, 185] as [number, number], // on the west glass, swings out onto the balcony
	tvWall: { x: 199, y1: 0, y2: 122 }, // measured 122" solid face
	landing: [199, 122, 300, 175] as Rect, // office / guest landing opening off the living room
	bathDoor: [180, 215] as [number, number], // bath 2 door on the east side, north of the landing stub
	switchPlate: { y: 115.5, z1: 45, z2: 49.5 }, // light switch 6.5" from the north end of the TV wall
	smoke: { y: 94, z: 105 },
	outlet: { y: 63, z: 16 },
	eyeZ: 40, // seated eye height
	kitchenEntry: { x: 175, y: 262 }, // kitchen aisle east of the island, on the way in from the entry hall
};

// The owner's cap (2026-11-05).
export const MAX_TV_DIAG = 98;

export const MOUNT_WALLS = [
	{ name: 'TV wall (east)', a: { x: 199, y: 0 }, b: { x: 199, y: 122 }, heading: 270 },
	{ name: 'South solid return', a: { x: 146, y: 0 }, b: { x: 199, y: 0 }, heading: 0 },
];

type Base = { id: string; label?: string; x: number; y: number; rot: number };
export type Leg = { length: number; width?: number; kind: 'seats' | 'chaise'; seats: number; corner?: boolean };
export type Seating = Base & {
	type: 'seating';
	length: number;
	depth: number;
	arm: number;
	seats: number;
	back?: number;
	eye?: number;
	left?: Leg;
	right?: Leg;
	recline?: number;
};
export type Tv = Base & { type: 'tv'; diag: number; mount: 'wall' | 'stand'; center: number; thickness?: number };
export type Console = Base & { type: 'console'; w: number; d: number; h: number; floating?: boolean };
export type Table = Base & {
	type: 'table';
	role: 'coffee' | 'side' | 'ottoman';
	w: number;
	d: number;
	h: number;
	shape: 'rect' | 'oval' | 'round';
};
export type Rug = Base & { type: 'rug'; w: number; d: number };
// A reading chair is decor: it takes floor and blocks walking, but it is not a TV seat.
export type Decor = Base & { type: 'decor'; kind: 'plant' | 'lamp' | 'chair'; size: number };
// Chairs sit on the long sides (`sides` per side) and the short ends of a rect table, or evenly around a round one.
// `bare` lists rect sides that get no chairs, such as one pushed against a bench or the island.
export type Dining = Base & {
	type: 'dining';
	shape: 'rect' | 'round';
	w: number;
	d: number;
	sides?: number;
	ends?: 0 | 1 | 2;
	n?: number;
	bare?: ('front' | 'back')[];
};
export type Component = Seating | Tv | Console | Table | Rug | Decor | Dining;
// `room.balconyDoor: false` treats the balcony door as glass: no route to it, and furniture may stand in front of it.
export type Layout = {
	id: string;
	title: string;
	notes?: string[];
	room?: { balconyDoor?: boolean };
	components: Component[];
};

export const tvSize = (diag: number) => ({
	w: (diag * 16) / Math.hypot(16, 9) + 1,
	h: (diag * 9) / Math.hypot(16, 9) + 1,
	screenW: (diag * 16) / Math.hypot(16, 9),
});

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Vec) => Math.hypot(a.x, a.y);
const angleBetween = (a: Vec, b: Vec) =>
	deg(Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (len(a) * len(b) || 1)))));

export function frame(c: Base) {
	const h = rad(c.rot);
	const f = { x: Math.sin(h), y: Math.cos(h) };
	const r = { x: Math.cos(h), y: -Math.sin(h) };
	const pt = (lx: number, ly: number): Vec => ({ x: c.x + lx * r.x + ly * f.x, y: c.y + lx * r.y + ly * f.y });
	const dir = (lx: number, ly: number): Vec => ({ x: lx * r.x + ly * f.x, y: lx * r.y + ly * f.y });
	const rect = (x1: number, y1: number, x2: number, y2: number): Poly => [
		pt(x1, y1),
		pt(x2, y1),
		pt(x2, y2),
		pt(x1, y2),
	];
	return { pt, dir, rect, f };
}

// Knees and feet need this much clear floor in front of a seat cushion; a coffee table may start right after it.
export const LEGROOM = 13;

export type Seat = {
	comp: string;
	n: number;
	eye: Vec;
	facing: Vec;
	front: Vec;
	cushion: Poly;
	legroom?: Poly;
	width: number;
	kind: 'main' | 'corner' | 'leg' | 'chaise';
};

export function seatingShape(c: Seating) {
	const A = c.length,
		D = c.depth,
		back = c.back ?? 9,
		eye = c.eye ?? 18;
	const H = Math.max(D, c.left?.length ?? 0, c.right?.length ?? 0);
	const bk = -H / 2;
	const wL = c.left ? (c.left.width ?? D) : 0;
	const wR = c.right ? (c.right.width ?? D) : 0;
	const local = { A, D, H, bk, wL, wR, back, eye };
	const rects: Rect[] = [[-A / 2, bk, A / 2, bk + D]];
	if (c.left) rects.push([-A / 2, bk, -A / 2 + wL, bk + c.left.length]);
	if (c.right) rects.push([A / 2 - wR, bk, A / 2, bk + c.right.length]);
	const outline: [number, number][] = [
		[-A / 2, bk],
		[A / 2, bk],
	];
	if (c.right) outline.push([A / 2, bk + c.right.length], [A / 2 - wR, bk + c.right.length], [A / 2 - wR, bk + D]);
	else outline.push([A / 2, bk + D]);
	if (c.left) outline.push([-A / 2 + wL, bk + D], [-A / 2 + wL, bk + c.left.length], [-A / 2, bk + c.left.length]);
	else outline.push([-A / 2, bk + D]);
	const backs: Rect[] = [[-A / 2, bk, A / 2, bk + back]];
	const arms: Rect[] = [];
	if (!c.left) arms.push([-A / 2, bk, -A / 2 + c.arm, bk + D]);
	else if (c.left.kind === 'seats') {
		backs.push([-A / 2, bk, -A / 2 + back, bk + c.left.length]);
		arms.push([-A / 2, bk + c.left.length - c.arm, -A / 2 + wL, bk + c.left.length]);
	} else arms.push([-A / 2, bk, -A / 2 + c.arm, bk + c.left.length]);
	if (!c.right) arms.push([A / 2 - c.arm, bk, A / 2, bk + D]);
	else if (c.right.kind === 'seats') {
		backs.push([A / 2 - back, bk, A / 2, bk + c.right.length]);
		arms.push([A / 2 - wR, bk + c.right.length - c.arm, A / 2, bk + c.right.length]);
	} else arms.push([A / 2 - c.arm, bk, A / 2, bk + c.right.length]);
	return { local, rects, outline, backs, arms };
}

export function seatsOf(c: Seating): Seat[] {
	const F = frame(c);
	const { local, rects } = seatingShape(c);
	void rects;
	const { A, D, bk, wL, wR, back, eye } = local;
	const out: Omit<Seat, 'n'>[] = [];
	const mk = (
		kind: Seat['kind'],
		r: Rect,
		e: [number, number],
		fdir: [number, number],
		frontDist: number,
		leg: Rect | null,
	) => {
		const facing = F.dir(fdir[0], fdir[1]);
		const fl = len(facing);
		const nf = { x: facing.x / fl, y: facing.y / fl };
		const eyeW = F.pt(e[0], e[1]);
		out.push({
			comp: c.id,
			kind,
			eye: eyeW,
			facing: nf,
			front: { x: eyeW.x + nf.x * frontDist, y: eyeW.y + nf.y * frontDist },
			cushion: F.rect(...r),
			legroom: leg ? F.rect(...leg) : undefined,
			width: Math.max(Math.abs(r[2] - r[0]), Math.abs(r[3] - r[1])) > 0 ? seatWidth(kind, r) : 0,
		});
	};
	const seatWidth = (kind: Seat['kind'], r: Rect) => (kind === 'leg' ? Math.abs(r[3] - r[1]) : Math.abs(r[2] - r[0]));
	const legSide = (side: 'left' | 'right') => {
		const leg = c[side];
		if (!leg) return;
		const s = side === 'left' ? -1 : 1;
		const outer = (s * A) / 2;
		const w = side === 'left' ? wL : wR;
		if (leg.kind === 'chaise') {
			const x1 = side === 'left' ? outer + c.arm : outer - w;
			const x2 = side === 'left' ? outer + w : outer - c.arm;
			mk('chaise', [x1, bk + back, x2, bk + leg.length], [(x1 + x2) / 2, bk + eye], [0, 1], leg.length - eye + 8, null);
			return;
		}
		if (leg.corner) {
			const x1 = side === 'left' ? outer + back : outer - w;
			const x2 = side === 'left' ? outer + w : outer - back;
			mk(
				'corner',
				[x1, bk + back, x2, bk + D],
				[outer - s * eye * 0.85, bk + eye * 0.85],
				[-s, 1],
				(D - eye * 0.85) * Math.SQRT2 + 10,
				side === 'left'
					? [outer + w, bk + D, outer + w + LEGROOM, bk + D + LEGROOM]
					: [outer - w - LEGROOM, bk + D, outer - w, bk + D + LEGROOM],
			);
		}
		const y0 = bk + D,
			y1 = bk + leg.length - c.arm;
		const n = Math.max(1, leg.seats);
		const step = (y1 - y0) / n;
		for (let i = 0; i < n; i++) {
			const ya = y0 + i * step,
				yb = ya + step;
			const x1 = side === 'left' ? outer + back : outer - w;
			const x2 = side === 'left' ? outer + w : outer - back;
			mk(
				'leg',
				[x1, ya, x2, yb],
				[outer - s * eye, (ya + yb) / 2],
				[-s, 0],
				w - eye + 8,
				side === 'left' ? [outer + w, ya, outer + w + LEGROOM, yb] : [outer - w - LEGROOM, ya, outer - w, yb],
			);
		}
	};
	const x0 = -A / 2 + (c.left ? wL : c.arm);
	const x1 = A / 2 - (c.right ? wR : c.arm);
	const n = Math.max(1, c.seats);
	const step = (x1 - x0) / n;
	const main: Omit<Seat, 'n'>[] = [];
	for (let i = 0; i < n; i++) {
		const xa = x0 + i * step,
			xb = xa + step;
		mk('main', [xa, bk + back, xb, bk + D], [(xa + xb) / 2, bk + eye], [0, 1], D - eye + 8, [
			xa,
			bk + D,
			xb,
			bk + D + LEGROOM,
		]);
		main.push(out.pop()!);
	}
	legSide('left');
	const leftSeats = out.splice(0);
	legSide('right');
	const rightSeats = out.splice(0);
	return [...leftSeats.reverse(), ...main, ...rightSeats].map((s, i) => ({ ...s, n: i + 1 }));
}

// A seated diner takes 24" behind the table edge; pushing the chair back to stand needs 32–36".
export const CHAIR = { w: 20, seated: 24, tight: 32, comfy: 36 };

export type Chair = { n: number; zone: Poly; edge: Vec; out: Vec; side: Vec };

export function diningChairs(c: Dining): Chair[] {
	const F = frame(c);
	const out: Omit<Chair, 'n'>[] = [];
	const add = (edgeL: [number, number], outL: [number, number]) => {
		const o = F.dir(outL[0], outL[1]);
		const side = { x: -o.y, y: o.x };
		const e = F.pt(edgeL[0], edgeL[1]);
		const hw = CHAIR.w / 2;
		const at = (along: number, dist: number): Vec => ({
			x: e.x + side.x * along + o.x * dist,
			y: e.y + side.y * along + o.y * dist,
		});
		out.push({ zone: [at(-hw, 0), at(hw, 0), at(hw, CHAIR.seated), at(-hw, CHAIR.seated)], edge: e, out: o, side });
	};
	if (c.shape === 'round') {
		const n = c.n ?? 4,
			r = c.w / 2;
		for (let i = 0; i < n; i++) {
			const a = (2 * Math.PI * i) / n;
			add([Math.sin(a) * r, Math.cos(a) * r], [Math.sin(a), Math.cos(a)]);
		}
	} else {
		const k = c.sides ?? 2;
		for (const [side, ly] of [
			['front', c.d / 2],
			['back', -c.d / 2],
		] as const) {
			if (c.bare?.includes(side)) continue;
			for (let i = 0; i < k; i++) add([-c.w / 2 + (c.w * (i + 0.5)) / k, ly], [0, Math.sign(ly)]);
		}
		const ends = c.ends ?? 0;
		if (ends >= 1) add([c.w / 2, 0], [1, 0]);
		if (ends >= 2) add([-c.w / 2, 0], [-1, 0]);
	}
	return out.map((ch, i) => ({ ...ch, n: i + 1 }));
}

export type Piece = { comp: string; type: Component['type']; label: string; poly: Poly; solid: boolean };

export function pieces(c: Component): Piece[] {
	const F = frame(c);
	const label = c.label ?? c.id;
	const p = (poly: Poly, solid = true): Piece => ({ comp: c.id, type: c.type, label, poly, solid });
	switch (c.type) {
		case 'seating':
			return seatingShape(c).rects.map(r => p(F.rect(...r)));
		case 'tv': {
			const { w } = tvSize(c.diag);
			const t = c.thickness ?? (c.mount === 'wall' ? 5 : 3);
			return [p(F.rect(-w / 2, -t, w / 2, 0))];
		}
		case 'console':
			return [p(F.rect(-c.w / 2, -c.d / 2, c.w / 2, c.d / 2))];
		case 'table':
			return [p(F.rect(-c.w / 2, -c.d / 2, c.w / 2, c.d / 2))];
		case 'rug':
			return [p(F.rect(-c.w / 2, -c.d / 2, c.w / 2, c.d / 2), false)];
		case 'decor':
			return [p(F.rect(-c.size / 2, -c.size / 2, c.size / 2, c.size / 2))];
		case 'dining': {
			const r = c.w / 2;
			const table =
				c.shape === 'round'
					? Array.from({ length: 16 }, (_, i) => F.pt(Math.sin((i * Math.PI) / 8) * r, Math.cos((i * Math.PI) / 8) * r))
					: F.rect(-c.w / 2, -c.d / 2, c.w / 2, c.d / 2);
			return [p(table), ...diningChairs(c).map(ch => p(ch.zone))];
		}
	}
}

const rectPoly = ([x1, y1, x2, y2]: Rect): Poly => [
	{ x: x1, y: y1 },
	{ x: x2, y: y1 },
	{ x: x2, y: y2 },
	{ x: x1, y: y2 },
];

function project(poly: Poly, ax: Vec) {
	let lo = Infinity,
		hi = -Infinity;
	for (const v of poly) {
		const d = v.x * ax.x + v.y * ax.y;
		lo = Math.min(lo, d);
		hi = Math.max(hi, d);
	}
	return [lo, hi];
}

// Separating-axis overlap depth for convex polygons; > 0 means they intersect by that much.
export function overlapDepth(a: Poly, b: Poly) {
	let min = Infinity;
	for (const poly of [a, b])
		for (let i = 0; i < poly.length; i++) {
			const e = sub(poly[(i + 1) % poly.length]!, poly[i]!);
			const l = len(e) || 1;
			const ax = { x: -e.y / l, y: e.x / l };
			const [a0, a1] = project(a, ax);
			const [b0, b1] = project(b, ax);
			min = Math.min(min, Math.min(a1!, b1!) - Math.max(a0!, b0!));
		}
	return min;
}

function segDist(p: Vec, a: Vec, b: Vec) {
	const ab = sub(b, a);
	const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
	return len({ x: p.x - a.x - t * ab.x, y: p.y - a.y - t * ab.y });
}

function inside(p: Vec, poly: Poly) {
	let sign = 0;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i]!,
			b = poly[(i + 1) % poly.length]!;
		const cr = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
		if (Math.abs(cr) < 1e-9) continue;
		const s = Math.sign(cr);
		if (sign === 0) sign = s;
		else if (s !== sign) return false;
	}
	return true;
}

function segmentsCross(a: Vec, b: Vec, c: Vec, d: Vec) {
	const o = (p: Vec, q: Vec, r: Vec) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
	return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

export function segmentHitsPoly(a: Vec, b: Vec, poly: Poly) {
	if (inside(a, poly) || inside(b, poly)) return true;
	return poly.some((v, i) => segmentsCross(a, b, v, poly[(i + 1) % poly.length]!));
}

export function polyDist(a: Poly, b: Poly) {
	if (overlapDepth(a, b) > 0) return -overlapDepth(a, b);
	let d = Infinity;
	for (const [p, q] of [
		[a, b],
		[b, a],
	] as const)
		for (const v of p) for (let i = 0; i < q.length; i++) d = Math.min(d, segDist(v, q[i]!, q[(i + 1) % q.length]!));
	return d;
}

export function polyCircleDist(a: Poly, c: { x: number; y: number; r: number }) {
	if (inside(c, a)) return -c.r;
	let d = Infinity;
	for (let i = 0; i < a.length; i++) d = Math.min(d, segDist(c, a[i]!, a[(i + 1) % a.length]!));
	return d - c.r;
}

// ---------- walking clearance grid ----------

const G = { x0: -61, y0: 0, x1: 300, y1: 300 }; // 1" cells
const GW = G.x1 - G.x0,
	GH = G.y1 - G.y0;

const domain = (door: boolean): Rect[] => [
	[0, 0, ROOM.w, ROOM.d],
	[35, ROOM.d, ROOM.w, G.y1],
	...(door ? ([[-61, 2, 0, 204]] as Rect[]) : []), // balcony, reached only through the door gap
	ROOM.landing,
	[199, ROOM.bathDoor[0], 300, ROOM.bathDoor[1]],
];
const fixedBlocks = (door: boolean): Rect[] => [
	ROOM.island,
	...(door
		? ([
				[-0.5, 0, 0.5, ROOM.balconyDoor[0]],
				[-0.5, ROOM.balconyDoor[1], 0.5, 204],
			] as Rect[])
		: ([[-0.5, 0, 0.5, 204]] as Rect[])),
	[199, 175, 300, ROOM.bathDoor[0]],
];

export const TARGETS = [
	{ key: 'office', name: 'Office / guest door', at: { x: 262, y: 150 }, min: 32, good: 36 },
	{ key: 'bath', name: 'Bath 2 door', at: { x: 262, y: 197 }, min: 28, good: 32 },
	{ key: 'balcony', name: 'Balcony door', at: { x: -30, y: 164 }, min: 28, good: 32 },
] as const;

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
	let k = 0;
	v[0] = 0;
	z[0] = -Infinity;
	z[1] = Infinity;
	for (let q = 1; q < n; q++) {
		let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
		while (s <= z[k]!) {
			k--;
			s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
		}
		k++;
		v[k] = q;
		z[k] = s;
		z[k + 1] = Infinity;
	}
	k = 0;
	for (let q = 0; q < n; q++) {
		while (z[k + 1]! < q) k++;
		d[q] = (q - v[k]!) * (q - v[k]!) + f[v[k]!]!;
	}
}

function clearanceGrid(solids: Poly[], door = true) {
	const blocked = new Uint8Array(GW * GH).fill(1);
	const mark = (r: Rect, val: 0 | 1) => {
		for (let y = Math.max(0, Math.floor(r[1] - G.y0)); y < Math.min(GH, Math.ceil(r[3] - G.y0)); y++)
			for (let x = Math.max(0, Math.floor(r[0] - G.x0)); x < Math.min(GW, Math.ceil(r[2] - G.x0)); x++) {
				const cx = x + G.x0 + 0.5,
					cy = y + G.y0 + 0.5;
				if (cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3]) blocked[y * GW + x] = val;
			}
	};
	for (const r of domain(door)) mark(r, 0);
	for (const r of fixedBlocks(door)) mark(r, 1);
	const col = ROOM.column;
	const all = [...solids];
	for (const poly of all) {
		const xs = poly.map(p => p.x),
			ys = poly.map(p => p.y);
		for (
			let y = Math.max(0, Math.floor(Math.min(...ys) - G.y0));
			y < Math.min(GH, Math.ceil(Math.max(...ys) - G.y0));
			y++
		)
			for (
				let x = Math.max(0, Math.floor(Math.min(...xs) - G.x0));
				x < Math.min(GW, Math.ceil(Math.max(...xs) - G.x0));
				x++
			)
				if (inside({ x: x + G.x0 + 0.5, y: y + G.y0 + 0.5 }, poly)) blocked[y * GW + x] = 1;
	}
	for (let y = 0; y < 45; y++)
		for (let x = 0; x < 140; x++) {
			const cx = x + G.x0 + 0.5,
				cy = y + G.y0 + 0.5;
			if (Math.hypot(cx - col.x, cy - col.y) <= col.r) blocked[y * GW + x] = 1;
		}
	// Squared distance to the nearest blocked cell, with everything outside the grid blocked.
	const INF = 1e12;
	const tmp = new Float64Array(GW * GH);
	const n = Math.max(GW, GH) + 2;
	const f = new Float64Array(n),
		d = new Float64Array(n),
		v = new Int32Array(n),
		z = new Float64Array(n + 1);
	for (let x = 0; x < GW; x++) {
		f[0] = 0;
		for (let y = 0; y < GH; y++) f[y + 1] = blocked[y * GW + x] ? 0 : INF;
		f[GH + 1] = 0;
		edt1d(f, GH + 2, d, v, z);
		for (let y = 0; y < GH; y++) tmp[y * GW + x] = d[y + 1]!;
	}
	const r = new Float32Array(GW * GH);
	for (let y = 0; y < GH; y++) {
		f[0] = 0;
		for (let x = 0; x < GW; x++) f[x + 1] = tmp[y * GW + x]!;
		f[GW + 1] = 0;
		edt1d(f, GW + 2, d, v, z);
		for (let x = 0; x < GW; x++) r[y * GW + x] = Math.max(0, Math.sqrt(d[x + 1]!) - 0.5);
	}
	return { blocked, r };
}

// Widest path from the kitchen entry: value[cell] = the narrowest clearance radius on the best route there.
function widestPaths(r: Float32Array) {
	const val = new Float32Array(GW * GH).fill(-1);
	const parent = new Int32Array(GW * GH).fill(-1);
	const heap: number[] = [];
	const hv: number[] = [];
	const push = (i: number, w: number) => {
		heap.push(i);
		hv.push(w);
		let k = heap.length - 1;
		while (k > 0) {
			const p = (k - 1) >> 1;
			if (hv[p]! >= hv[k]!) break;
			[heap[p], heap[k]] = [heap[k]!, heap[p]!];
			[hv[p], hv[k]] = [hv[k]!, hv[p]!];
			k = p;
		}
	};
	const pop = () => {
		const top = heap[0]!,
			tv = hv[0]!;
		const li = heap.pop()!,
			lv = hv.pop()!;
		if (heap.length) {
			heap[0] = li;
			hv[0] = lv;
			let k = 0;
			for (;;) {
				const a = 2 * k + 1,
					b = a + 1;
				let m = k;
				if (a < heap.length && hv[a]! > hv[m]!) m = a;
				if (b < heap.length && hv[b]! > hv[m]!) m = b;
				if (m === k) break;
				[heap[m], heap[k]] = [heap[k]!, heap[m]!];
				[hv[m], hv[k]] = [hv[k]!, hv[m]!];
				k = m;
			}
		}
		return [top, tv] as const;
	};
	const s = Math.floor(ROOM.kitchenEntry.y - G.y0) * GW + Math.floor(ROOM.kitchenEntry.x - G.x0);
	val[s] = Infinity;
	push(s, Infinity);
	const nb = [-1, 1, -GW, GW, -GW - 1, -GW + 1, GW - 1, GW + 1];
	while (heap.length) {
		const [i, w] = pop();
		if (w < val[i]!) continue;
		const x = i % GW;
		for (const o of nb) {
			const j = i + o;
			if (j < 0 || j >= GW * GH) continue;
			const xj = j % GW;
			if (Math.abs(xj - x) > 1) continue;
			const c = Math.min(w, r[j]!);
			if (c > val[j]!) {
				val[j] = c;
				parent[j] = i;
				push(j, c);
			}
		}
	}
	return { val, parent };
}

const cellOf = (p: Vec) => Math.floor(p.y - G.y0) * GW + Math.floor(p.x - G.x0);
const cellPt = (i: number): Vec => ({ x: (i % GW) + G.x0 + 0.5, y: Math.floor(i / GW) + G.y0 + 0.5 });

// Shortest walk from the kitchen entry to `t` that keeps `radius` of clearance, pulled taut for drawing.
function corridorPath(r: Float32Array, t: number, radius: number) {
	const ok = (i: number) => r[i]! >= radius - 1e-3;
	const dist = new Float32Array(GW * GH).fill(Infinity);
	const parent = new Int32Array(GW * GH).fill(-1);
	const s = cellOf(ROOM.kitchenEntry);
	const open: number[] = [s];
	dist[s] = 0;
	const nb: [number, number, number][] = [
		[-1, 0, 1],
		[1, 0, 1],
		[0, -1, 1],
		[0, 1, 1],
		[-1, -1, Math.SQRT2],
		[1, -1, Math.SQRT2],
		[-1, 1, Math.SQRT2],
		[1, 1, Math.SQRT2],
	];
	// Buckets by rounded distance keep this a cheap Dijkstra on a uniform grid.
	const buckets: number[][] = [open];
	for (let b = 0; b < buckets.length; b++) {
		const q = buckets[b];
		if (!q) continue;
		for (let k = 0; k < q.length; k++) {
			const i = q[k]!;
			if (Math.round(dist[i]!) !== b || i === t) continue;
			const x = i % GW,
				y = Math.floor(i / GW);
			for (const [dx, dy, w] of nb) {
				const nx = x + dx,
					ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
				const j = ny * GW + nx;
				if (!ok(j) && j !== t) continue;
				const nd = dist[i]! + w;
				if (nd < dist[j]!) {
					dist[j] = nd;
					parent[j] = i;
					(buckets[Math.round(nd)] ??= []).push(j);
				}
			}
		}
	}
	const cells: number[] = [];
	for (let i = t, guard = 0; i >= 0 && guard < GW * GH; guard++, i = parent[i]!) cells.push(i);
	let pinch = cells[0]!;
	for (const i of cells) if (r[i]! < r[pinch]!) pinch = i;
	const clear = (a: number, b: number) => {
		const pa = cellPt(a),
			pb = cellPt(b);
		const n = Math.ceil(len(sub(pb, pa)));
		for (let k = 1; k < n; k++) {
			const c = cellOf({ x: pa.x + ((pb.x - pa.x) * k) / n, y: pa.y + ((pb.y - pa.y) * k) / n });
			if (!ok(c)) return false;
		}
		return true;
	};
	const taut = [cells[0]!];
	let a = 0;
	while (a < cells.length - 1) {
		let b = cells.length - 1;
		while (b > a + 1 && !clear(cells[a]!, cells[b]!)) b--;
		taut.push(cells[b]!);
		a = b;
	}
	return { pts: taut.map(cellPt), pinch: cellPt(pinch), cells };
}

// ---------- evaluation ----------

export type Issue = { level: 'bad' | 'warn' | 'ok'; msg: string };
export type SeatView = Seat & {
	dist: number;
	fov: number;
	offAxis: number;
	turn: number;
	vert: number;
	rating: 'prime' | 'good' | 'side';
	access: number;
};
export type Route = {
	key: string;
	name: string;
	width: number;
	min: number;
	good: number;
	path: Vec[];
	pinch: Vec;
};
export type Evaluation = {
	issues: Issue[];
	seats: SeatView[];
	tv?: { comp: Tv; w: number; h: number; center: Vec; left: Vec; right: Vec; normal: Vec; wall?: string };
	routes: Route[];
	coffeeGap?: number;
	tvGap?: number;
	islandGap: number;
	columnGap: number;
	seatingLength: number;
	seatingArea: number;
	openRect: { w: number; d: number; rect: Rect };
	diningSeats: { comp: string; n: number; pull: number }[];
	pockets?: { area: number; count: number; largest: number; cells: Uint8Array; grid: typeof G };
	score: number;
	summary: Record<string, string | number>;
};

const rateSeat = (fov: number, off: number, turn: number): SeatView['rating'] =>
	fov >= 26 && fov <= 46 && off <= 30 && turn <= 35
		? 'prime'
		: fov >= 20 && fov <= 50 && off <= 45 && turn <= 50
			? 'good'
			: 'side';

function largestOpenRect(blockedLiving: (x: number, y: number) => boolean, w: number, h: number) {
	const heights: number[] = Array.from({ length: w }, () => 0);
	let best = { area: 0, rect: [0, 0, 0, 0] as Rect };
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) heights[x] = blockedLiving(x, y) ? 0 : heights[x] + 1;
		const stack: number[] = [];
		for (let x = 0; x <= w; x++) {
			const hx = x === w ? 0 : heights[x];
			while (stack.length && heights[stack.at(-1)!] >= hx) {
				const top = stack.pop()!;
				const height = heights[top];
				const left = stack.length ? stack.at(-1)! + 1 : 0;
				const width = x - left;
				const sq = Math.min(width, height);
				// Favor usable shapes: area of the rectangle, capped at 2:1.
				const area = Math.min(width * height, sq * sq * 2);
				if (area > best.area) best = { area, rect: [left, y - height + 1, x, y + 1] };
			}
			stack.push(x);
		}
	}
	return best.rect;
}

function hull(pts: Vec[]): Poly {
	const p = pts.toSorted((a, b) => a.x - b.x || a.y - b.y);
	const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower: Vec[] = [],
		upper: Vec[] = [];
	for (const q of p) {
		while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, q) <= 0) lower.pop();
		lower.push(q);
	}
	for (const q of p.toReversed()) {
		while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, q) <= 0) upper.pop();
		upper.push(q);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// Odd pockets: free floor in the living room that nothing uses. Floor counts as used when it is legroom, a dining
// chair's seat or pull-out zone, within reach of the coffee table, inside the viewing wedge between the seats and the
// screen, in front of a reading chair, or on a 30" access corridor from the kitchen to a door, a seat, a chair or the TV. Strips under 8"
// (wall and glass clearance) and specks under 1 sq ft are ignored.
function findPockets(ctx: {
	r: Float32Array;
	val: Float32Array;
	seats: Seat[];
	dinings: Dining[];
	coffees: Table[];
	chairs: Decor[];
	tvInfo: Evaluation['tv'];
	routes: Route[];
	solids: Piece[];
}) {
	const { r, val } = ctx;
	const used = new Uint8Array(GW * GH);
	const fill = (poly: Poly) => {
		const xs = poly.map(p => p.x),
			ys = poly.map(p => p.y);
		for (
			let y = Math.max(0, Math.floor(Math.min(...ys) - G.y0));
			y < Math.min(GH, Math.ceil(Math.max(...ys) - G.y0));
			y++
		)
			for (
				let x = Math.max(0, Math.floor(Math.min(...xs) - G.x0));
				x < Math.min(GW, Math.ceil(Math.max(...xs) - G.x0));
				x++
			)
				if (inside({ x: x + G.x0 + 0.5, y: y + G.y0 + 0.5 }, poly)) used[y * GW + x] = 1;
	};
	const disk = (i: number, rad: number) => {
		const cx = i % GW,
			cy = Math.floor(i / GW);
		for (let dy = -rad; dy <= rad; dy++)
			for (let dx = -rad; dx <= rad; dx++)
				if (dx * dx + dy * dy <= rad * rad) {
					const x = cx + dx,
						y = cy + dy;
					if (x >= 0 && y >= 0 && x < GW && y < GH) used[y * GW + x] = 1;
				}
	};
	for (const s of ctx.seats) if (s.legroom) fill(s.legroom);
	const targets: Vec[] = ctx.seats.map(s => s.front);
	for (const d of ctx.dinings)
		for (const ch of diningChairs(d)) {
			const at = (a: number, k: number): Vec => ({
				x: ch.edge.x + ch.side.x * a + ch.out.x * k,
				y: ch.edge.y + ch.side.y * a + ch.out.y * k,
			});
			fill([at(-CHAIR.w / 2, 0), at(CHAIR.w / 2, 0), at(CHAIR.w / 2, CHAIR.comfy), at(-CHAIR.w / 2, CHAIR.comfy)]);
			targets.push(at(0, 30));
		}
	for (const c of ctx.chairs) {
		const F = frame(c);
		fill(F.rect(-c.size / 2, c.size / 2, c.size / 2, c.size / 2 + 18));
		targets.push(F.pt(0, c.size / 2 + 12));
	}
	for (const t of ctx.coffees) {
		const F = frame(t);
		fill(F.rect(-t.w / 2 - 18, -t.d / 2 - 18, t.w / 2 + 18, t.d / 2 + 18));
	}
	if (ctx.tvInfo && ctx.seats.length) {
		fill(hull([...ctx.seats.map(s => s.eye), ctx.tvInfo.left, ctx.tvInfo.right]));
		targets.push({
			x: ctx.tvInfo.center.x + ctx.tvInfo.normal.x * 24,
			y: ctx.tvInfo.center.y + ctx.tvInfo.normal.y * 24,
		});
	}
	for (const rt of ctx.routes) targets.push(rt.path[0]!);
	for (const t of targets) {
		const ti = cellOf(t);
		if (ti < 0 || ti >= val.length || val[ti]! <= 0.5) continue;
		const { cells } = corridorPath(r, ti, Math.min(val[ti]!, 15));
		for (const c of cells) disk(c, 15);
	}
	const pocket = new Uint8Array(GW * GH);
	const inLiving = (i: number) => {
		const p = cellPt(i);
		return p.x > 0 && p.x < ROOM.w && p.y > 0 && p.y < ROOM.island[1];
	};
	for (let i = 0; i < GW * GH; i++) if (inLiving(i) && r[i]! > 0.5 && !used[i]) pocket[i] = 1;
	const seen = new Uint8Array(GW * GH);
	let area = 0,
		count = 0,
		largest = 0;
	const keep = new Uint8Array(GW * GH);
	for (let i = 0; i < GW * GH; i++) {
		if (!pocket[i] || seen[i]) continue;
		const comp: number[] = [i];
		seen[i] = 1;
		let maxR = 0;
		for (let k = 0; k < comp.length; k++) {
			const c = comp[k]!;
			maxR = Math.max(maxR, r[c]!);
			for (const o of [-1, 1, -GW, GW]) {
				const j = c + o;
				if (j >= 0 && j < GW * GH && pocket[j] && !seen[j]) {
					seen[j] = 1;
					comp.push(j);
				}
			}
		}
		if (comp.length < 144 || maxR < 4) continue;
		for (const c of comp) keep[c] = 1;
		area += comp.length / 144;
		count++;
		largest = Math.max(largest, comp.length / 144);
	}
	return { area, count, largest, cells: keep, grid: G };
}

export function evaluate(layout: Layout, opts: { pockets?: boolean } = {}): Evaluation {
	const issues: Issue[] = [];
	const comps = layout.components;
	const all = comps.flatMap(c => pieces(c));
	const solids = all.filter(p => p.solid);
	const living = rectPoly([0, 0, ROOM.w, ROOM.d]);
	const fixed = [
		{ name: 'kitchen island', poly: rectPoly(ROOM.island) },
		{ name: 'kitchen counter', poly: rectPoly(ROOM.counter) },
	];
	const cName = (id: string) => comps.find(c => c.id === id)?.label ?? id;

	for (const p of all) {
		const out = p.poly.some(v => v.x < -0.25 || v.y < -0.25 || v.x > ROOM.w + 0.25 || v.y > ROOM.d + 0.25);
		if (out) issues.push({ level: 'bad', msg: `${cName(p.comp)} leaves the room` });
	}
	const seen = new Set<string>();
	for (let i = 0; i < solids.length; i++) {
		const a = solids[i]!;
		for (const f of fixed)
			if (overlapDepth(a.poly, f.poly) > 0.25)
				issues.push({ level: 'bad', msg: `${cName(a.comp)} hits the ${f.name}` });
		const colGap = polyCircleDist(a.poly, ROOM.column);
		if (colGap < -0.25) issues.push({ level: 'bad', msg: `${cName(a.comp)} hits the column` });
		// The column's distance from the south glass is traced, not taped, so leave room for error.
		else if (colGap < 2 && !seen.has(`column|${a.comp}`)) {
			seen.add(`column|${a.comp}`);
			issues.push({ level: 'warn', msg: `${cName(a.comp)} is ${Math.max(0, colGap).toFixed(1)}″ from the column` });
		}
		for (let j = i + 1; j < solids.length; j++) {
			const b = solids[j]!;
			if (a.comp === b.comp) continue;
			const tvOnConsole = (a.type === 'tv' && b.type === 'console') || (a.type === 'console' && b.type === 'tv');
			if (tvOnConsole) continue;
			const k = [a.comp, b.comp].sort().join('|');
			if (!seen.has(k) && overlapDepth(a.poly, b.poly) > 0.25) {
				seen.add(k);
				issues.push({ level: 'bad', msg: `${cName(a.comp)} overlaps ${cName(b.comp)}` });
			}
		}
	}
	for (const p of all.filter(p => p.type === 'rug'))
		if (polyCircleDist(p.poly, ROOM.column) < 0)
			issues.push({ level: 'warn', msg: `${cName(p.comp)} runs into the column; cut or shrink it` });
	void living;

	// TV
	const tvs = comps.filter((c): c is Tv => c.type === 'tv');
	let tvInfo: Evaluation['tv'];
	if (tvs.length !== 1) issues.push({ level: 'bad', msg: `expected exactly one TV, found ${tvs.length}` });
	const tv = tvs[0];
	if (tv) {
		const F = frame(tv);
		const { w, h, screenW } = tvSize(tv.diag);
		tvInfo = {
			comp: tv,
			w,
			h,
			center: F.pt(0, 0),
			left: F.pt(-screenW / 2, 0),
			right: F.pt(screenW / 2, 0),
			normal: F.f,
		};
		const bottom = tv.center - h / 2,
			top = tv.center + h / 2;
		if (tv.diag > MAX_TV_DIAG) issues.push({ level: 'bad', msg: `TV is ${tv.diag}″; the cap is ${MAX_TV_DIAG}″` });
		if (top > ROOM.ceiling - 2) issues.push({ level: 'bad', msg: 'TV top hits the ceiling' });
		if (tv.mount === 'wall') {
			const t = tv.thickness ?? 5;
			const backL = F.pt(-w / 2, -t),
				backR = F.pt(w / 2, -t);
			const wall = MOUNT_WALLS.find(
				m =>
					segDist(backL, m.a, m.b) < 1.5 &&
					segDist(backR, m.a, m.b) < 1.5 &&
					Math.abs(((tv.rot - m.heading + 540) % 360) - 180) < 1,
			);
			if (!wall)
				issues.push({
					level: 'bad',
					msg: 'wall-mounted TV is not flat on a solid wall (east TV wall or south solid return)',
				});
			else {
				tvInfo.wall = wall.name;
				if (wall.heading === 270) {
					const y1 = Math.min(backL.y, backR.y),
						y2 = Math.max(backL.y, backR.y);
					const sw = ROOM.switchPlate;
					if (y2 > sw.y - 1.5 && y1 < sw.y + 1.5 && bottom < sw.z2 + 1 && top > sw.z1)
						issues.push({ level: 'bad', msg: 'TV covers the light switch' });
					if (y2 > ROOM.smoke.y - 3 && y1 < ROOM.smoke.y + 3 && top > ROOM.smoke.z - 4)
						issues.push({ level: 'bad', msg: 'TV runs into the smoke alarm' });
				}
			}
			if (bottom < 6) issues.push({ level: 'warn', msg: 'wall TV bottom is almost on the floor' });
		} else {
			const consoles = comps.filter((c): c is Console => c.type === 'console');
			const base = consoles.find(cs => inside(F.pt(0, -1.5), pieces(cs)[0]!.poly));
			if (!base) issues.push({ level: 'bad', msg: 'TV on a stand needs a console under it' });
			else {
				if (bottom < base.h + 1)
					issues.push({ level: 'bad', msg: `TV bottom (${bottom.toFixed(0)}″) is below the console top (${base.h}″)` });
				if (base.w < w * 0.6) issues.push({ level: 'warn', msg: 'console is narrow for this TV’s feet' });
				if (base.d < 15) issues.push({ level: 'warn', msg: 'console under 15″ deep is tight for a 98″+ TV stand' });
			}
			const panelDist = Math.min(...MOUNT_WALLS.map(m => segDist(tvInfo!.center, m.a, m.b)));
			void panelDist;
		}
		if (ROOM.southGlassEnd > 0) {
			// A screen in front of glass is backlit by day.
			const behind = F.pt(0, -30);
			if (behind.y < 0 && behind.x < ROOM.southGlassEnd)
				issues.push({ level: 'warn', msg: 'TV stands in front of the south glass: backlit and blocks the lake view' });
			if (behind.x < 0)
				issues.push({ level: 'warn', msg: 'TV stands in front of the west glass: sunset glare behind it' });
		}
	}

	// Seats
	const seatComps = comps.filter((c): c is Seating => c.type === 'seating');
	const rawSeats = seatComps.flatMap(seatsOf);
	const door = layout.room?.balconyDoor !== false;
	const { r } = clearanceGrid(
		solids.map(s => s.poly),
		door,
	);
	const { val, parent } = widestPaths(r);
	const seats: SeatView[] = rawSeats.map(s => {
		let dist = 0,
			fov = 0,
			offAxis = 90,
			turn = 180,
			vert = 0;
		if (tvInfo) {
			const toC = sub(tvInfo.center, s.eye);
			dist = len(toC);
			fov = angleBetween(sub(tvInfo.left, s.eye), sub(tvInfo.right, s.eye));
			offAxis = angleBetween(tvInfo.normal, sub(s.eye, tvInfo.center));
			turn = angleBetween(s.facing, toC);
			vert = deg(Math.atan2(tvInfo.comp.center - ROOM.eyeZ, dist));
		}
		const ci = cellOf(s.front);
		const access = ci >= 0 && ci < val.length ? Math.max(0, val[ci]!) * 2 : 0;
		return { ...s, dist, fov, offAxis, turn, vert, rating: rateSeat(fov, offAxis, turn), access };
	});
	seats.forEach((s, i) => (s.n = i + 1));
	for (const s of seatComps) {
		for (const seat of seats.filter(x => x.comp === s.id))
			if (seat.width < 21)
				issues.push({ level: 'bad', msg: `${cName(s.id)} seat ${seat.n} is only ${seat.width.toFixed(0)}″ wide` });
	}
	for (const s of seats) {
		if (!s.legroom) continue;
		const hits = solids
			.filter(p => p.comp !== s.comp && overlapDepth(p.poly, s.legroom!) > 0.5)
			.map(p => cName(p.comp));
		if (polyCircleDist(s.legroom, ROOM.column) < 0) hits.push('the column');
		if (s.legroom.some(v => v.x < 0 || v.y < 0 || v.x > ROOM.w || v.y > ROOM.d)) hits.push('the wall');
		if (hits.length)
			issues.push({
				level: 'bad',
				msg: `${cName(s.comp)} seat ${s.n}: no legroom, ${[...new Set(hits)].join(' and ')} in the way`,
			});
	}
	for (const s of seats)
		if (s.access < 12)
			issues.push({ level: 'warn', msg: `${cName(s.comp)} seat ${s.n}: ${s.access.toFixed(0)}″ to get in` });
	// Seated people (about 44" tall) block anything behind them; tables and consoles sit below the 21"+ screen.
	if (tvInfo)
		for (const s of seats) {
			const blockers = new Set<string>();
			for (let k = 0; k <= 4; k++) {
				const t = k / 4;
				const target = {
					x: tvInfo.left.x + (tvInfo.right.x - tvInfo.left.x) * t,
					y: tvInfo.left.y + (tvInfo.right.y - tvInfo.left.y) * t,
				};
				for (const p of solids)
					if (p.type === 'seating' && p.comp !== s.comp && segmentHitsPoly(s.eye, target, p.poly))
						blockers.add(cName(p.comp));
			}
			if (blockers.size)
				issues.push({
					level: 'bad',
					msg: `${cName(s.comp)} seat ${s.n}: view of the screen blocked by ${[...blockers].join(', ')}`,
				});
		}
	// Dining tables: chair pull-out room, and whether empty chairs or the table cut the bottom of the screen.
	const dinings = comps.filter((c): c is Dining => c.type === 'dining');
	const blockedAt = (p: Vec, own: string) =>
		p.x < 0 ||
		p.y < 0 ||
		p.x > ROOM.w ||
		(p.y > ROOM.d && p.x < ROOM.counter[2]) ||
		inside(p, rectPoly(ROOM.island)) ||
		Math.hypot(p.x - ROOM.column.x, p.y - ROOM.column.y) < ROOM.column.r ||
		solids.some(q => q.comp !== own && inside(p, q.poly));
	const diningSeats: { comp: string; n: number; pull: number }[] = [];
	for (const d of dinings) {
		for (const ch of diningChairs(d)) {
			let pull = CHAIR.seated;
			for (let k = CHAIR.seated; k <= 48; k++) {
				const hit = [-CHAIR.w / 2, 0, CHAIR.w / 2].some(a =>
					blockedAt({ x: ch.edge.x + ch.side.x * a + ch.out.x * k, y: ch.edge.y + ch.side.y * a + ch.out.y * k }, d.id),
				);
				if (hit) break;
				pull = k;
			}
			diningSeats.push({ comp: d.id, n: ch.n, pull });
			if (pull < CHAIR.tight - 4)
				issues.push({
					level: 'bad',
					msg: `${cName(d.id)} chair ${ch.n} can't pull out: ${pull}″ behind the table edge`,
				});
			else if (pull < CHAIR.tight)
				issues.push({
					level: 'warn',
					msg: `${cName(d.id)} chair ${ch.n}: ${pull}″ to pull out (32–36″ is comfortable)`,
				});
		}
		if (tvInfo) {
			const bottom = tvInfo.comp.center - tvInfo.h / 2;
			const dp = pieces(d);
			const cut = new Set<number>();
			for (const s of seats)
				for (let k = 0; k <= 4; k++) {
					const target = {
						x: tvInfo.left.x + ((tvInfo.right.x - tvInfo.left.x) * k) / 4,
						y: tvInfo.left.y + ((tvInfo.right.y - tvInfo.left.y) * k) / 4,
					};
					dp.forEach((piece, i) => {
						const top = i === 0 ? 30 : 34;
						for (let j = 1; j < 40; j++) {
							const t = j / 40;
							const q = { x: s.eye.x + (target.x - s.eye.x) * t, y: s.eye.y + (target.y - s.eye.y) * t };
							if (inside(q, piece.poly) && ROOM.eyeZ + (bottom - ROOM.eyeZ) * t < top) {
								cut.add(s.n);
								break;
							}
						}
					});
				}
			if (cut.size)
				issues.push({
					level: 'warn',
					msg: `${cName(d.id)} sits in the sightline of seat${cut.size > 1 ? 's' : ''} ${[...cut].join(', ')}: chair backs cut the bottom of the screen`,
				});
		}
	}

	if (tvInfo && seats.length) {
		const best = Math.max(...seats.map(s => s.fov));
		if (best > 50)
			issues.push({ level: 'warn', msg: `TV fills ${best.toFixed(0)}° from the closest seat (over 50° is too close)` });
		const maxVert = Math.max(...seats.map(s => s.vert));
		if (maxVert > 15) issues.push({ level: 'warn', msg: `screen center ${maxVert.toFixed(0)}° above eye level` });
	}

	// Routes
	const routes: Route[] = TARGETS.filter(t => door || t.key !== 'balcony').map(t => {
		const ti = cellOf(t.at);
		const width = Math.max(0, val[ti]!) * 2;
		const { pts, pinch } = corridorPath(r, ti, Math.min(width, t.good) / 2);
		if (width < t.min)
			issues.push({ level: 'bad', msg: `${t.name}: route pinches to ${width.toFixed(0)}″ (needs ${t.min}″)` });
		else if (width < t.good)
			issues.push({ level: 'warn', msg: `${t.name}: route is ${width.toFixed(0)}″ (${t.good}″ is comfortable)` });
		return { key: t.key, name: t.name, width, min: t.min, good: t.good, path: pts, pinch };
	});

	// Tables
	const coffees = comps.filter((c): c is Table => c.type === 'table' && c.role !== 'side');
	const seatPolys = seatComps.flatMap(c => pieces(c).map(p => p.poly));
	let coffeeGap: number | undefined;
	let tvGap: number | undefined;
	if (!coffees.length) issues.push({ level: 'warn', msg: 'no coffee table' });
	for (const t of coffees) {
		const tp = pieces(t)[0]!.poly;
		const g = Math.min(...seatPolys.map(sp => polyDist(sp, tp)));
		coffeeGap = coffeeGap === undefined ? g : Math.min(coffeeGap, g);
		if (tvInfo) {
			const tvPolys = all.filter(p => p.type === 'tv' || p.type === 'console').map(p => p.poly);
			const tg = Math.min(...tvPolys.map(q => polyDist(q, tp)));
			tvGap = tvGap === undefined ? tg : Math.min(tvGap, tg);
		}
		const recline = Math.max(0, ...seatComps.map(s => s.recline ?? 0));
		if (g < 12)
			issues.push({ level: 'warn', msg: `${cName(t.id)} is ${g.toFixed(0)}″ from the sofa (14–18″ is the norm)` });
		else if (g > 24) issues.push({ level: 'warn', msg: `${cName(t.id)} is ${g.toFixed(0)}″ from the sofa, a reach` });
		if (recline && g < recline)
			issues.push({ level: 'warn', msg: `recliner footrests (+${recline}″) hit ${cName(t.id)}` });
		const reachable = seats.filter(s => polyDist([s.front, s.front, s.front], tp) < 30).length;
		if (seats.length && reachable < Math.ceil(seats.length * 0.6))
			issues.push({ level: 'warn', msg: `only ${reachable} of ${seats.length} seats can reach a table surface` });
	}

	const pockets =
		(opts.pockets ?? !door)
			? findPockets({
					r,
					val,
					seats,
					dinings,
					coffees,
					chairs: comps.filter((c): c is Decor => c.type === 'decor' && c.kind === 'chair'),
					tvInfo,
					routes,
					solids,
				})
			: undefined;
	if (pockets && pockets.area >= 1)
		issues.push({
			level: 'warn',
			msg: `${pockets.area.toFixed(1)} sq ft of odd empty pockets (${pockets.count}; largest ${pockets.largest.toFixed(1)} sq ft)`,
		});

	// A dining table set against the island replaces the stools, so only other furniture counts here.
	const islandGap = Math.min(
		Infinity,
		...solids.filter(s => s.type !== 'dining').map(s => polyDist(s.poly, rectPoly(ROOM.island))),
	);
	const columnGap = Math.min(Infinity, ...solids.map(s => polyCircleDist(s.poly, ROOM.column)));
	if (islandGap < 36)
		issues.push({
			level: 'warn',
			msg: `${islandGap.toFixed(0)}″ behind the island stools (36″ to sit, 44″ to walk behind)`,
		});

	const seatingLength = seatComps.reduce(
		(a, c) =>
			a + c.length + (c.left?.length ?? 0) + (c.right?.length ?? 0) - (c.left ? c.depth : 0) - (c.right ? c.depth : 0),
		0,
	);
	const polyArea = (p: Poly) =>
		Math.abs(p.reduce((a, v, i) => a + v.x * p[(i + 1) % p.length]!.y - p[(i + 1) % p.length]!.x * v.y, 0)) / 2;
	const seatingArea = seatComps.reduce((a, c) => {
		const sh = seatingShape(c);
		const ring = sh.outline.map(([x, y]) => ({ x, y }));
		return a + polyArea(ring);
	}, 0);

	const LW = ROOM.w,
		LH = Math.floor(ROOM.island[1]);
	const openRect = largestOpenRect(
		(x, y) => {
			const i = (y - G.y0) * GW + (x - G.x0);
			return r[i]! < 0.5;
		},
		LW,
		LH,
	);

	const prime = seats.filter(s => s.rating === 'prime').length;
	const good = seats.filter(s => s.rating === 'good').length;
	const bad = issues.filter(i => i.level === 'bad').length;
	const tvScore = tv ? Math.min(1, tv.diag / MAX_TV_DIAG) : 0;
	const seatScore = Math.min(1, (prime + 0.6 * good) / 5);
	const routeScore = routes.every(r => r.width >= r.good) ? 1 : routes.every(r => r.width >= r.min) ? 0.7 : 0.2;
	const score = Math.round(
		100 * (0.35 * tvScore + 0.35 * seatScore + 0.15 * routeScore + 0.15 * (seats.length >= 5 ? 1 : seats.length / 5)) -
			bad * 15,
	);

	const ftin = (n: number) => `${Math.floor(Math.round(n) / 12)}′${Math.round(n) % 12}″`;
	const summary: Record<string, string | number> = {
		TV: tv ? `${tv.diag}″ ${tv.mount === 'wall' ? 'wall-mounted' : 'on a stand'}` : 'none',
		Seats: `${seats.length} (${prime} prime, ${good} good, ${seats.length - prime - good} side)`,
		'Seat run': `${Math.round(seatingLength)}″`,
		'Eye → screen': seats.length
			? `${ftin(Math.min(...seats.map(s => s.dist)))} – ${ftin(Math.max(...seats.map(s => s.dist)))}`
			: '—',
		'Screen fills': seats.length
			? `${Math.round(Math.min(...seats.map(s => s.fov)))}–${Math.round(Math.max(...seats.map(s => s.fov)))}°`
			: '—',
		'Coffee table gap': coffeeGap !== undefined ? `${coffeeGap.toFixed(0)}″` : '—',
		...(dinings.length
			? {
					Dining: `${diningSeats.length} chairs, ${dinings.map(d => (d.shape === 'round' ? `${d.w}″ round` : `${d.w}″ × ${d.d}″`)).join(' + ')}`,
					'Chair pull-out': `${Math.min(...diningSeats.map(x => x.pull))}″ min`,
				}
			: {}),
		'Island clearance': `${islandGap.toFixed(0)}″`,
		'Open floor': `${openRect[2] - openRect[0]}″ × ${openRect[3] - openRect[1]}″`,
		...(pockets ? { 'Odd pockets': `${pockets.area.toFixed(1)} sq ft` } : {}),
	};
	for (const rt of routes) summary[rt.name] = `${rt.width.toFixed(0)}″`;
	if (!issues.some(i => i.level !== 'ok')) issues.push({ level: 'ok', msg: 'No collisions; every route clear' });
	return {
		issues,
		seats,
		tv: tvInfo,
		routes,
		coffeeGap,
		tvGap,
		islandGap,
		columnGap,
		seatingLength,
		seatingArea,
		openRect: { w: openRect[2] - openRect[0], d: openRect[3] - openRect[1], rect: openRect },
		diningSeats,
		pockets,
		score,
		summary,
	};
}
