import {
	ROOM,
	frame,
	pieces,
	seatingShape,
	tvSize,
	type Component,
	type Evaluation,
	type Layout,
	type Poly,
	type Rect,
	type Vec,
} from './model.ts';

const VB = { x0: -40, y0: -22, x1: 262, y1: 250 };
const sy = (y: number) => VB.y1 + VB.y0 - y;
const f1 = (n: number) => Math.round(n * 2) / 2;
const P = (pts: Poly) => pts.map(p => `${f1(p.x)},${f1(sy(p.y))}`).join(' ');
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const rectPts = ([x1, y1, x2, y2]: Rect): Poly => [
	{ x: x1, y: y1 },
	{ x: x2, y: y1 },
	{ x: x2, y: y2 },
	{ x: x1, y: y2 },
];
const line = (a: Vec, b: Vec, cls: string, extra = '') =>
	`<line class="${cls}" x1="${f1(a.x)}" y1="${f1(sy(a.y))}" x2="${f1(b.x)}" y2="${f1(sy(b.y))}" ${extra}/>`;
const text = (p: Vec, s: string, cls = 'lbl', rot = 0) =>
	`<text class="${cls}" x="${f1(p.x)}" y="${f1(sy(p.y))}"${rot ? ` transform="rotate(${rot} ${f1(p.x)} ${f1(sy(p.y))})"` : ''}>${esc(s)}</text>`;
const ftin = (n: number) => `${Math.floor(Math.round(n) / 12)}′${Math.round(n) % 12}″`;

export const PLAN_CSS = `
.lr-plan{--lr-sofa:#9c7b5c;--lr-wood:#b8925f;--lr-plant:#6e9a5c;--lr-glass:#4f9bd0;width:100%;height:auto;display:block;font-family:var(--font-sans,system-ui,sans-serif)}
.lr-plan .floor{fill:color-mix(in srgb,var(--foreground,#222) 5%,transparent)}
.lr-plan .floor2{fill:color-mix(in srgb,var(--foreground,#222) 2.5%,transparent)}
.lr-plan .wall{stroke:var(--foreground,#222);stroke-width:3;stroke-linecap:square}
.lr-plan .glass{stroke:var(--lr-glass);stroke-width:2.2}
.lr-plan .open{stroke:var(--muted-foreground,#888);stroke-width:.6;stroke-dasharray:3 2}
.lr-plan .fixed{fill:color-mix(in srgb,var(--foreground,#222) 14%,transparent);stroke:var(--muted-foreground,#888);stroke-width:.5}
.lr-plan .column{fill:color-mix(in srgb,var(--foreground,#222) 45%,transparent)}
.lr-plan .rug{fill:color-mix(in srgb,var(--lr-wood) 16%,transparent);stroke:color-mix(in srgb,var(--lr-wood) 60%,transparent);stroke-width:.6;stroke-dasharray:2 1.5}
.lr-plan .sofa{fill:color-mix(in srgb,var(--lr-sofa) 55%,transparent);stroke:var(--lr-sofa);stroke-width:.8}
.lr-plan .sofaback{fill:color-mix(in srgb,var(--lr-sofa) 85%,black 10%)}
.lr-plan .cushion{fill:color-mix(in srgb,var(--lr-sofa) 30%,transparent);stroke:color-mix(in srgb,var(--lr-sofa) 70%,transparent);stroke-width:.4}
.lr-plan .table{fill:color-mix(in srgb,var(--lr-wood) 70%,transparent);stroke:var(--lr-wood);stroke-width:.6}
.lr-plan .console{fill:color-mix(in srgb,var(--foreground,#222) 30%,transparent);stroke:var(--foreground,#222);stroke-width:.4}
.lr-plan .tv{fill:var(--foreground,#111)}
.lr-plan .decor{fill:color-mix(in srgb,var(--lr-plant) 55%,transparent)}
.lr-plan .sight{stroke-width:.45;opacity:.7}
.lr-plan .prime{stroke:var(--success,#2f7d4a);fill:var(--success,#2f7d4a)}
.lr-plan .good{stroke:var(--warning,#b5651d);fill:var(--warning,#b5651d)}
.lr-plan .side{stroke:var(--destructive,#b3261e);fill:var(--destructive,#b3261e)}
.lr-plan .wedge{fill:color-mix(in srgb,var(--lr-glass) 12%,transparent)}
.lr-plan .route{fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:.16}
.lr-plan .routec{fill:none;stroke-width:.6;stroke-dasharray:2 2;opacity:.8}
.lr-plan .rok{stroke:var(--success,#2f7d4a)}
.lr-plan .rwarn{stroke:var(--warning,#b5651d)}
.lr-plan .rbad{stroke:var(--destructive,#b3261e)}
.lr-plan .lbl{font-size:5.5px;fill:var(--foreground,#222);text-anchor:middle;dominant-baseline:middle}
.lr-plan .mut{font-size:5px;fill:var(--muted-foreground,#777);text-anchor:middle;dominant-baseline:middle}
.lr-plan .big{font-size:7px;font-weight:700;fill:var(--foreground,#222);text-anchor:middle;dominant-baseline:middle}
.lr-plan .seatn{font-size:5px;font-weight:700;text-anchor:middle;dominant-baseline:middle;stroke:none}
.lr-plan .dim{stroke:var(--foreground,#222);stroke-width:.4}
.lr-plan .open-rect{fill:none;stroke:var(--lr-plant);stroke-width:.5;stroke-dasharray:1 1.5}
.lr-plan .sel{stroke:var(--ring,#3b82f6)!important;stroke-width:1.6!important}
.lr-plan [data-id]{cursor:grab}
`;

