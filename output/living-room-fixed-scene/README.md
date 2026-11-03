# Living room — fixed 3D scene

Four furniture arrangements rendered directly from one dimensioned Blender scene. Geometry is not passed through an AI image generator. All images use the same room, glazing, column, island and kitchen-side camera.

Open [comparison.html](comparison.html). Each design contains render.png, an overhead plan.png, dimensions.md, scene.json, validation.json and an editable scene.blend.

## Source geometry

Tape dimensions in the project README take precedence over the approximate builder plan. Traced positions use a coherent calibration: x=(traceX−180)×199/403 and y=(905−traceY)×204/385. Directly measured sizes are preserved.

| Fixed element       | Model dimensions / position, inches                                                        | Source                                                              |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Living room         | 199 east-west ×204 north-south ×120 high                                                   | Measured spans and TV-wall height                                   |
| TV wall             | East x199; y0–122; height120                                                               | Measured                                                            |
| Column              | Diameter33; center(62.71,21.19)                                                            | Measured diameter, calibrated trace center                          |
| South glazing       | x0–142.71; opaque living return56.29                                                       | Calibrated trace                                                    |
| Island              | 71×41; x75.60–146.60,y204–245; top36                                                       | Measured size; room-span anchor; modeled height                     |
| West balcony access | y151.01–193.40; opens outward                                                              | Calibrated trace; opening width approximate                         |
| Office door         | East-west cross-wall at y122; x203.44–238.50; opens south into office                      | Traced orientation/width; measured TV-wall endpoint anchor          |
| Office recess       | East edge251.84; north return189.16                                                        | Calibrated trace; landing depth67.16 is a reconciliation assumption |
| TV-wall controls    | Switch6.5 from north end, bottom45; alarm28 from north end at105; outlet/data near y63,z16 | Tape notes                                                          |

The floor-plan trace puts the office cross-wall at139.89, conflicting with the taped TV-wall length122. This model honors122 and moves the adjoining unmeasured cross-wall to that endpoint. It does not claim that the resulting recess depth was measured. The recorded column distance45 from west glass has unspecified endpoints; the traced column edge is46.21 from glass. Exact mullions, pendant/fan positions, island reference endpoints and door details remain approximate. The exterior photograph supplies view context, not a calibrated skyline reconstruction.

## Layouts

| Design             | Sofa                                              | Main difference                                         | Sofa/island gap        |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------- | ---------------------- |
| 1. Kitchen chaise  | 124 long ×42 deep, chaise reaches72 overall depth | Kitchen-side chaise; pale oak slats                     | 38                     |
| 2. Lounge ottoman  | 120 long ×46 deep                                 | Straight deep sofa, movable38×44 ottoman, walnut        | 42                     |
| 3. Window chaise   | 120 long ×42 deep, chaise reaches72 overall depth | South/window-side chaise, stone table, broad oak panels | 42                     |
| 4. Sofa and swivel | 120 long ×42 deep;36×36 chair                     | Separate cognac sofa and olive swivel chair             | 42 to sofa;38 to chair |

All have a nominal98-inch TV modeled85.8 wide×48 high, floating110-inch console,48-inch soundbar resting on top, a floor lamp and plant. TV side margins18.1; soundbar-to-TV gap3. The room is not mirrored: looking south from this kitchen camera places the east TV wall on the LEFT and west windows on the RIGHT.

The narrow4.31-inch column/sofa separation is not a walkway. The west bypass is40. The chair plan has43 between sofa and chair,36 between table and chair,38 east of chair, and38 to the island. Each dimension schedule includes all footprint coordinates and elevations.

## Reproduce

Requires uv on PATH. The executable pins Blender Python bpy5.0.1 and installs Pillow through uv. No API key or server is required. Run the real entry point from the repository root:

```sh
./output/living-room-fixed-scene/render.py --design 1
./output/living-room-fixed-scene/render.py --design 2
./output/living-room-fixed-scene/render.py --design 3
./output/living-room-fixed-scene/render.py --design 4
```

Use --draft for a low-sample check, or --validate-only to rewrite the dimension schedule and plan without rendering. The script writes immutable dimensions, every furniture footprint and fit calculations before each render; it asserts room containment, furnishing collisions, office-route protection, actual Blender mesh dimensions and camera framing.

## Verification record

See inspection.md for the final picture-by-picture review and remaining source uncertainties. The model locks specified dimensions; it cannot recover unmeasured survey details from a photograph. Furniture is generically modeled at the stated sizes, not a claim that an unspecified retailer's product has those dimensions.
