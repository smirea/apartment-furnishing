import { expect, test } from 'bun:test';
import { planGeometry } from './plan';

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

test('hangs the TV centered on the measured 122" of the TV wall', () => {
	expect(planGeometry().tvMount).toEqual({ x: 24.388, z: 32.596 });
});