function drawComponent(c: Component, selected: boolean) {
	const F = frame(c);
	const sel = selected ? ' sel' : '';
	const g: string[] = [];
	switch (c.type) {
		case 'seating': {
			const sh = seatingShape(c);
			g.push(`<polygon class="sofa${sel}" points="${P(sh.outline.map(([x, y]) => F.pt(x, y)))}"/>`);
			for (const r of sh.backs) g.push(`<polygon class="sofaback" points="${P(F.rect(...r))}"/>`);
			for (const r of sh.arms) g.push(`<polygon class="sofaback" points="${P(F.rect(...r))}"/>`);
			break;
		}
		case 'tv': {
			const { w } = tvSize(c.diag);
			const t = c.thickness ?? (c.mount === 'wall' ? 5 : 3);
			g.push(`<polygon class="tv${sel}" points="${P(F.rect(-w / 2, -Math.min(t, 2.5), w / 2, 0))}"/>`);
			if (c.mount === 'wall') g.push(`<polygon class="console" points="${P(F.rect(-14, -t, 14, -2.5))}"/>`);
			break;
		}
		case 'console':
			g.push(`<polygon class="console${sel}" points="${P(pieces(c)[0]!.poly)}"/>`);
			break;
		case 'table':
			if (c.shape === 'rect') g.push(`<polygon class="table${sel}" points="${P(pieces(c)[0]!.poly)}"/>`);
			else {
				const ctr = F.pt(0, 0);
				g.push(
					`<ellipse class="table${sel}" cx="${f1(ctr.x)}" cy="${f1(sy(ctr.y))}" rx="${c.w / 2}" ry="${c.d / 2}" transform="rotate(${c.rot} ${f1(ctr.x)} ${f1(sy(ctr.y))})"/>`,
				);
			}
			break;
		case 'rug':
			g.push(`<polygon class="rug${sel}" points="${P(pieces(c)[0]!.poly)}"/>`);
			break;
		case 'decor': {
			const ctr = F.pt(0, 0);
			g.push(`<circle class="decor${sel}" cx="${f1(ctr.x)}" cy="${f1(sy(ctr.y))}" r="${c.size / 2}"/>`);
			break;
		}
	}
	return `<g data-id="${esc(c.id)}">${g.join('')}</g>`;
}

// The fixed room, split into what sits under the furniture and what draws over it. Galleries with many plans
// define both once (roomDefs) and reference them, which keeps the page small.
function roomUnder() {
	const o: string[] = [];
	o.push(`<polygon class="floor" points="${P(rectPts([0, 0, ROOM.w, ROOM.d]))}"/>`);
	o.push(`<polygon class="floor2" points="${P(rectPts([35, ROOM.d, ROOM.w, VB.y1]))}"/>`);
	o.push(`<polygon class="floor2" points="${P(rectPts([ROOM.w, ROOM.landing[1], VB.x1, ROOM.landing[3]]))}"/>`);
	o.push(`<polygon class="floor2" points="${P(rectPts([-38, 2, -1, 204]))}"/>`);
	o.push(text({ x: -20, y: 100 }, 'balcony', 'mut', -90));
	o.push(text({ x: 232, y: 148 }, 'office', 'mut'));
	o.push(text({ x: 232, y: 141 }, 'landing', 'mut'));
	o.push(text({ x: 218, y: 197 }, 'bath 2', 'mut'));
	o.push(`<polygon class="fixed" points="${P(rectPts(ROOM.island))}"/>`);
	o.push(text({ x: (ROOM.island[0] + ROOM.island[2]) / 2, y: 216 }, 'island 71×41', 'mut'));
	o.push(`<polygon class="fixed" points="${P(rectPts([7, ROOM.d, 35, VB.y1]))}"/>`);
	o.push(text({ x: 21, y: 228 }, 'counter', 'mut', -90));
	o.push(text({ x: 175, y: 240 }, 'kitchen / entry ↑', 'mut'));

	return o.join('');
}

