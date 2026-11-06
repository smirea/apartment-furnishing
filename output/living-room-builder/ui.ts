import { LAYOUTS } from './layouts.ts';
import { evaluate, type Component, type Layout } from './model.ts';
import { renderElevation, renderPlan, seatTable, toPlanY } from './render.ts';

type Field = {
	path: string;
	label: string;
	kind: 'num' | 'text' | 'bool' | 'select';
	options?: string[];
	step?: number;
};

const LEG: Field[] = ['left', 'right'].flatMap(side => [
	{ path: `${side}.length`, label: `${side} leg length`, kind: 'num' as const },
	{ path: `${side}.width`, label: `${side} leg width`, kind: 'num' as const },
	{ path: `${side}.kind`, label: `${side} leg kind`, kind: 'select' as const, options: ['seats', 'chaise'] },
	{ path: `${side}.seats`, label: `${side} leg seats`, kind: 'num' as const },
	{ path: `${side}.corner`, label: `${side} corner seat`, kind: 'bool' as const },
]);

const FIELDS: Record<Component['type'], Field[]> = {
	seating: [
		{ path: 'length', label: 'main run length', kind: 'num' },
		{ path: 'depth', label: 'depth', kind: 'num' },
		{ path: 'arm', label: 'arm width', kind: 'num' },
		{ path: 'seats', label: 'main seats', kind: 'num' },
		{ path: 'back', label: 'back cushion', kind: 'num' },
		{ path: 'eye', label: 'eye from back', kind: 'num' },
		{ path: 'recline', label: 'recline extension', kind: 'num' },
		...LEG,
	],
	tv: [
		{ path: 'diag', label: 'diagonal', kind: 'num' },
		{ path: 'mount', label: 'mount', kind: 'select', options: ['wall', 'stand'] },
		{ path: 'center', label: 'center height', kind: 'num' },
		{ path: 'thickness', label: 'depth incl. mount', kind: 'num', step: 0.5 },
	],
	console: [
		{ path: 'w', label: 'width', kind: 'num' },
		{ path: 'd', label: 'depth', kind: 'num' },
		{ path: 'h', label: 'top height', kind: 'num' },
		{ path: 'floating', label: 'floating', kind: 'bool' },
	],
	table: [
		{ path: 'role', label: 'role', kind: 'select', options: ['coffee', 'ottoman', 'side'] },
		{ path: 'shape', label: 'shape', kind: 'select', options: ['rect', 'oval', 'round'] },
		{ path: 'w', label: 'width', kind: 'num' },
		{ path: 'd', label: 'depth', kind: 'num' },
		{ path: 'h', label: 'height', kind: 'num' },
	],
	rug: [
		{ path: 'w', label: 'width', kind: 'num' },
		{ path: 'd', label: 'depth', kind: 'num' },
	],
	dining: [
		{ path: 'shape', label: 'shape', kind: 'select', options: ['rect', 'round'] },
		{ path: 'w', label: 'length / diameter', kind: 'num' },
		{ path: 'd', label: 'width', kind: 'num' },
		{ path: 'sides', label: 'chairs per long side', kind: 'num' },
		{ path: 'ends', label: 'end chairs (0–2)', kind: 'num' },
		{ path: 'n', label: 'chairs (round)', kind: 'num' },
	],
	decor: [
		{ path: 'kind', label: 'kind', kind: 'select', options: ['plant', 'lamp', 'chair'] },
		{ path: 'size', label: 'size', kind: 'num' },
	],
};

