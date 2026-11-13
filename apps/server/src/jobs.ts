import { RUNNER_STALE_MS, type JobKind } from '@repo/shared/db';
import type { Mount } from '@repo/shared/items';
import { db } from './db';

// An import holds its request open until the runner finishes it, about a minute, so the clients keep their
// paste-and-wait flow. Nothing claims it while the runner is off, so that fails right away instead.
const IMPORT_TIMEOUT_MS = 10 * 60_000;
const POLL_MS = 1000;

export class RunnerOffline extends Error {}

export async function runnerOnline() {
	const seen = await db.runnerSeen.get();
	return !!seen && Date.now() - Date.parse(seen.at) < RUNNER_STALE_MS;
}

export async function runImport(
	kind: JobKind,
	url: string,
	category: string | null = null,
	mount: Mount | null = null,
): Promise<string> {
	if (!(await runnerOnline()))
		throw new RunnerOffline(
			"Imports run on the Mac mini, and its job runner isn't running. Start it with bun scripts/runner-service.ts setup.",
		);
	const id = (await db.jobs.enqueue(kind, url, category, mount))!;
	const deadline = Date.now() + IMPORT_TIMEOUT_MS;
	while (Date.now() < deadline) {
		await new Promise(resolve => setTimeout(resolve, POLL_MS));
		const job = await db.jobs.read(id);
		if (!job) throw new Error(`Import job ${id} disappeared`);
		if (job.state === 'done' || job.state === 'failed') {
			await db.jobs.remove(id);
			if (job.state === 'failed') throw new Error(job.error ?? 'Import failed');
			return job.result!;
		}
	}
	throw new Error(`Import of ${url} took longer than ${IMPORT_TIMEOUT_MS / 60_000} minutes`);
}

// Builds just queue: the clients poll the item's job state, and a build queued while the runner is down runs when it comes back.
export const startBuild = (kind: JobKind, id: string) => db.jobs.enqueue(kind, id);
