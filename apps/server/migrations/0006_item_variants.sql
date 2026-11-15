-- A furniture listing sells several looks (colors, fabrics, finishes) of one shape, each shown by the item's model
-- recolored. Items imported before this sell one.
ALTER TABLE catalog_items ADD COLUMN variantLabel TEXT NOT NULL DEFAULT 'Color';
ALTER TABLE catalog_items ADD COLUMN variants TEXT NOT NULL DEFAULT '[]';
ALTER TABLE catalog_items ADD COLUMN variant TEXT;

-- Each copy in a room picks its own look; null shows the listing's.
ALTER TABLE placements ADD COLUMN variant TEXT;
