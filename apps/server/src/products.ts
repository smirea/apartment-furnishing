import { statement, type JobKind } from '@repo/shared/db';
import { productKey } from '@repo/shared/layouts';
import { env } from 'cloudflare:workers';
import { db } from './db';
import { dropPicks, hide, listLayouts, usedElsewhere, type ProductKind } from './layouts';

// `looks` says whether the table lists each look's link in a `variants` column.
const PRODUCTS = {
	item: { table: 'catalog_items', builds: ['buildModel', 'buildVariants'], looks: true },
	texture: { table: 'wall_textures', builds: ['buildTexture'], looks: false },
	carpet: { table: 'carpets', builds: ['buildCarpet'], looks: true },
	tv: { table: 'tv_models', builds: [], looks: false },
} as const satisfies Record<ProductKind, { table: string; builds: JobKind[]; looks: boolean }>;

// Clears every key under a folder prefix like `items/<id>/`.
export async function clearAssets(prefix: string) {
	let page;
	do {
		page = await env.FILES.list({ prefix });
		if (page.objects.length) await env.FILES.delete(page.objects.map(o => o.key));
	} while (page.truncated);
}

// The id of the product a link was already imported as, its own or one of its looks', so pasting it again skips the
// minute-long import.
export async function findImported(kind: ProductKind, url: string) {
	const key = productKey(url);
	const { table, looks } = PRODUCTS[kind];
	const [rows] = await db.sql([statement(`SELECT id, url${looks ? ', variants' : ''} FROM ${table}`)]);
	const links = (r: (typeof rows)[number]) => [
		r.url as string,
		...(looks ? (JSON.parse(r.variants as string) as { url: string }[]).map(v => v.url) : []),
	];
	return (rows!.find(r => links(r).some(link => productKey(link) === key))?.id as string | undefined) ?? null;
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
// A build the runner is already running then fails when it reads the row back, before it saves anything.
async function deleteProduct(kind: ProductKind, id: string) {
	const { table, builds } = PRODUCTS[kind];
	await db.sql([
		...(kind === 'item' ? [statement('DELETE FROM placements WHERE itemId = ?1', id)] : []),
		...(kind === 'carpet' ? [statement('DELETE FROM layout_carpets WHERE carpetId = ?1', id)] : []),
		// A carpet's builds each draw one of its looks, `<id>/<look>`.
		...builds.map(build =>
			statement("DELETE FROM jobs WHERE kind = ?1 AND (target = ?2 OR target LIKE ?2 || '/%')", build, id),
		),
		statement('DELETE FROM layout_hidden WHERE kind = ?1 AND productId = ?2', kind, id),
		statement(`DELETE FROM ${table} WHERE id = ?1`, id),
	]);
	await dropPicks(
		id,
		(await listLayouts()).layouts.map(l => l.id),
	);
	await clearAssets(`items/${id}/`);
}
