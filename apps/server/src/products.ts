import { statement, type JobKind } from '@repo/shared/db';
import { productKey } from '@repo/shared/layouts';
import { env } from 'cloudflare:workers';
import { db } from './db';
import { dropPicks, hide, listLayouts, usedElsewhere, type ProductKind } from './layouts';

const PRODUCTS = {
	item: { table: 'catalog_items', build: 'buildModel' },
	texture: { table: 'wall_textures', build: 'buildTexture' },
	carpet: { table: 'carpets', build: 'buildCarpet' },
	tv: { table: 'tv_models', build: null },
} as const satisfies Record<ProductKind, { table: string; build: JobKind | null }>;

// Clears every key under a folder prefix like `items/<id>/`.
export async function clearAssets(prefix: string) {
	let page;
	do {
		page = await env.FILES.list({ prefix });
		if (page.objects.length) await env.FILES.delete(page.objects.map(o => o.key));
	} while (page.truncated);
}

// The id of the product a link was already imported as, so pasting it again skips the minute-long import.
export async function findImported(kind: ProductKind, url: string) {
	const key = productKey(url);
	const [rows] = await db.sql([statement(`SELECT id, url FROM ${PRODUCTS[kind].table}`)]);
	return (rows!.find(r => productKey(r.url as string) === key)?.id as string | undefined) ?? null;
}

// Deleting from a layout deletes for good only when no other layout has the product in its room; otherwise it just
// leaves this layout. Answers whether it was deleted for good.
export async function removeProduct(kind: ProductKind, id: string, layout: string) {
	if (await usedElsewhere(kind, id, layout)) {
		await hide(kind, id, layout);
		return false;
	}
	await deleteProduct(kind, id);
	return true;
}

// Takes everything that uses the product along in one transaction: its placements, its carpet poses, its build jobs.
// A build the laptop is already running then fails when it reads the row back, before it saves anything.
async function deleteProduct(kind: ProductKind, id: string) {
	const { table, build } = PRODUCTS[kind];
	await db.sql([
		...(kind === 'item' ? [statement('DELETE FROM placements WHERE itemId = ?1', id)] : []),
		...(kind === 'carpet' ? [statement('DELETE FROM layout_carpets WHERE carpetId = ?1', id)] : []),
		...(build ? [statement('DELETE FROM jobs WHERE kind = ?1 AND target = ?2', build, id)] : []),
		statement('DELETE FROM layout_hidden WHERE kind = ?1 AND productId = ?2', kind, id),
		statement(`DELETE FROM ${table} WHERE id = ?1`, id),
	]);
	await dropPicks(
		id,
		(await listLayouts()).layouts.map(l => l.id),
	);
	if (kind !== 'tv') await clearAssets(`items/${id}/`);
}
