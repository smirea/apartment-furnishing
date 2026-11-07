CREATE TABLE layouts (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL UNIQUE,
	createdAt TEXT NOT NULL
) STRICT;

INSERT INTO layouts (id, name, createdAt) VALUES ('main', 'Main', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

ALTER TABLE placements ADD COLUMN layoutId TEXT NOT NULL DEFAULT 'main';
CREATE INDEX placements_by_layout ON placements (layoutId);

-- A layout without a row for a carpet shows it at the listing's size, off the floor.
CREATE TABLE layout_carpets (
	layoutId TEXT NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
	carpetId TEXT NOT NULL REFERENCES carpets(id) ON DELETE CASCADE,
	size TEXT NOT NULL,
	placement TEXT,
	PRIMARY KEY (layoutId, carpetId)
) STRICT;

-- carpets.placement stays: a job runner still on older code writes it on every rug import, and nothing reads it now.
INSERT INTO layout_carpets (layoutId, carpetId, size, placement) SELECT 'main', id, size, placement FROM carpets;

-- Products deleted from one layout while another layout still has them in the room.
CREATE TABLE layout_hidden (
	layoutId TEXT NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
	kind TEXT NOT NULL,
	productId TEXT NOT NULL,
	PRIMARY KEY (layoutId, kind, productId)
) STRICT;

UPDATE settings SET key = 'fixtures:main' WHERE key = 'fixtures';
UPDATE settings SET key = 'tv:main' WHERE key = 'tv';
