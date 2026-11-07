import type { CarpetPose, CarpetSize } from '@repo/shared/carpets';
import { statement, type Row } from '@repo/shared/db';
import type { FixtureKey } from '@repo/shared/fixtures';
import { DEFAULT_TV, type TvSettings } from '@repo/shared/items';
import { FIRST_LAYOUT, LAYOUT_HEADER, type Layout, type LayoutList } from '@repo/shared/layouts';
import { db } from './db';

export type ProductKind = 'item' | 'texture' | 'carpet' | 'tv';

// A request the caller can fix, answered with a 400.
export class LayoutError extends Error {}

const active = db.setting<string>('layout', () => FIRST_LAYOUT);

export async function listLayouts(): Promise<LayoutList> {
	const [[rows], current] = await Promise.all([
		db.sql([statement('SELECT id, name FROM layouts ORDER BY createdAt')]),
		active.get(),
	]);
	return { active: current, layouts: rows as Layout[] };
}

async function existing(id: string) {
	const [[row]] = await db.sql([statement('SELECT 1 FROM layouts WHERE id = ?1', id)]);
	if (!row) throw new LayoutError(`No layout ${id}`);
	return id;
}

// The layout a request names, else the active one.
export const layoutOf = async (request: Request) =>
	existing(request.headers.get(LAYOUT_HEADER) ?? (await active.get()));

export const setActive = async (id: string) => active.set(await existing(id));

// A new layout starts empty, or as a copy of `from` with its own placement keys. Either way it becomes the active one.
export async function createLayout(name: string, from: string | null) {
	const id = crypto.randomUUID();
	const [[taken]] = await db.sql([statement('SELECT 1 FROM layouts WHERE name = ?1', name)]);
	if (taken) throw new LayoutError(`There is already a layout named ${name}`);
	if (from) await existing(from);
	await db.sql([
		statement('INSERT INTO layouts (id, name, createdAt) VALUES (?1, ?2, ?3)', id, name, new Date().toISOString()),
		...(from
			? [
					statement(
						`INSERT INTO placements (key, layoutId, itemId, position, rotation)
						SELECT lower(hex(randomblob(16))), ?1, itemId, position, rotation FROM placements WHERE layoutId = ?2`,
						id,
						from,
					),
					statement(
						`INSERT INTO layout_carpets (layoutId, carpetId, variant, size, placement)
						SELECT ?1, carpetId, variant, size, placement FROM layout_carpets WHERE layoutId = ?2`,
						id,
						from,
					),
					statement(
						`INSERT INTO layout_hidden (layoutId, kind, productId)
						SELECT ?1, kind, productId FROM layout_hidden WHERE layoutId = ?2`,
						id,
						from,
					),
					statement(
						`INSERT INTO settings (key, value)
						SELECT substr(key, 1, instr(key, ':')) || ?1, value FROM settings WHERE key IN ('fixtures:' || ?2, 'tv:' || ?2)`,
						id,
						from,
					),
				]
			: []),
	]);
	await active.set(id);
	return id;
}

// Products only this layout had in its room stay in the catalog for the others. Deleting the active layout makes the
// oldest one left active.
export async function deleteLayout(id: string) {
	const { active: current, layouts } = await listLayouts();
	await existing(id);
	const next = layouts.find(l => l.id !== id);
	if (!next) throw new LayoutError('The last layout cannot be deleted');
	await db.sql([
		statement('DELETE FROM placements WHERE layoutId = ?1', id),
		statement('DELETE FROM layout_carpets WHERE layoutId = ?1', id),
		statement('DELETE FROM layout_hidden WHERE layoutId = ?1', id),
		statement(`DELETE FROM settings WHERE key IN ('fixtures:' || ?1, 'tv:' || ?1)`, id),
		statement('DELETE FROM layouts WHERE id = ?1', id),
		...(current === id
			? [
					statement(
						'INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2',
						'layout',
						JSON.stringify(next.id),
					),
				]
			: []),
	]);
}

// The pick of every fixture but the TV, whose size and mount live in the layout's `tv` setting.
export const picksOf = (layout: string) =>
	db.setting<Partial<Record<FixtureKey, string | null>>>(`fixtures:${layout}`, () => ({}));
