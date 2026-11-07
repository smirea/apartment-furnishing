// The tables in D1. The Worker runs these against its D1 binding, the laptop runner over the Worker's /api/runner/sql,
// so both share one definition of every table and of the job queue between them.
import type { Carpet } from './carpets';
import type { CatalogItem, Job, Placement, TvModel, WallTexture } from './items';

export type SqlValue = string | number | null;
export type Statement = { sql: string; params: SqlValue[] };
export type Row = Record<string, SqlValue>;
// Runs the statements in one transaction and answers each one's rows.
export type Sql = (statements: Statement[]) => Promise<Row[][]>;

export const statement = (sql: string, ...params: SqlValue[]): Statement => ({ sql, params });

// Every column of the row type, so a field added to the type without a column fails to compile. Nested values are
// JSON text: nothing queries inside them.
type Columns<T> = { [K in keyof T]-?: 'json' | 'value' };

function table<T extends object>(sql: Sql, name: string, key: keyof T & string, columns: Columns<T>, order: string) {
	const names = Object.keys(columns) as (keyof T & string)[];
	const upsert = `INSERT INTO ${name} (${names.map(c => `"${c}"`).join(', ')}) VALUES (${names.map((_, i) => `?${i + 1}`).join(', ')})
		ON CONFLICT("${key}") DO UPDATE SET ${names.map(c => `"${c}" = excluded."${c}"`).join(', ')}`;
	const one = async (s: Statement) => (await sql([s]))[0]!;

	const decode = (row: Row) => {
		const value: Record<string, unknown> = { ...row };
		for (const c of names) if (columns[c] === 'json' && row[c] !== null) value[c] = JSON.parse(row[c] as string);
		return value as T;
	};
	const encode = (value: T) =>
		names.map(c => {
			const v = value[c] as unknown;
			if (v === undefined) throw new Error(`${name}.${c} is missing on ${JSON.stringify(value)}`);
			return columns[c] === 'json' && v !== null ? JSON.stringify(v) : (v as SqlValue);
		});

	const get = async (id: string) => {
		const [row] = await one(statement(`SELECT * FROM ${name} WHERE "${key}" = ?1`, id));
		return row ? decode(row) : null;
	};

	return {
		all: async () => (await one(statement(`SELECT * FROM ${name} ORDER BY ${order}`))).map(decode),
		get,
		read: async (id: string) => {
			const row = await get(id);
			if (!row) throw new Error(`No ${name} row ${id}`);
			return row;
		},
		put: async (value: T) => void (await one({ sql: upsert, params: encode(value) })),
		remove: async (id: string) => void (await one(statement(`DELETE FROM ${name} WHERE "${key}" = ?1`, id))),
	};
}

// One JSON value per singleton: the TV size, the fixture picks, the runner's heartbeat.
function setting<T>(sql: Sql, key: string, fallback: () => T) {
	return {
		get: async (): Promise<T> => {
			const [[row]] = (await sql([statement('SELECT value FROM settings WHERE key = ?1', key)])) as [Row[]];
			return row ? JSON.parse(row.value as string) : fallback();
		},
		set: async (value: T) =>
			void (await sql([
				statement(
					'INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2',
					key,
					JSON.stringify(value),
				),
			])),
		// Merges fields into the stored object in one statement, so clients changing different fields at once can't
		// revert each other. A null field is dropped (JSON merge patch), which reads back as unset.
		patch: async (fields: Partial<T>) =>
			void (await sql([
				statement(
					'INSERT INTO settings (key, value) VALUES (?1, json_patch(?2, ?3)) ON CONFLICT(key) DO UPDATE SET value = json_patch(value, ?3)',
					key,
					JSON.stringify(fallback()),
					JSON.stringify(fields),
				),
			])),
	};
}

