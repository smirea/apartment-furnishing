#!/usr/bin/env bun
// Writes builder.html (the interactive editor) and gallery.html (every layout, static) next to this file.
// `./build.ts --gallery <out.html> [ids...]` writes a gallery of just those layouts instead; `--compact` writes a
// two-column overview with plans and headline numbers only.
import { join } from 'node:path';
import { LAYOUTS } from './layouts.ts';
import { evaluate, type Layout } from './model.ts';
import { PLAN_CSS, renderElevation, renderPlan, roomDefs, seatTable } from './render.ts';

const dir = import.meta.dir;

const PAGE_CSS = `
${PLAN_CSS}
.lr{font-family:var(--font-sans,system-ui,sans-serif);color:var(--foreground,#1d1d1b);font-size:13px;line-height:1.45}
.lr h2{font-size:15px;margin:0 0 2px}
.lr .card{border:1px solid var(--border,#d9d5cb);border-radius:var(--radius,10px);padding:14px;margin:0 0 16px;background:var(--card,transparent)}
.lr .cols{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:14px;align-items:start}
.lr .kv{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid var(--border,#e5e2da);padding:2px 0}
.lr .kv span{color:var(--muted-foreground,#6d6a62)}
.lr .score{font-weight:700;margin-bottom:4px}
.lr ul.issues{margin:6px 0 0;padding-left:16px}
.lr li.bad{color:var(--destructive,#b3261e)}
.lr li.warn{color:var(--warning,#b5651d)}
.lr li.ok{color:var(--success,#2f7d4a)}
.lr table.seats{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
.lr table.seats th,.lr table.seats td{text-align:left;padding:2px 4px;border-bottom:1px solid var(--border,#e5e2da)}
.lr table.seats th{color:var(--muted-foreground,#6d6a62);font-weight:600}
.lr .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
.lr .dot.prime{background:var(--success,#2f7d4a)}.lr .dot.good{background:var(--warning,#b5651d)}.lr .dot.side{background:var(--destructive,#b3261e)}
.lr .notes{margin:4px 0 8px;padding-left:16px;color:var(--muted-foreground,#6d6a62)}
.lr .legend{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--muted-foreground,#6d6a62);margin:0 0 12px}
.lr .elev{max-width:340px;margin-top:8px}
@media (max-width:640px){.lr .cols{grid-template-columns:1fr}}
`;

const LEGEND = `<div class="legend"><span><span class="dot prime"></span>prime seat (≤30° off-axis, ≤35° head turn, screen fills 26–46°)</span><span><span class="dot good"></span>good seat (≤45° off-axis, ≤50° head turn)</span><span><span class="dot side"></span>side seat (anything else: turns more than 50°, sits more than 45° off-axis, or the screen fills more than 50°)</span><span>shaded lines: walking routes from the kitchen, labeled at their narrowest point</span></div>`;

