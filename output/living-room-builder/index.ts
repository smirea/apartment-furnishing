#!/usr/bin/env bun
// Writes the hub page output/index.html, which frames everything: the picks, the builder, every layout, the panel
// and council rounds, and the earlier studies. Also writes the two pages it frames that nothing else builds:
// picks.html and panel-rounds.html.
import { join } from 'node:path';
import { card, compactGallery, PAGE_CSS, THEME_CSS } from './build.ts';
import { LAYOUTS } from './layouts.ts';
import type { Layout } from './model.ts';

const dir = import.meta.dir;
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const byId = (id: string) => {
	const l = LAYOUTS.find(x => x.id === id);
	if (!l) throw new Error(`unknown layout ${id}`);
	return l;
};

// The builder and gallery embed the layouts, so rebuild them first or the hub frames stale copies.
const built = Bun.spawnSync([join(dir, 'build.ts')], { stdout: 'inherit', stderr: 'inherit' });
if (built.exitCode !== 0) throw new Error('build.ts failed');

const THEME = `<style>${THEME_CSS}body{padding:12px}</style>`;
await Bun.write(
	join(dir, 'picks.html'),
	compactGallery([byId('H2'), byId('G2')]).replace('</head>', `${THEME}</head>`),
);

type PanelScores = {
	overall: number;
	seating: number;
	tv: number;
	coffeeTable: number;
	space: number;
	floorPlan: number;
};
type PanelRound = {
	round: number;
	date: string;
	tvCap?: number;
	layout: Layout;
	scores: Record<string, PanelScores | string>;
	findings: string[];
	outcome?: string;
};
const panel: PanelRound[] = [];
for (let n = 1; ; n++) {
	const f = [...new Bun.Glob(`rounds/round-${n}-*.json`).scanSync(dir)][0];
	if (!f) break;
	panel.push(await Bun.file(join(dir, f)).json());
}
const cell = (n: number) => `<td class="n ${n >= 9 ? 'pass' : n >= 8 ? 'near' : 'low'}">${n}</td>`;
const panelRows = panel
	.map(r => {
		const rows = Object.entries(r.scores)
			.map(([who, s]) =>
				typeof s === 'string'
					? `<tr><th>${esc(who)}</th><td colspan="6" class="n muted">${esc(s)}</td></tr>`
					: `<tr><th>${esc(who)}</th>${[s.overall, s.seating, s.tv, s.coffeeTable, s.space, s.floorPlan].map(cell).join('')}</tr>`,
			)
			.join('');
		return `<section class="round"><h2>Round ${r.round} · ${esc(r.layout.id)} · ${esc(r.layout.title)}</h2><p class="muted">${esc(r.date)}${r.tvCap ? ` · TV capped at ${r.tvCap}″` : ''}</p>
<div class="scroll"><table class="council"><thead><tr><th>Reviewer</th><th>Overall</th><th>Seating</th><th>TV</th><th>Coffee table</th><th>Space</th><th>Plan</th></tr></thead><tbody>${rows}</tbody></table></div>
<ul>${r.findings.map(f => `<li>${esc(f)}</li>`).join('')}</ul>${r.outcome ? `<p><b>Outcome:</b> ${esc(r.outcome)}</p>` : ''}
<details><summary>The layout as reviewed</summary>${card(r.layout)}</details></section>`;
	})
	.join('');
