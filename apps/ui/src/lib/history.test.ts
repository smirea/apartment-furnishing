/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { createHistory } from './history';

type Pose = { x: number };

test('undo writes back what each touched thing was, redo what it became', () => {
	const history = createHistory<Pose>();
	history.record([{ key: 'a', before: null, after: { x: 1 } }]);
	history.record([{ key: 'a', before: { x: 1 }, after: { x: 2 } }]);
	expect(history.undo()).toEqual([{ key: 'a', value: { x: 1 } }]);
	expect(history.undo()).toEqual([{ key: 'a', value: null }]);
	expect(history.undo()).toBeNull();
	expect(history.redo()).toEqual([{ key: 'a', value: { x: 1 } }]);
	expect(history.canRedo).toBe(true);
});

test('a new step after an undo drops what could be redone', () => {
	const history = createHistory<Pose>();
	history.record([{ key: 'a', before: { x: 0 }, after: { x: 1 } }]);
	history.undo();
	history.record([{ key: 'b', before: { x: 0 }, after: { x: 5 } }]);
	expect(history.canRedo).toBe(false);
	expect(history.redo()).toBeNull();
});

test('the plan settling an added item folds into the add, so undo removes it and redo puts it back settled', () => {
	const history = createHistory<Pose>();
	history.record([{ key: 'a', before: null, after: { x: 1 } }]);
	history.record([{ key: 'b', before: { x: 0 }, after: { x: 3 } }]);
	history.record([{ key: 'a', before: { x: 1 }, after: { x: 1.5 } }], 'settled');
	history.undo();
	expect(history.undo()).toEqual([{ key: 'a', value: null }]);
	history.redo();
	expect(history.redo()).toEqual([{ key: 'b', value: { x: 3 } }]);
	history.undo();
	expect(history.undo()).toEqual([{ key: 'a', value: null }]);
	expect(history.redo()).toEqual([{ key: 'a', value: { x: 1.5 } }]);
});

test('settling something no step touched is not a step', () => {
	const history = createHistory<Pose>();
	history.record([{ key: 'a', before: { x: 0 }, after: { x: 1 } }], 'settled');
	expect(history.canUndo).toBe(false);
});

test('typing coalesces into one step while it changes the same thing', () => {
	const history = createHistory<Pose>();
	history.record([{ key: 'a', before: { x: 0 }, after: { x: 1 } }], 'coalesce');
	history.record([{ key: 'a', before: { x: 1 }, after: { x: 12 } }], 'coalesce');
	history.record([{ key: 'b', before: { x: 0 }, after: { x: 4 } }], 'coalesce');
	history.undo();
	expect(history.undo()).toEqual([{ key: 'a', value: { x: 0 } }]);
	expect(history.canUndo).toBe(false);
});

test('typing right after turning the same thing is a step of its own', () => {
	const history = createHistory<Pose>();
	history.record([{ key: 'a', before: { x: 0 }, after: { x: 1 } }]);
	history.record([{ key: 'a', before: { x: 1 }, after: { x: 12 } }], 'coalesce');
	expect(history.undo()).toEqual([{ key: 'a', value: { x: 1 } }]);
	expect(history.undo()).toEqual([{ key: 'a', value: { x: 0 } }]);
});

test('a change that changes nothing is not a step', () => {
	const history = createHistory<Pose>();
	history.record([{ key: 'a', before: { x: 1 }, after: { x: 1 } }]);
	expect(history.canUndo).toBe(false);
});

test('forgetting a deleted thing drops every step that touched it', () => {
	const history = createHistory<Pose>();
	history.record([{ key: 'a', before: null, after: { x: 1 } }]);
	history.record([{ key: 'b', before: null, after: { x: 2 } }]);
	history.undo();
	history.forget(key => key === 'b');
	expect(history.canRedo).toBe(false);
	expect(history.undo()).toEqual([{ key: 'a', value: null }]);
});

test('undo hands back copies, so editing them leaves the history alone', () => {
	const history = createHistory<Pose>();
	history.record([{ key: 'a', before: { x: 0 }, after: { x: 1 } }]);
	history.undo()![0]!.value!.x = 99;
	expect(history.redo()).toEqual([{ key: 'a', value: { x: 1 } }]);
});
