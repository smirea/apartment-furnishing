import { carpetHitsWalls, sizeLabel, type CarpetPose, type CarpetSize } from '@repo/shared/carpets';
import { planGeometry } from '@repo/shared/plan';
import { db } from './db';
import { carpetStates, putCarpetState } from './layouts';

const plan = planGeometry();

// A request the caller can fix, answered with a 400.
export class CarpetError extends Error {}

const sameSize = (a: Pick<CarpetSize, 'widthIn' | 'lengthIn'>, b: Pick<CarpetSize, 'widthIn' | 'lengthIn'>) =>
	Math.abs(a.widthIn - b.widthIn) < 0.5 && Math.abs(a.lengthIn - b.lengthIn) < 0.5;

const isPose = (value: unknown): value is CarpetPose =>
	typeof value === 'object' &&
	value !== null &&
	['x', 'z', 'yaw'].every(k => Number.isFinite((value as Record<string, unknown>)[k]));

// Picks a size the listing sells and moves the carpet into the layout's room (a pose), out of it (null), or leaves it
// be (undefined). The result must clear the walls, so a bigger size can't grow a carpet into one.
export async function updateCarpet(id: string, body: { size?: unknown; placement?: unknown }, layout: string) {
	const carpet = await db.carpets.read(id);
	const current = (await carpetStates(layout)).get(id) ?? { size: carpet.size, placement: null };
	let size = current.size;
	if (body.size !== undefined) {
		const asked = body.size as Partial<CarpetSize> | null;
		const match = carpet.sizes.find(
			s => typeof asked?.widthIn === 'number' && typeof asked.lengthIn === 'number' && sameSize(s, asked as CarpetSize),
		);
		if (!match) throw new CarpetError(`${carpet.name} isn't sold in ${JSON.stringify(body.size)}`);
		size = match;
	}
	if (body.placement !== undefined && body.placement !== null && !isPose(body.placement))
		throw new CarpetError('Expected placement: { x, z, yaw } in feet and degrees, or null');
	const placement = body.placement === undefined ? current.placement : (body.placement as CarpetPose | null);
	if (placement && carpetHitsWalls(placement, size, plan))
		throw new CarpetError(`At ${sizeLabel(size)} the rug would cross a wall there`);
	await putCarpetState(layout, id, { size, placement });
}
