#!/usr/bin/env bun
// Searches couch + TV + dining combinations and ranks them on the council's criteria: couch seats (3 minimum, 4–5
// ideal) that watch the TV well, TV size up to 98", dining for 4 (6 ideal) with real chair pull-out room, clear
// routes and open floor.
import {
	evaluate,
	overlapDepth,
	pieces,
	polyCircleDist,
	ROOM,
	seatsOf,
	type Component,
	type Dining,
	type Layout,
	type Seating,
	type Tv,
} from './model.ts';

const W = { tv: 25, couch: 25, dining: 25, routes: 10, space: 15 };

export function rank(L: Layout) {
	const ev = evaluate(L);
	const bad = ev.issues.filter(i => i.level === 'bad').length;
	const warn = ev.issues.filter(i => i.level === 'warn' && !i.msg.includes('coffee')).length;
	const tv = L.components.find((c): c is Tv => c.type === 'tv');
	const w = (r: string) => (r === 'prime' ? 1 : r === 'good' ? 0.7 : 0.15);
	const fill = (f: number) => Math.min(1, Math.max(0, (f - 24) / 10));
	const view = ev.seats.length
		? ev.seats.reduce((a, s) => a + w(s.rating) * (0.6 + 0.4 * fill(s.fov)), 0) / ev.seats.length
		: 0;
	const couch = ev.seats.length < 3 ? 0 : Math.min(1, ev.seats.reduce((a, s) => a + w(s.rating), 0) / 4.5);
	const okChairs = ev.diningSeats.filter(d => d.pull >= 32).length;
	const dining = okChairs < 4 ? okChairs / 8 : 0.6 + 0.4 * Math.min(1, (okChairs - 4) / 2);
	const routes = ev.routes.every(r => r.width >= r.good) ? 1 : ev.routes.every(r => r.width >= r.min) ? 0.6 : 0;
	const space = Math.min(1, (ev.openRect.w * ev.openRect.d) / (60 * 60));
	const total =
		W.tv * (tv ? Math.min(1, tv.diag / 98) : 0) * view +
		W.couch * couch +
		W.dining * dining +
		W.routes * routes +
		W.space * space -
		30 * bad -
		2 * warn;
	return { total, ev, okChairs, bad, warn };
}

type Cand = { L: Layout; r: ReturnType<typeof rank> };

const tvs = (): { name: string; parts: Component[] }[] => [
	...[48, 54, 60, 66].map(y => ({
		name: `wall@${y}`,
		parts: [
			{ id: 'tv', label: 'TV', type: 'tv', x: 194, y, rot: 270, diag: 98, mount: 'wall', center: 48 } as Tv,
			{
				id: 'console',
				label: 'Floating console',
				type: 'console',
				x: 192,
				y,
				rot: 270,
				w: 90,
				d: 14,
				h: 16,
				floating: true,
			} as Component,
		],
	})),
	{
		name: 'corner',
		parts: [
			{
				id: 'console',
				label: 'Corner console',
				type: 'console',
				x: 171.8,
				y: 28.2,
				rot: 315,
				w: 56,
				d: 18,
				h: 20,
			} as Component,
			{ id: 'tv', label: 'TV', type: 'tv', x: 165.4, y: 34.6, rot: 315, diag: 98, mount: 'stand', center: 48 } as Tv,
		],
	},
];

const dinings = (): { name: string; d: Dining }[] => {
	const out: { name: string; d: Dining }[] = [];
	if (process.env.DIN === 'T') {
		for (const x of [114, 120, 126])
			out.push({
				name: `T72@${x}`,
				d: {
					id: 'din',
					label: 'Dining table',
					type: 'dining',
					x,
					y: 158,
					rot: 90,
					shape: 'rect',
					w: 72,
					d: 36,
					sides: 3,
					ends: 0,
				},
			});
		return out;
	}
	// North–south table off the island (the T), 6 or 4 chairs.
	for (const x of [96, 102, 108, 114])
		for (const [len, sides] of [
			[72, 3],
			[60, 2],
		] as const)
			out.push({
				name: `T${len}@${x}`,
				d: {
					id: 'din',
					label: 'Dining table',
					type: 'dining',
					x,
					y: 194 - len / 2,
					rot: 90,
					shape: 'rect',
					w: len,
					d: 36,
					sides,
					ends: len === 60 ? 1 : 0,
				},
			});
	// East–west table against the island: chairs on the south side and the ends.
	for (const x of [100, 108, 116])
		out.push({
			name: `E72@${x}`,
			d: {
				id: 'din',
				label: 'Dining table',
				type: 'dining',
				x,
				y: 176,
				rot: 0,
				shape: 'rect',
				w: 72,
				d: 36,
				sides: 3,
				ends: 2,
				bare: ['front'],
			},
		});
	// Free east–west table in the north band, chairs on both sides.
	for (const x of [84, 96, 108])
		for (const y of [140, 146, 152])
			out.push({
				name: `F60@${x},${y}`,
				d: {
					id: 'din',
					label: 'Dining table',
					type: 'dining',
					x,
					y,
					rot: 0,
					shape: 'rect',
					w: 60,
					d: 36,
					sides: 2,
					ends: 2,
				},
			});
	// Round tables in the north-west and south-west.
	for (const [x, y] of [
		[56, 160],
		[60, 150],
		[52, 92],
		[60, 100],
		[110, 150],
	] as const)
		for (const n of [4, 5])
			out.push({
				name: `R48x${n}@${x},${y}`,
				d: { id: 'din', label: 'Dining table', type: 'dining', x, y, rot: 45, shape: 'round', w: 48, d: 48, n },
			});
	return out;
};

