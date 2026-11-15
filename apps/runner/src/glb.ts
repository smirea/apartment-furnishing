// glTF binary: a 12-byte header (magic, version, total length), then chunks of (length, type, data). The first chunk is
// the JSON scene description; the rest (the BIN buffer) pass through untouched.
const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

export type Gltf = {
	nodes?: { name?: string }[];
	materials?: {
		name?: string;
		pbrMetallicRoughness?: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number };
	}[];
	[key: string]: unknown;
};

export function readGlb(bytes: Uint8Array): Gltf {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0, true) !== MAGIC || view.getUint32(16, true) !== JSON_CHUNK) throw new Error('not a GLB file');
	return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
}

export function writeGlb(original: Uint8Array, gltf: Gltf): Uint8Array {
	const view = new DataView(original.buffer, original.byteOffset, original.byteLength);
	const rest = original.subarray(20 + view.getUint32(12, true));
	const text = new TextEncoder().encode(JSON.stringify(gltf));
	// Chunks are 4-byte aligned; the JSON chunk pads with spaces.
	const padded = Math.ceil(text.length / 4) * 4;
	const out = new Uint8Array(20 + padded + rest.length);
	const head = new DataView(out.buffer);
	head.setUint32(0, MAGIC, true);
	head.setUint32(4, 2, true);
	head.setUint32(8, out.length, true);
	head.setUint32(12, padded, true);
	head.setUint32(16, JSON_CHUNK, true);
	out.fill(0x20, 20, 20 + padded);
	out.set(text, 20);
	out.set(rest, 20 + padded);
	return out;
}

// Generated models write sRGB bytes / 255 into baseColorFactor, so a hex color maps straight onto it and back.
export const toHex = (factor: number[] | undefined) =>
	`#${(factor ?? [1, 1, 1])
		.slice(0, 3)
		.map(c =>
			Math.round(Math.min(1, Math.max(0, c)) * 255)
				.toString(16)
				.padStart(2, '0'),
		)
		.join('')}`;

export function fromHex(hex: string) {
	const match = /^#([0-9a-f]{6})$/i.exec(hex);
	if (!match) throw new Error(`not a #rrggbb color: ${hex}`);
	const n = parseInt(match[1]!, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => c / 255);
}

// The same model with each listed material's base color replaced, alpha kept.
export function recolorGlb(glb: Uint8Array, colors: Map<number, string>): Uint8Array {
	const gltf = readGlb(glb);
	for (const [index, hex] of colors) {
		const material = gltf.materials?.[index];
		if (!material) throw new Error(`the model has no material ${index}`);
		const pbr = (material.pbrMetallicRoughness ??= {});
		pbr.baseColorFactor = [...fromHex(hex), pbr.baseColorFactor?.[3] ?? 1];
	}
	return writeGlb(glb, gltf);
}
