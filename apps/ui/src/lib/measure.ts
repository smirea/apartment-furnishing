import { clearFraction, type Obstacles } from '@repo/shared/obstacles';
import {
	BufferGeometry,
	DoubleSide,
	Float32BufferAttribute,
	Group,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	Plane,
	Vector2,
	Vector3,
	type Camera,
	type Raycaster,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export type MeasureTool = 'line' | 'area';
export type Measurement = { id: number; tool: MeasureTool; value: string; detail: string };
export type MeasureState = { tool: MeasureTool | null; draft: Measurement | null; done: Measurement[] };

const SNAP_PX = 12;
const COLOR = 0xfbbf24;
const DRAFT_COLOR = 0x5eead4;
const FLOOR = new Plane(new Vector3(0, 1, 0), 0);

const toInches = (feet: number) => Math.round(feet * 24) / 2;
const inches = (feet: number) => `${toInches(feet)}″`;

// The two clicked corners span a rectangle square to the plan, listed in drawing order.
function rectangle(a: Vector3, b: Vector3) {
	return [a, new Vector3(b.x, a.y, a.z), b, new Vector3(a.x, a.y, b.z)];
}

function pathLength(points: Vector3[]) {
	let total = 0;
	for (let i = 1; i < points.length; i++) total += points[i]!.distanceTo(points[i - 1]!);
	return total;
}

function summarize(id: number, tool: MeasureTool, points: Vector3[]): Measurement {
	if (tool === 'line') {
		const segments = points.length - 1;
		return { id, tool, value: inches(pathLength(points)), detail: segments > 1 ? `${segments} segments` : 'length' };
	}
	const [a, b] = [points[0]!, points.at(-1)!];
	const [w, d] = [toInches(Math.abs(b.x - a.x)), toInches(Math.abs(b.z - a.z))];
	return { id, tool, value: `${w}″ × ${d}″`, detail: `${(w * d).toLocaleString()} in²` };
}

function label(text: string, className: string, at: Vector3) {
	const el = document.createElement('div');
	el.className = className;
	el.textContent = text;
	const obj = new CSS2DObject(el);
	obj.position.copy(at);
	return obj;
}

function draw(tool: MeasureTool, points: Vector3[], draft: boolean) {
	const group = new Group();
	const color = draft ? DRAFT_COLOR : COLOR;
	const corners = tool === 'area' && points.length > 1 ? rectangle(points[0]!, points.at(-1)!) : null;
	const path = corners ? [...corners, corners[0]!] : points;
	if (path.length > 1) {
		const geometry = new LineGeometry().setPositions(path.flatMap(p => [p.x, p.y, p.z]));
		const line = new Line2(geometry, new LineMaterial({ color, linewidth: 3, depthTest: false, transparent: true }));
		line.renderOrder = 10;
		group.add(line);
	}
	// A rectangle labels one width edge and one depth edge; the other two would only repeat them.
	const labelled = corners ? path.slice(0, 3) : path;
	for (let i = 1; i < labelled.length; i++) {
		const [a, b] = [labelled[i - 1]!, labelled[i]!];
		const length = a.distanceTo(b);
		if (length > 0.05) group.add(label(inches(length), 'measure-label', a.clone().lerp(b, 0.5)));
	}
	for (const p of corners ?? points) group.add(label('', `measure-dot${draft ? ' draft' : ''}`, p));
	if (corners) {
		const geometry = new BufferGeometry();
		geometry.setAttribute(
			'position',
			new Float32BufferAttribute(
				corners.flatMap(p => [p.x, p.y, p.z]),
				3,
			),
		);
		geometry.setIndex([0, 1, 2, 0, 2, 3]);
		const fill = new Mesh(
			geometry,
			new MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: DoubleSide, depthTest: false }),
		);
		fill.renderOrder = 9;
		group.add(fill);
		const center = corners[0]!.clone().lerp(corners[2]!, 0.5);
		group.add(label(summarize(0, tool, points).detail, 'measure-label area', center));
	}
	return group;
}

function dispose(group: Group) {
	group.traverse(node => {
		if (node instanceof Mesh || node instanceof Line2) {
			node.geometry.dispose();
			node.material.dispose();
		}
		if (node instanceof CSS2DObject) node.element.remove();
	});
	group.removeFromParent();
}