function roomOver() {
	const o: string[] = [];
	o.push(`<circle class="column" cx="${ROOM.column.x}" cy="${sy(ROOM.column.y)}" r="${ROOM.column.r}"/>`);
	o.push(text({ x: ROOM.column.x, y: ROOM.column.y }, 'column', 'mut'));
	const W = (a: Vec, b: Vec, cls: string) => line(a, b, cls);
	o.push(W({ x: 0, y: 0 }, { x: ROOM.southGlassEnd, y: 0 }, 'glass'));
	o.push(W({ x: ROOM.southGlassEnd, y: 0 }, { x: ROOM.w, y: 0 }, 'wall'));
	o.push(W({ x: 0, y: 0 }, { x: 0, y: ROOM.balconyDoor[0] }, 'glass'));
	o.push(W({ x: 0, y: ROOM.balconyDoor[1] }, { x: 0, y: ROOM.d }, 'glass'));
	o.push(line({ x: 0, y: ROOM.balconyDoor[0] }, { x: -30, y: ROOM.balconyDoor[0] + 12 }, 'open'));
	o.push(text({ x: -9, y: (ROOM.balconyDoor[0] + ROOM.balconyDoor[1]) / 2 }, 'door', 'mut', -90));
	o.push(W({ x: ROOM.w, y: 0 }, { x: ROOM.w, y: ROOM.tvWall.y2 }, 'wall'));
	o.push(W({ x: ROOM.w, y: ROOM.landing[3] }, { x: ROOM.w, y: ROOM.bathDoor[0] }, 'wall'));
	o.push(W({ x: ROOM.w, y: ROOM.bathDoor[1] }, { x: ROOM.w, y: VB.y1 }, 'wall'));
	o.push(W({ x: ROOM.w, y: ROOM.tvWall.y2 }, { x: ROOM.landing[2], y: ROOM.tvWall.y2 }, 'wall'));
	o.push(W({ x: ROOM.w + 14, y: ROOM.landing[3] }, { x: ROOM.landing[2], y: ROOM.landing[3] }, 'wall'));
	o.push(line({ x: 0, y: ROOM.d }, { x: 35, y: ROOM.d }, 'wall'));
	o.push(line({ x: 35, y: ROOM.island[1] }, { x: ROOM.w, y: ROOM.island[1] }, 'open'));
	o.push(text({ x: 70, y: -8 }, 'south glass (lake)', 'mut'));
	o.push(text({ x: 172, y: -8 }, 'solid', 'mut'));
	o.push(text({ x: -9, y: 70 }, 'west glass', 'mut', -90));
	o.push(text({ x: ROOM.w + 9, y: 61 }, 'TV wall 122″', 'mut', 90));

	// scale bar + north
	o.push(line({ x: 150, y: -16 }, { x: 198, y: -16 }, 'dim'));
	o.push(line({ x: 150, y: -14 }, { x: 150, y: -18 }, 'dim'));
	o.push(line({ x: 198, y: -14 }, { x: 198, y: -18 }, 'dim'));
	o.push(text({ x: 210, y: -16 }, '4 ft', 'mut'));
	o.push(text({ x: 245, y: 10 }, 'N ↑', 'lbl'));
	return o.join('');
}

// Some renderers do not apply page CSS inside <use> copies, so the shared room carries its styles inline.
const inlineStyles = (svg: string) => {
	const rules = new Map<string, string>();
	for (const m of PLAN_CSS.matchAll(/\.lr-plan \.([\w-]+)\{([^}]*)\}/g)) rules.set(m[1]!, m[2]!);
	return svg.replace(/class="([\w-]+)"/g, (whole, cls: string) =>
		rules.has(cls) ? `style="${rules.get(cls)}"` : whole,
	);
};

