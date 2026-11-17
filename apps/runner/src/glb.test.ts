import { expect, test } from 'bun:test';
import { readGlb, recolorGlb, toHex, type Gltf } from './glb';

const glb = (json: Gltf, bin: number[]) => {
	const text = new TextEncoder().encode(JSON.stringify(json));
	const padded = Math.ceil(text.length / 4) * 4;
	const out = new Uint8Array(28 + padded + bin.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, 0x46546c67, true);
	view.setUint32(4, 2, true);
	view.setUint32(8, out.length, true);
	view.setUint32(12, padded, true);
	view.setUint32(16, 0x4e4f534a, true);
	out.fill(0x20, 20, 20 + padded);
	out.set(text, 20);
	view.setUint32(20 + padded, bin.length, true);
	view.setUint32(24 + padded, 0x004e4942, true);
	out.set(bin, 28 + padded);
	return out;
};

test('recolors only the listed materials and keeps the binary chunk', () => {
	const model = glb(
		{
			materials: [
				{ name: 'fabric', pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 0.5], roughnessFactor: 0.9 } },
				{ name: 'rings', pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1] } },
			],
		},
		[1, 2, 3, 4],
	);
	const out = recolorGlb(model, new Map([[0, '#ff8000']]));
	const { materials } = readGlb(out);
	expect(materials![0]!.pbrMetallicRoughness).toEqual({
		baseColorFactor: [1, 128 / 255, 0, 0.5],
		roughnessFactor: 0.9,
	});
	expect(toHex(materials![1]!.pbrMetallicRoughness!.baseColorFactor)).toBe('#000000');
	expect(out.length % 4).toBe(0);
	expect(new DataView(out.buffer).getUint32(8, true)).toBe(out.length);
	expect([...out.subarray(out.length - 4)]).toEqual([1, 2, 3, 4]);
});

test('refuses a color that is not #rrggbb and a material the model lacks', () => {
	const model = glb({ materials: [{ name: 'fabric' }] }, []);
	expect(() => recolorGlb(model, new Map([[0, 'olive']]))).toThrow();
	expect(() => recolorGlb(model, new Map([[3, '#000000']]))).toThrow();
});
