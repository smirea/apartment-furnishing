#!/usr/bin/env bun
// Searches rotated L sectionals (main run + left return) for the most seats that watch a wall-mounted 98" TV comfortably.
import {
	evaluate,
	pieces,
	polyCircleDist,
	ROOM,
	seatsOf,
	tvSize,
	type Layout,
	type Seating,
	type Tv,
} from './model.ts';

const TVYS = (process.env.TVY ?? '48,54,60,66').split(',').map(Number);
let TVY = 0;
const { screenW } = tvSize(98);
const CORNER = !!process.env.CORNER;
// Corner TV: 98" on a corner console across the south-east corner, facing north-west.
const cornerTv = {
	c: { x: 165.4, y: 34.6 },
	n: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
	r: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
};

const ang = (u: { x: number; y: number }, v: { x: number; y: number }) =>
	(Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))))) *
		180) /
	Math.PI;
type Hit = { sofa: Seating; ok: number; worst: number; minW: number; seats: number; ty: number };
const hits: Hit[] = [];
for (const ty of TVYS)
	for (const rot of (process.env.ROTS ?? '60,65,70,75,80,85,90').split(',').map(Number))
		for (const depth of (process.env.DEPTHS ?? '40').split(',').map(Number))
			for (const length of [98, 106, 114, 122])
				for (const ret of [100, 112, 124, 136])
					for (const seatsR of (process.env.RS ?? '2,3').split(',').map(Number))
						for (let x = 20; x <= 110; x += 3)
							for (let y = 60; y <= 140; y += 3) {
								const sofa: Seating = {
									id: 'sofa',
									type: 'seating',
									x,
									y,
									rot,
									length,
									depth,
									arm: 5,
									seats: 2,
									left: { length: ret, kind: 'seats', seats: seatsR, corner: true },
								};
								const pts = pieces(sofa).flatMap(p => p.poly);
								if (pts.some(p => p.x < 1 || p.y < 1 || p.x > 185 || p.y > 156)) continue;
								if (CORNER && pts.some(p => p.x - p.y > 95)) continue;
								if (pts.some(p => p.x > 155 && p.y > 105)) continue;
								if (pts.some(p => p.x < 30 && p.y > 141)) continue;
								if (pieces(sofa).some(p => polyCircleDist(p.poly, ROOM.column) < 3)) continue;
								TVY = ty;
								const C = CORNER ? cornerTv.c : { x: 194, y: TVY };
								const Lp = CORNER
									? { x: C.x - (cornerTv.r.x * screenW) / 2, y: C.y - (cornerTv.r.y * screenW) / 2 }
									: { x: 194, y: TVY + screenW / 2 };
								const Rp = CORNER
									? { x: C.x + (cornerTv.r.x * screenW) / 2, y: C.y + (cornerTv.r.y * screenW) / 2 }
									: { x: 194, y: TVY - screenW / 2 };
								const N = CORNER ? cornerTv.n : { x: -1, y: 0 };
								const ss = seatsOf(sofa);
								if (
									ss.some(
										q =>
											q.legroom &&
											(polyCircleDist(q.legroom, ROOM.column) < 1 || q.legroom.some(v => v.x < 0 || v.y < 0)),
									)
								)
									continue;
								let ok = 0,
									worst = 0,
									minW = Infinity;
								for (const s of ss) {
									const toC = { x: C.x - s.eye.x, y: C.y - s.eye.y };
									const fov = ang({ x: Lp.x - s.eye.x, y: Lp.y - s.eye.y }, { x: Rp.x - s.eye.x, y: Rp.y - s.eye.y });
									const off = ang(N, { x: -toC.x, y: -toC.y });
									const turn = ang(s.facing, toC);
									if (fov >= 26 && fov <= 46 && off <= 30 && turn <= 35) ok += 2;
									else if (fov >= 20 && fov <= 50 && off <= 45 && turn <= 50) ok += 1;
									worst = Math.max(worst, turn);
									minW = Math.min(minW, s.width);
								}
								if (minW < 28 || ss.length < 5) continue;
								hits.push({ sofa, ok, worst, minW, seats: ss.length, ty });
							}
const minX = (h: Hit) => Math.min(...pieces(h.sofa).flatMap(p => p.poly.map(v => v.x)));
const area = (h: Hit) => h.sofa.length * h.sofa.depth + (h.sofa.left!.length - h.sofa.depth) * h.sofa.depth;
hits.sort(
	process.env.SORT === 'glass'
		? (a, b) => b.ok - a.ok || b.seats - a.seats || minX(a) - minX(b) || area(b) - area(a)
		: (a, b) => b.ok - a.ok || b.seats - a.seats || a.worst - b.worst || b.sofa.depth - a.sofa.depth || b.minW - a.minW,
);
console.log(`${hits.length} pass`);
const seen = new Set<string>();
for (const h of hits) {
	const k = `${Math.round(minX(h) / 6)}-${h.sofa.depth}-${h.sofa.rot}-${h.sofa.length}-${h.sofa.left!.length}-${h.sofa.left!.seats}-${h.ty}`;
	if (seen.has(k)) continue;
	seen.add(k);
	const tv: Tv = CORNER
		? { id: 'tv', type: 'tv', x: 165.4, y: 34.6, rot: 315, diag: 98, mount: 'stand', center: 48 }
		: { id: 'tv', type: 'tv', x: 194, y: h.ty, rot: 270, diag: 98, mount: 'wall', center: 50 };
	const stand = { id: 'console', type: 'console' as const, x: 171.8, y: 28.2, rot: 315, w: 56, d: 18, h: 20 };
	const ev = evaluate({ id: 's', title: 's', components: CORNER ? [h.sofa, tv, stand] : [h.sofa, tv] } as Layout);
	if (ev.issues.some(i => i.level === 'bad' && !i.msg.includes('coffee'))) continue;
	console.log(
		`minX ${minX(h).toFixed(0)} tvY ${h.ty} score ${h.ok}/${h.seats} worst turn ${h.worst.toFixed(0)} minW ${h.minW.toFixed(0)} | d ${h.sofa.depth} rot ${h.sofa.rot} main ${h.sofa.length} ret ${h.sofa.left!.length}x${h.sofa.left!.seats} at (${h.sofa.x},${h.sofa.y}) | island ${ev.islandGap.toFixed(0)} | ${ev.routes.map(r => r.key + ' ' + r.width.toFixed(0)).join(' ')} | ${ev.seats.map(s => Math.round(s.turn) + '/' + Math.round(s.fov)).join(' ')}`,
	);
	if (seen.size > 20) break;
}