export const tvOf = (layout: string) => db.setting<TvSettings>(`tv:${layout}`, () => DEFAULT_TV);

// A pick naming a deleted product already reads as nothing picked, but would come back if the same link were imported
// again under the same id.
export async function dropPicks(id: string, layouts: string[]) {
	await Promise.all(
		layouts.map(async layout => {
			const picks = picksOf(layout);
			const stale = Object.entries(await picks.get()).filter(([, picked]) => picked === id);
			if (stale.length) await picks.patch(Object.fromEntries(stale.map(([key]) => [key, null])));
		}),
	);
}

export type CarpetState = { variant: string; size: CarpetSize; placement: CarpetPose | null };

export async function carpetStates(layout: string) {
	const [rows] = await db.sql([
		statement('SELECT carpetId, variant, size, placement FROM layout_carpets WHERE layoutId = ?1', layout),
	]);
	return new Map(
		rows!.map((r: Row): [string, CarpetState] => [
			r.carpetId as string,
			{
				variant: r.variant as string,
				size: JSON.parse(r.size as string),
				placement: r.placement ? JSON.parse(r.placement as string) : null,
			},
		]),
	);
}

export async function putCarpetState(layout: string, carpetId: string, state: CarpetState) {
	await db.sql([
		statement(
			`INSERT INTO layout_carpets (layoutId, carpetId, variant, size, placement) VALUES (?1, ?2, ?3, ?4, ?5)
			ON CONFLICT (layoutId, carpetId) DO UPDATE SET variant = ?3, size = ?4, placement = ?5`,
			layout,
			carpetId,
			state.variant,
			JSON.stringify(state.size),
			state.placement && JSON.stringify(state.placement),
		),
	]);
}

export async function hiddenIn(layout: string, kind: ProductKind) {
	const [rows] = await db.sql([
		statement('SELECT productId FROM layout_hidden WHERE layoutId = ?1 AND kind = ?2', layout, kind),
	]);
	return new Set(rows!.map(r => r.productId as string));
}

// Importing a product a layout had deleted brings it back there.
export const unhide = (layout: string, kind: ProductKind, id: string) =>
	db.sql([
		statement('DELETE FROM layout_hidden WHERE layoutId = ?1 AND kind = ?2 AND productId = ?3', layout, kind, id),
	]);

const PICKED_ELSEWHERE = `SELECT 1 FROM settings, json_each(settings.value)
	WHERE settings.key LIKE 'fixtures:%' AND settings.key != 'fixtures:' || ?2 AND json_each.value = ?1 LIMIT 1`;
// Each query finds the product (?1) in the room of a layout other than ?2.
const USES: Record<ProductKind, string[]> = {
	item: ['SELECT 1 FROM placements WHERE itemId = ?1 AND layoutId != ?2 LIMIT 1', PICKED_ELSEWHERE],
	carpet: ['SELECT 1 FROM layout_carpets WHERE carpetId = ?1 AND layoutId != ?2 AND placement IS NOT NULL LIMIT 1'],
	texture: [PICKED_ELSEWHERE],
	tv: [PICKED_ELSEWHERE],
};

export async function usedElsewhere(kind: ProductKind, id: string, layout: string) {
	const results = await db.sql(USES[kind].map(sql => statement(sql, id, layout)));
	return results.some(rows => rows.length > 0);
}

// Takes the product out of one layout only: off its list, out of its room and its fixture picks.
export async function hide(kind: ProductKind, id: string, layout: string) {
	await db.sql([
		statement('INSERT OR IGNORE INTO layout_hidden (layoutId, kind, productId) VALUES (?1, ?2, ?3)', layout, kind, id),
		...(kind === 'item'
			? [statement('DELETE FROM placements WHERE itemId = ?1 AND layoutId = ?2', id, layout)]
			: kind === 'carpet'
				? [statement('DELETE FROM layout_carpets WHERE carpetId = ?1 AND layoutId = ?2', id, layout)]
				: []),
	]);
	await dropPicks(id, [layout]);
}
