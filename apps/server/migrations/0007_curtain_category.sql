-- Curtains became their own category, which the Curtains panel hangs at the windows. The three imported before it
-- were read as wall decor and grouped as "Curtains".
UPDATE catalog_items SET category = 'curtain' WHERE category = 'decor' AND "group" = 'Curtains';

-- A layout that hung curtains on a wall as stand-ins gets the one it hung most as its curtains. The stand-ins stay put.
INSERT INTO settings (key, value)
SELECT
	'fixtures:' || l.id,
	json_object(
		'curtains',
		(
			SELECT p.itemId FROM placements p JOIN catalog_items c ON c.id = p.itemId
			WHERE c.category = 'curtain' AND p.layoutId = l.id
			GROUP BY p.itemId ORDER BY count(*) DESC, p.itemId LIMIT 1
		)
	)
FROM layouts l
WHERE EXISTS (
	SELECT 1 FROM placements p JOIN catalog_items c ON c.id = p.itemId WHERE c.category = 'curtain' AND p.layoutId = l.id
)
ON CONFLICT(key) DO UPDATE SET value = json_set(value, '$.curtains', json_extract(excluded.value, '$.curtains'))
WHERE json_extract(value, '$.curtains') IS NULL;