type Template = Component extends infer C ? (C extends Component ? Omit<C, 'id' | 'x' | 'y'> : never) : never;
const TEMPLATES: Record<string, Template> = {
	'Sofa 3-seat': { type: 'seating', label: 'Sofa', rot: 90, length: 96, depth: 40, arm: 6, seats: 3 },
	'Sofa + chaise': {
		type: 'seating',
		label: 'Chaise sofa',
		rot: 90,
		length: 110,
		depth: 40,
		arm: 6,
		seats: 2,
		right: { length: 66, width: 36, kind: 'chaise', seats: 1 },
	},
	'L sectional': {
		type: 'seating',
		label: 'L sectional',
		rot: 90,
		length: 110,
		depth: 40,
		arm: 6,
		seats: 2,
		left: { length: 100, kind: 'seats', seats: 2, corner: true },
	},
	'U sectional': {
		type: 'seating',
		label: 'U sectional',
		rot: 90,
		length: 120,
		depth: 40,
		arm: 6,
		seats: 2,
		left: { length: 90, kind: 'seats', seats: 1, corner: true },
		right: { length: 90, kind: 'seats', seats: 1, corner: true },
	},
	Recliner: { type: 'seating', label: 'Recliner', rot: 90, length: 36, depth: 39, arm: 5, seats: 1, recline: 22 },
	'Coffee table': { type: 'table', label: 'Coffee table', role: 'coffee', rot: 0, w: 48, d: 28, h: 16, shape: 'rect' },
	Ottoman: { type: 'table', label: 'Ottoman', role: 'ottoman', rot: 0, w: 60, d: 26, h: 17, shape: 'rect' },
	'Side table': { type: 'table', label: 'Side table', role: 'side', rot: 0, w: 18, d: 18, h: 22, shape: 'round' },
	'Wall TV': { type: 'tv', label: 'TV', rot: 270, diag: 98, mount: 'wall', center: 50 },
	'TV on stand': { type: 'tv', label: 'TV', rot: 270, diag: 98, mount: 'stand', center: 52 },
	Console: { type: 'console', label: 'Console', rot: 270, w: 90, d: 16, h: 20 },
	Rug: { type: 'rug', label: 'Rug', rot: 0, w: 120, d: 96 },
	Plant: { type: 'decor', label: 'Plant', kind: 'plant', rot: 0, size: 18 },
	'Dining 6 (rect)': { type: 'dining', label: 'Dining table', rot: 0, shape: 'rect', w: 60, d: 36, sides: 2, ends: 2 },
	'Dining 4 (round)': { type: 'dining', label: 'Dining table', rot: 45, shape: 'round', w: 42, d: 42, n: 4 },
};

function $<T extends HTMLElement>(id: string) {
	const el = document.getElementById(id);
	if (!el) throw new Error(`missing #${id}`);
	return el as T;
}
function clone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}
const get = (o: any, path: string) => path.split('.').reduce((a, k) => a?.[k], o);
function set(o: any, path: string, v: unknown) {
	const ks = path.split('.');
	let cur = o;
	for (const k of ks.slice(0, -1)) cur = cur[k] ??= {};
	cur[ks.at(-1)!] = v;
}

const STORE = 'living-room-builder:v1';
let layout: Layout = clone(LAYOUTS[0]!);
let selected: string | undefined;
const view = { routes: true, sight: true, openRect: false };

function loadInitial() {
	const hash = decodeURIComponent(location.hash.slice(1));
	if (hash.startsWith('{')) {
		layout = JSON.parse(hash);
		return;
	}
	const preset = LAYOUTS.find(l => l.id === hash);
	if (preset) {
		layout = clone(preset);
		return;
	}
	try {
		const saved = localStorage.getItem(STORE);
		if (saved) layout = JSON.parse(saved);
	} catch {}
}

function save() {
	try {
		localStorage.setItem(STORE, JSON.stringify(layout));
	} catch {}
}

let frame = 0;
function schedule() {
	if (frame) return;
	frame = requestAnimationFrame(() => {
		frame = 0;
		render();
	});
}

