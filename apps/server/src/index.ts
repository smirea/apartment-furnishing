import type { Placement } from '@repo/shared/items';
import { join, normalize } from 'node:path';
import { ASSET_DIR, importProducts, listCatalog, readPlacements, writePlacements } from './catalog';
import { config } from './config';

const uiBuildPath = new URL('../../ui/build/', import.meta.url);

const server = Bun.serve({
	development: config.environment === 'development',
	// Imports run a headless browser and an LLM call, which takes about a minute.
	idleTimeout: 240,
	port: config.port,
	routes: {
		'/api/status': Response.json({ ok: true, now: new Date().toISOString() }),
		'/api/catalog': { GET: async () => Response.json(await listCatalog()) },
		'/api/catalog/import': {
			POST: async request => {
				const { url } = (await request.json()) as { url?: string };
				if (!url || !/^https?:\/\//.test(url)) return Response.json({ error: 'Paste a product URL' }, { status: 400 });
				try {
					const [item] = await importProducts([url], console.log);
					return Response.json(item);
				} catch (error) {
					console.error(error);
					return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
				}
			},
		},
		'/api/placements': {
			GET: async () => Response.json(await readPlacements()),
			PUT: async request => {
				const placements = (await request.json()) as Placement[];
				if (!Array.isArray(placements)) return Response.json({ error: 'Expected an array' }, { status: 400 });
				await writePlacements(placements);
				return Response.json(placements);
			},
		},
		'/api/assets/*': async request => {
			const rel = normalize(decodeURIComponent(new URL(request.url).pathname.slice('/api/assets/'.length)));
			if (rel.startsWith('..')) return new Response('Bad path', { status: 400 });
			const file = Bun.file(join(ASSET_DIR, rel));
			return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 });
		},
	},
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname.startsWith('/api/')) {
			return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
		}

		return staticFile(url.pathname);
	},
});

async function staticFile(pathname: string) {
	const path = pathname === '/' ? '/index.html' : pathname;
	const file = Bun.file(new URL(`.${path}`, uiBuildPath));

	if (await file.exists()) {
		return new Response(file);
	}

	const index = Bun.file(new URL('./index.html', uiBuildPath));
	if (await index.exists()) {
		return new Response(index);
	}

	return new Response('UI build not found. Run `bun run build` or use `bun run dev`.', {
		status: 404,
	});
}

console.log(`server listening on http://${server.hostname}:${server.port}`);
