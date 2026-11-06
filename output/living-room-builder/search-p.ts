#!/usr/bin/env bun
// Couch + TV + 6-seat dining with the balcony door treated as glass, ranked on the council goals minus the area of
// odd empty pockets. Cheap geometry screens every pose; the full evaluation (pockets included) runs on the best few.
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

const room = { balconyDoor: false };
const POCKET_WEIGHT = Number(process.env.PW ?? 0.35);

export function score(L: Layout, pockets: boolean) {
	const ev = evaluate(L, { pockets });
	const bad = ev.issues.filter(i => i.level === 'bad').length;
	const warn = ev.issues.filter(
		i => i.level === 'warn' && !i.msg.includes('coffee') && !i.msg.includes('pockets'),
	).length;
	const tv = L.components.find((c): c is Tv => c.type === 'tv');
	const w = (r: string) => (r === 'prime' ? 1 : r === 'good' ? 0.7 : 0.15);
	const fill = (f: number) => Math.min(1, Math.max(0, (f - 24) / 10));
	const view = ev.seats.length
		? ev.seats.reduce((a, s) => a + w(s.rating) * (0.6 + 0.4 * fill(s.fov)), 0) / ev.seats.length
		: 0;
	const couch = ev.seats.length < 3 ? 0 : Math.min(1, ev.seats.reduce((a, s) => a + w(s.rating), 0) / 4.5);
	const ok = ev.diningSeats.filter(d => d.pull >= 32).length;
	const dining = ok >= 6 ? 1 : 0;
	const routes = ev.routes.every(r => r.width >= r.good) ? 1 : ev.routes.every(r => r.width >= r.min) ? 0.6 : 0;
	const total =
		25 * (tv ? Math.min(1, tv.diag / 98) : 0) * view +
		25 * couch +
		25 * dining +
		10 * routes -
		30 * bad -
		2 * warn -
		POCKET_WEIGHT * (ev.pockets?.area ?? 0);
	return { total, ev, ok, bad };
}

const tvs = (): { name: string; parts: Component[] }[] => [
	...[50, 58, 66].flatMap(y =>
		[85, 98].map(diag => ({
			name: `wall${diag}@${y}`,
			parts: [
				{
					id: 'tv',
					label: 'TV',
					type: 'tv',
					x: 194,
					y,
					rot: 270,
					diag,
					mount: 'wall',
					center: diag === 98 ? 50 : 46,
				} as Tv,
				{
					id: 'console',
					label: 'Floating console',
					type: 'console',
					x: 192,
					y,
					rot: 270,
					w: diag === 98 ? 90 : 80,
					d: 14,
					h: 20,
					floating: true,
				} as Component,
			],
		})),
	),
	{
		name: 'corner98',
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
	const T = (name: string, x: number, y: number, rot: number): { name: string; d: Dining } => ({
		name,
		d: { id: 'din', label: 'Dining table', type: 'dining', x, y, rot, shape: 'rect', w: 72, d: 36, sides: 3, ends: 0 },
	});
	return [
		...[114, 120, 126].map(x => T(`T@${x}`, x, 158, 90)),
		// Along the west glass, north-west by the kitchen counter: chairs pull back to the glass.
		...[150, 156, 162].map(y => T(`W@${y}`, 54, y, 90)),
		// Along the west glass, south-west by the column.
		...[76, 82].map(y => T(`SW@${y}`, 54, y, 90)),
		// East–west in the north band, chairs both sides.
		...[84, 96].flatMap(x => [140, 150].map(y => T(`EW@${x},${y}`, x, y, 0))),
	];
};

function* sofas(): Generator<Seating> {
	for (let x = 22; x <= 120; x += 4)
		for (let y = 40; y <= 160; y += 4) {
			for (const [len, seats] of [
				[84, 3],
				[108, 4],
				[133, 5],
			] as const)
				yield { id: 'sofa', label: 'Sofa', type: 'seating', x, y, rot: 90, length: len, depth: 38, arm: 4, seats };
			for (const [main, ret, rs] of [
				[84, 112, 2],
				[96, 128, 3],
				[106, 136, 3],
			] as const)
				yield {
					id: 'sofa',
					label: 'L sectional',
					type: 'seating',
					x,
					y,
					rot: 90,
					length: main,
					depth: 40,
					arm: 4,
					seats: 2,
					left: { length: ret, kind: 'seats', seats: rs, corner: true },
				};
		}
}

function quick(s: Seating, d: Dining, tvParts: Component[]) {
	const sp = pieces(s);
	const pts = sp.flatMap(p => p.poly);
	if (pts.some(p => p.x < 2 || p.y < 1 || p.x > 185 || p.y > 192)) return false;
	if (pts.some(p => p.x > 158 && p.y > 108)) return false;
	if (sp.some(p => polyCircleDist(p.poly, ROOM.column) < 3)) return false;
	const others = [...pieces(d), ...tvParts.flatMap(pieces)].map(p => p.poly);
	if (sp.some(p => others.some(o => overlapDepth(p.poly, o) > -2))) return false;
	const tv = tvParts.find((c): c is Tv => c.type === 'tv')!;
	for (const q of seatsOf(s)) {
		if (q.legroom && (polyCircleDist(q.legroom, ROOM.column) < 0 || others.some(o => overlapDepth(q.legroom!, o) > 0)))
			return false;
		const to = { x: tv.x - q.eye.x, y: tv.y - q.eye.y };
		if ((to.x * q.facing.x + to.y * q.facing.y) / Math.hypot(to.x, to.y) < Math.cos((65 * Math.PI) / 180)) return false;
	}
	return true;
}

if (import.meta.main) {
	const finalists: { L: Layout; s: ReturnType<typeof score> }[] = [];
	let screened = 0;
	for (const t of tvs())
		for (const d of dinings()) {
			const local: { L: Layout; s: ReturnType<typeof score> }[] = [];
			for (const so of sofas()) {
				if (!quick(so, d.d, t.parts)) continue;
				screened++;
				const L: Layout = {
					id: `${t.name}|${d.name}|${so.label}${so.length}@${so.x},${so.y}`,
					title: '',
					room,
					components: [d.d, so, ...t.parts],
				};
				const s = score(L, false);
				if (s.bad || s.ok < 6) continue;
				local.push({ L, s });
			}
			local.sort((a, b) => b.s.total - a.s.total);
			for (const c of local.slice(0, 4)) finalists.push({ L: c.L, s: score(c.L, true) });
		}
	finalists.sort((a, b) => b.s.total - a.s.total);
	console.log(`${screened} poses passed the screen, ${finalists.length} finalists`);
	for (const f of finalists.slice(0, 24))
		console.log(
			f.s.total.toFixed(1),
			f.L.id,
			'|',
			f.s.ev.summary.Seats,
			'|',
			f.s.ev.summary['Eye → screen'],
			f.s.ev.summary['Screen fills'],
			'| pockets',
			f.s.ev.summary['Odd pockets'],
		);
}
