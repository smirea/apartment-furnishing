// The laptop's half of the app: claims the jobs the Worker queues (imports, Codex builds) and runs them with the tools
// only this Mac has. Start with `bun run runner` against the local server or `bun run runner:prod` against production.
import { statement, type JobKind, type QueuedJob } from '@repo/shared/db';
import env from '@repo/shared/env';
import { generateCarpetTexture, importCarpet } from './carpets';
import { groupFurniture, importProducts } from './catalog';
import { generateModel } from './generate-model';
import { db } from './remote';
import { generateTexture, importTexture } from './textures';
import { importTv } from './tvs';

const POLL_MS = 5000;
// An import the Worker gave up waiting on leaves its finished row behind.
const ORPHAN_MS = 60 * 60_000;

const log = console.log;

// What each job does; an import answers the id it saved.
const RUN: Record<JobKind, (job: QueuedJob) => Promise<string | null>> = {
	importItem: async job => (await importProducts([job.target], log, job.category ?? undefined))[0]!.id,
	importTexture: async job => (await importTexture(job.target, log)).id,
	importCarpet: async job => (await importCarpet(job.target, log)).id,
	importTv: async job => (await importTv(job.target)).id,
	buildModel: async job => (await generateModel(await db.catalog.read(job.target), log), null),
	buildTexture: async job => (await generateTexture(await db.textures.read(job.target), log), null),
	buildCarpet: async job => (await generateCarpetTexture(job.target), null),
};

// Each Codex build is a long session and a store import can queue dozens, so each kind gets a few slots.
const POOLS: { kinds: JobKind[]; size: number; running: number }[] = [
	{ kinds: ['importItem', 'importTexture', 'importCarpet', 'importTv'], size: 2, running: 0 },
	{ kinds: ['buildModel'], size: 3, running: 0 },
	{ kinds: ['buildTexture'], size: 3, running: 0 },
	{ kinds: ['buildCarpet'], size: 3, running: 0 },
];

async function run(pool: (typeof POOLS)[number], job: QueuedJob) {
	pool.running++;
	log(`→ ${job.kind} ${job.target}`);
	try {
		await db.jobs.complete(job, await RUN[job.kind](job));
		log(`✓ ${job.kind} ${job.target}`);
	} catch (error) {
		console.error(`✗ ${job.kind} ${job.target}`, error);
		await db.jobs.fail(job, error instanceof Error ? error.message : String(error)).catch(console.error);
	} finally {
		pool.running--;
	}
}

// One request per poll: the heartbeat the Worker checks before queuing an import, cleanup, and a claim per free pool.
async function poll() {
	const free = POOLS.filter(p => p.running < p.size);
	const now = Date.now();
	const results = await db.sql([
		statement(
			"INSERT INTO settings (key, value) VALUES ('runner', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1",
			JSON.stringify({ at: new Date(now).toISOString() }),
		),
		statement(
			"DELETE FROM jobs WHERE kind LIKE 'import%' AND state IN ('done', 'failed') AND updatedAt < ?1",
			new Date(now - ORPHAN_MS).toISOString(),
		),
		...free.map(p => db.jobs.claim(p.kinds, p.size - p.running)),
	]);
	free.forEach((pool, i) => {
		for (const job of results[i + 2] as unknown as QueuedJob[]) void run(pool, job);
	});
}

// `bun run dev` starts the runner alongside the server, which applies migrations before it listens.
for (let attempt = 1; ; attempt++) {
	try {
		await db.jobs.requeueRunning();
		break;
	} catch (error) {
		if (attempt === 1)
			console.log(`runner: waiting for ${env.SERVER_URL} (${error instanceof Error ? error.message : error})`);
		await Bun.sleep(2000);
	}
}
log(`runner: claiming jobs from ${env.SERVER_URL}`);
// Items imported before groups existed get one; the list shows them under "Other" until this lands.
groupFurniture(log).catch(error => console.error('grouping furniture failed:', error));

while (true) {
	await poll().catch(error => console.error('poll failed:', error instanceof Error ? error.message : error));
	await Bun.sleep(POLL_MS);
}
