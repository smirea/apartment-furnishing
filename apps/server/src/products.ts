import { statement, type JobKind } from '@repo/shared/db';
import { env } from 'cloudflare:workers';
import { db } from './db';

const PRODUCTS = {
	item: { table: 'catalog_items', build: 'buildModel' },
	texture: { table: 'wall_textures', build: 'buildTexture' },
	carpet: { table: 'carpets', build: 'buildCarpet' },
	tv: { table: 'tv_models', build: null },
} as const satisfies Record<string, { table: string; build: JobKind | null }>;
export type ProductKind = keyof typeof PRODUCTS;

// Clears every key under a folder prefix like `items/<id>/`.
export async function clearAssets(prefix: string) {
	let page;
	do {
		page = await env.FILES.list({ prefix });
		if (page.objects.length) await env.FILES.delete(page.objects.map(o => o.key));
	} while (page.truncated);
}

// Deleting a product takes everything that uses it along in one transaction: an item's placements and the product's
// build jobs. A build the laptop is already running then fails when it reads the row back, before it saves anything.
// The fixture picks naming it are the fixtures module's to drop.
export async function deleteProduct(kind: ProductKind, id: string) {
	const { table, build } = PRODUCTS[kind];
	await db.sql([
		...(kind === 'item' ? [statement('DELETE FROM placements WHERE itemId = ?1', id)] : []),
		...(build ? [statement('DELETE FROM jobs WHERE kind = ?1 AND target = ?2', build, id)] : []),
		statement(`DELETE FROM ${table} WHERE id = ?1`, id),
	]);
	if (kind !== 'tv') await clearAssets(`items/${id}/`);
}
