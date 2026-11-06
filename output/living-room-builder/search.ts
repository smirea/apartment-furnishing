#!/usr/bin/env bun
// Brute-force search for seating placements that put the most seats square to a wall-mounted TV.
// Prefilters on cheap geometry, then runs the full evaluation (routes included) on the best few.
import {
	evaluate,
	frame,
	pieces,
	polyCircleDist,
	ROOM,
	seatsOf,
	tvSize,
	type Layout,
	type Seating,
	type Tv,
} from './model.ts';

type Cand = {
	sofa: Seating;
	tvY: number;
	prime: number;
	good: number;
	minW: number;
	worstTurn: number;
	meanFov: number;
};

const lengths = (process.env.LENS ?? '130,136,142,148,154,160,166').split(',').map(Number);
const results: Cand[] = [];
const diag = Number(process.argv[2] ?? 98);
const { screenW } = tvSize(diag);
const colGap = (s: Seating) => {
	let g = Infinity;
	for (const p of pieces(s))
		for (let i = 0; i < 4; i++) {
			const a = p.poly[i]!,
				b = p.poly[(i + 1) % 4]!;
			const t = Math.max(
				0,
				Math.min(
					1,
					((ROOM.column.x - a.x) * (b.x - a.x) + (ROOM.column.y - a.y) * (b.y - a.y)) /
						((b.x - a.x) ** 2 + (b.y - a.y) ** 2),
				),
			);
			g = Math.min(
				g,
				Math.hypot(a.x + t * (b.x - a.x) - ROOM.column.x, a.y + t * (b.y - a.y) - ROOM.column.y) - ROOM.column.r,
			);
		}
	return g;
};

for (const tvY of (process.env.TVY ?? '55,58,61').split(',').map(Number))
	for (const length of lengths)
		for (const seats of [5, 6])
			for (const chaise of [false])
				for (let rot = 96; rot <= 136; rot += 3)
					for (let x = 20; x <= 100; x += 2)
						for (let y = 50; y <= 140; y += 2) {
							const sofa: Seating = {
								id: 'sofa',
								type: 'seating',
								x,
								y,
								rot,
								length,
								arm: Number(process.env.ARM ?? 5),
								depth: Number(process.env.DEPTH ?? 40),
								seats: chaise ? seats - 1 : seats,
								...(chaise ? { left: { length: 64, width: 34, kind: 'chaise' as const, seats: 1 } } : {}),
							};
							const pts = pieces(sofa).flatMap(p => p.poly);
							if (pts.some(p => p.x < 1 || p.y < 1 || p.x > 185 || p.y > 159)) continue;
							if (pts.some(p => p.x > 160 && p.y > 110)) continue;
							if (pts.some(p => p.x < 32 && p.y > 140)) continue;
							if (colGap(sofa) < 4) continue;
							const ss = seatsOf(sofa);
							if (
								ss.some(
									q =>
										q.legroom &&
										(polyCircleDist(q.legroom, ROOM.column) < 1 || q.legroom.some(v => v.x < 0 || v.y < 0)),
								)
							)
								continue;
							const C = { x: 194, y: tvY };
							const L = { x: 194, y: tvY + screenW / 2 },
								R = { x: 194, y: tvY - screenW / 2 };
							let prime = 0,
								good = 0,
								worstTurn = 0,
								fovSum = 0,
								minW = Infinity;
							for (const s of ss) {
								const ang = (u: { x: number; y: number }, v: { x: number; y: number }) =>
									(Math.acos(
										Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)))),
									) *
										180) /
									Math.PI;
								const toC = { x: C.x - s.eye.x, y: C.y - s.eye.y };
								const fov = ang({ x: L.x - s.eye.x, y: L.y - s.eye.y }, { x: R.x - s.eye.x, y: R.y - s.eye.y });
								const off = ang({ x: -1, y: 0 }, { x: -toC.x, y: -toC.y });
								const turn = ang(s.facing, toC);
								if (fov >= 26 && fov <= 46 && off <= 30 && turn <= 35) prime++;
								else if (fov >= 20 && off <= 50 && turn <= 65) good++;
								worstTurn = Math.max(worstTurn, turn);
								fovSum += fov;
								minW = Math.min(minW, s.width);
							}
							if (minW < Number(process.argv[3] ?? 27)) continue;
							results.push({ sofa, tvY, prime, good, minW, worstTurn, meanFov: fovSum / ss.length });
						}

results.sort((a, b) => b.prime - a.prime || b.minW - a.minW || a.worstTurn - b.worstTurn);
console.log(`${results.length} candidates pass the prefilter`);
const shown = new Set<string>();
for (const c of results) {
	const key = `${c.sofa.length}-${c.sofa.seats}-${!!c.sofa.left}-${c.sofa.rot}`;
	if (shown.has(key)) continue;
	shown.add(key);
	const tv: Tv = { id: 'tv', type: 'tv', x: 194, y: c.tvY, rot: 270, diag, mount: 'wall', center: 50 };
	const layout: Layout = { id: 's', title: 's', components: [c.sofa, tv] };
	const ev = evaluate(layout);
	const bad = ev.issues.filter(i => i.level === 'bad' && !i.msg.includes('coffee'));
	if (bad.length) continue;
	const routes = ev.routes.map(r => `${r.key} ${r.width.toFixed(0)}`).join(' ');
	console.log(
		`prime ${c.prime} good ${c.good} minW ${c.minW.toFixed(0)} turn≤${c.worstTurn.toFixed(0)} fov ${c.meanFov.toFixed(0)} | L ${c.sofa.length} seats ${c.sofa.seats}${c.sofa.left ? '+chaise' : ''} rot ${c.sofa.rot} at (${c.sofa.x},${c.sofa.y}) tvY ${c.tvY} | island ${ev.islandGap.toFixed(0)} col ${colGap(c.sofa).toFixed(0)} | ${routes}`,
	);
	if (shown.size > 25) break;
}
void frame;
