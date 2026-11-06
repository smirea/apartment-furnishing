#!/usr/bin/env bun
import { LAYOUTS } from './layouts.ts';
import { evaluate } from './model.ts';

const ids = process.argv.slice(2);
const pick = ids.length ? LAYOUTS.filter(l => ids.includes(l.id)) : LAYOUTS;
if (ids.length && pick.length !== ids.length) throw new Error(`unknown layout id in ${ids.join(', ')}`);

for (const l of pick) {
	const t0 = performance.now();
	const ev = evaluate(l);
	console.log(`\n== ${l.id} · ${l.title}  (score ${ev.score}, ${Math.round(performance.now() - t0)}ms)`);
	for (const [k, v] of Object.entries(ev.summary)) console.log(`  ${k.padEnd(20)} ${v}`);
	for (const s of ev.seats)
		console.log(
			`  seat ${s.n} ${s.kind.padEnd(6)} ${s.rating.padEnd(5)} dist ${s.dist.toFixed(0)} fov ${s.fov.toFixed(0)}° off ${s.offAxis.toFixed(0)}° turn ${s.turn.toFixed(0)}° w ${Math.round(s.width * 2) / 2} access ${s.access.toFixed(0)}`,
		);
	for (const i of ev.issues) console.log(`  [${i.level}] ${i.msg}`);
}
