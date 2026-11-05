import { expect, test } from 'bun:test';
import { DEFAULT_TV } from './items';
import { planGeometry, TV_DEPTH_IN, tvPose } from './plan';

test('splits the bedroom wall at both doors into three runs in feet', () => {
	const bedroomWall = planGeometry().walls.filter(w => w.rect[0] === 15.949 && w.rect[2] === 16.371);
	expect(bedroomWall).toEqual([
		{ rect: [15.949, 1.477, 16.371, 4.641], glass: false },
		{ rect: [15.949, 7.89, 16.371, 8.397], glass: false },
		{ rect: [15.949, 11.561, 16.371, 12.489], glass: false },
	]);
});

test('reports the living-room column with its radius in feet', () => {
	expect(planGeometry().columns).toEqual([{ x: 12.954, z: 36.498, radius: 1.392 }]);
});

test('places the texture surfaces on the TV wall face and the column, in feet', () => {
	const plan = planGeometry();
	expect(plan.ceiling).toBe(10);
	expect(plan.finishSurfaces).toEqual({
		tvWall: { x: 24.388, z1: 27.046, z2: 37.679 },
		column: { x: 12.954, z: 36.498, radius: 1.392 },
	});
});

test('offers the back wall center, the pillar wall between column and back wall, and the corner of the two', () => {
	expect(planGeometry().tvSpots).toEqual({
		backWall: { x: 24.388, z: 32.596, yaw: -90, onBackWall: true, corner: false },
		pillarWall: { x: 19.367, z: 37.679, yaw: 180, onBackWall: false, corner: false },
		corner: { x: 24.388, z: 37.679, yaw: -135, onBackWall: true, corner: true },
	});
});

test('hangs a back-wall TV 2.5" off the wall texture, centered on the measured 122"', () => {
	const pose = tvPose({ ...DEFAULT_TV, placement: 'backWall' }, 1 / 12);
	expect(pose.x).toBeCloseTo(24.388 - (1 + 2.5 + TV_DEPTH_IN / 2) / 12, 6);
	expect(pose.z).toBe(32.596);
	expect(pose.yaw).toBe(-90);
});

test('ignores a back-wall texture for a TV on the pillar wall', () => {
	const pose = tvPose({ ...DEFAULT_TV, placement: 'pillarWall' }, 1 / 12);
	expect(pose.x).toBeCloseTo(19.367, 6);
	expect(pose.z).toBeCloseTo(37.679 - (2.5 + TV_DEPTH_IN / 2) / 12, 6);
});

test('pulls a corner TV out until both back corners clear the walls by the same 1.77"', () => {
	for (const diagonal of [65, 98]) {
		const widthIn = (diagonal * 16) / Math.hypot(16, 9);
		const pose = tvPose({ ...DEFAULT_TV, placement: 'corner', widthIn }, 0);
		const back = (TV_DEPTH_IN / 2 / 12) * Math.SQRT1_2;
		const half = (widthIn / 2 / 12) * Math.SQRT1_2;
		const towardBackWall = 24.388 - (pose.x + back + half);
		const towardPillarWall = 37.679 - (pose.z + back + half);
		expect([towardBackWall, towardPillarWall].map(ft => Math.round(ft * 1200) / 100)).toEqual([1.77, 1.77]);
	}
});

test("lists the TV wall's switch, outlet and smoke alarm against its face, in feet", () => {
	expect(planGeometry().tvWallDevices).toEqual([
		{ rect: [24.304, 28.059, 24.388, 28.312], y: 3.75, height: 0.375, color: 0xffffff },
		{ rect: [24.304, 31.857, 24.388, 32.447], y: 1.15, height: 0.375, color: 0xffffff },
		{ rect: [24.262, 29.578, 24.388, 30.042], y: 8.75, height: 0.15, color: 0xf4f4f4 },
	]);
});
