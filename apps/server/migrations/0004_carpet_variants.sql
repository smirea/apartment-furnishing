-- A carpet sells several looks (colors, patterns), each with its own photos, sizes and texture. A carpet imported before
-- this has one look, whose photos and texture stay where they were.
ALTER TABLE carpets ADD COLUMN variantLabel TEXT NOT NULL DEFAULT 'Color';
ALTER TABLE carpets ADD COLUMN variants TEXT NOT NULL DEFAULT '[]';
ALTER TABLE carpets ADD COLUMN variant TEXT NOT NULL DEFAULT 'default';
UPDATE carpets SET variants = json_array(json_object(
	'id', 'default',
	'name', '',
	'url', url,
	'image', image,
	'sizes', json(sizes),
	'texture', json(texture)
));
ALTER TABLE carpets DROP COLUMN sizes;
ALTER TABLE carpets DROP COLUMN image;
ALTER TABLE carpets DROP COLUMN texture;
ALTER TABLE carpets DROP COLUMN placement;

ALTER TABLE layout_carpets ADD COLUMN variant TEXT NOT NULL DEFAULT 'default';

-- Texture builds now draw one look of a carpet.
UPDATE jobs SET target = target || '/default' WHERE kind = 'buildCarpet';
