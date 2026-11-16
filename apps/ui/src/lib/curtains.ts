import type { CurtainState } from '@repo/shared/fixtures';
import { CEILING_FT, ft, type CurtainTrack } from '@repo/shared/floorplan';
import {
	BufferGeometry,
	CanvasTexture,
	CylinderGeometry,
	DoubleSide,
	Float32BufferAttribute,
	Group,
	Mesh,
	MeshStandardMaterial,
	RepeatWrapping,
	SRGBColorSpace,
} from 'three';

// The fabric's middle hangs this far into the room from the glass, clear of the mullions at the deepest fold.
const OFFSET_IN = 4.5;
// Width of one pleat drawn closed, and fabric per width of glass covered (2× is the usual fullness).
const PLEAT_IN = 4.5;
const FULLNESS = 2;
// Gathered open, a panel's fabric folds into a stack about this fraction of its flat width.
const STACK = 1 / 7;
const STACK_MIN_IN = 6;
const HEM_IN = 0.5;
const ROD_IN = 2;
const ROD_RADIUS_IN = 0.6;
// The linen tile repeats every this many feet.
const WEAVE_FT = 0.5;

// One piece that the plan's cutaway shortens: the fabric to the cut, the rod gone below it.
export type CurtainPart = { mesh: Mesh; fullHeight: number; y: number };

// A pleated panel `widthFt` wide whose `pleats` folds each hold `fabricFt / pleats` of cloth. Folds keep their cloth as
// a panel gathers, so the same pleats grow deeper in a narrow stack than drawn across the glass: a zigzag of period p
// and depth 2a is sqrt(p² + 16a²) long. Centered on its height, it runs along +x from x = 0 and folds along z.
function pleatGeometry(widthFt: number, heightFt: number, pleats: number, fabricFt: number) {
	const period = widthFt / pleats;
	const cloth = fabricFt / pleats;
	const depth = Math.sqrt(Math.max(cloth ** 2 - period ** 2, 0)) / 4;
	const columns = pleats * 12;
	const positions: number[] = [];
	const uvs: number[] = [];
	const index: number[] = [];
	for (let i = 0; i <= columns; i++) {
		const t = i / columns;
		const x = t * widthFt;
		const z = depth * Math.sin(t * pleats * 2 * Math.PI);
		// The weave follows the cloth, so a gathered stack squeezes it with the folds.
		const u = (t * fabricFt) / WEAVE_FT;
		positions.push(x, -heightFt / 2, z, x, heightFt / 2, z);
		uvs.push(u, 0, u, heightFt / WEAVE_FT);
		if (i < columns) {
			const a = i * 2;
			index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
		}
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
	geometry.setIndex(index);
	geometry.computeVertexNormals();
	return geometry;
}

let weave: CanvasTexture | null = null;
// A light linen weave the look's color tints, so the fabric doesn't read as plastic.
function linen() {
	if (weave) return weave;
	const size = 64;
	const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
	const ctx = canvas.getContext('2d')!;
	const image = ctx.createImageData(size, size);
	const rows = Array.from({ length: size }, () => Math.random());
	const cols = Array.from({ length: size }, () => Math.random());
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const shade = 228 + 14 * ((rows[y]! + cols[x]!) / 2) + 8 * Math.random() - ((x + y) % 2) * 6;
			image.data.set([shade, shade, shade, 255], (y * size + x) * 4);
		}
	ctx.putImageData(image, 0, 0);
	weave = new CanvasTexture(canvas);
	weave.colorSpace = SRGBColorSpace;
	weave.wrapS = weave.wrapT = RepeatWrapping;
	return weave;
}

// Every track's panels, drawn across the glass or gathered at the ends, and the rods they hang from.
export function buildCurtains(tracks: CurtainTrack[], state: Exclude<CurtainState, 'off'>, color: string) {
	const group = new Group();
	const parts: CurtainPart[] = [];
	const fabric = new MeshStandardMaterial({ color, map: linen(), roughness: 0.95, side: DoubleSide });
	const metal = new MeshStandardMaterial({ color: 0x2f3438, roughness: 0.4, metalness: 0.6 });
	const rodY = CEILING_FT - ROD_IN / 12;
	const bottom = HEM_IN / 12;
	const height = rodY - bottom;

	for (const track of tracks) {
		// World x/z of a point `along` the track, `out` feet into the room.
		const point = (along: number, out: number) => {
			const a = ft(along);
			const b = ft(track.at) + out * track.into;
			return track.axis === 'y' ? { x: b, z: a } : { x: a, z: b };
		};
		const offset = OFFSET_IN / 12;

		for (const end of [track.from, track.to]) {
			const closedFt = ft(Math.abs(track.part - end));
			if (closedFt < 0.1) continue;
			const fabricFt = closedFt * FULLNESS;
			const widthFt = state === 'closed' ? closedFt : Math.min(closedFt, Math.max(STACK_MIN_IN / 12, fabricFt * STACK));
			const pleats = Math.max(2, Math.round((closedFt * 12) / PLEAT_IN));
			const mesh = new Mesh(pleatGeometry(widthFt, height, pleats, fabricFt), fabric);
			const start = point(end, offset);
			const toward = Math.sign(track.part - end);
			const dir = track.axis === 'y' ? { x: 0, z: toward } : { x: toward, z: 0 };
			// rotation.y = θ turns local +x to (cos θ, -sin θ) and local +z to (sin θ, cos θ) in world x/z.
			const theta = -Math.atan2(dir.z, dir.x);
			mesh.rotation.y = theta;
			const normal = track.axis === 'y' ? { x: track.into, z: 0 } : { x: 0, z: track.into };
			if (Math.sin(theta) * normal.x + Math.cos(theta) * normal.z < 0) mesh.scale.z = -1;
			mesh.position.set(start.x, bottom + height / 2, start.z);
			group.add(mesh);
			parts.push({ mesh, fullHeight: height, y: bottom });
		}

		const lengthFt = ft(track.to - track.from);
		const rod = new Mesh(new CylinderGeometry(ROD_RADIUS_IN / 12, ROD_RADIUS_IN / 12, lengthFt, 12), metal);
		const middle = point((track.from + track.to) / 2, offset);
		rod.position.set(middle.x, rodY, middle.z);
		rod.rotation.set(track.axis === 'y' ? Math.PI / 2 : 0, 0, track.axis === 'x' ? Math.PI / 2 : 0);
		group.add(rod);
		parts.push({ mesh: rod, fullHeight: ROD_RADIUS_IN / 6, y: rodY - ROD_RADIUS_IN / 12 });
	}
	return { group, parts };
}

// A listing sold in one look has no swatch, so its color is the middle of its photo, where the curtain hangs.
export async function photoColor(src: string) {
	const image = new Image();
	image.src = src;
	await image.decode();
	const canvas = Object.assign(document.createElement('canvas'), { width: 16, height: 16 });
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	const w = image.naturalWidth;
	const h = image.naturalHeight;
	ctx.drawImage(image, w * 0.3, h * 0.25, w * 0.4, h * 0.5, 0, 0, 16, 16);
	const { data } = ctx.getImageData(0, 0, 16, 16);
	const sum = [0, 0, 0];
	for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
	return `#${sum
		.map(v =>
			Math.round(v / 256)
				.toString(16)
				.padStart(2, '0'),
		)
		.join('')}`;
}