export function card(l: Layout) {
	const ev = evaluate(l);
	const kv = Object.entries(ev.summary)
		.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`)
		.join('');
	const notes = l.notes?.length ? `<ul class="notes">${l.notes.map(n => `<li>${n}</li>`).join('')}</ul>` : '';
	const issues = ev.issues.map(i => `<li class="${i.level}">${i.msg}</li>`).join('');
	return `<section class="card"><h2>${l.id} · ${l.title}</h2>${notes}<div class="cols"><div>${renderPlan(l, ev)}</div><div>${kv}<ul class="issues">${issues}</ul><div class="elev">${renderElevation(l, ev)}</div></div></div>${seatTable(ev)}</section>`;
}

function compactCard(l: Layout) {
	const ev = evaluate(l);
	const bad = ev.issues
		.filter(i => i.level === 'bad')
		.map(i => `<li class="bad">${i.msg}</li>`)
		.join('');
	const facts = ['TV', 'Seats', 'Seat run', 'Eye → screen', 'Coffee table gap']
		.map(k => `<div class="kv"><span>${k}</span><b>${ev.summary[k]}</b></div>`)
		.join('');
	return `<section class="card"><h2>${l.id} · ${l.title}</h2>${l.notes?.[0] ? `<p class="note">${l.notes[0]}</p>` : ''}${renderPlan(l, ev, { routes: false, sight: false, shared: true })}${facts}${bad ? `<ul class="issues">${bad}</ul>` : ''}</section>`;
}

export function compactGallery(layouts: Layout[]) {
	const unused =
		/^\.lr-plan (\.(route|routec|rok|rwarn|rbad|open-rect|sel|wedge|sight)|\[data-id\])\{.*$|^\.lr (table\.seats[^{]*|\.cols|\.score|\.notes|\.elev|li\.(ok|warn))\{.*$|^@media.*$/gm;
	const css = `${PAGE_CSS.replace(unused, '')}.lr .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}.lr .grid .card{margin:0}.lr .note{color:var(--muted-foreground,#6d6a62);margin:2px 0 6px;font-size:12px}`;
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Living room layouts</title><style>${css}</style></head><body><div class="lr">${roomDefs()}${LEGEND.replace(/<span>shaded lines[^<]*<\/span>/, '')}<div class="grid">${layouts.map(compactCard).join('')}</div></div></body></html>`;
}

export function gallery(layouts: Layout[], title = 'Living room layouts') {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${PAGE_CSS}</style></head><body><div class="lr">${LEGEND}${layouts.map(card).join('')}</div></body></html>`;
}

async function builder() {
	const out = await Bun.build({ entrypoints: [join(dir, 'ui.ts')], target: 'browser', format: 'esm' });
	if (!out.success) throw new AggregateError(out.logs, 'ui bundle failed');
	const js = (await out.outputs[0]!.text()).replaceAll('</script', '<\\/script');
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Living Room Builder</title><style>
:root{--background:#f6f4ef;--foreground:#1d1d1b;--muted-foreground:#6d6a62;--border:#d9d5cb;--card:#fff;--chart-1:#8c6f56;--chart-2:#3f8fc4;--chart-3:#4f8f4f;--chart-4:#c09a68;--success:#2f7d4a;--warning:#b5651d;--destructive:#b3261e;--ring:#2563eb;--radius:10px}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--background:#161614;--foreground:#ecebe6;--muted-foreground:#a29f96;--border:#37352f;--card:#1f1f1c;--chart-1:#b08a68;--chart-4:#c9a77c;--success:#5cb27a;--warning:#e09a50;--destructive:#ef6b62}}
body{margin:0;background:var(--background)}
${PAGE_CSS}
.app{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(320px,1fr);gap:16px;padding:16px;max-width:1500px;margin:0 auto}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px 0;max-width:1500px;margin:0 auto}
.bar h1{font-size:16px;margin:0 12px 0 0}
button,select,input,textarea{font:inherit;color:inherit;background:var(--card);border:1px solid var(--border);border-radius:6px;padding:3px 7px}
button{cursor:pointer}button.danger{color:var(--destructive)}
.panel{display:flex;flex-direction:column;gap:12px}
.box{border:1px solid var(--border);border-radius:var(--radius);padding:10px;background:var(--card)}
.box h3{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted-foreground);margin:0 0 6px}
#palette,.row-btns{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px}
.f{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:12px}
.f span{color:var(--muted-foreground)}.f input[type=number],.f input[type=text],.f select{width:84px}
.hint{color:var(--muted-foreground);font-size:12px}
#json{width:100%;height:140px;font:11px/1.3 ui-monospace,monospace}
#plan svg{touch-action:none;user-select:none}
.app>*,.panel>*{min-width:0}
#preset{max-width:100%;min-width:0}
.fields{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))!important}
.f span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#seats{overflow-x:auto}
@media (max-width:900px){.app{grid-template-columns:1fr;padding:12px}.bar{padding:12px 12px 0}}
</style></head><body><div class="lr">
<div class="bar"><h1>Living room builder</h1><select id="preset"></select><button id="reset">Reset</button><button id="copy">Copy JSON</button>
<label class="hint"><input type="checkbox" id="v-routes"> routes</label><label class="hint"><input type="checkbox" id="v-sight"> sightlines</label><label class="hint"><input type="checkbox" id="v-openRect"> open floor</label><span id="title" class="hint"></span></div>
<div class="app"><div><div id="plan" class="box"></div>${LEGEND}<div class="box"><h3>Seats</h3><div id="seats"></div></div></div>
<div class="panel"><div class="box"><h3>Metrics</h3><div id="summary"></div><ul class="issues" id="issues"></ul></div>
<div class="box"><h3>Selected</h3><div id="inspector"></div></div>
<div class="box"><h3>Add</h3><div id="palette"></div></div>
<div class="box"><h3>TV elevation</h3><div id="elev" class="elev"></div></div>
<div class="box"><h3>Layout JSON</h3><textarea id="json" spellcheck="false"></textarea><button id="load">Load JSON</button></div></div></div>
</div><script type="module">${js}</script></body></html>`;
}

const pick = (ids: string[]) =>
	ids.length
		? ids.map(id => {
				const l = LAYOUTS.find(x => x.id === id);
				if (!l) throw new Error(`unknown layout ${id}`);
				return l;
			})
		: LAYOUTS;

const [mode, out, ...ids] = process.argv.slice(2);
if (mode === '--gallery' || mode === '--compact') {
	if (!out) throw new Error(`usage: ./build.ts ${mode} <out.html> [ids...]`);
	await Bun.write(out, mode === '--gallery' ? gallery(pick(ids)) : compactGallery(pick(ids)));
	console.log(`wrote ${out}`);
} else {
	await Bun.write(join(dir, 'builder.html'), await builder());
	await Bun.write(join(dir, 'gallery.html'), gallery(LAYOUTS));
	console.log('wrote builder.html, gallery.html');
}
