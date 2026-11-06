import { expect, test } from 'bun:test';
import { CARPET_SPAWN, carpetHitsWalls, carpetSpawn, moveCarpet, sizeLabel } from './carpets';
import { planGeometry } from './plan';

const plan = planGeometry();
const rug = (widthFt: number, lengthFt: number) => ({ widthIn: widthFt * 12, lengthIn: lengthFt * 12 });

test('an 8 × 10 rug fits in the middle of the living room either way round', () => {
	expect(carpetHitsWalls({ ...CARPET_SPAWN, yaw: 0 }, rug(8, 10), plan)).toBe(false);
	expect(carpetHitsWalls({ ...CARPET_SPAWN, yaw: 90 }, rug(8, 10), plan)).toBe(false);
});

test('a 9 × 12 rug running north-south reaches the column; turned east-west it clears it', () => {
	expect(carpetHitsWalls({ ...CARPET_SPAWN, yaw: 0 }, rug(9, 12), plan)).toBe(true);
	expect(carpetHitsWalls({ ...CARPET_SPAWN, yaw: 90 }, rug(9, 12), plan)).toBe(false);
});

test('a rug can lie flush against the TV wall but not cross into it', () => {
	const tvWallX = 24.388;
	const flush = { x: tvWallX - 4, z: 30, yaw: 0 };
	expect(carpetHitsWalls(flush, rug(8, 10), plan)).toBe(false);
	expect(carpetHitsWalls({ ...flush, x: flush.x + 0.05 }, rug(8, 10), plan)).toBe(true);
});

test('turning a rug that fits square to the wall can swing its corner into it', () => {
	const flush = { x: 24.388 - 4, z: 30, yaw: 0 };
	expect(carpetHitsWalls({ ...flush, yaw: 15 }, rug(8, 10), plan)).toBe(true);
});

test('a rug against the column is checked against its circle, not its bounding square', () => {
	const column = plan.columns[0]!;
	// The rug's corner sits in the square around the column, outside the circle.
	const corner = column.radius * 0.8;
	const pose = { x: column.x + corner + 1, z: column.z - corner - 1, yaw: 0 };
	expect(carpetHitsWalls(pose, rug(2, 2), plan)).toBe(false);
	expect(carpetHitsWalls({ ...pose, x: pose.x - 0.5, z: pose.z + 0.5 }, rug(2, 2), plan)).toBe(true);
});

test('labels sizes in feet and inches', () => {
	expect(sizeLabel({ widthIn: 96, lengthIn: 120 })).toBe('8′ × 10′');
	expect(sizeLabel({ widthIn: 30, lengthIn: 94 })).toBe('2′6″ × 7′10″');
});

test('lands a 9 × 12 rug in the living room turned east-west, and refuses one too big for it', () => {
	expect(carpetSpawn(rug(9, 12), plan)).toEqual({ ...CARPET_SPAWN, yaw: 90 });
	expect(carpetSpawn(rug(18, 20), plan)).toBeNull();
});

test('dragging a rug into the TV wall stops it flush and keeps the slide along the wall', () => {
	const from = { x: 18, z: 30, yaw: 0 };
	const moved = moveCarpet(from, { x: 30, z: 31, yaw: 0 }, rug(8, 10), plan);
	expect(moved.x).toBeCloseTo(24.388 - 4, 2);
	expect(moved.z).toBe(31);
	expect(carpetHitsWalls(moved, rug(8, 10), plan)).toBe(false);
});

test('a turn that would swing a rug into a wall leaves it where it was', () => {
	const flush = { x: 24.388 - 4, z: 30, yaw: 0 };
	expect(moveCarpet(flush, { ...flush, yaw: 15 }, rug(8, 10), plan)).toEqual(flush);
});

test('a drag that jumps a small rug clean past the TV wall stops it flush on this side', () => {
	const moved = moveCarpet({ x: 22, z: 30, yaw: 0 }, { x: 27, z: 30, yaw: 0 }, rug(2, 2), plan);
	expect(moved.x).toBeCloseTo(24.388 - 1, 2);
});

test('a big turn that would sweep a corner through a wall is refused even if it ends clear', () => {
	const flush = { x: 24.388 - 4, z: 30, yaw: 0 };
	expect(moveCarpet(flush, { ...flush, yaw: 180 }, rug(8, 10), plan)).toEqual(flush);
});
