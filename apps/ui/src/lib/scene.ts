import type { CatalogItem, Placement } from '@repo/shared/items';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
	AmbientLight,
	Box3,
	BoxGeometry,
	BoxHelper,
	CylinderGeometry,
	Color,
	DirectionalLight,
	Group,
	HemisphereLight,
	Mesh,
	Object3D,
	MeshStandardMaterial,
	PerspectiveCamera,
	Plane,
	Raycaster,
	Scene,
	Vector2,
	Vector3,
	WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
	CEILING_FT,
	columns,
	doors,
	fixtures,
	footprint,
	ft,
	rooms,
	walls,
	type FloorKind,
	type Rect,
	type Wall,
} from './floorplan';

export type Mode = 'orbit' | 'walk';

const EYE_FT = 5.5;
const PLAYER_RADIUS_FT = 0.9;
const WALK_FT_PER_S = 6;
const CUTAWAY_FT = 3.2;
const SNAP_FT = 0.6;
const WALL_MOUNT_SNAP_FT = 2;
const DEG = Math.PI / 180;

const floorColors: Record<FloorKind, number> = { wood: 0xc9a672, tile: 0xe6e6e2, concrete: 0x9a9a98 };

type Box = { x1: number; z1: number; x2: number; z2: number };

export function createViewer(
	container: HTMLElement,
	onMode: (mode: Mode) => void,
	onSelect: (key: string | null) => void,
	onChange: (key: string, position: Placement['position'], rotation: Placement['rotation']) => void,
) {
	const renderer = new WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	container.append(renderer.domElement);

	const labelRenderer = new CSS2DRenderer();
	Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
	container.append(labelRenderer.domElement);

	const scene = new Scene();
	scene.background = new Color(0x1c1f24);
	scene.add(new HemisphereLight(0xffffff, 0x6a6f77, 1.4), new AmbientLight(0xffffff, 0.5));
	const sun = new DirectionalLight(0xfff2dd, 1.6);
	sun.position.set(-20, 40, 30);
	scene.add(sun);

	const camera = new PerspectiveCamera(60, 1, 0.1, 400);
	const cx = ft((footprint[0] + footprint[2]) / 2);
	const cz = ft((footprint[1] + footprint[3]) / 2);

	const orbit = new OrbitControls(camera, renderer.domElement);
	orbit.target.set(cx, 0, cz);
	orbit.maxPolarAngle = Math.PI / 2 - 0.02;
	orbit.enableDamping = true;
	camera.position.set(cx, 36, cz + 22);

	const look = new PointerLockControls(camera, renderer.domElement);

	const wallGroup = new Group();
	const ceilingGroup = new Group();
	const labelGroup = new Group();
	scene.add(wallGroup, ceilingGroup, labelGroup);
	const colliders: Box[] = [];
	// Snap targets: wall faces for flush placement, fixture tops (counters, vanities) for surface items.
	const wallBoxes: Box[] = [];
	const surfaces: (Box & { top: number })[] = [];
	const cutawayWalls: { mesh: Mesh; fullHeight: number; y: number; glass: boolean; lintel?: boolean }[] = [];

	function addBox(parent: Object3D, rect: Rect, y: number, height: number, material: MeshStandardMaterial) {
		const [x1, z1, x2, z2] = rect.map(ft) as Rect;
		const mesh = new Mesh(new BoxGeometry(x2 - x1, height, z2 - z1), material);
		mesh.position.set((x1 + x2) / 2, y + height / 2, (z1 + z2) / 2);
		parent.add(mesh);
		return mesh;
	}

	for (const room of rooms) {
		const mat = new MeshStandardMaterial({ color: floorColors[room.floor], roughness: 0.8 });
		addBox(scene, room.rect, -0.1, 0.1, mat);
		if (!room.name) continue;
		const el = document.createElement('div');
		el.className = 'room-label';
		el.textContent = room.name;
		if (room.size) el.append(Object.assign(document.createElement('small'), { textContent: room.size }));
		const label = new CSS2DObject(el);
		const [x1, z1, x2, z2] = room.rect.map(ft);
		label.position.set((x1! + x2!) / 2, 0.3, (z1! + z2!) / 2);
		labelGroup.add(label);
	}

	const plaster = new MeshStandardMaterial({ color: 0xf1efea, roughness: 0.95 });
	const glassMat = new MeshStandardMaterial({
		color: 0x9fd0e8,
		transparent: true,
		opacity: 0.25,
		roughness: 0.1,
		depthWrite: false,
	});

	function buildWall({ line, thickness = 10, gaps = [], glass = false, height = CEILING_FT }: Wall) {
		const [x1, y1, x2, y2] = line;
		const horizontal = y1 === y2;
		const start = horizontal ? Math.min(x1, x2) : Math.min(y1, y2);
		const end = horizontal ? Math.max(x1, x2) : Math.max(y1, y2);
		const fixed = horizontal ? y1 : x1;
		const half = thickness / 2;
		const sorted = [...gaps].sort((a, b) => a[0] - b[0]);

		const span = (a: number, b: number, y: number, h: number, mat: MeshStandardMaterial, solid: boolean) => {
			if (b - a < 1) return;
			const rect: Rect = horizontal ? [a, fixed - half, b, fixed + half] : [fixed - half, a, fixed + half, b];
			const mesh = addBox(wallGroup, rect, y, h, mat);
			cutawayWalls.push({ mesh, fullHeight: h, y, glass, lintel: y > 0 });
			if (solid) {
				const [bx1, bz1, bx2, bz2] = rect.map(ft) as Rect;
				colliders.push({ x1: bx1, z1: bz1, x2: bx2, z2: bz2 });
				if (h >= 3) wallBoxes.push({ x1: bx1, z1: bz1, x2: bx2, z2: bz2 });
			}
		};

		let cursor = start;
		for (const [from, to] of sorted) {
			span(cursor, from, 0, height, glass ? glassMat : plaster, true);
			span(from, to, 7, height - 7, plaster, false);
			cursor = to;
		}
		span(cursor, end, 0, height, glass ? glassMat : plaster, true);
	}

	walls.forEach(wall => {
		const h = wall.height ?? CEILING_FT;
		buildWall({ ...wall, height: h });
	});

	for (const f of fixtures) {
		const y = f.y ?? 0;
		const mesh = addBox(wallGroup, f.rect, y, f.height, new MeshStandardMaterial({ color: f.color, roughness: 0.6 }));
		cutawayWalls.push({ mesh, fullHeight: f.height, y, glass: false });
		if (f.solid || (y === 0 && f.height > 1)) {
			const [x1, z1, x2, z2] = f.rect.map(ft) as Rect;
			colliders.push({ x1, z1, x2, z2 });
		}
		if (y === 0) {
			const [x1, z1, x2, z2] = f.rect.map(ft) as Rect;
			surfaces.push({ x1, z1, x2, z2, top: f.height });
		}
	}

	const doorMat = new MeshStandardMaterial({ color: 0xfafaf7, roughness: 0.7 });
	for (const [hx, hy, ex, ey] of doors) {
		const length = ft(Math.hypot(ex - hx, ey - hy));
		const mesh = new Mesh(new BoxGeometry(length, 7, 0.15), doorMat);
		mesh.position.set(ft((hx + ex) / 2), 3.5, ft((hy + ey) / 2));
		mesh.rotation.y = -Math.atan2(ey - hy, ex - hx);
		wallGroup.add(mesh);
		cutawayWalls.push({ mesh, fullHeight: 7, y: 0, glass: false });
	}

	for (const c of columns) {
		const mesh = new Mesh(new CylinderGeometry(ft(c.r), ft(c.r), CEILING_FT, 32), plaster);
		mesh.position.set(ft(c.x), CEILING_FT / 2, ft(c.y));
		wallGroup.add(mesh);
		cutawayWalls.push({ mesh, fullHeight: CEILING_FT, y: 0, glass: false });
		colliders.push({ x1: ft(c.x - c.r), z1: ft(c.y - c.r), x2: ft(c.x + c.r), z2: ft(c.y + c.r) });
	}

	const itemGroup = new Group();
	scene.add(itemGroup);
	const gltf = new GLTFLoader();
	const fallbackMat = new MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.6 });
	const roots = new Map<string, Group>();
	// Newly added items settle (floor, wall, ceiling) once their model has loaded and has a size.
	const snapOnLoad = new Set<string>();
	let catalogById: Record<string, CatalogItem> = {};
	const signature = (item: CatalogItem) => `${item.id}|${item.model}|${item.removeNodes.join(',')}`;

	async function buildItem(item: CatalogItem): Promise<Object3D> {
		const dims = item.dimensions;
		let object: Object3D;
		if (item.model) {
			object = (await gltf.loadAsync(item.model)).scene;
			for (const name of item.removeNodes) object.getObjectByName(name)?.removeFromParent();
			const size = new Box3().setFromObject(object).getSize(new Vector3());
			// Uniform scale keeps the model's proportions; listed width wins, otherwise assume glTF meters.
			object.scale.setScalar(dims ? dims.width / 12 / size.x : 3.28084);
		} else {
			const { width, height, depth } = dims ?? { width: 24, height: 24, depth: 24 };
			object = new Mesh(new BoxGeometry(width / 12, height / 12, depth / 12), fallbackMat);
		}
		// Re-center so the root's origin is the footprint center at the item's bottom; rotation spins in place.
		const box = new Box3().setFromObject(object);
		const center = box.getCenter(new Vector3());
		object.position.sub(new Vector3(center.x, box.min.y, center.z));
		return object;
	}

	function placeRoot(root: Group, p: Placement) {
		root.position.set(...p.position);
		root.rotation.set(p.rotation[0] * DEG, p.rotation[1] * DEG, p.rotation[2] * DEG);
	}

	const isBeingMoved = (root: Group) => dragging?.root === root || (transform.dragging && transform.object === root);

	function setPlacements(placements: Placement[], catalog: Record<string, CatalogItem>) {
		catalogById = catalog;
		const keys = new Set(placements.map(p => p.key));
		for (const [key, root] of roots) {
			if (keys.has(key)) continue;
			root.removeFromParent();
			roots.delete(key);
			if (selectedKey === key) select(null);
		}
		for (const p of placements) {
			const item = catalog[p.itemId];
			if (!item) continue;
			let root = roots.get(p.key);
			if (root && root.userData.signature !== signature(item)) {
				root.removeFromParent();
				root = undefined;
			}
			if (!root) {
				const fresh = new Group();
				fresh.userData = { key: p.key, itemId: item.id, signature: signature(item) };
				roots.set(p.key, fresh);
				itemGroup.add(fresh);
				void buildItem(item).then(object => {
					fresh.add(object);
					if (snapOnLoad.delete(p.key)) commit(fresh);
					if (selectedKey === p.key) selection.setFromObject(fresh);
				});
				root = fresh;
			}
			if (!isBeingMoved(root)) placeRoot(root, p);
		}
	}

	type WallHit = { wall: Box; shift: number; axis: 'x' | 'z'; normal: [x: number, z: number] };
	// Shift that puts the item's box against the given face of a wall, measured from the box as it is now.
	function flushShift(box: Box3, w: Box, normal: [number, number]) {
		if (normal[0] === 1) return w.x2 - box.min.x;
		if (normal[0] === -1) return w.x1 - box.max.x;
		if (normal[1] === 1) return w.z2 - box.min.z;
		return w.z1 - box.max.z;
	}
	function nearestWall(box: Box3, threshold: number): WallHit | null {
		let best: WallHit | null = null;
		const consider = (wall: Box, normal: [number, number]) => {
			const shift = flushShift(box, wall, normal);
			if (Math.abs(shift) < threshold && (!best || Math.abs(shift) < Math.abs(best.shift)))
				best = { wall, shift, axis: normal[0] ? 'x' : 'z', normal };
		};
		for (const w of wallBoxes) {
			if (box.min.z < w.z2 && box.max.z > w.z1) {
				if (box.max.x > w.x2) consider(w, [1, 0]);
				if (box.min.x < w.x1) consider(w, [-1, 0]);
			}
			if (box.min.x < w.x2 && box.max.x > w.x1) {
				if (box.max.z > w.z2) consider(w, [0, 1]);
				if (box.min.z < w.z1) consider(w, [0, -1]);
			}
		}
		return best;
	}

	// Pull items flush to nearby walls (wall-mounted ones also turn to face out of the wall),
	// then settle them onto the floor or the highest surface under their center.
	function snap(root: Group) {
		const mount = catalogById[root.userData.itemId]?.mount ?? 'floor';
		root.updateMatrixWorld(true);
		let box = new Box3().setFromObject(root);
		if (box.isEmpty()) return;

		const wall = nearestWall(box, mount === 'wall' ? WALL_MOUNT_SNAP_FT : SNAP_FT);
		if (wall) {
			if (mount === 'wall') {
				root.rotation.set(0, Math.atan2(wall.normal[0], wall.normal[1]), 0);
				root.updateMatrixWorld(true);
				box = new Box3().setFromObject(root);
			}
			root.position[wall.axis] += flushShift(box, wall.wall, wall.normal);
			root.updateMatrixWorld(true);
			box = new Box3().setFromObject(root);
		}

		if (mount === 'ceiling') {
			root.position.y += CEILING_FT - box.max.y;
			return;
		}
		const center = box.getCenter(new Vector3());
		const under = (b: Box) => center.x > b.x1 && center.x < b.x2 && center.z > b.z1 && center.z < b.z2;
		const tops = [0, ...surfaces.filter(under).map(s => s.top)];
		for (const other of roots.values()) {
			if (other === root) continue;
			const ob = new Box3().setFromObject(other);
			if (!ob.isEmpty() && under({ x1: ob.min.x, z1: ob.min.z, x2: ob.max.x, z2: ob.max.z })) tops.push(ob.max.y);
		}
		const support = Math.max(...tops.filter(t => t <= box.min.y + SNAP_FT));
		// Floor and surface items always rest on what is under them; wall items keep their height
		// unless brought close to the floor or a surface.
		if (mount !== 'wall' || box.min.y - support < SNAP_FT) root.position.y += support - box.min.y;
	}

	function commit(root: Group) {
		snap(root);
		const r = root.rotation;
		const round = (n: number, step: number) => Math.round(n / step) * step;
		onChange(
			root.userData.key,
			[round(root.position.x, 0.01), round(root.position.y, 0.01), round(root.position.z, 0.01)],
			[round(r.x / DEG, 0.1), round(r.y / DEG, 0.1), round(r.z / DEG, 0.1)],
		);
	}

	const transform = new TransformControls(camera, renderer.domElement);
	transform.setSize(0.8);
	scene.add(transform.getHelper());
	transform.addEventListener('dragging-changed', e => {
		orbit.enabled = !e.value && mode === 'orbit';
		if (!e.value && transform.object) commit(transform.object as Group);
	});
	transform.addEventListener('objectChange', () => {
		if (transform.object && transform.getMode() === 'translate') snap(transform.object as Group);
	});

	let selectedKey: string | null = null;
	const selection = new BoxHelper(new Object3D(), 0x5eead4);
	selection.visible = false;
	scene.add(selection);
	function select(key: string | null) {
		selectedKey = key && roots.has(key) ? key : null;
		selection.visible = !!selectedKey;
		if (selectedKey) {
			selection.setFromObject(roots.get(selectedKey)!);
			transform.attach(roots.get(selectedKey)!);
		} else transform.detach();
		onSelect(selectedKey);
	}

	const raycaster = new Raycaster();
	const pointer = new Vector2();
	const floor = new Plane(new Vector3(0, 1, 0), 0);
	const floorHit = new Vector3();
	let downAt: [number, number] | null = null;
	let dragging: { root: Group; offset: Vector3; moved: boolean } | null = null;

	function setPointer(e: PointerEvent) {
		const rect = renderer.domElement.getBoundingClientRect();
		if (mode === 'walk') pointer.set(0, 0);
		else pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
		raycaster.setFromCamera(pointer, camera);
	}

	function pickItem(e: PointerEvent): Group | null {
		setPointer(e);
		const hit = raycaster.intersectObjects([...itemGroup.children, wallGroup], true)[0];
		let node: Object3D | null = hit?.object ?? null;
		while (node && node.parent !== itemGroup) node = node.parent;
		return node as Group | null;
	}

	const onGizmo = () => transform.dragging || transform.axis !== null;

	// Dragging an item's body slides it along the floor plane; the gizmo handles precise axes.
	renderer.domElement.addEventListener('pointerdown', e => {
		downAt = [e.clientX, e.clientY];
		if (mode !== 'orbit' || e.button !== 0 || onGizmo()) return;
		const root = pickItem(e);
		if (!root) return;
		floor.constant = -root.position.y;
		if (!raycaster.ray.intersectPlane(floor, floorHit)) return;
		select(root.userData.key);
		dragging = { root, offset: root.position.clone().sub(floorHit), moved: false };
		orbit.enabled = false;
		renderer.domElement.setPointerCapture(e.pointerId);
	});
	renderer.domElement.addEventListener('pointermove', e => {
		if (!dragging) return;
		setPointer(e);
		if (!raycaster.ray.intersectPlane(floor, floorHit)) return;
		dragging.root.position.x = floorHit.x + dragging.offset.x;
		dragging.root.position.z = floorHit.z + dragging.offset.z;
		snap(dragging.root);
		dragging.moved = true;
	});
	renderer.domElement.addEventListener('pointerup', e => {
		if (dragging) {
			const { root, moved } = dragging;
			dragging = null;
			orbit.enabled = mode === 'orbit';
			if (moved) commit(root);
			return;
		}
		if (onGizmo() || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
		if (mode === 'walk' && !look.isLocked) return;
		select(pickItem(e)?.userData.key ?? null);
	});

	const ceilingMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
	for (const room of rooms) {
		if (room.floor === 'concrete' && room.name === 'Balcony') continue;
		addBox(ceilingGroup, room.rect, CEILING_FT, 0.1, ceilingMat);
	}

	let mode: Mode = 'orbit';
	let cutaway = true;
	let labels = false;

	function applyHeights() {
		const low = mode === 'orbit' && cutaway;
		for (const w of cutawayWalls) {
			const target = low ? Math.min(w.fullHeight, CUTAWAY_FT) : w.fullHeight;
			w.mesh.visible = !(low && w.y >= CUTAWAY_FT);
			const scale = target / w.fullHeight;
			w.mesh.scale.y = scale;
			w.mesh.position.y = w.y + (w.fullHeight * scale) / 2;
		}
		ceilingGroup.visible = mode === 'walk';
		labelGroup.visible = mode === 'orbit' && labels;
	}

	function setMode(next: Mode) {
		mode = next;
		orbit.enabled = next === 'orbit';
		if (next === 'walk') {
			select(null);
			camera.position.set(ft(380), EYE_FT, ft(780));
			camera.lookAt(ft(380), EYE_FT, ft(400));
			look.lock();
		} else {
			if (look.isLocked) look.unlock();
			camera.position.set(cx, 36, cz + 22);
			orbit.target.set(cx, 0, cz);
		}
		applyHeights();
		onMode(next);
	}

	function setLabels(value: boolean) {
		labels = value;
		applyHeights();
	}

	function setCutaway(value: boolean) {
		cutaway = value;
		applyHeights();
	}

	look.addEventListener('unlock', () => {
		if (mode === 'walk') setMode('orbit');
	});

	const keys = new Set<string>();
	const onKeyDown = (e: KeyboardEvent) => keys.add(e.code);
	const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
	addEventListener('keydown', onKeyDown);
	addEventListener('keyup', onKeyUp);

	function collides(x: number, z: number) {
		return colliders.some(
			b =>
				x > b.x1 - PLAYER_RADIUS_FT &&
				x < b.x2 + PLAYER_RADIUS_FT &&
				z > b.z1 - PLAYER_RADIUS_FT &&
				z < b.z2 + PLAYER_RADIUS_FT,
		);
	}

	const forward = new Vector3();
	const right = new Vector3();
	function step(dt: number) {
		const run = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2 : 1;
		const f = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
		const r = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
		if (!f && !r) return;
		camera.getWorldDirection(forward);
		forward.y = 0;
		forward.normalize();
		right.crossVectors(forward, camera.up).normalize();
		const dist = WALK_FT_PER_S * run * dt;
		const dx = (forward.x * f + right.x * r) * dist;
		const dz = (forward.z * f + right.z * r) * dist;
		if (!collides(camera.position.x + dx, camera.position.z)) camera.position.x += dx;
		if (!collides(camera.position.x, camera.position.z + dz)) camera.position.z += dz;
	}

	function resize() {
		const { clientWidth: w, clientHeight: h } = container;
		renderer.setSize(w, h);
		labelRenderer.setSize(w, h);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	}
	const observer = new ResizeObserver(resize);
	observer.observe(container);
	resize();
	applyHeights();

	let last = performance.now();
	renderer.setAnimationLoop(now => {
		const dt = Math.min((now - last) / 1000, 0.1);
		last = now;
		if (mode === 'walk') step(dt);
		else orbit.update();
		if (selectedKey) selection.setFromObject(roots.get(selectedKey)!);
		renderer.render(scene, camera);
		labelRenderer.render(scene, camera);
	});

	return {
		setMode,
		setCutaway,
		setLabels,
		setPlacements,
		select,
		setGizmoMode: (m: 'translate' | 'rotate') => transform.setMode(m),
		snapWhenLoaded: (key: string) => snapOnLoad.add(key),
		dispose() {
			renderer.setAnimationLoop(null);
			observer.disconnect();
			removeEventListener('keydown', onKeyDown);
			removeEventListener('keyup', onKeyUp);
			look.dispose();
			orbit.dispose();
			renderer.dispose();
			container.replaceChildren();
		},
	};
}
