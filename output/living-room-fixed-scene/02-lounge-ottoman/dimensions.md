# Deep lounge + movable ottoman · walnut

This schedule is written and checked before rendering. All dimensions are inches. Origin: southwest glass corner; x east, y north, z up.

## Immutable geometry

- Living room: 199 × 204, ceiling 120. East TV wall: x199, y0–122, height120.
- Concrete column: diameter33, center (62.71,21.19), height120.
- South glass ends at x142.71; opaque living-room return56.29.
- Kitchen island: 71 × 41, x75.60–146.60, y204–245, top36.
- West balcony opening: y151.01–193.40, opens outward. Balcony nominal61 × 206.
- Office door: on perpendicular east-west cross-wall at y122, x203.44–238.50; opens south into office. Recess east edge251.84, north return189.16.
- Existing switch: y115.5, bottom45. Alarm: y94, z105. Outlet/data: y63, z16. Controls remain exposed and accessible.
- Existing fan, white ceiling, pale oak floor, black glazing frames, island and kitchen pendants remain in the model.

Measured: room spans, TV wall, column diameter, island size and fixture offsets. Calibrated trace: column center, glass return, balcony opening and recess width. Reconciliation assumption: office cross-wall anchored at measured TV-wall north end122; resulting unmeasured landing depth67.16. Mullions, fan and pendant positions are approximate. The island13′3″ note has unspecified endpoints and is not used as a second exact anchor. Exterior photograph is context only.

## Every added furnishing

Footprint columns are [x1,y1,x2,y2]. Sofa and chaise meet at their module seam. All other hard furniture footprints are disjoint.

| Item      | Footprint            | Overall height / elevation |
| --------- | -------------------- | -------------------------- |
| sofa      | [40, 42, 86, 162]    | 32                         |
| ottoman   | [109, 75, 147, 119]  | 19                         |
| side      | [108, 137, 126, 155] | 20                         |
| lamp      | [91, 42, 105, 56]    | 64                         |
| plant_pot | [156, 13, 174, 31]   | 16                         |
| console   | [180.7, 6, 197, 116] | 9–21                       |

- TV: nominal98-inch class,85.8 wide ×48 high, y18.1–103.9, z27–75, depth2.5.
- Soundbar:48 ×5 ×3, centered on the console, z21–24.
- Floating console:110 along y, depth16.3 including fronts, y6–116, frontx180.7, rear197, z9–21. Rear mounting gap accommodates the wood treatment and cables.
- Rug:144 ×134, x30–174, y40–174, z0.1–0.4.
- Floor lamp:14-inch shade diameter,64 total height,12-inch base diameter,0.9-inch stem; warm2700K light.
- Plant:18-inch pot diameter,16-inch pot height; foliage bounded approximately26 diameter and64 total height.
- Wood treatment: TV-wall only, ending at y110 and height98/99, below the alarm and before the switch. Olive option paints the full122 ×115 wall surface, retains exposed fixtures and uses a14-inch oak strip ending at z100.
- Furniture colors, exact panel construction and all coordinates are in scene.json and render.py. The generic proposed furniture sizes are not retailer product guarantees.

## Numeric fit checks

```json
{
	"island_to_sofa": 42,
	"west_route": 40,
	"column_to_sofa": 4.310000000000002,
	"tv_side_margin": 18.1,
	"console_side_margin": 6,
	"soundbar_gap": 3,
	"office_route": 36,
	"east_clearance_above_tv_wall": 73
}
```

The4.31-inch column/sofa gap is separation, not a walkway. Use the40-inch west bypass. The reserved office route x163–199, y>122 is empty. For the chair plan, the checked passages are43 between sofa and chair,36 between table and chair,38 east of chair and38 to the island.

## Camera and rendering

Fixed kitchen-side camera (48,250,68), horizontal target (115,80,68), lens20.5mm on36mm sensor, vertical lens shift−0.18. Image1600 ×1100, straight verticals. Same camera and shell for all designs. East TV wall is image LEFT; west glazing and sofa are RIGHT. The original island remains in the foreground and causes physically correct occlusion.

Actual Blender mesh dimensions, footprint collisions and camera projection checks are exported to validation.json before rendering. Editable scene.blend contains the geometry and packed exterior texture. See inspection.md for final picture-by-picture findings and source uncertainties.
