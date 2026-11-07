// Listings without a 3D model get a procedural one: Codex studies the listing photos (including dimension
// diagrams), works out the real size, and writes a trimesh script (kept as model.py next to the GLB).
import type { CatalogItem } from '@repo/shared/items';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { GALLERY_DIR, ROOT } from './catalog';
import { assets, db } from './remote';
import { uploadModel } from './usdz';

// Read per job so prompt edits apply without restarting the server.
const PROMPT_FILE = Bun.file(join(import.meta.dir, 'model-prompt.md'));
if (!(await PROMPT_FILE.exists())) throw new Error(`missing ${PROMPT_FILE.name}`);
// Shared so each run doesn't re-download numpy/trimesh; Codex's sandbox only gets write access to it.
const UV_CACHE = join(ROOT, '.cache/uv');

if (!Bun.which('codex')) throw new Error('codex CLI not found on PATH');

async function prompt(item: CatalogItem, photos: string[]) {
	const d = item.dimensions;
	const size = d
		? `${d.width} in wide (left to right, seen from the front) × ${d.height} in tall × ${d.depth} in deep${item.dimensionsNote ? `. ${item.dimensionsNote}` : ''}`
		: 'not listed; estimate it from the photos';
	return (await PROMPT_FILE.text())
		.replace('{{name}}', item.name)
		.replace('{{category}}', item.category)
		.replace('{{size}}', size)
		.replace('{{summary}}', item.summary)
		.replace('{{photos}}', photos.map((p, i) => `${i + 1}. ${p}`).join('\n'));
}

async function readDimensions(path: string): Promise<Pick<CatalogItem, 'dimensions' | 'dimensionsNote'>> {
	const raw = await Bun.file(path)
		.json()
		.catch(() => null);
	const sizes = [raw?.width, raw?.height, raw?.depth];
	if (!sizes.every(n => typeof n === 'number' && n > 0 && n < 1000) || typeof raw.note !== 'string')
		throw new Error(`codex wrote no valid dimensions.json: ${JSON.stringify(raw)}`);
	const [width, height, depth] = sizes.map(n => Math.round(n * 10) / 10) as [number, number, number];
	return { dimensions: { width, height, depth }, dimensionsNote: raw.note };
}

// Downloads the item's photos into the work folder. Main photo first: it shows the colorway being bought, the gallery
// may include others.
export async function collectPhotos(id: string, work: string): Promise<string[]> {
	const files = await assets.list(`${id}/`);
	const main = files.find(f => f.startsWith(`${id}/image.`));
	const gallery = files.filter(f => f.startsWith(`${id}/${GALLERY_DIR}/`)).toSorted();
	const sources = [...(main ? [main] : []), ...gallery];
	if (!sources.length) throw new Error(`${id} has no product photos to model from`);
	return Promise.all(
		sources.map(async (src, i) => {
			const name = i === 0 ? `main${extname(src)}` : `gallery-${basename(src)}`;
			const res = await assets.get(src);
			if (!res) throw new Error(`${src} vanished from the bucket`);
			await Bun.write(join(work, name), res);
			return name;
		}),
	);
}

// Codex runs in a scratch folder holding the photos, with network for uv, and writes its outputs there.
export async function runCodex(work: string, photos: string[], prompt: string, expect: string[]) {
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
			...photos.map(p => join(work, p)),
			'-o',
			join(work, 'last-message.txt'),
			'-',
		],
		{
			stdin: new Blob([prompt]),
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
	const missing = [];
	for (const name of expect) if (!(await Bun.file(join(work, name)).exists())) missing.push(name);
	if (code !== 0 || missing.length)
		throw new Error(`codex exited ${code} without ${missing.join(', ') || 'success'}: ${(err || out).slice(-1500)}`);
}

export async function generateModel(item: CatalogItem, log: (line: string) => void = () => {}): Promise<CatalogItem> {
	const work = await mkdtemp(join(tmpdir(), `model-${item.id}-`));
	const photos = await collectPhotos(item.id, work);
	log(`codex: modeling ${item.id} from ${photos.length} photo(s) in ${work}`);
	await runCodex(work, photos, await prompt(item, photos), ['model.glb', 'build.py']);
	const size = await readDimensions(join(work, 'dimensions.json'));
	await assets.put(`${item.id}/model.py`, await Bun.file(join(work, 'build.py')).text());
	const model = await uploadModel(item.id, await Bun.file(join(work, 'model.glb')).bytes());
	const updated: CatalogItem = { ...(await db.catalog.read(item.id)), ...size, model, modelSource: 'generated' };
	await db.catalog.put(updated);
	log(`codex: ${item.id} done, ${JSON.stringify(size)} (${work})`);
	return updated;
}