function render() {
	const ev = evaluate(layout);
	$('plan').innerHTML = renderPlan(layout, ev, { selected, ...view });
	$('elev').innerHTML = renderElevation(layout, ev);
	$('seats').innerHTML = seatTable(ev);
	$('summary').innerHTML =
		`<div class="score">self-check ${ev.score}</div>` +
		Object.entries(ev.summary)
			.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`)
			.join('');
	$('issues').innerHTML = ev.issues.map(i => `<li class="${i.level}">${i.msg}</li>`).join('');
	$<HTMLTextAreaElement>('json').value = JSON.stringify(layout, null, 1);
	$('title').textContent = `${layout.id} · ${layout.title}`;
	save();
}

function renderInspector() {
	const box = $('inspector');
	const c = layout.components.find(x => x.id === selected);
	if (!c) {
		box.innerHTML =
			'<p class="hint">Click a piece to edit it. Drag to move; arrows nudge 1″ (shift 6″); R / shift-R turn 15°; Delete removes.</p>';
		return;
	}
	const fields: Field[] = [
		{ path: 'label', label: 'label', kind: 'text' },
		{ path: 'x', label: 'x (center)', kind: 'num', step: 0.5 },
		{ path: 'y', label: 'y (center)', kind: 'num', step: 0.5 },
		{ path: 'rot', label: 'faces (°, 0 = N)', kind: 'num', step: 15 },
		...FIELDS[c.type],
	];
	box.innerHTML =
		`<div class="insp-head"><b>${c.label ?? c.id}</b> <span class="hint">${c.type}</span></div>` +
		`<div class="row-btns"><button data-act="rot-90">⟲ 90</button><button data-act="rot-15">⟲ 15</button><button data-act="rot15">⟳ 15</button><button data-act="rot90">⟳ 90</button><button data-act="dup">Duplicate</button><button data-act="del" class="danger">Delete</button></div>` +
		(c.type === 'tv'
			? `<div class="row-btns">${[65, 75, 85, 98].map(d => `<button data-diag="${d}">${d}″</button>`).join('')}</div>`
			: '') +
		'<div class="fields">' +
		fields
			.map(f => {
				const v = get(c, f.path);
				const id = `f-${f.path}`;
				if (f.kind === 'bool')
					return `<label class="f"><span>${f.label}</span><input id="${id}" data-path="${f.path}" data-kind="bool" type="checkbox" ${v ? 'checked' : ''}></label>`;
				if (f.kind === 'select')
					return `<label class="f"><span>${f.label}</span><select id="${id}" data-path="${f.path}" data-kind="select"><option value=""></option>${f.options!.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
				return `<label class="f"><span>${f.label}</span><input id="${id}" data-path="${f.path}" data-kind="${f.kind}" type="${f.kind === 'num' ? 'number' : 'text'}" step="${f.step ?? 1}" value="${v ?? ''}"></label>`;
			})
			.join('') +
		'</div>';
}

function selectComp(id: string | undefined) {
	selected = id;
	renderInspector();
	render();
}

function current() {
	return layout.components.find(x => x.id === selected);
}

function onField(e: Event) {
	const el = e.target as HTMLInputElement | HTMLSelectElement;
	const c = current();
	if (!c || !el.dataset['path']) return;
	const path = el.dataset['path'];
	const kind = el.dataset['kind'];
	const legSide = path.match(/^(left|right)\./)?.[1];
	if (kind === 'bool') set(c, path, (el as HTMLInputElement).checked);
	else if (kind === 'num') {
		if (el.value === '') {
			if (legSide && path.endsWith('.length')) delete (c as any)[legSide];
			else set(c, path, undefined);
		} else set(c, path, Number(el.value));
	} else if (el.value === '' && legSide && path.endsWith('.kind')) delete (c as any)[legSide];
	else set(c, path, el.value);
	if (legSide && (c as any)[legSide]) {
		const leg = (c as any)[legSide];
		leg.kind ??= 'seats';
		leg.seats ??= 1;
		leg.length ??= 80;
	}
	render();
}

function act(a: string) {
	const c = current();
	if (!c) return;
	if (a.startsWith('rot')) c.rot = (((c.rot + Number(a.slice(3))) % 360) + 360) % 360;
	if (a === 'dup') {
		const n = clone(c);
		n.id = uid(c.type);
		n.x += 12;
		n.y -= 12;
		layout.components.push(n);
		selected = n.id;
	}
	if (a === 'del') {
		layout.components = layout.components.filter(x => x !== c);
		selected = undefined;
	}
	renderInspector();
	render();
}

const uid = (t: string) => {
	let i = 1;
	while (layout.components.some(c => c.id === `${t}${i}`)) i++;
	return `${t}${i}`;
};

function planPoint(e: PointerEvent) {
	const svg = $('plan').querySelector('svg')!;
	const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
	return { x: pt.x, y: toPlanY(pt.y) };
}