await Bun.write(
	join(dir, 'panel-rounds.html'),
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Panel rounds</title><style>
:root{--background:#f6f4ef;--foreground:#1d1d1b;--muted-foreground:#6d6a62;--border:#d9d5cb;--card:#fff;--success:#2f7d4a;--warning:#b5651d;--destructive:#b3261e}
@media (prefers-color-scheme:dark){:root{--background:#161614;--foreground:#ecebe6;--muted-foreground:#a29f96;--border:#37352f;--card:#1f1f1c;--success:#5cb27a;--warning:#e09a50;--destructive:#ef6b62}}
body{margin:0;background:var(--background)}
${PAGE_CSS}
.wrap{max-width:1200px;margin:0 auto;padding:16px}.round{margin:0 0 28px}.muted{color:var(--muted-foreground)}
table.council{width:100%;border-collapse:collapse;font-size:13px}table.council th,table.council td{border-bottom:1px solid var(--border);padding:6px 8px;text-align:left}
table.council td.n{text-align:center;font-weight:700}.pass{color:var(--success)}.near{color:var(--warning)}.low{color:var(--destructive)}.scroll{overflow-x:auto}
details{margin-top:8px}summary{cursor:pointer;font-weight:600}
</style></head><body><div class="lr wrap"><h1>Panel rounds: couch + TV</h1><p class="muted">Three reviewers (grok-4.7, gpt-6.1-terra, claude-sonnet-5-5) scoring each submission 1–10.</p>${panelRows}</div></body></html>`,
);

type Frame = { title: string; src: string; note: string; height: number };
const section = (id: string, title: string, lede: string, body: string) =>
	`<section id="${id}"><div class="head"><h2>${title}</h2><p>${lede}</p></div>${body}</section>`;
const frame = (f: Frame, lazy = true) =>
	`<figure class="frame"><figcaption><span><b>${esc(f.title)}</b> · ${esc(f.note)}</span><a href="${f.src}" target="_blank" rel="noopener">Open ↗</a></figcaption><iframe src="${f.src}" title="${esc(f.title)}" style="height:${f.height}px"${lazy ? ' loading="lazy"' : ''}></iframe></figure>`;
const tabs = (name: string, frames: Frame[]) =>
	`<div class="tabs">${frames
		.map(
			(f, i) =>
				`<input type="radio" name="${name}" id="${name}-${i}"${i === frames.length - 1 ? ' checked' : ''}><label for="${name}-${i}">${esc(f.title)}</label>`,
		)
		.join('')}${frames.map((f, i) => `<div class="tab" data-for="${name}-${i}">${frame(f)}</div>`).join('')}</div>`;

const councilRounds: { round: number; layout: Layout; verdicts: { scores: { overall: number } | null }[] }[] =
	await Bun.file(join(dir, 'council/rounds.json')).json();
const councilFrames = councilRounds.map(r => {
	const pass = r.verdicts.filter(v => v.scores && v.scores.overall >= 9).length;
	return {
		title: `Round ${r.round} · ${r.layout.id}`,
		src: `living-room-builder/council/round-${r.round}.html`,
		note: `${pass}/${r.verdicts.length} councillors at 9+`,
		height: 1500,
	};
});
const tabCss = councilFrames.map((_, i) => `#council-${i}:checked~.tab[data-for="council-${i}"]`).join(',');
const earlier: Frame[] = [
	{
		title: 'Layout permutations',
		src: 'living-room-layouts/index.html',
		note: 'first computed fit checks and TV sizing',
		height: 1100,
	},
	{
		title: 'West Elm Harmony fit study',
		src: 'living-room-layouts/harmony.html',
		note: 'one modular sofa, measured',
		height: 1100,
	},
	{
		title: 'Fixed 3D scene renders',
		src: 'living-room-fixed-scene/comparison.html',
		note: 'four arrangements rendered in Blender',
		height: 1100,
	},
	{
		title: 'Measured design concepts',
		src: 'living-room-measured-v2/comparison.html',
		note: 'AI renders from measured geometry',
		height: 1100,
	},
	{
		title: 'First design concepts',
		src: 'living-room-concepts/comparison.html',
		note: 'four moodboard concepts',
		height: 1100,
	},
];

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Living room plans</title><style>
:root{--bg:#f6f4ef;--fg:#1d1d1b;--muted:#6d6a62;--line:#d9d5cb;--card:#fff;--accent:#8c6f56;--pass:#2f7d4a}
@media (prefers-color-scheme:dark){:root{--bg:#141412;--fg:#ecebe6;--muted:#a29f96;--line:#33312c;--card:#1e1d1a;--accent:#c9a77c;--pass:#5cb27a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,system-ui,sans-serif}
header{padding:32px 16px 8px;max-width:1240px;margin:0 auto}h1{font-size:28px;margin:0 0 6px;letter-spacing:-.01em}header p{color:var(--muted);margin:0;max-width:760px}
nav{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
nav div{max-width:1240px;margin:0 auto;padding:10px 16px;display:flex;gap:18px;overflow-x:auto;white-space:nowrap}nav a{color:var(--muted);text-decoration:none;font-size:14px}nav a:hover{color:var(--fg)}
main{max-width:1240px;margin:0 auto;padding:8px 16px 64px}section{padding:28px 0 8px;scroll-margin-top:48px}
.head h2{font-size:20px;margin:0 0 4px}.head p{margin:0 0 14px;color:var(--muted);max-width:820px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin:0 0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.card h3{margin:0 0 4px;font-size:16px}.card p{margin:0;color:var(--muted);font-size:14px}
.badge{display:inline-block;font-size:12px;font-weight:600;color:var(--pass);border:1px solid currentColor;border-radius:99px;padding:0 8px;margin-bottom:6px}
.frame{margin:0 0 18px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.frame figcaption{display:flex;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line);font-size:14px}.frame figcaption span{color:var(--muted)}.frame figcaption b{color:var(--fg)}
.frame a{color:var(--accent);text-decoration:none;white-space:nowrap}.frame iframe{display:block;width:100%;border:0;background:var(--bg)}
.tabs{display:flex;flex-wrap:wrap;gap:6px}.tabs input{position:absolute;opacity:0}.tabs label{padding:6px 12px;border:1px solid var(--line);border-radius:99px;cursor:pointer;font-size:14px;color:var(--muted)}
.tabs input:checked+label{color:var(--fg);border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}.tab{display:none;flex-basis:100%;margin-top:8px}${tabCss}{display:block}
details.study{margin:0 0 10px;background:var(--card);border:1px solid var(--line);border-radius:12px}details.study summary{cursor:pointer;padding:12px 14px;font-weight:600}details.study summary span{font-weight:400;color:var(--muted)}details.study .frame{margin:0;border:0;border-top:1px solid var(--line);border-radius:0}
</style></head><body>
<header><h1>Living room plans</h1><p>Everything worked out for the B4 living room: the measured layout builder, every layout tried, and the review rounds that picked a winner. Each panel below is the live page; use <b>Open ↗</b> for full screen.</p></header>
<nav><div><a href="#picks">Picks</a><a href="#builder">Builder</a><a href="#layouts">All layouts</a><a href="#council">Council rounds (with dining)</a><a href="#panel">Panel rounds (couch + TV)</a><a href="#earlier">Earlier studies</a></div></nav>
<main>
${section(
	'picks',
	'The picks',
	'Two winners, depending on whether the room needs a dining table.',
	`<div class="cards"><div class="card"><span class="badge">Council 4/5 at 9+</span><h3>H2 · with dining</h3><p>85″ wall TV at 8 ft, a 4-seat sofa east of the column, and a 72″ six-seat table off the island.</p></div><div class="card"><span class="badge">Panel 3/3 at 9+</span><h3>G2 · without dining</h3><p>98″ TV across the south-east corner, a 6-seat L sectional facing it, and an Aries ottoman with a walnut tray.</p></div></div>${frame({ title: 'H2 and G2', src: 'living-room-builder/picks.html', note: 'plans and headline numbers', height: 660 }, false)}`,
)}
${section('builder', 'Layout builder', 'Drag, rotate and resize every piece; every layout is re-scored live for sightlines, legroom, routes and dining pull-out room.', frame({ title: 'Builder', src: 'living-room-builder/builder.html#H2', note: 'opens on H2; pick any layout from the menu', height: 1150 }))}
${section('layouts', 'Every layout tried', 'Each layout with its plan, metrics, TV-wall elevation and seat table.', frame({ title: 'Gallery', src: 'living-room-builder/gallery.html', note: `${LAYOUTS.length} layouts`, height: 1400 }))}
${section('council', 'Council rounds · couch + TV + dining', 'Five harnesses (claude-sonnet-5-5, grok-4.7, gemini-4-argon, composer-2.5, gpt-6.1-terra) scored each submission; the goal was 9+ from at least four.', tabs('council', councilFrames))}
${section('panel', 'Panel rounds · couch + TV', 'The earlier three-reviewer panel, from the first 115″ L sectional to the 98″ corner-TV pick.', frame({ title: 'Panel rounds', src: 'living-room-builder/panel-rounds.html', note: `${panel.length} rounds`, height: 1300 }))}
${section('earlier', 'Earlier studies', 'Work in output/ from before the builder. Each loads when opened.', earlier.map(f => `<details class="study"><summary>${esc(f.title)} <span>· ${esc(f.note)}</span></summary>${frame(f)}</details>`).join(''))}
</main></body></html>`;
await Bun.write(join(dir, '..', 'index.html'), html);
console.log('wrote output/index.html, picks.html, panel-rounds.html');
