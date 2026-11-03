import {
	tvDiagonal,
	type CatalogItem,
	type FinishSurface,
	type Placement,
	type TvSettings,
	type WallTexture,
} from '@repo/shared/items';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
	AmbientLight,
	Box3,
	BoxGeometry,
	BoxHelper,
	CanvasTexture,
	CylinderGeometry,
	Color,
	DirectionalLight,
	Euler,
	Group,
	HemisphereLight,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	MeshStandardMaterial,
	PerspectiveCamera,
	Plane,
	PlaneGeometry,
	Raycaster,
	RepeatWrapping,
	Scene,
	SRGBColorSpace,
	Texture,
	TextureLoader,
	Vector2,
	Vector3,
	WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
	bedWallFace,
	CEILING_FT,
	columns,
	doors,
	fixtures,
	footprint,
	ft,
	finishAreasIn,
	PX_PER_FT,
	rooms,
	tvWallFace,
	walls,
	type FloorKind,
	type Rect,
	type Wall,
} from '@repo/shared/floorplan';

export type Mode = 'orbit' | 'walk';

const EYE_FT = 5.5;
const PLAYER_RADIUS_FT = 0.9;
const WALK_FT_PER_S = 6;
const CUTAWAY_FT = 3.2;
// Mullion spacing taped on the living-room south glass.
const WINDOW_BAY_IN = 48;
const FRAME_IN = 2;
const SNAP_FT = 0.6;
const WALL_MOUNT_SNAP_FT = 2;
const DEG = Math.PI / 180;
const round1 = (n: number) => Math.round(n * 10) / 10;

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
	const cutawayWalls: {
		mesh: Mesh;
		fullHeight: number;
		y: number;
		glass: boolean;
		lintel?: boolean;
		onHeight?: (height: number) => void;
	}[] = [];

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
		opacity: 0.35,
		roughness: 0.1,
		depthWrite: false,
	});
	const frameMat = new MeshStandardMaterial({ color: 0x2f3438, roughness: 0.5 });
	const inchPx = PX_PER_FT / 12;

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

		const frame = (a: number, b: number, y: number, h: number) => {
			const depth = half + inchPx;
			const rect: Rect = horizontal ? [a, fixed - depth, b, fixed + depth] : [fixed - depth, a, fixed + depth, b];
			const mesh = addBox(wallGroup, rect, y, h, frameMat);
			cutawayWalls.push({ mesh, fullHeight: h, y, glass: false });
		};
		// Full-height glass reads as a window: sill, head and evenly spaced mullions. Railings stay plain glass.
		const windowFrames = (a: number, b: number) => {
			if (!glass || height < CEILING_FT || b - a < 1) return;
			const bar = FRAME_IN * inchPx;
			const bays = Math.max(1, Math.round((b - a) / (WINDOW_BAY_IN * inchPx)));
			for (let i = 0; i <= bays; i++) {
				const c = a + ((b - a) * i) / bays;
				frame(Math.max(a, c - bar / 2), Math.min(b, c + bar / 2), 0, height);
			}
			frame(a, b, 0, FRAME_IN / 12);
			frame(a, b, height - FRAME_IN / 12, FRAME_IN / 12);
		};

		let cursor = start;
		for (const [from, to] of sorted) {
			span(cursor, from, 0, height, glass ? glassMat : plaster, true);
			windowFrames(cursor, from);
			span(from, to, 7, height - 7, plaster, false);
			cursor = to;
		}
		span(cursor, end, 0, height, glass ? glassMat : plaster, true);
		windowFrames(cursor, end);
	}

	walls.forEach(wall => {
		const h = wall.height ?? CEILING_FT;
		buildWall({ ...wall, height: h });
	});

	const tvWallFixtures: { mesh: Mesh; x: number }[] = [];
	for (const f of fixtures) {
		const y = f.y ?? 0;
		const mesh = addBox(wallGroup, f.rect, y, f.height, new MeshStandardMaterial({ color: f.color, roughness: 0.6 }));
		cutawayWalls.push({ mesh, fullHeight: f.height, y, glass: false });
		if (f.tvWall) tvWallFixtures.push({ mesh, x: mesh.position.x });
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

	// Wall textures cover the TV wall's living-room face and sleeve the column, standing out from them by the panel
	// thickness. Each surface keeps its own copy of the tile so it can repeat at real scale for its width and for the
	// height the cutaway currently shows.
	type Finish = {
		group: Group;
		material: MeshStandardMaterial;
		widthFt: () => number;
		setDepth: (ft: number) => void;
		heightFt: number;
		repeat: { width: number; height: number } | null;
		version: number;
	};
	const finishes = {} as Record<FinishSurface, Finish>;
	function addFinish(surface: FinishSurface, mesh: Mesh, widthFt: () => number, setDepth: (ft: number) => void) {
		const group = new Group();
		group.visible = false;
		group.add(mesh);
		wallGroup.add(group);
		const finish: Finish = {
			group,
			material: mesh.material as MeshStandardMaterial,
			widthFt,
			setDepth,
			heightFt: CEILING_FT,
			repeat: null,
			version: 0,
		};
		finishes[surface] = finish;
		cutawayWalls.push({
			mesh,
			fullHeight: CEILING_FT,
			y: 0,
			glass: false,
			onHeight: height => {
				finish.heightFt = height;
				tileFinish(finish);
			},
		});
	}
	function tileFinish({ material, widthFt, heightFt, repeat }: Finish) {
		if (!repeat || !material.map || !material.normalMap) return;
		const across = widthFt() / (repeat.width / 12);
		const up = heightFt / (repeat.height / 12);
		for (const map of [material.map, material.normalMap]) map.repeat.set(across, up);
	}

	const tvWallSnap = wallBoxes.find(b => b.x1 === ft(tvWallFace.x) && b.z1 === ft(tvWallFace.y1));
	if (!tvWallSnap) throw new Error('TV wall face does not match a wall run in the floor plan');
	const wallFinish = new Mesh(
		new PlaneGeometry(ft(tvWallFace.y2 - tvWallFace.y1), CEILING_FT),
		new MeshStandardMaterial(),
	);
	// Faces west, into the living room, with the tile's left edge at the north end.
	wallFinish.rotation.y = -Math.PI / 2;
	wallFinish.position.z = ft((tvWallFace.y1 + tvWallFace.y2) / 2);
	addFinish(
		'tvWall',
		wallFinish,
		() => ft(tvWallFace.y2 - tvWallFace.y1),
		depth => {
			wallFinish.position.x = ft(tvWallFace.x) - depth;
			// Wall-mounted items snap to the panels' face instead of the plaster behind them.
			tvWallSnap.x1 = ft(tvWallFace.x) - depth;
			tvWallDepthFt = depth;
			placeTv();
			for (const f of tvWallFixtures) f.mesh.position.x = f.x - depth;
		},
	);

	const column = columns[0]!;
	const columnFinish = new Mesh(new CylinderGeometry(1, 1, CEILING_FT, 64, 1, true), new MeshStandardMaterial());
	columnFinish.position.set(ft(column.x), CEILING_FT / 2, ft(column.y));
	addFinish(
		'column',
		columnFinish,
		// Whole tiles around, so the seam where the sleeve closes matches.
		() => {
			const repeat = finishes.column.repeat;
			const around = 2 * Math.PI * columnFinish.scale.x;
			return repeat ? Math.max(1, Math.round(around / (repeat.width / 12))) * (repeat.width / 12) : around;
		},
		depth => columnFinish.scale.set(ft(column.r) + depth, columnFinish.scale.y, ft(column.r) + depth),
	);

	// The TV hangs on a tilting mount centered on the TV wall's measured span, out from any wall texture.
	const TV_DEPTH_IN = 1.2;
	const TV_MOUNT_IN = 2.5;
	const TV_BEZEL_IN = 0.3;
	let tvWallDepthFt = 0;
	let tvSettings: TvSettings | null = null;
	const tvGroup = new Group();
	tvGroup.visible = false;
	scene.add(tvGroup);
	const tvBody = new Mesh(
		new BoxGeometry(1, 1, 1),
		new MeshStandardMaterial({ color: 0x141518, roughness: 0.4, metalness: 0.3 }),
	);
	const tvScreenMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.1 });
	const tvScreen = new Mesh(new PlaneGeometry(1, 1), tvScreenMat);
	// Faces west, into the living room.
	tvScreen.rotation.y = -Math.PI / 2;
	tvGroup.add(tvBody, tvScreen);

	function tvLabel({ widthIn, heightIn }: TvSettings) {
		const canvas = document.createElement('canvas');
		canvas.width = 1024;
		canvas.height = Math.round((1024 * heightIn) / widthIn);
		const ctx = canvas.getContext('2d')!;
		const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
		gradient.addColorStop(0, '#1d2633');
		gradient.addColorStop(1, '#0b0e13');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = '#e8edf3';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const unit = canvas.height / 10;
		ctx.font = `600 ${unit * 2.4}px system-ui, sans-serif`;
		ctx.fillText(`${round1(tvDiagonal({ widthIn, heightIn }))}″`, canvas.width / 2, canvas.height * 0.42);
		ctx.font = `400 ${unit * 0.9}px system-ui, sans-serif`;
		ctx.fillStyle = '#9aa7b6';
		ctx.fillText(`${round1(widthIn)}″ × ${round1(heightIn)}″`, canvas.width / 2, canvas.height * 0.66);
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		return texture;
	}

	function placeTv() {
		const tv = tvSettings;
		tvGroup.visible = !!tv?.visible;
		if (!tv) return;
		const [w, h, d] = [tv.widthIn / 12, tv.heightIn / 12, TV_DEPTH_IN / 12];
		tvBody.scale.set(d, h, w);
		tvScreen.scale.set(w - (2 * TV_BEZEL_IN) / 12, h - (2 * TV_BEZEL_IN) / 12, 1);
		tvScreen.position.x = -d / 2 - 0.002;
		// Rotating about the wall-parallel axis through the screen center tips the top out and the screen down.
		tvGroup.rotation.z = tv.tiltDeg * DEG;
		tvGroup.position.set(
			// Tilting about the center swings the bottom edge toward the wall; the mount holds it out by that much.
			ft(tvWallFace.x) - tvWallDepthFt - TV_MOUNT_IN / 12 - d / 2 - (h / 2) * Math.sin(tv.tiltDeg * DEG),
			tv.centerIn / 12,
			ft(tvWallFace.y2) - finishAreasIn.tvWall.width / 24,
		);
	}

	function setTv(tv: TvSettings) {
		const resized = tv.widthIn !== tvSettings?.widthIn || tv.heightIn !== tvSettings?.heightIn;
		tvSettings = tv;
		if (resized) {
			tvScreenMat.map?.dispose();
			tvScreenMat.map = tvLabel(tv);
			tvScreenMat.needsUpdate = true;
		}
		placeTv();
	}

	const textureLoader = new TextureLoader();
	const textureCache = new Map<string, Promise<Texture>>();
	const loadTexture = (url: string) => {
		if (!textureCache.has(url)) textureCache.set(url, textureLoader.loadAsync(url));
		return textureCache.get(url)!;
	};

	async function setFinish(surface: FinishSurface, texture: WallTexture | null) {
		const finish = finishes[surface];
		const version = ++finish.version;
		const tile = texture?.texture;
		if (!tile) {
			finish.group.visible = false;
			finish.setDepth(0);
			return;
		}
		const [map, normalMap] = await Promise.all([loadTexture(tile.map), loadTexture(tile.normalMap)]);
		if (version !== finish.version) return;
		const copy = (source: Texture, color: boolean) => {
			const t = source.clone();
			t.wrapS = t.wrapT = RepeatWrapping;
			if (color) t.colorSpace = SRGBColorSpace;
			t.needsUpdate = true;
			return t;
		};
		finish.material.map?.dispose();
		finish.material.normalMap?.dispose();
		finish.material.map = copy(map, true);
		finish.material.normalMap = copy(normalMap, false);
		finish.material.roughness = 0.75;
		finish.material.needsUpdate = true;
		finish.repeat = tile.repeat;
		finish.setDepth(tile.depthIn / 12);
		tileFinish(finish);
		finish.group.visible = true;
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

	// The bed is built in like the TV: headboard (the model's back, -z) flush to the primary bedroom's north wall and
	// centered between the side walls, with its size written across the top.
	const bedWallSnap = wallBoxes.find(
		b => b.z2 === ft(bedWallFace.y) && b.x1 <= ft(bedWallFace.x1) && b.x2 >= ft(bedWallFace.x2),
	);
	if (!bedWallSnap) throw new Error('Bed wall face does not match a wall run in the floor plan');
	const bedSpanIn = ft(bedWallFace.x2 - bedWallFace.x1) * 12;
	const bedGroup = new Group();
	bedGroup.position.x = ft((bedWallFace.x1 + bedWallFace.x2) / 2);
	scene.add(bedGroup);
	const bedModels = new Map<string, Promise<Object3D>>();
	const bedLabelMat = new MeshBasicMaterial({ transparent: true, depthWrite: false });
	const bedLabel = new Mesh(new PlaneGeometry(1, 1), bedLabelMat);
	// Lies flat with the text's top toward the headboard, so it reads from the foot of the bed.
	bedLabel.rotation.x = -Math.PI / 2;
	let bedVersion = 0;
	let shownBedKey: string | null = null;

	function bedLabelTexture(lines: [string, string]) {
		const canvas = document.createElement('canvas');
		canvas.width = 1024;
		canvas.height = 400;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = 'rgba(15, 18, 24, 0.72)';
		ctx.beginPath();
		ctx.roundRect(0, 0, canvas.width, canvas.height, 48);
		ctx.fill();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#f2f5f8';
		ctx.font = '600 150px system-ui, sans-serif';
		ctx.fillText(lines[0], canvas.width / 2, 150);
		ctx.fillStyle = '#b4bfcc';
		ctx.font = '400 64px system-ui, sans-serif';
		ctx.fillText(lines[1], canvas.width / 2, 300);
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		return texture;
	}

	async function setBed(item: CatalogItem | null) {
		const version = ++bedVersion;
		if (!item) {
			bedGroup.clear();
			shownBedKey = null;
			return;
		}
		const key = `${signature(item)}|${JSON.stringify(item.dimensions)}`;
		if (key === shownBedKey) return;
		if (!bedModels.has(key)) bedModels.set(key, buildItem(item));
		const model = await bedModels.get(key)!.catch(error => {
			bedModels.delete(key);
			throw error;
		});
		if (version !== bedVersion) return;
		bedGroup.clear();
		bedGroup.add(model, bedLabel);
		shownBedKey = key;
		const size = new Box3().setFromObject(model).getSize(new Vector3());
		bedGroup.position.z = ft(bedWallFace.y) + size.z / 2;
		bedGroup.updateMatrixWorld(true);

		const { width, height, depth } = item.dimensions ?? { width: size.x * 12, height: size.y * 12, depth: size.z * 12 };
		bedLabelMat.map?.dispose();
		bedLabelMat.map = bedLabelTexture([
			`${round1(width)}″ × ${round1(depth)}″`,
			`${round1(height)}″ high · ${round1((bedSpanIn - size.x * 12) / 2)}″ each side`,
		]);
		bedLabelMat.needsUpdate = true;
		const labelWidth = Math.min(size.x * 0.8, size.z * 0.45 * (1024 / 400));
		const labelDepth = (labelWidth * 400) / 1024;
		bedLabel.scale.set(labelWidth, labelDepth, 1);

		// The label rests on the highest thing under it (mattress, slats or platform); one ray down the middle can pass
		// between slats and leave the text buried under them.
		const ray = new Raycaster();
		const down = new Vector3(0, -1, 0);
		let top = 0;
		const STEP_FT = 2 / 12;
		for (let dx = -labelWidth / 2; dx <= labelWidth / 2; dx += STEP_FT)
			for (let dz = -labelDepth / 2; dz <= labelDepth / 2; dz += STEP_FT) {
				ray.set(new Vector3(bedGroup.position.x + dx, CEILING_FT, bedGroup.position.z + dz), down);
				top = Math.max(top, ray.intersectObject(model, true)[0]?.point.y ?? 0);
			}
		bedLabel.position.y = (top || size.y) + 0.03;
	}

	function placeRoot(root: Group, p: Placement) {
		root.position.set(...p.position);
		root.rotation.set(p.rotation[0] * DEG, p.rotation[1] * DEG, p.rotation[2] * DEG);
	}

	const isBeingMoved = (root: Group) => dragging?.root === root || gizmos.some(g => g.dragging && g.object === root);

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
				if (selectedKey === p.key) select(p.key);
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
		const support = Math.max(0, ...tops.filter(t => t <= box.min.y + SNAP_FT));
		// Floor and surface items always rest on what is under them; wall items keep their height
		// unless brought close to the floor or a surface.
		if (mount !== 'wall' || box.min.y - support < SNAP_FT) root.position.y += support - box.min.y;
	}

	function commit(root: Group) {
		snap(root);
		// Items only turn about Y. Reading yaw in YXZ order avoids the gizmo's equivalent
		// [180, y, 180] XYZ decomposition, which would make the card's turn buttons spin backwards.
		const yaw = new Euler().setFromQuaternion(root.quaternion, 'YXZ').y;
		const round = (n: number, step: number) => Math.round(n / step) * step;
		onChange(
			root.userData.key,
			[round(root.position.x, 0.01), round(root.position.y, 0.01), round(root.position.z, 0.01)],
			[0, round(yaw / DEG, 0.1), 0],
		);
	}

	// Three move arrows and a single turn ring; plane handles and tilting are left out on purpose.
	const move = new TransformControls(camera, renderer.domElement);
	move.setSize(0.8);
	move.showXY = move.showYZ = move.showXZ = false;
	const turn = new TransformControls(camera, renderer.domElement);
	turn.setMode('rotate');
	turn.setSize(1.1);
	turn.showX = turn.showZ = false;
	turn.setRotationSnap(15 * DEG);
	const gizmos = [move, turn];
	for (const g of gizmos) {
		scene.add(g.getHelper());
		g.addEventListener('dragging-changed', e => {
			orbit.enabled = !e.value && mode === 'orbit';
			if (!e.value && g.object) commit(g.object as Group);
		});
	}
	move.addEventListener('objectChange', () => {
		if (move.object) snap(move.object as Group);
	});

	let selectedKey: string | null = null;
	const selection = new BoxHelper(new Object3D(), 0x5eead4);
	selection.visible = false;
	scene.add(selection);
	function select(key: string | null) {
		selectedKey = key && roots.has(key) ? key : null;
		selection.visible = !!selectedKey;
		if (selectedKey) {
			const root = roots.get(selectedKey)!;
			selection.setFromObject(root);
			move.attach(root);
			// Wall-mounted items take their facing from the wall they snap to.
			if (catalogById[root.userData.itemId]?.mount === 'wall') turn.detach();
			else turn.attach(root);
		} else for (const g of gizmos) g.detach();
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

	const onGizmo = () => gizmos.some(g => g.dragging || g.axis !== null);

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
			w.onHeight?.(target);
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
		setTv,
		setBed: (item: CatalogItem | null) => setBed(item).catch(error => console.error('Bed model failed to load', error)),
		setFinishes: (textures: Record<FinishSurface, WallTexture | null>) => {
			void setFinish('tvWall', textures.tvWall);
			void setFinish('column', textures.column);
		},
		select,
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
