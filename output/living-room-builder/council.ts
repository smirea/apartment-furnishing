#!/usr/bin/env bun
// Writes council/round-N.html for every round in council/rounds.json: the layout as it was submitted, then each
// councillor's scores and feedback as a table. `./council.ts [series-dir]` rebuilds them all (default `council`).
import { join } from 'node:path';
import { card, PAGE_CSS } from './build.ts';
import type { Layout } from './model.ts';

type Scores = { overall: number; couch: number; tv: number; dining: number; space: number; plan: number };
type Verdict = { councillor: string; model: string; scores: Scores | null; summary: string; feedback: string[] };
type Round = { round: number; date: string; layout: Layout; verdicts: Verdict[]; changes?: string[] };

const series = process.argv[2] ?? 'council';
const dir = join(import.meta.dir, series);
const rounds: Round[] = await Bun.file(join(dir, 'rounds.json')).json();
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const cell = (n: number | undefined) =>
	n === undefined ? '—' : `<td class="n ${n >= 9 ? 'pass' : n >= 8 ? 'near' : 'low'}">${n}</td>`;

for (const r of rounds) {
	const passing = r.verdicts.filter(v => v.scores && v.scores.overall >= 9).length;
	const rows = r.verdicts
		.map(
			v =>
				`<tr><th>${esc(v.councillor)}<div class="m">${esc(v.model)}</div></th>${
					v.scores
						? [v.scores.overall, v.scores.couch, v.scores.tv, v.scores.dining, v.scores.space, v.scores.plan]
								.map(cell)
								.join('')
						: '<td colspan="6" class="n">no score</td>'
				}<td>${esc(v.summary)}<ul>${v.feedback.map(f => `<li>${esc(f)}</li>`).join('')}</ul></td></tr>`,
		)
		.join('');
	const changes = r.changes?.length
		? `<h3>After this round</h3><ul>${r.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`
		: '';
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Council round ${r.round}</title><style>
:root{--background:#f6f4ef;--foreground:#1d1d1b;--muted-foreground:#6d6a62;--border:#d9d5cb;--card:#fff;--success:#2f7d4a;--warning:#b5651d;--destructive:#b3261e}
@media (prefers-color-scheme:dark){:root{--background:#161614;--foreground:#ecebe6;--muted-foreground:#a29f96;--border:#37352f;--card:#1f1f1c;--success:#5cb27a;--warning:#e09a50;--destructive:#ef6b62}}
body{margin:0;background:var(--background)}
${PAGE_CSS}
.wrap{max-width:1200px;margin:0 auto;padding:16px}
.lr h1{font-size:20px;margin:0 0 4px}
.verdict{font-weight:700;margin:4px 0 14px}
table.council{width:100%;border-collapse:collapse;margin:0 0 20px;font-size:13px}
table.council th,table.council td{border-bottom:1px solid var(--border);padding:8px;vertical-align:top;text-align:left}
table.council thead th{color:var(--muted-foreground);font-weight:600}
table.council td.n{text-align:center;font-weight:700;white-space:nowrap}
.pass{color:var(--success)}.near{color:var(--warning)}.low{color:var(--destructive)}
.m{font-weight:400;color:var(--muted-foreground);font-size:12px}
table.council ul{margin:6px 0 0;padding-left:16px}
.scroll{overflow-x:auto}
@media (max-width:640px){
table.council thead th:last-child{display:none}
table.council tr{display:grid;grid-template-columns:minmax(0,1fr) repeat(6,3.1em);border-bottom:1px solid var(--border)}
table.council th,table.council td{border-bottom:0}
table.council td:last-child{grid-column:1/-1;padding-top:0}
table.council td.n,table.council thead th{padding:8px 0;text-align:center;font-size:11px}table.council td.n{font-size:13px}
table.council thead th:first-child{font-size:0}
}
</style></head><body><div class="lr wrap"><h1>Council round ${r.round} · ${esc(r.layout.id)} · ${esc(r.layout.title)}</h1>
<div class="verdict">${passing} of ${r.verdicts.length} councillors at 9 or above (goal: at least ${r.verdicts.length - 1}) · ${esc(r.date)}</div>
<div class="scroll"><table class="council"><thead><tr><th>Councillor</th><th>Overall</th><th>Couch</th><th>TV</th><th>Dining</th><th>Space</th><th>Plan</th><th>Verdict and feedback</th></tr></thead><tbody>${rows}</tbody></table></div>
${changes}
<h3>The layout as submitted</h3>${card(r.layout)}</div></body></html>`;
	await Bun.write(join(dir, `round-${r.round}.html`), html);
	console.log(`wrote ${series}/round-${r.round}.html (${passing}/${r.verdicts.length} at 9+)`);
}