// Clicks drop points on the floor. A line segment stops at the first wall, fixture or door in its way, like a laser
// measure; furniture doesn't stop it. Clicking the last point again or Enter ends a line. An area is the rectangle
// between two clicked corners and ends on the second click. Backspace drops the last point, and Escape drops the draft.
export function createMeasurer(
	parent: Object3D,
	camera: Camera,
	canvas: HTMLElement,
	cast: (e: PointerEvent) => Raycaster,
	obstacles: Obstacles,
	onState: (state: MeasureState) => void,
) {
	const root = new Group();
	parent.add(root);
	let tool: MeasureTool | null = null;
	let nextId = 1;
	const done: { measurement: Measurement; snaps: Vector3[]; group: Group }[] = [];
	let points: Vector3[] = [];
	let hover: Vector3 | null = null;
	let draftGroup: Group | null = null;

	function emit() {
		const preview = hover ? [...points, hover] : points;
		onState({
			tool,
			draft: tool && points.length ? summarize(0, tool, preview) : null,
			done: done.map(d => d.measurement),
		});
	}

	function redraw() {
		if (draftGroup) dispose(draftGroup);
		draftGroup = null;
		if (tool && points.length) {
			draftGroup = draw(tool, hover ? [...points, hover] : points, true);
			root.add(draftGroup);
		}
		emit();
	}

	function screen(p: Vector3) {
		const v = p.clone().project(camera);
		const rect = canvas.getBoundingClientRect();
		return new Vector2(((v.x + 1) / 2) * rect.width + rect.left, ((1 - v.y) / 2) * rect.height + rect.top);
	}

	function nearby(e: PointerEvent, candidates: Vector3[]) {
		const at = new Vector2(e.clientX, e.clientY);
		return candidates.find(p => screen(p).distanceTo(at) < SNAP_PX) ?? null;
	}

	// Snaps to existing points, then to the floor under the cursor. Shift keeps a new line segment straight along x or z.
	function locate(e: PointerEvent) {
		const snapped = nearby(e, [...points, ...done.flatMap(d => d.snaps)]);
		if (snapped) return snapped;
		const hit = cast(e).ray.intersectPlane(FLOOR, new Vector3());
		const last = points.at(-1);
		if (!hit || !last || tool === 'area') return hit;
		const target = last.clone();
		if (!e.shiftKey) target.copy(hit);
		else if (Math.abs(hit.x - last.x) >= Math.abs(hit.z - last.z)) target.x = hit.x;
		else target.z = hit.z;
		return last.clone().lerp(target, clearFraction(last.x, last.z, target.x, target.z, obstacles));
	}

	function finish() {
		if (!tool) return;
		if (points.length > 1) {
			const measurement = summarize(nextId++, tool, points);
			const group = draw(tool, points, false);
			root.add(group);
			done.push({ measurement, snaps: tool === 'area' ? rectangle(points[0]!, points[1]!) : points, group });
		}
		points = [];
		hover = null;
		redraw();
	}

	function cancel() {
		points = [];
		hover = null;
		redraw();
	}

	function onKey(e: KeyboardEvent) {
		if (!tool || (e.target as HTMLElement).closest?.('input, textarea, select')) return;
		if (e.key === 'Enter') finish();
		else if (e.key === 'Escape') {
			if (points.length) cancel();
			else setTool(null);
		} else if (e.key === 'Backspace' && points.length) {
			points = points.slice(0, -1);
			redraw();
		} else return;
		e.preventDefault();
	}
	addEventListener('keydown', onKey);

	function setTool(next: MeasureTool | null) {
		if (next !== tool) cancel();
		tool = next;
		canvas.style.cursor = tool ? 'crosshair' : '';
		emit();
	}

	return {
		get active() {
			return tool !== null;
		},
		setTool,
		hover(e: PointerEvent) {
			if (!tool || !points.length) return;
			hover = locate(e);
			redraw();
		},
		click(e: PointerEvent) {
			if (!tool) return;
			const p = locate(e);
			if (!p) return;
			if (tool === 'line' && p === points.at(-1)) return finish();
			if (points.includes(p)) return;
			points = [...points, p];
			if (tool === 'area' && points.length === 2) return finish();
			redraw();
		},
		finish,
		remove(id: number) {
			const index = done.findIndex(d => d.measurement.id === id);
			if (index < 0) return;
			dispose(done[index]!.group);
			done.splice(index, 1);
			emit();
		},
		clear() {
			for (const d of done) dispose(d.group);
			done.length = 0;
			cancel();
		},
		dispose() {
			removeEventListener('keydown', onKey);
			dispose(root);
		},
	};
}
