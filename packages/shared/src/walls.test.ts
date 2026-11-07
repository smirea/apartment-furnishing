import { expect, test } from 'bun:test';
import { planGeometry } from './plan';
import { hangOnWall, indoorRooms, wallFaces } from './walls';

const plan = planGeometry();
const faces = wallFaces(
	plan.walls.filter(w => !w.glass).map(({ rect: [x1, z1, x2, z2] }) => ({ x1, z1, x2, z2 })),
	indoorRooms,
);
const tvWall = plan.finishSurfaces.tvWall;

test('the TV wall’s living-room face is one stretch facing west', () => {
	const face = faces.find(f => f.axis === 'x' && f.at === tvWall.x && f.normal === -1);
	expect(face).toBeDefined();
	expect(face!.from).toBeCloseTo(27.05, 1);
	expect(face!.to).toBeCloseTo(tvWall.z2, 1);
});

test('only faces looking into the apartment: no outside of the shell, no glass, no slivers', () => {
	// The north wall's outer face looks out of the building.
	expect(faces.some(f => f.axis === 'z' && f.normal === -1 && f.at < 2)).toBe(false);
	// The living room's west side is glass onto the balcony.
	expect(faces.some(f => f.axis === 'x' && f.normal === 1 && f.from > 21 && f.at < 8)).toBe(false);
	expect(faces.every(f => f.to - f.from >= 1)).toBe(true);
});

test('a piece dragged near the TV wall hangs flush on it, facing into the living room', () => {
	expect(hangOnWall(faces, 22, 31, 3)).toMatchObject({ x: tvWall.x, z: 31, yaw: -90 });
});

test('a piece dragged past the end of a wall stays entirely on it', () => {
	const spot = hangOnWall(faces, tvWall.x - 0.5, 27.2, 4);
	expect(spot.x).toBe(tvWall.x);
	expect(spot.z).toBeCloseTo(spot.face.from + 2, 5);
});

test('a piece wider than the wall it is nearest to goes to one it fits on', () => {
	const spot = hangOnWall(faces, tvWall.x - 0.5, 31, 12);
	expect(spot.face.to - spot.face.from).toBeGreaterThanOrEqual(12);
});
