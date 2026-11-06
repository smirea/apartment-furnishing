#!/usr/bin/env bun
// Main 3-seat sofa on the west glass plus a second 3-seat sofa angled toward the TV: search the second sofa's pose.
import { evaluate, type Layout, type Seating, type Tv } from './model.ts';
import { at } from './layouts.ts';

const main = at(
	{
		id: 'sofa',
		label: 'Main sofa',
		type: 'seating',
		x: 0,
		y: 0,
		rot: 90,
		length: Number(process.env.ML ?? 109),
		depth: 40,
		arm: 5,
		seats: 3,
	} as Seating,
	4,
	Number(process.env.MY ?? 34),
);
const tv: Tv = { id: 'tv', type: 'tv', x: 194, y: 59, rot: 270, diag: 98, mount: 'wall', center: 50 };
type R = { s2: Seating; worst: number; maxFov: number; island: number; summary: string };
const out: R[] = [];
for (const [len, n] of (process.env.SIZES ?? '92:3,96:3,72:2,76:2')
	.split(',')
	.map(t => t.split(':').map(Number) as [number, number]))
	for (let rot = Number(process.env.R0 ?? 128); rot <= Number(process.env.R1 ?? 160); rot += 4)
		for (let x = 85; x <= 135; x += 3)
			for (let y = 105; y <= 135; y += 3) {
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
				const ev = evaluate({ id: 'p', title: 'p', components: [main, s2, tv] } as Layout);
				if (ev.issues.some(i => i.level === 'bad' && !i.msg.includes('coffee'))) continue;
				if (ev.islandGap < 38) continue;
				const two = ev.seats.filter(s => s.comp === 'sofa2');
				out.push({
					s2,
					worst: Math.max(...two.map(s => s.turn)),
					maxFov: Math.max(...ev.seats.map(s => s.fov)),
					island: ev.islandGap,
					summary: ev.seats.map(s => `${Math.round(s.turn)}/${Math.round(s.offAxis)}/${Math.round(s.fov)}`).join(' '),
				});
			}
out.sort((a, b) => a.worst - b.worst);
console.log(out.length, 'valid');
for (const n of [2, 3])
	for (const r of out.filter(r => r.maxFov <= 50 && r.s2.seats === n).slice(0, 6))
		console.log(
			`n ${r.s2.seats} worst ${r.worst.toFixed(0)} fov≤${r.maxFov.toFixed(0)} island ${r.island.toFixed(0)} | len ${r.s2.length} rot ${r.s2.rot} at (${r.s2.x},${r.s2.y}) | turn/off/fov ${r.summary}`,
		);
