import {
	AmbientLight,
	BoxGeometry,
	CylinderGeometry,
	Color,
	DirectionalLight,
	Group,
	HemisphereLight,
	Mesh,
	Object3D,
	MeshStandardMaterial,
	PerspectiveCamera,
	Scene,
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

const floorColors: Record<FloorKind, number> = { wood: 0xc9a672, tile: 0xe6e6e2, concrete: 0x9a9a98 };

type Box = { x1: number; z1: number; x2: number; z2: number };

export function createViewer(container: HTMLElement, onMode: (mode: Mode) => void) {
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

	const ceilingMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
	for (const room of rooms) {
		if (room.floor === 'concrete' && room.name === 'Balcony') continue;
		addBox(ceilingGroup, room.rect, CEILING_FT, 0.1, ceilingMat);
	}

	let mode: Mode = 'orbit';
	let cutaway = true;

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
		labelGroup.visible = mode === 'orbit';
	}

	function setMode(next: Mode) {
		mode = next;
		orbit.enabled = next === 'orbit';
		if (next === 'walk') {
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
		renderer.render(scene, camera);
		labelRenderer.render(scene, camera);
	});

	return {
		setMode,
		setCutaway,
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
