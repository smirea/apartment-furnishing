import { Database } from 'bun:sqlite';
import { statSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(import.meta.dir, '../../../data/app.db');

// Nested values (dimensions, highlights, the texture tile, vectors) are JSON text: nothing queries inside them.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS catalog_items (
	id TEXT PRIMARY KEY,
	url TEXT NOT NULL,
	importedAt TEXT NOT NULL,
	name TEXT NOT NULL,
	brand TEXT,
	price REAL,
	currency TEXT NOT NULL,
	category TEXT NOT NULL,
	dimensions TEXT,
	dimensionsNote TEXT,
	weightLb REAL,
	summary TEXT NOT NULL,
	highlights TEXT NOT NULL,
	mount TEXT NOT NULL,
	defaultElevationIn REAL NOT NULL,
	removeNodes TEXT NOT NULL,
	image TEXT,
	model TEXT,
	modelSource TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS placements (
	key TEXT PRIMARY KEY,
	itemId TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
	position TEXT NOT NULL,
	rotation TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS wall_textures (
	id TEXT PRIMARY KEY,
	url TEXT NOT NULL,
	importedAt TEXT NOT NULL,
	name TEXT NOT NULL,
	brand TEXT,
	price REAL,
	currency TEXT NOT NULL,
	panelsPerPack INTEGER NOT NULL,
	panel TEXT,
	summary TEXT NOT NULL,
	"group" TEXT,
	image TEXT,
	texture TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS tv_models (
	id TEXT PRIMARY KEY,
	url TEXT NOT NULL,
	importedAt TEXT NOT NULL,
	name TEXT NOT NULL,
	widthIn REAL NOT NULL,
	heightIn REAL NOT NULL
) STRICT;

-- One JSON value per singleton: the TV size, the bed pick, the wall finishes.
CREATE TABLE IF NOT EXISTS settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
) STRICT;
`;

function open() {
	// The file is committed like the JSON it replaced, so it keeps SQLite's default rollback journal: in WAL mode
	// recent writes would sit in a -wal file that git doesn't track.
	const db = new Database(FILE, { create: true, strict: true });
	db.run('PRAGMA foreign_keys = ON');
	// The import scripts write from their own process while the server's model and texture jobs write too.
	db.run('PRAGMA busy_timeout = 5000');
	db.run(SCHEMA);
	return { db, inode: statSync(FILE).ino };
}

let current = open();

// A pull or checkout replaces data/app.db with a new file while the dev server holds the old one open, which would
// keep serving stale data and send every write to the deleted file. Reopen whenever the path points somewhere new.
function db() {
	if (statSync(FILE, { throwIfNoEntry: false })?.ino !== current.inode) {
		current.db.close();
		current = open();
	}
	return current.db;
}

type Row = Record<string, unknown>;

export function table<T extends object>(
	name: string,
	{ key, json, order }: { key: keyof T & string; json: (keyof T & string)[]; order: string },
) {
	const columns = db()
		.query<{ name: string }, [string]>('SELECT name FROM pragma_table_info(?)')
		.all(name)
		.map(c => c.name);
	if (!columns.length) throw new Error(`No table ${name}`);
	const list = columns.map(c => `"${c}"`).join(', ');
	const upsert = `INSERT INTO ${name} (${list}) VALUES (${columns.map(c => `$${c}`).join(', ')})
		ON CONFLICT("${key}") DO UPDATE SET ${columns.map(c => `"${c}" = excluded."${c}"`).join(', ')}`;

	const decode = (row: Row) => {
		for (const c of json) row[c] = row[c] === null ? null : JSON.parse(row[c] as string);
		return row as T;
	};
	const encode = (value: T) =>
		Object.fromEntries(
			columns.map(c => {
				const v = (value as Row)[c];
				if (v === undefined) throw new Error(`${name}.${c} is missing on ${JSON.stringify(value)}`);
				return [c, json.includes(c as keyof T & string) && v !== null ? JSON.stringify(v) : v];
			}),
		) as Record<string, string | number | null>;

	const get = (id: string) => {
		const row = db().query<Row, [string]>(`SELECT * FROM ${name} WHERE "${key}" = ?`).get(id);
		return row ? decode(row) : null;
	};

	return {
		all: () => db().query<Row, []>(`SELECT * FROM ${name} ORDER BY ${order}`).all().map(decode),
		get,
		read: (id: string) => {
			const row = get(id);
			if (!row) throw new Error(`No ${name} row ${id}`);
			return row;
		},
		put: (value: T) => void db().query(upsert).run(encode(value)),
		remove: (id: string) => void db().query(`DELETE FROM ${name} WHERE "${key}" = ?`).run(id),
	};
}

export function setting<T>(key: string, fallback: () => T) {
	return {
		get: (): T => {
			const row = db().query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?').get(key);
			return row ? JSON.parse(row.value) : fallback();
		},
		set: (value: T) =>
			void db()
				.query('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2')
				.run(key, JSON.stringify(value)),
	};
}
