import { expect, test } from 'bun:test';
import { clearFraction, type Obstacles } from './obstacles';

const wall: Obstacles = { boxes: [{ x1: 4, z1: -10, x2: 5, z2: 10 }], circles: [], segments: [] };

test('a clear path runs its full length', () => {
	expect(clearFraction(0, 0, 3, 0, wall)).toBe(1);
});

test('a path stops at the face of the first wall it meets', () => {
	expect(clearFraction(0, 0, 8, 0, wall)).toBe(0.5);
	expect(clearFraction(10, 0, 0, 0, wall)).toBe(0.5);
});

test('the nearest of several walls stops the path', () => {
	const two: Obstacles = { boxes: [{ x1: 6, z1: -1, x2: 7, z2: 1 }, ...wall.boxes], circles: [], segments: [] };
	expect(clearFraction(0, 0, 10, 0, two)).toBe(0.4);
});

test('a path can leave a wall it starts on or inside', () => {
	expect(clearFraction(4, 0, 0, 0, wall)).toBe(1);
	expect(clearFraction(4.5, 0, 0, 0, wall)).toBe(1);
	expect(clearFraction(4, 0, 8, 0, wall)).toBe(0);
});

test('a path along a wall face is not blocked by it', () => {
	expect(clearFraction(4, -5, 4, 5, wall)).toBe(1);
});

test('a door leaf stops a path that crosses it', () => {
	const door: Obstacles = { boxes: [], circles: [], segments: [[2, -1, 2, 1]] };
	expect(clearFraction(0, 0, 4, 0, door)).toBe(0.5);
	expect(clearFraction(0, 2, 4, 2, door)).toBe(1);
});

test('a column stops a path at its round edge, not its bounding square', () => {
	const column: Obstacles = { boxes: [], circles: [{ x: 5, z: 0, r: 1 }], segments: [] };
	expect(clearFraction(0, 0, 10, 0, column)).toBe(0.4);
	expect(clearFraction(0, 0.6, 10, 0.6, column)).toBeCloseTo(0.42);
	expect(clearFraction(0, 2, 10, 2, column)).toBe(1);
	expect(clearFraction(5, 0, 0, 0, column)).toBe(1);
});
