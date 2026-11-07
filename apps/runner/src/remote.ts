// The runner reaches the database and the bucket only through the Worker, so it runs the same against `wrangler dev`
// and against apartment.stf.lol.
import { createDb, type Row, type Statement } from '@repo/shared/db';
import env from '@repo/shared/env';

if (!env.API_TOKEN) throw new Error('API_TOKEN is not set: the runner signs every request to the server with it');
const auth = { authorization: `Bearer ${env.API_TOKEN}` };

async function call(path: string, init: RequestInit = {}) {
	const res = await fetch(new URL(path, env.SERVER_URL), { ...init, headers: { ...auth, ...init.headers } });
	if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${(await res.text()).slice(0, 500)}`);
	return res;
}

export const db = createDb(
	async (statements: Statement[]) =>
		(await call('/api/runner/sql', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ statements }),
		}).then(res => res.json())) as Row[][],
);

const contentTypes: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	glb: 'model/gltf-binary',
	usdz: 'model/vnd.usdz+zip',
	txt: 'text/plain; charset=utf-8',
	py: 'text/x-python; charset=utf-8',
};

// Paths are `<item id>/<file>`, served to the clients at /api/assets/<path>.
export const assets = {
	async put(path: string, body: Blob | ArrayBuffer | Uint8Array | string) {
		const type = contentTypes[path.split('.').at(-1)!.toLowerCase()] ?? 'application/octet-stream';
		await call(`/api/assets/${path}`, { method: 'PUT', headers: { 'content-type': type }, body: body as BodyInit });
	},
	async get(path: string): Promise<Response | null> {
		const res = await fetch(new URL(`/api/assets/${path}`, env.SERVER_URL));
		if (res.status === 404) return null;
		if (!res.ok) throw new Error(`GET /api/assets/${path}: ${res.status}`);
		return res;
	},
	list: async (prefix: string): Promise<string[]> =>
		(await call(`/api/runner/assets?prefix=${encodeURIComponent(prefix)}`)).json(),
	async removeAll(prefix: string) {
		await call(`/api/runner/assets?prefix=${encodeURIComponent(prefix)}`, { method: 'DELETE' });
	},
};