// Work only the laptop can do: page captures, grok and Codex sessions, USDZ conversion. The Worker queues it, the
// runner on the laptop claims and runs it. An import's result is the id it saved; builds have none.
export const JOB_KINDS = [
	'importItem',
	'importTexture',
	'importCarpet',
	'importTv',
	'buildModel',
	'buildTexture',
	'buildCarpet',
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

// `target` is the product URL of an import and the item id of a build. `category` limits an item import to one kind
// of product, so a link pasted in the Bed panel can't add a lamp nobody sees.
export type QueuedJob = { id: number; kind: JobKind; target: string; category: string | null };

type JobRow = QueuedJob & {
	state: 'queued' | 'running' | 'failed' | 'done';
	result: string | null;
	error: string | null;
};

// The runner writes this on every poll; older than this, nothing is claiming jobs.
export const RUNNER_STALE_MS = 30_000;

const now = () => new Date().toISOString();

function jobQueue(sql: Sql) {
	return {
		// A build already queued or running for the target is left alone; a failed one is replaced.
		async enqueue(kind: JobKind, target: string, category: string | null = null): Promise<number | null> {
			const [, inserted] = await sql([
				statement("DELETE FROM jobs WHERE kind = ?1 AND target = ?2 AND state = 'failed'", kind, target),
				statement(
					`INSERT INTO jobs (kind, target, category, state, updatedAt)
					SELECT ?1, ?2, ?3, 'queued', ?4
					WHERE ?1 LIKE 'import%' OR NOT EXISTS (
						SELECT 1 FROM jobs WHERE kind = ?1 AND target = ?2 AND state IN ('queued', 'running')
					)
					RETURNING id`,
					kind,
					target,
					category,
					now(),
				),
			]);
			return (inserted![0]?.id as number | undefined) ?? null;
		},
		async read(id: number): Promise<JobRow | null> {
			const [[row]] = (await sql([statement('SELECT * FROM jobs WHERE id = ?1', id)])) as [JobRow[]];
			return row ?? null;
		},
		async remove(id: number) {
			await sql([statement('DELETE FROM jobs WHERE id = ?1', id)]);
		},
		// What the clients show next to each item: queued, running, or failed with the error. Done jobs show nothing.
		async states(kind: JobKind): Promise<Map<string, Job>> {
			const [rows] = (await sql([
				statement("SELECT target, state, error FROM jobs WHERE kind = ?1 AND state != 'done' ORDER BY id", kind),
			])) as [Pick<JobRow, 'target' | 'state' | 'error'>[]];
			return new Map(
				rows.map(r => [
					r.target,
					r.state === 'failed' ? { state: 'failed', error: r.error ?? '' } : { state: r.state },
				]),
			) as Map<string, Job>;
		},
		async active(kind: JobKind) {
			const [rows] = await sql([
				statement("SELECT 1 FROM jobs WHERE kind = ?1 AND state IN ('queued', 'running') LIMIT 1", kind),
			]);
			return rows!.length > 0;
		},
		// Claims up to `limit` queued jobs of these kinds, oldest first.
		claim: (kinds: readonly JobKind[], limit: number): Statement =>
			statement(
				`UPDATE jobs SET state = 'running', updatedAt = ?1 WHERE id IN (
					SELECT id FROM jobs WHERE state = 'queued' AND kind IN (${kinds.map(k => `'${k}'`).join(', ')})
					ORDER BY id LIMIT ?2
				) RETURNING id, kind, target, category`,
				now(),
				limit,
			),
		// Builds leave no row behind; an import keeps its result until the Worker waiting on it reads it.
		async complete(job: QueuedJob, result: string | null) {
			await sql([
				result === null
					? statement('DELETE FROM jobs WHERE id = ?1', job.id)
					: statement(
							"UPDATE jobs SET state = 'done', result = ?2, updatedAt = ?3 WHERE id = ?1",
							job.id,
							result,
							now(),
						),
			]);
		},
		async fail(job: QueuedJob, error: string) {
			await sql([
				statement("UPDATE jobs SET state = 'failed', error = ?2, updatedAt = ?3 WHERE id = ?1", job.id, error, now()),
			]);
		},
		// A runner that died mid-job left it running; the next one starts it over.
		async requeueRunning() {
			await sql([statement("UPDATE jobs SET state = 'queued' WHERE state = 'running'")]);
		},
	};
}

export function createDb(sql: Sql) {
	return {
		sql,
		catalog: table<CatalogItem>(
			sql,
			'catalog_items',
			'id',
			{
				id: 'value',
				url: 'value',
				importedAt: 'value',
				name: 'value',
				brand: 'value',
				price: 'value',
				currency: 'value',
				category: 'value',
				group: 'value',
				dimensions: 'json',
				dimensionsNote: 'value',
				weightLb: 'value',
				summary: 'value',
				highlights: 'json',
				mount: 'value',
				defaultElevationIn: 'value',
				removeNodes: 'json',
				image: 'value',
				model: 'value',
				modelSource: 'value',
			},
			'importedAt DESC',
		),
		placements: table<Placement>(
			sql,
			'placements',
			'key',
			{ key: 'value', itemId: 'value', position: 'json', rotation: 'json' },
			'rowid',
		),
		textures: table<WallTexture>(
			sql,
			'wall_textures',
			'id',
			{
				id: 'value',
				url: 'value',
				importedAt: 'value',
				name: 'value',
				brand: 'value',
				price: 'value',
				currency: 'value',
				panelsPerPack: 'value',
				panel: 'json',
				summary: 'value',
				group: 'value',
				image: 'value',
				texture: 'json',
			},
			'importedAt DESC',
		),
		carpets: table<Carpet>(
			sql,
			'carpets',
			'id',
			{
				id: 'value',
				url: 'value',
				importedAt: 'value',
				name: 'value',
				brand: 'value',
				currency: 'value',
				summary: 'value',
				sizes: 'json',
				size: 'json',
				image: 'value',
				texture: 'json',
				placement: 'json',
			},
			'importedAt',
		),
		tvs: table<TvModel>(
			sql,
			'tv_models',
			'id',
			{ id: 'value', url: 'value', importedAt: 'value', name: 'value', widthIn: 'value', heightIn: 'value' },
			'importedAt DESC',
		),
		setting: <T>(key: string, fallback: () => T) => setting(sql, key, fallback),
		runnerSeen: setting<{ at: string } | null>(sql, 'runner', () => null),
		jobs: jobQueue(sql),
	};
}

export type Db = ReturnType<typeof createDb>;
