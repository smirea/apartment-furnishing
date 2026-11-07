-- An item import from the Wall panel hangs the product on a wall whatever grok reads its mount as.
ALTER TABLE jobs ADD COLUMN mount TEXT;
