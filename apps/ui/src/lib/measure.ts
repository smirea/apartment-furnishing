import {
	BufferGeometry,
	DoubleSide,
	Float32BufferAttribute,
	Group,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	Plane,
	ShapeUtils,
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

export function feetInches(feet: number) {
	const halfInches = Math.round(feet * 24);
	const ft = Math.floor(halfInches / 24);
	const inches = (halfInches % 24) / 2;
	return ft ? `${ft}′ ${inches}″` : `${inches}″`;
}

function polygonArea(points: Vector3[]) {
	// Newell's method: the summed cross products point along the plane's normal with twice the enclosed area.
	const normal = new Vector3();
	for (let i = 0; i < points.length; i++)
		normal.add(new Vector3().crossVectors(points[i]!, points[(i + 1) % points.length]!));
	return { area: normal.length() / 2, normal: normal.normalize() };
}

function pathLength(points: Vector3[], closed: boolean) {
	let total = 0;
	for (let i = 1; i < points.length; i++) total += points[i]!.distanceTo(points[i - 1]!);
	if (closed && points.length > 2) total += points.at(-1)!.distanceTo(points[0]!);
	return total;
}

function summarize(id: number, tool: MeasureTool, points: Vector3[]): Measurement {
	if (tool === 'line') {
		const segments = points.length - 1;
		return {
			id,
			tool,
			value: feetInches(pathLength(points, false)),
			detail: segments > 1 ? `${segments} segments` : 'length',
		};
	}
	const area = points.length > 2 ? polygonArea(points).area : 0;
	return {
		id,
		tool,
		value: `${area.toFixed(1)} ft²`,
		detail: `perimeter ${feetInches(pathLength(points, true))}`,
	};
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
	const closed = tool === 'area' && points.length > 2;
	const path = closed ? [...points, points[0]!] : points;
	if (path.length > 1) {
		const geometry = new LineGeometry().setPositions(path.flatMap(p => [p.x, p.y, p.z]));
		const line = new Line2(geometry, new LineMaterial({ color, linewidth: 3, depthTest: false, transparent: true }));
		line.renderOrder = 10;
		group.add(line);
	}
	for (let i = 1; i < path.length; i++) {
		const [a, b] = [path[i - 1]!, path[i]!];
		const length = a.distanceTo(b);
		if (length > 0.05) group.add(label(feetInches(length), 'measure-label', a.clone().lerp(b, 0.5)));
	}
	for (const p of points) group.add(label('', `measure-dot${draft ? ' draft' : ''}`, p));
	if (closed) {
		const { area, normal } = polygonArea(points);
		const u = new Vector3(1, 0, 0).cross(normal);
		if (u.lengthSq() < 1e-6) u.set(0, 1, 0).cross(normal);
		u.normalize();
		const v = new Vector3().crossVectors(normal, u);
		const flat = points.map(p => new Vector2(p.dot(u), p.dot(v)));
		const geometry = new BufferGeometry();
		geometry.setAttribute(
			'position',
			new Float32BufferAttribute(
				points.flatMap(p => [p.x, p.y, p.z]),
				3,
			),
		);
		geometry.setIndex(ShapeUtils.triangulateShape(flat, []).flat());
		const fill = new Mesh(
			geometry,
			new MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: DoubleSide, depthTest: false }),
		);
		fill.renderOrder = 9;
		group.add(fill);
		const center = points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length);
		group.add(label(`${area.toFixed(1)} ft²`, 'measure-label area', center));
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

const visible = (node: Object3D | null): boolean => !node || (node.visible && visible(node.parent));

// Clicks drop points on whatever surface is under the cursor. Clicking the last point again ends a line and clicking
// the first point closes an area; Enter does either, Backspace drops the last point, and Escape drops the draft.
export function createMeasurer(
	parent: Object3D,
	camera: Camera,
	canvas: HTMLElement,
	cast: (e: PointerEvent) => Raycaster,
	targets: () => Object3D[],
	onState: (state: MeasureState) => void,
) {
	const root = new Group();
	parent.add(root);
	let tool: MeasureTool | null = null;
	let nextId = 1;
	const done: { measurement: Measurement; points: Vector3[]; group: Group }[] = [];
	let points: Vector3[] = [];
	// An area stays on the surface its first corner landed on, so furniture in the way doesn't lift a floor corner.
	let plane: Plane | null = null;
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

	// Snaps to existing points, then to the surface under the cursor. Shift keeps the new segment on one axis.
	function surface(e: PointerEvent) {
		const raycaster = cast(e);
		if (plane) {
			const point = raycaster.ray.intersectPlane(plane, new Vector3());
			return point && { point, normal: plane.normal };
		}
		const hit = raycaster.intersectObjects(targets(), true).find(h => visible(h.object));
		if (!hit?.face) return null;
		return { point: hit.point.clone(), normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld) };
	}

	function locate(e: PointerEvent) {
		const snapped = nearby(e, plane ? points : [...points, ...done.flatMap(d => d.points)]);
		if (snapped) return snapped;
		const hit = surface(e);
		if (!hit) return null;
		const last = points.at(-1);
		if (!e.shiftKey || !last) return hit.point;
		const delta = hit.point.clone().sub(last);
		const axis = (['x', 'y', 'z'] as const).reduce((a, b) => (Math.abs(delta[a]) >= Math.abs(delta[b]) ? a : b));
		return last.clone().setComponent('xyz'.indexOf(axis), last[axis] + delta[axis]);
	}

	function finish() {
		if (!tool) return;
		const enough = tool === 'line' ? points.length > 1 : points.length > 2;
		if (enough) {
			const measurement = summarize(nextId++, tool, points);
			const group = draw(tool, points, false);
			root.add(group);
			done.push({ measurement, points, group });
		}
		points = [];
		plane = null;
		hover = null;
		redraw();
	}

	function cancel() {
		points = [];
		plane = null;
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
			if (!points.length) plane = null;
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
		root,
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
			if (tool === 'area' && points.length > 2 && p === points[0]) return finish();
			if (points.includes(p)) return;
			if (tool === 'area' && !points.length) {
				const normal = surface(e)?.normal ?? new Vector3(0, 1, 0);
				plane = new Plane().setFromNormalAndCoplanarPoint(normal, p);
			}
			points = [...points, p];
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