export const roomDefs = () =>
	`<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><g id="lr-under" style="--lr-glass:#4f9bd0;font-family:var(--font-sans,system-ui,sans-serif)">${inlineStyles(roomUnder())}</g><g id="lr-over" style="--lr-glass:#4f9bd0;font-family:var(--font-sans,system-ui,sans-serif)">${inlineStyles(roomOver())}</g></defs></svg>`;

export function renderPlan(
	layout: Layout,
	ev: Evaluation,
	opts: { selected?: string; routes?: boolean; sight?: boolean; openRect?: boolean; shared?: boolean } = {},
) {
	const { routes = true, sight = true } = opts;
	const o: string[] = [];
	o.push(
		`<svg class="lr-plan" viewBox="${VB.x0} ${VB.y0} ${VB.x1 - VB.x0} ${VB.y1 - VB.y0}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(layout.title)} floor plan">`,
	);
	o.push(opts.shared ? '<use href="#lr-under"/>' : roomUnder());
	for (const c of layout.components.filter(c => c.type === 'rug')) o.push(drawComponent(c, opts.selected === c.id));
	if (opts.openRect) {
		const r = ev.openRect.rect;
		o.push(`<polygon class="open-rect" points="${P(rectPts(r))}"/>`);
	}
	if (routes)
		for (const rt of ev.routes) {
			const cls = rt.width >= rt.good ? 'rok' : rt.width >= rt.min ? 'rwarn' : 'rbad';
			const pts = rt.path.map(p => `${f1(p.x)},${f1(sy(p.y))}`).join(' ');
			o.push(`<polyline class="route ${cls}" stroke-width="${Math.max(4, rt.width)}" points="${pts}"/>`);
			o.push(`<polyline class="routec ${cls}" points="${pts}"/>`);
			o.push(text({ x: rt.pinch.x, y: rt.pinch.y + 4 }, `${Math.round(rt.width)}″`, 'mut'));
		}
	if (ev.tv && sight && ev.seats.length) {
		const best = [...ev.seats].sort((a, b) => a.offAxis + a.turn - (b.offAxis + b.turn))[0]!;
		o.push(`<polygon class="wedge" points="${P([best.eye, ev.tv.left, ev.tv.right])}"/>`);
		for (const s of ev.seats) o.push(line(s.eye, ev.tv.center, `sight ${s.rating}`));
	}
	for (const c of layout.components.filter(c => c.type !== 'rug' && c.type !== 'tv'))
		o.push(drawComponent(c, opts.selected === c.id));
	for (const s of ev.seats) {
		o.push(`<polygon class="cushion" points="${P(s.cushion)}"/>`);
		o.push(
			`<circle class="${s.rating}" cx="${f1(s.eye.x)}" cy="${f1(sy(s.eye.y))}" r="2.6" stroke="white" stroke-width=".5"/>`,
		);
		o.push(`<text class="seatn" fill="white" x="${f1(s.eye.x)}" y="${f1(sy(s.eye.y)) + 0.2}">${s.n}</text>`);
	}
	for (const c of layout.components.filter(c => c.type === 'tv')) o.push(drawComponent(c, opts.selected === c.id));

	o.push(opts.shared ? '<use href="#lr-over"/>' : roomOver());
	if (ev.tv) {
		const t = ev.tv;
		const lp = { x: t.center.x + t.normal.x * 8, y: t.center.y + t.normal.y * 8 };
		o.push(text(lp, `${t.comp.diag}″ TV`, 'big', ((t.comp.rot + 90) % 180) - 90));
		const best = [...ev.seats].sort((a, b) => a.offAxis + a.turn - (b.offAxis + b.turn))[0];
		if (best) {
			const mid = { x: (best.eye.x + t.center.x) / 2, y: (best.eye.y + t.center.y) / 2 + 4 };
			o.push(text(mid, `${ftin(best.dist)} · ${Math.round(best.fov)}°`, 'lbl'));
		}
	}
	o.push('</svg>');
	return o.join('');
}

