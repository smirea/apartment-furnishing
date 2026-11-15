// Undo and redo for the plan. A step holds, for each thing it touched (a placement, a carpet), what it was before and
// after; undoing writes back only those, so edits made meanwhile elsewhere (the AR app, a poll) to other things stay.
// `null` is "not in the room".
export type Change<V> = { key: string; before: V | null; after: V | null };

// `new` is its own step. `coalesce` folds into the last step when that was coalescing too and touched exactly the same
// things, like keystrokes in a height field, but never into a turn or move made before the typing. `settled` is the plan
// settling something on its own after a step, like an added item landing once its model loads: it updates the latest
// step that touched it and is never a step of its own.
export type RecordMode = 'new' | 'coalesce' | 'settled';

type Step<V> = Map<string, { before: V | null; after: V | null }> & { coalescing?: boolean };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function createHistory<V>() {
	let undone: Step<V>[] = [];
	let done: Step<V>[] = [];

	const restore = (step: Step<V>, side: 'before' | 'after') =>
		[...step].map(([key, change]) => ({ key, value: structuredClone(change[side]) }));

	return {
		record(changes: Change<V>[], mode: RecordMode = 'new') {
			const real = changes.filter(c => !same(c.before, c.after));
			if (!real.length) return;
			if (mode === 'settled') {
				for (const c of real) {
					const step = done.findLast(s => s.has(c.key));
					if (step) step.get(c.key)!.after = c.after;
				}
				return;
			}
			const last = done.at(-1);
			if (mode === 'coalesce' && last?.coalescing && last.size === real.length && real.every(c => last.has(c.key))) {
				for (const c of real) last.get(c.key)!.after = c.after;
				return;
			}
			const step: Step<V> = new Map(real.map(c => [c.key, { before: c.before, after: c.after }]));
			step.coalescing = mode === 'coalesce';
			done.push(step);
			undone = [];
		},
		// The values to write back, or null when there is nothing to undo.
		undo() {
			const step = done.pop();
			if (!step) return null;
			undone.push(step);
			return restore(step, 'before');
		},
		redo() {
			const step = undone.pop();
			if (!step) return null;
			done.push(step);
			return restore(step, 'after');
		},
		// Drops every step that touched something matching, say a product deleted for good, which can't come back.
		forget(matches: (key: string, value: V | null) => boolean) {
			const keep = (step: Step<V>) => ![...step].some(([key, c]) => matches(key, c.before) || matches(key, c.after));
			done = done.filter(keep);
			undone = undone.filter(keep);
		},
		clear() {
			done = [];
			undone = [];
		},
		get canUndo() {
			return done.length > 0;
		},
		get canRedo() {
			return undone.length > 0;
		},
	};
}
