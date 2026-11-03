# Final picture-by-picture inspection

The parent opened and inspected all four final1600×1100 PNGs and all four overhead plans against the original plan/photos, dimension schedules and actual Blender scene geometry. An independent reviewer also inspected every final design; two earlier findings (exterior floor spill and chair visibility) were fixed before this final set.

## Render inspection

| Picture                    | Placement and proportion checks                                                                                                                                                                                           | Outcome |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1. Kitchen-side chaise     | 124×42 sofa, kitchen-side extension to72 overall depth; matching table/plant/lamp locations; TV85.8×48 on122 wall; column and south opaque return retained. Entire main seating form visible; island stays in foreground. | Pass    |
| 2. Deep lounge and ottoman | 120×46 straight sofa;38×44 ottoman with tray; side table and lamp correspond to overhead footprints. Same TV, column, glazing and room perspective as1.                                                                   | Pass    |
| 3. Window-side chaise      | 120×42 sofa with extension at rear/window end, stone table and broad oak panels. Lamp moved to(140,20) so the plant is visible instead of hidden behind its shade.                                                        | Pass    |
| 4. Sofa and swivel         | 120×42 sofa;36-diameter barrel chair in36×36 bounding footprint atx125–161,y130–166. Chair moved south to be visible above the unchanged island.36 between table/chair,43 sofa/chair,38 island/chair and38 east of chair. | Pass    |

All four: east TV wall LEFT, west glazing RIGHT from the kitchen camera. Office opening is on the perpendicular cross-wall, not a new opening cut through the TV wall. Rear glass stops at the solid southeast return. No invented rear balcony door, removed column, widened TV wall or relocated island. Soundbar rests on the console. Main furniture remains within the frame. The foreground island can occlude feet or floor, as real line-of-sight geometry dictates.

## Actual saved-scene checks

Reopened all four scene.blend files using Blender Python. Verified TV wall5×122×120, TV2.5×85.8×48, column33×33×120, island top71×41, soundbar5×48×3. All four saved scenes have identical fixed-object transforms and camera.

Shared fixed geometry/camera SHA-256:

```text
2b0a8a7fa6ee47d7507c1ac32d48c29dd5666a211caeca5482dd591ab2b0d385
```

Checked every floorboard: none has negative interior x or y, so oak planks do not protrude through the west/south glazing. Exterior texture is packed in every editable scene. All four PNGs decode at1600×1100; all four plans decode; all projected furniture envelopes lie within camera frame. See verification.json for final-image hashes and saved-scene results.

The real executable entry point was run for every design, including corrected rerenders. It writes fixed dimensions, complete furnishing schedules and collision checks before rendering. No AI image-generation pass modifies these rendered coordinates afterward.

The comparison was rendered at728px and390px. All four room/plan toggles, image loading, enlargement and closing were exercised; no horizontal overflow.

## What remains unverified in the apartment

The model enforces the recorded measured spans. It cannot establish dimensions that were never recorded: exact column setback interpretation, west mullions/door size, ceiling-fixture positions, island reference endpoints and office-recess depth. The122-inch measured TV wall conflicts with the calibrated trace's139.89-inch wall; the model explicitly anchors the office cross-wall to122 and labels the resulting landing depth a reconciliation assumption. The exterior photograph is visual context rather than a measured reconstruction of tower distances. Furniture is a dimensioned generic proposal, not a verified vendor SKU. These uncertainties are in README.md and every dimensions.md.
