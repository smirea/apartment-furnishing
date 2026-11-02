// RealityKit on iOS can't read glTF, so the AR app gets USDZ. macOS ships Apple's USD tools, whose glTF plugin does the
// conversion; usdzip's --arkitAsset mode then packages the extracted textures the way RealityKit expects.
import type { CatalogItem } from '@repo/shared/items';
import { mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { ASSET_DIR } from './catalog';

for (const bin of ['usdextract', 'usdzip']) if (!Bun.which(bin)) throw new Error(`${bin} not found on PATH`);

const converting = new Map<string, Promise<string>>();

async function run(cmd: string[]) {
	const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
	if ((await proc.exited) !== 0) throw new Error(`${cmd[0]} failed: ${await new Response(proc.stderr).text()}`);
}

async function convert(glb: string, usdz: string) {
	// Staged beside the item so the final rename never crosses volumes.
	const work = await mkdtemp(join(usdz, '../.usdz-'));
	try {
		await run(['usdextract', glb, '-o', work]);
		const staged = join(work, 'model.usdz');
		await run(['usdzip', '--arkitAsset', join(work, `${basename(glb, '.glb')}.usdc`), staged]);
		await rename(staged, usdz);
		return usdz;
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}

// Path to the item's model as USDZ, converted on first request and again whenever the GLB is newer.
export async function usdzPath(item: CatalogItem): Promise<string | null> {
	if (!item.model) return null;
	const dir = join(ASSET_DIR, item.id);
	const glb = join(dir, new URL(item.model, 'http://x').pathname.split('/').at(-1)!);
	const usdz = join(dir, 'model.usdz');
	const [source, cached] = await Promise.all([stat(glb), stat(usdz).catch(() => null)]);
	if (cached && cached.mtimeMs >= source.mtimeMs) return usdz;
	let job = converting.get(item.id);
	if (!job) {
		job = convert(glb, usdz).finally(() => converting.delete(item.id));
		converting.set(item.id, job);
	}
	return job;
}
