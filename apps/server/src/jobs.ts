import type { Job } from '@repo/shared/items';

// Background builds (textures, carpet images) keyed by the id they build for. Each is a Codex session, and a store
// import can queue dozens, so only `concurrency` run at once and the rest wait their turn.
export function jobQueue<T extends { id: string }>(concurrency: number, run: (item: T) => Promise<void>) {
	const jobs = new Map<string, Job>();
	const queue: T[] = [];
	let active = 0;

	function drain() {
		while (active < concurrency && queue.length) {
			const item = queue.shift()!;
			active++;
			jobs.set(item.id, { state: 'running' });
			run(item)
				.then(
					() => jobs.delete(item.id),
					(error: unknown) => {
						console.error(error);
						jobs.set(item.id, { state: 'failed', error: error instanceof Error ? error.message : String(error) });
					},
				)
				.finally(() => {
					active--;
					drain();
				});
		}
	}

	return {
		jobs,
		start(item: T) {
			const state = jobs.get(item.id)?.state;
			if (state === 'running' || state === 'queued') return;
			jobs.set(item.id, { state: 'queued' });
			queue.push(item);
			drain();
		},
	};
}
