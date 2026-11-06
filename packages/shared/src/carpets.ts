// Carpets and rugs: imported from a product link like wall textures, drawn as one top-down image of the whole rug on
// a layer of their own just above the floor and under everything else. They are moved by hand like furniture, but no
// part of a carpet may cross a floor-plan wall or the column.
import { ft, rooms } from './floorplan';
import type { Job } from './items';
import type { PlanGeometry } from './plan';

// Plan feet like Placement (+x east, +z south). `yaw` turns the rug like Placement.rotation[1]: at 0 its width runs
// east-west and its length north-south.
export type CarpetPose = { x: number; z: number; yaw: number };

export type CarpetSize = { widthIn: number; lengthIn: number; price: number | null };

export type Carpet = {
	id: string;
	url: string;
	importedAt: string;
	name: string;
	brand: string | null;
	currency: string;
	summary: string;
	// Every size the listing sells, smallest first; `size` is the one shown in the room.
	sizes: CarpetSize[];
	size: CarpetSize;
	image: string | null;
	// The whole rug seen straight down, image width along the rug's width and height along its length, stretched over
	// whichever size is picked.
	texture: { map: string; note: string } | null;
	// Null while the carpet is out of the room.
	placement: CarpetPose | null;
};

export type CarpetEntry = Carpet & { textureJob: Job | null };

export const sizeLabel = ({ widthIn, lengthIn }: Pick<CarpetSize, 'widthIn' | 'lengthIn'>) => {
	const feet = (n: number) => {
		const whole = Math.floor(n / 12 + 1e-9);
		const rest = Math.round(n - whole * 12);
		return rest ? `${whole}′${rest}″` : `${whole}′`;
	};
	return `${feet(widthIn)} × ${feet(lengthIn)}`;
};

const livingRoom = rooms.find(r => r.name === 'Living room')!.rect;
// Center of the living room: where a carpet lands when it is added.
export const CARPET_SPAWN = { x: ft((livingRoom[0] + livingRoom[2]) / 2), z: ft((livingRoom[1] + livingRoom[3]) / 2) };

type Obstacles = Pick<PlanGeometry, 'walls' | 'columns'>;

// Lying flush against a wall is fine; only real overlap counts.
const TOUCH_FT = 1e-3;

// Separating-axis test of the rug's turned rectangle against each axis-aligned wall run, and the rug against each
// column's circle in the rug's own frame.
export function carpetHitsWalls(pose: CarpetPose, size: Pick<CarpetSize, 'widthIn' | 'lengthIn'>, plan: Obstacles) {
	const hw = size.widthIn / 24;
	const hl = size.lengthIn / 24;
	const yaw = (pose.yaw * Math.PI) / 180;
	const c = Math.cos(yaw);
	const s = Math.sin(yaw);
	// Extent of the turned rug along world x and z.
	const ex = Math.abs(c) * hw + Math.abs(s) * hl;
	const ez = Math.abs(s) * hw + Math.abs(c) * hl;
	// Placement yaw turns +z toward +x, so the rug's width axis is (cos, -sin) and its length axis (sin, cos).
	const toLocal = (x: number, z: number) => {
		const dx = x - pose.x;
		const dz = z - pose.z;
		return [dx * c - dz * s, dx * s + dz * c] as const;
	};
	for (const {
		rect: [x1, z1, x2, z2],
	} of plan.walls) {
		const bx = (x1 + x2) / 2;
		const bz = (z1 + z2) / 2;
		const bw = (x2 - x1) / 2;
		const bh = (z2 - z1) / 2;
		if (Math.abs(bx - pose.x) >= ex + bw - TOUCH_FT || Math.abs(bz - pose.z) >= ez + bh - TOUCH_FT) continue;
		const [lx, lz] = toLocal(bx, bz);
		const boxAlongWidth = Math.abs(c) * bw + Math.abs(s) * bh;
		const boxAlongLength = Math.abs(s) * bw + Math.abs(c) * bh;
		if (Math.abs(lx) >= hw + boxAlongWidth - TOUCH_FT || Math.abs(lz) >= hl + boxAlongLength - TOUCH_FT) continue;
		return true;
	}
	for (const column of plan.columns) {
		const [lx, lz] = toLocal(column.x, column.z);
		const dx = Math.abs(lx) - Math.min(Math.abs(lx), hw);
		const dz = Math.abs(lz) - Math.min(Math.abs(lz), hl);
		if (Math.hypot(dx, dz) < column.radius - TOUCH_FT) return true;
	}
	return false;
}

// Where an added carpet lands: the middle of the living room, turned whichever way first clears the walls and column.
export function carpetSpawn(size: Pick<CarpetSize, 'widthIn' | 'lengthIn'>, plan: Obstacles): CarpetPose | null {
	for (const yaw of [0, 90]) {
		const pose = { ...CARPET_SPAWN, yaw };
		if (!carpetHitsWalls(pose, size, plan)) return pose;
	}
	return null;
}

// Moves a carpet from where it lies toward `to` as far as the walls let it: a move that crosses a wall slides along it,
// first east-west, then north-south, and stops flush against it. A turn that would cross a wall is refused. A carpet
// that already crosses a wall moves freely, so it can be pulled clear.
export function moveCarpet(
	from: CarpetPose,
	to: CarpetPose,
	size: Pick<CarpetSize, 'widthIn' | 'lengthIn'>,
	plan: Obstacles,
): CarpetPose {
	const fits = (pose: CarpetPose) => !carpetHitsWalls(pose, size, plan);
	if (fits(to) || !fits(from)) return to;
	if (Math.abs(to.yaw - from.yaw) > 1e-6) return from;
	let pose = from;
	for (const axis of ['x', 'z'] as const) {
		const along = (t: number) => ({ ...pose, [axis]: pose[axis] + (to[axis] - pose[axis]) * t });
		if (fits(along(1))) {
			pose = along(1);
			continue;
		}
		let [lo, hi] = [0, 1];
		for (let i = 0; i < 16; i++) {
			const mid = (lo + hi) / 2;
			if (fits(along(mid))) lo = mid;
			else hi = mid;
		}
		pose = along(lo);
	}
	return pose;
}
