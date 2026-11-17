import { expect, test } from 'bun:test';
import { CURTAIN_FRONT_IN, ft } from './floorplan';
import { DEFAULT_TV } from './items';
import { planGeometry, TV_DEPTH_IN, tvPose } from './plan';

const spots = planGeometry().tvSpots;
const offWall = (textureIn: number) => (textureIn + 2.5 + TV_DEPTH_IN / 2) / 12;

test('hangs a back-wall TV 2.5" off the wall texture, centered on the measured 122"', () => {
	const pose = tvPose({ ...DEFAULT_TV, placement: 'backWall' }, 1 / 12);
	expect(pose.x).toBeCloseTo(spots.backWall.x - offWall(1), 6);
	expect(pose.z).toBe(spots.backWall.z);
	expect(pose.yaw).toBe(-90);
});

test('ignores a back-wall texture for a TV on the pillar wall', () => {
	const pose = tvPose({ ...DEFAULT_TV, placement: 'pillarWall' }, 1 / 12);
	expect(pose.x).toBeCloseTo(spots.pillarWall.x, 6);
	expect(pose.z).toBeCloseTo(spots.pillarWall.z - offWall(0), 6);
});

test('hangs a balcony-window TV out from the glass, facing the back wall, whatever the back-wall texture', () => {
	const pose = tvPose({ ...DEFAULT_TV, placement: 'balconyWindow' }, 1 / 12);
	expect(pose.x).toBeCloseTo(spots.balconyWindow.x + offWall(0), 6);
	expect(pose.z).toBeCloseTo(spots.balconyWindow.z, 6);
	expect(pose.yaw).toBe(90);
});

test('pulls a corner TV out until both back corners clear the walls by the same 1.77"', () => {
	for (const diagonal of [65, 98]) {
		const widthIn = (diagonal * 16) / Math.hypot(16, 9);
		const pose = tvPose({ ...DEFAULT_TV, placement: 'corner', widthIn }, 0);
		const back = (TV_DEPTH_IN / 2 / 12) * Math.SQRT1_2;
		const half = (widthIn / 2 / 12) * Math.SQRT1_2;
		const towardBackWall = spots.corner.x - (pose.x + back + half);
		const towardPillarWall = spots.corner.z - (pose.z + back + half);
		expect([towardBackWall, towardPillarWall].map(ft => Math.round(ft * 1200) / 100)).toEqual([1.77, 1.77]);
	}
});

test('stands a TV in front of hung curtains, and back against its wall without them', () => {
	const front = (CURTAIN_FRONT_IN + 0.5) / 12;
	const balcony = tvPose({ ...DEFAULT_TV, placement: 'balconyWindow' }, 0, true);
	expect(balcony.x - TV_DEPTH_IN / 24).toBeCloseTo(spots.balconyWindow.x + front, 3);
	const pillar = tvPose({ ...DEFAULT_TV, placement: 'pillarWall' }, 0, true);
	expect(pillar.z + TV_DEPTH_IN / 24).toBeCloseTo(ft(900) - front, 6);
	expect(tvPose({ ...DEFAULT_TV, placement: 'backWall' }, 0, true)).toEqual(
		tvPose({ ...DEFAULT_TV, placement: 'backWall' }, 0),
	);
});