export function renderElevation(layout: Layout, ev: Evaluation) {
	const t = ev.tv;
	if (!t) return '';
	const onEast = t.wall === 'TV wall (east)';
	const span = onEast ? 122 : Math.max(130, t.w + 30);
	const W = span + 20,
		H = 135;
	const X = (y: number) => 10 + y,
		Z = (z: number) => H - 8 - z;
	const o: string[] = [
		`<svg class="lr-plan" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TV elevation">`,
	];
	o.push(`<rect class="floor" x="${X(0)}" y="${Z(120)}" width="${span}" height="120"/>`);
	o.push(`<line class="wall" x1="${X(0)}" y1="${Z(0)}" x2="${X(span)}" y2="${Z(0)}"/>`);
	o.push(`<line class="open" x1="${X(0)}" y1="${Z(120)}" x2="${X(span)}" y2="${Z(120)}"/>`);
	// Viewed from the room: for the east wall, left is north (the hallway end).
	const along = (p: Vec) => (onEast ? 122 - p.y : p.x - (t.center.x - span / 2));
	const a = along(t.left),
		b = along(t.right);
	const l = Math.min(a, b),
		r = Math.max(a, b);
	const consoles = layout.components.filter(c => c.type === 'console');
	for (const c of consoles) {
		if (c.type !== 'console') continue;
		const ctr = frame(c).pt(0, 0);
		const cx = along(ctr);
		const bottom = c.floating ? Math.max(4, c.h - 10) : 0;
		o.push(
			`<rect class="console" x="${f1(X(cx - c.w / 2))}" y="${f1(Z(c.h))}" width="${c.w}" height="${f1(c.h - bottom)}"/>`,
		);
	}
	const bz = t.comp.center - t.h / 2;
	o.push(
		`<rect class="tv" x="${f1(X(l - 0.5))}" y="${f1(Z(bz + t.h))}" width="${f1(r - l + 1)}" height="${f1(t.h)}" rx="1"/>`,
	);
	o.push(
		`<text class="lbl" style="fill:var(--background,#fff)" x="${f1(X((l + r) / 2))}" y="${f1(Z(t.comp.center))}">${t.comp.diag}″ · ${f1(t.w)}″ × ${f1(t.h)}″</text>`,
	);
	o.push(
		`<line class="dim" x1="${X(0)}" y1="${Z(ROOM.eyeZ)}" x2="${X(span)}" y2="${Z(ROOM.eyeZ)}" stroke-dasharray="2 2"/>`,
	);
	o.push(`<text class="mut" x="${X(span) - 14}" y="${Z(ROOM.eyeZ) - 3}">eye 40″</text>`);
	if (onEast) {
		const sw = ROOM.switchPlate;
		o.push(`<rect class="console" x="${X(122 - sw.y) - 1.5}" y="${Z(sw.z2)}" width="3" height="${sw.z2 - sw.z1}"/>`);
		o.push(`<text class="mut" x="${X(122 - sw.y) + 9}" y="${Z(sw.z2 + 4)}">switch</text>`);
		o.push(`<circle class="console" cx="${X(122 - ROOM.smoke.y)}" cy="${Z(ROOM.smoke.z)}" r="2.5"/>`);
		o.push(`<text class="mut" x="${X(122 - ROOM.smoke.y)}" y="${Z(ROOM.smoke.z) - 5}">smoke</text>`);
		o.push(
			`<rect class="console" x="${X(122 - ROOM.outlet.y) - 2}" y="${Z(ROOM.outlet.z + 2)}" width="4" height="4"/>`,
		);
		o.push(`<text class="mut" x="${X(122 - ROOM.outlet.y)}" y="${Z(6)}">outlet</text>`);
		o.push(`<text class="mut" x="${X(4)}" y="${Z(-5)}">N</text><text class="mut" x="${X(118)}" y="${Z(-5)}">S</text>`);
	}
	o.push(
		`<text class="mut" x="${X(span / 2)}" y="${Z(114)}">${onEast ? 'TV wall, seen from the sofa (122″ × 120″)' : 'TV, seen from the sofa'}</text>`,
	);
	o.push(`</svg>`);
	return o.join('');
}

export function seatTable(ev: Evaluation) {
	const rows = ev.seats
		.map(
			s =>
				`<tr><td><span class="dot ${s.rating}"></span>${s.n}</td><td>${s.kind}</td><td>${ftin(s.dist)}</td><td>${Math.round(s.fov)}°</td><td>${Math.round(s.offAxis)}°</td><td>${Math.round(s.turn)}°</td><td>${Math.round(s.width * 2) / 2}″</td></tr>`,
		)
		.join('');
	return `<table class="seats"><thead><tr><th>Seat</th><th>Type</th><th>To screen</th><th>Fills</th><th>Off-axis</th><th>Head turn</th><th>Width</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export const toPlanY = (svgY: number) => VB.y1 + VB.y0 - svgY;
