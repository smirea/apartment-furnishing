// RealityKit on iOS can't read glTF, so the AR app gets USDZ. macOS ships Apple's USD tools, whose glTF plugin does the
// conversion; usdzip's --arkitAsset mode then packages the extracted textures the way RealityKit expects.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assets } from './remote';

for (const bin of ['usdextract', 'usdzip']) if (!Bun.which(bin)) throw new Error(`${bin} not found on PATH`);

async function run(cmd: string[]) {
	const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
	if ((await proc.exited) !== 0) throw new Error(`${cmd[0]} failed: ${await new Response(proc.stderr).text()}`);
}

export async function toUsdz(glb: Uint8Array): Promise<Uint8Array> {
	const work = await mkdtemp(join(tmpdir(), 'usdz-'));
	try {
		await Bun.write(join(work, 'model.glb'), glb);
		await run(['usdextract', join(work, 'model.glb'), '-o', join(work, 'extracted')]);
		await run(['usdzip', '--arkitAsset', join(work, 'extracted/model.usdc'), join(work, 'model.usdz')]);
		return await Bun.file(join(work, 'model.usdz')).bytes();
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}

// Uploads the GLB with its USDZ and answers the model URL to save on the item. The USDZ goes up first, so no client sees
// a model URL whose USDZ the bucket lacks.
export async function uploadModel(id: string, glb: Uint8Array): Promise<string> {
	await assets.put(`${id}/model.usdz`, await toUsdz(glb));
	await assets.put(`${id}/model.glb`, glb);
	// Cache-busting version: the path stays the same across regenerations.
	return `/api/assets/${id}/model.glb?v=${Date.now()}`;
}