const sofas = function* (): Generator<{ name: string; s: Seating }> {
	for (let rot of [90, 180])
		for (let x = Number(process.env.X0 ?? 20); x <= Number(process.env.X1 ?? 120); x += Number(process.env.STEP ?? 6))
			for (
				let y = Number(process.env.Y0 ?? 50);
				y <= Number(process.env.Y1 ?? 140);
				y += Number(process.env.STEP ?? 6)
			) {
				for (const [len, seats] of [
					[84, 3],
					[96, 3],
					[108, 4],
				] as const)
					yield {
						name: `sofa${len}r${rot}`,
						s: { id: 'sofa', label: 'Sofa', type: 'seating', x, y, rot, length: len, depth: 38, arm: 4, seats },
					};
				yield {
					name: `chaise r${rot}`,
					s: {
						id: 'sofa',
						label: 'Chaise sofa',
						type: 'seating',
						x,
						y,
						rot,
						length: 100,
						depth: 38,
						arm: 4,
						seats: 3,
						right: { length: 66, width: 34, kind: 'chaise', seats: 1 },
					},
				};
				yield {
					name: `L r${rot}`,
					s: {
						id: 'sofa',
						label: 'L sectional',
						type: 'seating',
						x,
						y,
						rot,
						length: 96,
						depth: 38,
						arm: 4,
						seats: 2,
						left: { length: 96, kind: 'seats', seats: 2, corner: true },
					},
				};
			}
};

function quick(s: Seating, d: Dining, tvParts: Component[]) {
	const sp = pieces(s);
	const pts = sp.flatMap(p => p.poly);
	if (pts.some(p => p.x < 1 || p.y < 1 || p.x > 185 || p.y > 158)) return false;
	if (pts.some(p => p.x > 158 && p.y > 108)) return false;
	if (sp.some(p => polyCircleDist(p.poly, ROOM.column) < 2)) return false;
	const others = [...pieces(d), ...tvParts.flatMap(pieces)].map(p => p.poly);
	if (sp.some(p => others.some(o => overlapDepth(p.poly, o) > 0))) return false;
	const tv = tvParts.find((c): c is Tv => c.type === 'tv')!;
	for (const q of seatsOf(s)) {
		if (q.legroom && (polyCircleDist(q.legroom, ROOM.column) < 0 || others.some(o => overlapDepth(q.legroom!, o) > 0)))
			return false;
		const to = { x: tv.x - q.eye.x, y: tv.y - q.eye.y };
		const cos = (to.x * q.facing.x + to.y * q.facing.y) / Math.hypot(to.x, to.y);
		if (cos < Math.cos((70 * Math.PI) / 180)) return false;
	}
	return true;
}

if (import.meta.main) {
	const best: Cand[] = [];
	let n = 0;
	for (const t of tvs())
		for (const d of dinings()) {
			const local: Cand[] = [];
			for (const so of sofas()) {
				const L: Layout = { id: `${t.name}|${d.name}|${so.name}`, title: '', components: [d.d, so.s, ...t.parts] };
				n++;
				if (!quick(so.s, d.d, t.parts)) continue;
				const r = rank(L);
				if (r.bad) continue;
				local.push({ L, r });
			}
			local.sort((a, b) => b.r.total - a.r.total);
			best.push(...local.filter(c => c.r.ev.seats.length >= Number(process.env.MINSEATS ?? 0)).slice(0, 3));
		}
	best.sort((a, b) => b.r.total - a.r.total);
	if (process.env.MINSEATS) {
		const m = Number(process.env.MINSEATS);
		best.splice(0, best.length, ...best.filter(c => c.r.ev.seats.length >= m));
	}
	console.log(`${n} evaluated`);
	for (const c of best.slice(0, 25)) {
		const s = c.L.components.find(x => x.type === 'seating')!;
		console.log(
			c.r.total.toFixed(1),
			c.L.id,
			`sofa@(${s.x},${s.y})`,
			c.r.ev.summary.Seats,
			'| dining',
			c.r.okChairs,
			'|',
			c.r.ev.summary['Eye → screen'],
			'| open',
			c.r.ev.summary['Open floor'],
			'| warn',
			c.r.warn,
		);
	}
}
