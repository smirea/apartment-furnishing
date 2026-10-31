// Listings without a 3D model get a procedural one: Codex looks at the product photo and writes a
// trimesh script (kept as model.py next to the GLB so it can be tweaked and re-run).
import type { CatalogItem, ModelJob } from '@repo/shared/items';
import { copyFile, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ASSET_DIR, ROOT, readItem, saveItem } from './catalog';

const PROMPT = await Bun.file(join(import.meta.dir, 'model-prompt.md')).text();
// Shared so each run doesn't re-download numpy/trimesh; Codex's sandbox only gets write access to it.
const UV_CACHE = join(ROOT, '.cache/uv');

if (!Bun.which('codex')) throw new Error('codex CLI not found on PATH');

export const modelJobs = new Map<string, ModelJob>();

function prompt(item: CatalogItem) {
	const d = item.dimensions;
	const size = d
		? `${d.width} in wide (left to right, seen from the front) × ${d.height} in tall × ${d.depth} in deep`
		: 'not listed; estimate a typical size for this product from the photo';
	return PROMPT.replace('{{name}}', item.name)
		.replace('{{category}}', item.category)
		.replace('{{size}}', size)
		.replace('{{summary}}', item.summary);
}

export async function generateModel(item: CatalogItem, log: (line: string) => void = () => {}): Promise<CatalogItem> {
	const dir = join(ASSET_DIR, item.id);
	const photo = (await readdir(dir)).find(f => f.startsWith('image.'));
	if (!photo) throw new Error(`${item.id} has no product photo to model from`);

	const work = await mkdtemp(join(tmpdir(), `model-${item.id}-`));
	await copyFile(join(dir, photo), join(work, photo));
	log(`codex: modeling ${item.id} in ${work}`);
	const proc = Bun.spawn(
		[
			'codex',
			'exec',
			'--skip-git-repo-check',
			'--ephemeral',
			'-s',
			'workspace-write',
			'-c',
			'sandbox_workspace_write.network_access=true',
			'--add-dir',
			UV_CACHE,
			'-C',
			work,
			'-i',
			join(work, photo),
			'-o',
			join(work, 'last-message.txt'),
			'-',
		],
		{
			stdin: new Blob([prompt(item)]),
			stdout: 'pipe',
			stderr: 'pipe',
			env: { ...process.env, UV_CACHE_DIR: UV_CACHE },
		},
	);
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	const glb = Bun.file(join(work, 'model.glb'));
	if (code !== 0 || !(await glb.exists())) {
		throw new Error(`codex exited ${code} without model.glb: ${(err || out).slice(-1500)}`);
	}
	await copyFile(join(work, 'model.glb'), join(dir, 'model.glb'));
	await copyFile(join(work, 'build.py'), join(dir, 'model.py'));
	const updated: CatalogItem = {
		...(await readItem(item.id)),
		// Cache-busting version: the path stays the same across regenerations.
		model: `/api/assets/${item.id}/model.glb?v=${Date.now()}`,
		modelSource: 'generated',
	};
	await saveItem(updated);
	log(`codex: ${item.id} done (${work})`);
	return updated;
}

export function startModelJob(item: CatalogItem) {
	if (modelJobs.get(item.id)?.state === 'running') return;
	modelJobs.set(item.id, { state: 'running' });
	generateModel(item, console.log).then(
		() => modelJobs.delete(item.id),
		(error: unknown) => {
			console.error(error);
			modelJobs.set(item.id, { state: 'failed', error: error instanceof Error ? error.message : String(error) });
		},
	);
}
