CREATE TABLE catalog_items (
	id TEXT PRIMARY KEY,
	url TEXT NOT NULL,
	importedAt TEXT NOT NULL,
	name TEXT NOT NULL,
	brand TEXT,
	price REAL,
	currency TEXT NOT NULL,
	category TEXT NOT NULL,
	"group" TEXT,
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

CREATE TABLE placements (
	key TEXT PRIMARY KEY,
	itemId TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
	position TEXT NOT NULL,
	rotation TEXT NOT NULL
) STRICT;

CREATE TABLE wall_textures (
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

CREATE TABLE carpets (
	id TEXT PRIMARY KEY,
	url TEXT NOT NULL,
	importedAt TEXT NOT NULL,
	name TEXT NOT NULL,
	brand TEXT,
	currency TEXT NOT NULL,
	summary TEXT NOT NULL,
	sizes TEXT NOT NULL,
	size TEXT NOT NULL,
	image TEXT,
	texture TEXT,
	placement TEXT
) STRICT;

CREATE TABLE tv_models (
	id TEXT PRIMARY KEY,
	url TEXT NOT NULL,
	importedAt TEXT NOT NULL,
	name TEXT NOT NULL,
	widthIn REAL NOT NULL,
	heightIn REAL NOT NULL
) STRICT;

CREATE TABLE settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
) STRICT;

CREATE TABLE jobs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	kind TEXT NOT NULL,
	target TEXT NOT NULL,
	category TEXT,
	state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'failed', 'done')),
	result TEXT,
	error TEXT,
	updatedAt TEXT NOT NULL
) STRICT;

CREATE INDEX jobs_by_state ON jobs (state, kind);
