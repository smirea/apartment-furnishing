#!/usr/bin/env bun
// Two sofas in a V that both face the TV: a main sofa on the west glass and an angled sofa north of its sightlines.
import {
	evaluate,
	overlapDepth,
	pieces,
	polyCircleDist,
	ROOM,
	seatsOf,
	segmentHitsPoly,
	tvSize,
	type Layout,
	type Seating,
	type Tv,
} from './model.ts';
import { at } from './layouts.ts';

const tv: Tv = { id: 'tv', type: 'tv', x: 194, y: 59, rot: 270, diag: 98, mount: 'wall', center: 50 };
const half = tvSize(98).screenW / 2;
const edges = [0, 0.25, 0.5, 0.75, 1].map(t => ({ x: 194, y: 59 - half + 2 * half * t }));
type R = {
	main: Seating;
	s2: Seating;
	worst: number;
	maxFov: number;
	minW: number;
	island: number;
	n: number;
	summary: string;
};
const out: R[] = [];
const mains: [number, number][] = [
	[72, 2],
	[80, 2],
	[96, 3],
	[104, 3],
];
const twos: [number, number][] = [
	[72, 2],
	[80, 2],
	[88, 3],
	[96, 3],
];
for (const [ml, mn] of mains)
	for (const my of [34, 40, 46])
		for (const mx of [4, 16, 28]) {
			const main = at(
				{
					id: 'sofa',
					label: 'Main sofa',
					type: 'seating',
					x: 0,
					y: 0,
					rot: 90,
					length: ml,
					depth: 40,
					arm: 5,
					seats: mn,
				} as Seating,
				mx,
				my,
			);
			const mainPieces = pieces(main);
			const mainSeats = seatsOf(main);
			if (mainSeats.some(q => q.legroom && polyCircleDist(q.legroom, ROOM.column) < 1)) continue;
			if (polyCircleDist(mainPieces[0]!.poly, ROOM.column) < 3) continue;
			for (const [len, n] of twos)
				for (let rot = 110; rot <= 170; rot += 5)
					for (let x = 30; x <= 130; x += 4)
						for (let y = 100; y <= 145; y += 3) {
							const s2: Seating = {
								id: 'sofa2',
								label: 'Angled sofa',
								type: 'seating',
								x,
								y,
								rot,
								length: len,
								depth: 38,
								arm: 5,
								seats: n,
							};
							const p2 = pieces(s2);
							const pts = p2.flatMap(p => p.poly);
							if (pts.some(p => p.x < 1 || p.y < 1 || p.x > 185 || p.y > 157)) continue;
							if (pts.some(p => p.x > 155 && p.y > 105)) continue;
							if (pts.some(p => p.x < 32 && p.y > 141)) continue;
							if (polyCircleDist(p2[0]!.poly, ROOM.column) < 3) continue;
							if (mainPieces.some(mp => overlapDepth(mp.poly, p2[0]!.poly) > -2)) continue;
							const s2seats = seatsOf(s2);
							if (
								s2seats.some(
									q =>
										q.legroom &&
										(polyCircleDist(q.legroom, ROOM.column) < 1 ||
											mainPieces.some(mp => overlapDepth(mp.poly, q.legroom!) > 0)),
								)
							)
								continue;
							if (mainSeats.some(q => q.legroom && overlapDepth(p2[0]!.poly, q.legroom) > 0)) continue;
							if (mainSeats.some(q => edges.some(e => segmentHitsPoly(q.eye, e, p2[0]!.poly)))) continue;
							if (s2seats.some(q => edges.some(e => mainPieces.some(mp => segmentHitsPoly(q.eye, e, mp.poly)))))
								continue;
							const ev = evaluate({ id: 'p', title: 'p', components: [main, s2, tv] } as Layout);
							if (ev.issues.some(i => i.level === 'bad' && !i.msg.includes('coffee'))) continue;
							if (ev.islandGap < 38) continue;
							out.push({
								main,
								s2,
								n: ev.seats.length,
								worst: Math.max(...ev.seats.map(s => s.turn)),
								maxFov: Math.max(...ev.seats.map(s => s.fov)),
								minW: Math.min(...ev.seats.map(s => s.width)),
								island: ev.islandGap,
								summary: ev.seats
									.map(s => `${Math.round(s.turn)}/${Math.round(s.offAxis)}/${Math.round(s.fov)}`)
									.join(' '),
							});
						}
		}
console.log(out.length, 'valid');
for (const n of [5, 6]) {
	const best = out
		.filter(r => r.n === n && r.maxFov <= 48 && r.minW >= 26)
		.sort((a, b) => a.worst - b.worst)
		.slice(0, 6);
	for (const r of best)
		console.log(
			`n ${r.n} worst ${r.worst.toFixed(0)} fov≤${r.maxFov.toFixed(0)} minW ${r.minW.toFixed(0)} island ${r.island.toFixed(0)} | main ${r.main.length}x${r.main.seats} at (${r.main.x},${r.main.y}) | s2 ${r.s2.length}x${r.s2.seats} rot ${r.s2.rot} at (${r.s2.x},${r.s2.y}) | ${r.summary}`,
		);
}