function setup() {
	const presets = $<HTMLSelectElement>('preset');
	presets.innerHTML = LAYOUTS.map(l => `<option value="${l.id}">${l.id} · ${l.title}</option>`).join('');
	presets.value = LAYOUTS.some(l => l.id === layout.id) ? layout.id : '';
	presets.addEventListener('change', () => {
		layout = clone(LAYOUTS.find(l => l.id === presets.value)!);
		history.replaceState(null, '', `#${layout.id}`);
		selectComp(undefined);
	});
	$('reset').addEventListener('click', () => {
		layout = clone(LAYOUTS.find(l => l.id === presets.value) ?? LAYOUTS[0]!);
		selectComp(undefined);
	});
	$('copy').addEventListener('click', async () => {
		await navigator.clipboard.writeText(JSON.stringify(layout, null, '\t'));
		$('copy').textContent = 'Copied';
		setTimeout(() => ($('copy').textContent = 'Copy JSON'), 1200);
	});
	$('load').addEventListener('click', () => {
		layout = JSON.parse($<HTMLTextAreaElement>('json').value);
		selectComp(undefined);
	});
	for (const k of ['routes', 'sight', 'openRect'] as const) {
		const cb = $<HTMLInputElement>(`v-${k}`);
		cb.checked = view[k];
		cb.addEventListener('change', () => {
			view[k] = cb.checked;
			render();
		});
	}
	$('palette').innerHTML = Object.keys(TEMPLATES)
		.map(k => `<button data-add="${k}">${k}</button>`)
		.join('');
	$('palette').addEventListener('click', e => {
		const k = (e.target as HTMLElement).dataset['add'];
		if (!k) return;
		const t = clone(TEMPLATES[k]!);
		const c = { ...t, id: uid(t.type), x: 100, y: 90 } as Component;
		layout.components.push(c);
		selectComp(c.id);
	});
	const insp = $('inspector');
	insp.addEventListener('input', onField);
	insp.addEventListener('change', onField);
	insp.addEventListener('click', e => {
		const b = e.target as HTMLElement;
		if (b.dataset['act']) act(b.dataset['act']);
		if (b.dataset['diag']) {
			const c = current();
			if (c?.type === 'tv') {
				c.diag = Number(b.dataset['diag']);
				renderInspector();
				render();
			}
		}
	});

	let drag: { id: string; sx: number; sy: number; ox: number; oy: number } | undefined;
	$('plan').addEventListener('pointerdown', e => {
		const g = (e.target as Element).closest('[data-id]');
		if (!g) {
			selectComp(undefined);
			return;
		}
		const id = g.getAttribute('data-id')!;
		if (id !== selected) selectComp(id);
		const c = current()!;
		const p = planPoint(e);
		drag = { id, sx: p.x, sy: p.y, ox: c.x, oy: c.y };
		e.preventDefault();
	});
	window.addEventListener('pointermove', e => {
		if (!drag) return;
		const c = layout.components.find(x => x.id === drag!.id);
		if (!c) return;
		const p = planPoint(e);
		const snap = e.altKey ? 0.5 : 1;
		c.x = Math.round((drag.ox + p.x - drag.sx) / snap) * snap;
		c.y = Math.round((drag.oy + p.y - drag.sy) / snap) * snap;
		schedule();
	});
	window.addEventListener('pointerup', () => {
		if (drag) renderInspector();
		drag = undefined;
	});
	window.addEventListener('keydown', e => {
		const tag = (e.target as HTMLElement).tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		const c = current();
		if (!c) return;
		const step = e.shiftKey ? 6 : 1;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, step],
			ArrowDown: [0, -step],
		};
		if (moves[e.key]) {
			c.x += moves[e.key]![0];
			c.y += moves[e.key]![1];
			e.preventDefault();
			renderInspector();
			render();
		} else if (e.key === 'r' || e.key === 'R') act(e.shiftKey ? 'rot-15' : 'rot15');
		else if (e.key === 'Delete' || e.key === 'Backspace') act('del');
		else if (e.key === 'd') act('dup');
	});
}

loadInitial();
setup();
renderInspector();
render();
