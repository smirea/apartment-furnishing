# Olive and cognac — measured living room

## Sources and status

Read shared-geometry.md in full first, README.md measured dimensions, and apps/ui/src/lib/floorplan.ts. Inspected original floorplan-b4.jpg (topology), living-room-island-corner-windows.jpg (shell, glazing, column, floor, fan), kitchen-oven-wall.jpg (kitchen context) using view_image. No earlier concepts used. Coordinates are inches: southwest interior glass corner (0,0,0); east +x, north +y, up +z. This is a proposed furnishing layout using measured spans and approximate traced positions, not a survey or installation drawing. All added furniture is generic/custom proposed size, not a verified product.

## Immutable dimension schedule

- Room x0..199, y0..204: tape-measured 199 ×204. Ceiling z120 is same-stack listing evidence, not taped. Existing white ceiling, fan, pale wood floor, black glazing frames retained.
- East TV wall x199, y0..122, z0..120: taped 122 wide; not 144. Baseboard z0..5.
- Switch y115.5, bottom z45: measured 6.5 from north end. Alarm approximately y94,z105: measured approximate 28 from north end. Outlet/data approximately y63,z16: measured approximate. All retained; console has accessible removable rear service opening at outlet, no finish conceals controls.
- West glazing x0. Only balcony door is west at approximate y144..184 (40.5 traced width), outward swing. Exact mullions/leaf dimensions unknown; preserve reference topology.
- South glass y0,x0..approximately143, opaque southeast return x143..199 (traced). No south door or glass behind TV wall.
- Column diameter33 measured; traced center(64.3,20.3), radius16.5; limits x47.8..80.8,y3.8..36.8. README's 45 from west glass does not specify center/edge; no inferred interpretation claimed. Keep exposed concrete, inset from glass.
- Island measured71×41; approximate trace x78.5..149.4,y195.4..236.5; z36 nominal modeled. Trace span rounding is70.9×41.1. Tape living boundary and trace boundary differ about9; exact setback unknown. README13ft3 north of column has unspecified endpoints. Do not move island or pendants.
- Office access is beyond north end of TV wall, on recessed cross-wall near y133.7; traced door gap592..663 on y641. Exact recess/door size unknown. Keep x163..199 clear above y122; no opening cut into TV wall.
- Balcony west of glass: nominal listing61×206; original railing and outdoor swing retained, exact furniture footprint unknown. Adjacent rooms unchanged.
- README kitchen11ft7×7ft10 and adjacent room dimensions are context, not a reason to alter shell. Stud end reference/spacing ambiguous; mounting requires onsite verification.

## Every added item and finish

| Item                                          | Dimensions                                                      | Position / elevation                                                               |
| --------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Wall TV, 98-inch 16:9                         | 85.8 W×48 H;4 mount/thickness allowance, not product spec       | x195..199,y18.1..103.9,z27..75; center y61,z51; no stand                           |
| Floating dark walnut console                  | 110 W×18 D×12 H                                                 | x181..199,y6..116,z9..21; removable service back at y63,z16                        |
| Soundbar resting ON console                   | 48 W×5 D×3 H                                                    | x186..191,y37..85,z21..24                                                          |
| Cognac leather sofa, straight, low broad arms | 116 long×42 deep×32 high                                        | x40..82,y42..158,z0..32; faces east; seat eye approx x70; no chaise                |
| Dark walnut low coffee table, rounded corners | 30×48×14                                                        | x104..134,y74..122,z0..14                                                          |
| Rust/olive tactile wool rug                   | 144 east-west×120 north-south×0.4                               | x30..174,y40..160,z0..0.4                                                          |
| Dark walnut side table                        | 16×16×21                                                        | x90..106,y136..152,z0..21                                                          |
| Brass side-table lamp, warm2700K              | 14 diameter×22 high, all shade/base inside envelope             | center(98,144),x91..105,y137..151,z21..43                                          |
| Brass small console lamp, warm2700K           | 8 diameter×22 high                                              | center(190,12),x186..194,y8..16,z21..43                                            |
| Tall bounded ficus, terracotta pot            | pot18 diameter×20 high; foliage maximum28 diameter,total78 high | center(158,20); pot x149..167,y11..29,z0..20; all foliage x144..172,y6..34,z20..78 |
| Small console fern, terracotta pot            | pot6 diameter×6; all foliage10 diameter,total14 high            | center(190,110); foliage x185..195,y105..115,z21..35                               |
| Olive sofa cushion                            | 22×8×22                                                         | x48..70,y54..62,z18..40                                                            |
| Rust sofa cushion                             | 22×8×22                                                         | x48..70,y89..97,z18..40                                                            |
| Olive sofa cushion                            | 22×8×22                                                         | x48..70,y134..142,z18..40                                                          |
| Coffee table dark tray                        | 14×18×1                                                         | x112..126,y88..106,z14..15; no other table objects                                 |
| Olive mineral plaster east wall               | 122×115,negligible finish thickness                             | x199,y0..122,z5..120 except oak below; fixtures exposed                            |
| Selective honey oak east strip                | 16 W×115 H×0.5                                                  | x198.5..199,y0..16,z5..120; no overlap TV or controls                              |
| Honey oak southeast return                    | 56 W×115 H×0.5                                                  | x143..199,y0..0.5,z5..120, ends at existing glass boundary                         |

No extra chair, floor lamp, curtains, art, book stacks, dining furniture, fireplace or other added objects. Existing fan/pendants/island/balcony objects retain reference locations; their unsurveyed dimensions are not invented.

## Fit validation before generation 1

- TV margins (122−85.8)/2=18.1 each; console margins(122−110)/2=6 each. TV height27..75 below alarm105; switch115.5 beyond screen103.9, horizontal separation11.6. Wood strip ends16, screen begins18.1:2.1 gap.
- Console top21; soundbar top24; TV bottom27:3 clear. Bar rests on console, no wall floating bar. Console lamp stops y16, screen starts18.1:2.1 gap. Fern starts105, TV ends103.9:1.1 gap. Installation access at data/outlet must be provided through removable console back.
- Sofa front82 to table104=22; table134 to console181=47. Seat eye x70 to wall199=129 (10ft9), to screen face195=125 design allowance.
- North sofa end158 to traced island south195.4=37.4; narrower than46 to tape boundary204. Side table north152 and rug160 leave43.4 and35.4 respectively, rug is flat, not standing obstruction. Console/office route x163..199,y>122 remains36 wide. Turn access x134..181 beside table is47; above table y122 full route open except side table ending106.
- Sofa south42 to column north36.8=5.2 separation, not a circulation aisle. Column rear-west edge47.8 and sofa back40 allow west route x0..40 beside sofa; use west bypass, not5.2-inch slot. Column-to-glass narrows to47.8 at column center. West door y144..184 is clear x0..40, swings outward; no plant/lamp blocks it.
- Ficus foliage ends y34 before rug40 (6); x172 before console181 (9); clear TV plane195 by23 and glass y0 by6. Column east80.8 to plant west144=63.2.
- Sofa end158 to island37.4; side table east90 leaves8 from sofa82; shade stays within table footprint. All solid furniture boxes disjoint. Rug intentionally beneath sofa/table. Column and rug gap3.2. Paneling may not cover fixtures. Existing balcony swing exact position unknown, no changes proposed.
- Camera(95,190,62) looks at(105,70,45), rectilinear24mm landscape; just south of island195.4. Entire seating zone, south glazing and thick inset column left-rear, TV wall right, north-end recess at right foreground; small original island/pendant context can be cropped at top/near edge without moving anything.
- Numeric layout PASSES against measured spans and traced positions with stated uncertainties. No claim every route is36: rear slot5.2 intentionally bypassed. Exact door sweep, island offset, mullions, electrical/mount service and product dimensions require onsite/product confirmation.

## Full generation prompt

Use case: photorealistic-natural. Create ONE landscape photorealistic furnished living room interior, Olive and cognac direction. Input image1 floorplan is topology reference only, tape schedule overrides printed plan sizes. Image2 original empty living-room photo is architectural shell reference: retain actual concrete column, black glazing, fan, white ceiling, pale wood floor, balcony topology and skyline. Image3 kitchen photo is context for unchanged island finishes. Reconstruct this actual modest apartment, not a generic enlarged luxury room. Camera from kitchen side facing south, TV wall RIGHT, west glazing LEFT, south glazing rear. Show whole seating arrangement proportionally. Critically TV wall is only122 inches, NOT12 feet. Massive98-inch TV fills70.3% of wall width; console fills90.2%. North end steps back to recessed office access, actual door on cross wall beyond TV wall, never a hole through TV wall. Column is33-inch diameter, inset47.8 inches at closest west edge, prominent left-rear and separated from glass. ONLY balcony door is west/kitchen side, no south door. South southeast opaque return must remain. Do not mirror room.

Expressive warm modern interior: rich muted olive green mineral plaster, selective honey oak (only scheduled strips/return), long generous cognac leather sofa with broad arms, dark walnut low table and floating console, rust/olive textured wool rug, bounded lush plants, sculptural brass warm2700K lamps. Retain original white ceiling/fan and floor. Warm evening daylight balanced with lamps, tactile lived-in materials, architectural editorial photograph, no beige wash, no fantasy remodeling. TV is off dark subtly reflective, no artwork replacing screen. Soundbar physically rests ON console. No extra furnishings beyond schedule. No labels, text, dimensions, collage or watermark. Preserve proportions over dramatic styling. Recess and west access may be near frame edge but preserve topology. Full fixed geometry and added-item dimension schedule and fit checks follow; honor every constraint:

# Olive and cognac — measured living room

## Sources and status

Read shared-geometry.md in full first, README.md measured dimensions, and apps/ui/src/lib/floorplan.ts. Inspected original floorplan-b4.jpg (topology), living-room-island-corner-windows.jpg (shell, glazing, column, floor, fan), kitchen-oven-wall.jpg (kitchen context) using view_image. No earlier concepts used. Coordinates are inches: southwest interior glass corner (0,0,0); east +x, north +y, up +z. This is a proposed furnishing layout using measured spans and approximate traced positions, not a survey or installation drawing. All added furniture is generic/custom proposed size, not a verified product.

## Immutable dimension schedule

- Room x0..199, y0..204: tape-measured 199 ×204. Ceiling z120 is same-stack listing evidence, not taped. Existing white ceiling, fan, pale wood floor, black glazing frames retained.
- East TV wall x199, y0..122, z0..120: taped 122 wide; not 144. Baseboard z0..5.
- Switch y115.5, bottom z45: measured 6.5 from north end. Alarm approximately y94,z105: measured approximate 28 from north end. Outlet/data approximately y63,z16: measured approximate. All retained; console has accessible removable rear service opening at outlet, no finish conceals controls.
- West glazing x0. Only balcony door is west at approximate y144..184 (40.5 traced width), outward swing. Exact mullions/leaf dimensions unknown; preserve reference topology.
- South glass y0,x0..approximately143, opaque southeast return x143..199 (traced). No south door or glass behind TV wall.
- Column diameter33 measured; traced center(64.3,20.3), radius16.5; limits x47.8..80.8,y3.8..36.8. README's 45 from west glass does not specify center/edge; no inferred interpretation claimed. Keep exposed concrete, inset from glass.
- Island measured71×41; approximate trace x78.5..149.4,y195.4..236.5; z36 nominal modeled. Trace span rounding is70.9×41.1. Tape living boundary and trace boundary differ about9; exact setback unknown. README13ft3 north of column has unspecified endpoints. Do not move island or pendants.
- Office access is beyond north end of TV wall, on recessed cross-wall near y133.7; traced door gap592..663 on y641. Exact recess/door size unknown. Keep x163..199 clear above y122; no opening cut into TV wall.
- Balcony west of glass: nominal listing61×206; original railing and outdoor swing retained, exact furniture footprint unknown. Adjacent rooms unchanged.
- README kitchen11ft7×7ft10 and adjacent room dimensions are context, not a reason to alter shell. Stud end reference/spacing ambiguous; mounting requires onsite verification.

## Every added item and finish

| Item                                          | Dimensions                                                      | Position / elevation                                                               |
| --------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Wall TV, 98-inch 16:9                         | 85.8 W×48 H;4 mount/thickness allowance, not product spec       | x195..199,y18.1..103.9,z27..75; center y61,z51; no stand                           |
| Floating dark walnut console                  | 110 W×18 D×12 H                                                 | x181..199,y6..116,z9..21; removable service back at y63,z16                        |
| Soundbar resting ON console                   | 48 W×5 D×3 H                                                    | x186..191,y37..85,z21..24                                                          |
| Cognac leather sofa, straight, low broad arms | 116 long×42 deep×32 high                                        | x40..82,y42..158,z0..32; faces east; seat eye approx x70; no chaise                |
| Dark walnut low coffee table, rounded corners | 30×48×14                                                        | x104..134,y74..122,z0..14                                                          |
| Rust/olive tactile wool rug                   | 144 east-west×120 north-south×0.4                               | x30..174,y40..160,z0..0.4                                                          |
| Dark walnut side table                        | 16×16×21                                                        | x90..106,y136..152,z0..21                                                          |
| Brass side-table lamp, warm2700K              | 14 diameter×22 high, all shade/base inside envelope             | center(98,144),x91..105,y137..151,z21..43                                          |
| Brass small console lamp, warm2700K           | 8 diameter×22 high                                              | center(190,12),x186..194,y8..16,z21..43                                            |
| Tall bounded ficus, terracotta pot            | pot18 diameter×20 high; foliage maximum28 diameter,total78 high | center(158,20); pot x149..167,y11..29,z0..20; all foliage x144..172,y6..34,z20..78 |
| Small console fern, terracotta pot            | pot6 diameter×6; all foliage10 diameter,total14 high            | center(190,110); foliage x185..195,y105..115,z21..35                               |
| Olive sofa cushion                            | 22×8×22                                                         | x48..70,y54..62,z18..40                                                            |
| Rust sofa cushion                             | 22×8×22                                                         | x48..70,y89..97,z18..40                                                            |
| Olive sofa cushion                            | 22×8×22                                                         | x48..70,y134..142,z18..40                                                          |
| Coffee table dark tray                        | 14×18×1                                                         | x112..126,y88..106,z14..15; no other table objects                                 |
| Olive mineral plaster east wall               | 122×115,negligible finish thickness                             | x199,y0..122,z5..120 except oak below; fixtures exposed                            |
| Selective honey oak east strip                | 16 W×115 H×0.5                                                  | x198.5..199,y0..16,z5..120; no overlap TV or controls                              |
| Honey oak southeast return                    | 56 W×115 H×0.5                                                  | x143..199,y0..0.5,z5..120, ends at existing glass boundary                         |

No extra chair, floor lamp, curtains, art, book stacks, dining furniture, fireplace or other added objects. Existing fan/pendants/island/balcony objects retain reference locations; their unsurveyed dimensions are not invented.

## Fit validation before generation 1

- TV margins (122−85.8)/2=18.1 each; console margins(122−110)/2=6 each. TV height27..75 below alarm105; switch115.5 beyond screen103.9, horizontal separation11.6. Wood strip ends16, screen begins18.1:2.1 gap.
- Console top21; soundbar top24; TV bottom27:3 clear. Bar rests on console, no wall floating bar. Console lamp stops y16, screen starts18.1:2.1 gap. Fern starts105, TV ends103.9:1.1 gap. Installation access at data/outlet must be provided through removable console back.
- Sofa front82 to table104=22; table134 to console181=47. Seat eye x70 to wall199=129 (10ft9), to screen face195=125 design allowance.
- North sofa end158 to traced island south195.4=37.4; narrower than46 to tape boundary204. Side table north152 and rug160 leave43.4 and35.4 respectively, rug is flat, not standing obstruction. Console/office route x163..199,y>122 remains36 wide. Turn access x134..181 beside table is47; above table y122 full route open except side table ending106.
- Sofa south42 to column north36.8=5.2 separation, not a circulation aisle. Column rear-west edge47.8 and sofa back40 allow west route x0..40 beside sofa; use west bypass, not5.2-inch slot. Column-to-glass narrows to47.8 at column center. West door y144..184 is clear x0..40, swings outward; no plant/lamp blocks it.
- Ficus foliage ends y34 before rug40 (6); x172 before console181 (9); clear TV plane195 by23 and glass y0 by6. Column east80.8 to plant west144=63.2.
- Sofa end158 to island37.4; side table east90 leaves8 from sofa82; shade stays within table footprint. All solid furniture boxes disjoint. Rug intentionally beneath sofa/table. Column and rug gap3.2. Paneling may not cover fixtures. Existing balcony swing exact position unknown, no changes proposed.
- Camera(95,190,62) looks at(105,70,45), rectilinear24mm landscape; just south of island195.4. Entire seating zone, south glazing and thick inset column left-rear, TV wall right, north-end recess at right foreground; small original island/pendant context can be cropped at top/near edge without moving anything.
- Numeric layout PASSES against measured spans and traced positions with stated uncertainties. No claim every route is36: rear slot5.2 intentionally bypassed. Exact door sweep, island offset, mullions, electrical/mount service and product dimensions require onsite/product confirmation.

## Visual QA

First pass inspected; corrected by revision 2 below. Final QA appears at the end.

## Revision 2 pre-generation validation and complete prompt

All immutable and furnishing dimensions above remain unchanged; no fit calculation changes. Revision corrects visual placement/scale only. Full repeated schedule and checks are included below.

REVISION 2, precise-object-edit of reference image1 (generated first pass). Preserve its beautiful olive/cognac/walnut/brass style and existing architectural topology. Correct the following deviations only while honoring ALL original dimensions below. Camera must be JUST SOUTH OF island, at (95,190,62): the island is BEHIND THE CAMERA; REMOVE the huge foreground island that obscures the view, do not delete or relocate the actual island from apartment. This reveals the 37.4-inch north approach. Move side table and its brass lamp to KITCHEN/NORTH END of sofa (foreground end), center98,144; do not leave table/lamp at south/column end. Console must be LOW: bottom9,top21 inches, only12 high; soundbar on top21..24, massive TV bottom27 top75. Do not raise console or screen. Keep other dimensions. No honey oak portal framing office; keep oak only16-inch south-end strip and56-inch southeast return. Office door on RECESSED CROSS WALL north of122-inch wall, not on same plane as TV wall. Room only199×204, do not enlarge. Reference2 is floorplan topology, reference3 actual shell, reference4 kitchen context. Original complete dimension schedule, numerical validation and visual direction:

Use case: photorealistic-natural. Create ONE landscape photorealistic furnished living room interior, Olive and cognac direction. Input image1 floorplan is topology reference only, tape schedule overrides printed plan sizes. Image2 original empty living-room photo is architectural shell reference: retain actual concrete column, black glazing, fan, white ceiling, pale wood floor, balcony topology and skyline. Image3 kitchen photo is context for unchanged island finishes. Reconstruct this actual modest apartment, not a generic enlarged luxury room. Camera from kitchen side facing south, TV wall RIGHT, west glazing LEFT, south glazing rear. Show whole seating arrangement proportionally. Critically TV wall is only122 inches, NOT12 feet. Massive98-inch TV fills70.3% of wall width; console fills90.2%. North end steps back to recessed office access, actual door on cross wall beyond TV wall, never a hole through TV wall. Column is33-inch diameter, inset47.8 inches at closest west edge, prominent left-rear and separated from glass. ONLY balcony door is west/kitchen side, no south door. South southeast opaque return must remain. Do not mirror room.

Expressive warm modern interior: rich muted olive green mineral plaster, selective honey oak (only scheduled strips/return), long generous cognac leather sofa with broad arms, dark walnut low table and floating console, rust/olive textured wool rug, bounded lush plants, sculptural brass warm2700K lamps. Retain original white ceiling/fan and floor. Warm evening daylight balanced with lamps, tactile lived-in materials, architectural editorial photograph, no beige wash, no fantasy remodeling. TV is off dark subtly reflective, no artwork replacing screen. Soundbar physically rests ON console. No extra furnishings beyond schedule. No labels, text, dimensions, collage or watermark. Preserve proportions over dramatic styling. Recess and west access may be near frame edge but preserve topology. Full fixed geometry and added-item dimension schedule and fit checks follow; honor every constraint:

# Olive and cognac — measured living room

## Sources and status

Read shared-geometry.md in full first, README.md measured dimensions, and apps/ui/src/lib/floorplan.ts. Inspected original floorplan-b4.jpg (topology), living-room-island-corner-windows.jpg (shell, glazing, column, floor, fan), kitchen-oven-wall.jpg (kitchen context) using view_image. No earlier concepts used. Coordinates are inches: southwest interior glass corner (0,0,0); east +x, north +y, up +z. This is a proposed furnishing layout using measured spans and approximate traced positions, not a survey or installation drawing. All added furniture is generic/custom proposed size, not a verified product.

## Immutable dimension schedule

- Room x0..199, y0..204: tape-measured 199 ×204. Ceiling z120 is same-stack listing evidence, not taped. Existing white ceiling, fan, pale wood floor, black glazing frames retained.
- East TV wall x199, y0..122, z0..120: taped 122 wide; not 144. Baseboard z0..5.
- Switch y115.5, bottom z45: measured 6.5 from north end. Alarm approximately y94,z105: measured approximate 28 from north end. Outlet/data approximately y63,z16: measured approximate. All retained; console has accessible removable rear service opening at outlet, no finish conceals controls.
- West glazing x0. Only balcony door is west at approximate y144..184 (40.5 traced width), outward swing. Exact mullions/leaf dimensions unknown; preserve reference topology.
- South glass y0,x0..approximately143, opaque southeast return x143..199 (traced). No south door or glass behind TV wall.
- Column diameter33 measured; traced center(64.3,20.3), radius16.5; limits x47.8..80.8,y3.8..36.8. README's 45 from west glass does not specify center/edge; no inferred interpretation claimed. Keep exposed concrete, inset from glass.
- Island measured71×41; approximate trace x78.5..149.4,y195.4..236.5; z36 nominal modeled. Trace span rounding is70.9×41.1. Tape living boundary and trace boundary differ about9; exact setback unknown. README13ft3 north of column has unspecified endpoints. Do not move island or pendants.
- Office access is beyond north end of TV wall, on recessed cross-wall near y133.7; traced door gap592..663 on y641. Exact recess/door size unknown. Keep x163..199 clear above y122; no opening cut into TV wall.
- Balcony west of glass: nominal listing61×206; original railing and outdoor swing retained, exact furniture footprint unknown. Adjacent rooms unchanged.
- README kitchen11ft7×7ft10 and adjacent room dimensions are context, not a reason to alter shell. Stud end reference/spacing ambiguous; mounting requires onsite verification.

## Every added item and finish

| Item                                          | Dimensions                                                      | Position / elevation                                                               |
| --------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Wall TV, 98-inch 16:9                         | 85.8 W×48 H;4 mount/thickness allowance, not product spec       | x195..199,y18.1..103.9,z27..75; center y61,z51; no stand                           |
| Floating dark walnut console                  | 110 W×18 D×12 H                                                 | x181..199,y6..116,z9..21; removable service back at y63,z16                        |
| Soundbar resting ON console                   | 48 W×5 D×3 H                                                    | x186..191,y37..85,z21..24                                                          |
| Cognac leather sofa, straight, low broad arms | 116 long×42 deep×32 high                                        | x40..82,y42..158,z0..32; faces east; seat eye approx x70; no chaise                |
| Dark walnut low coffee table, rounded corners | 30×48×14                                                        | x104..134,y74..122,z0..14                                                          |
| Rust/olive tactile wool rug                   | 144 east-west×120 north-south×0.4                               | x30..174,y40..160,z0..0.4                                                          |
| Dark walnut side table                        | 16×16×21                                                        | x90..106,y136..152,z0..21                                                          |
| Brass side-table lamp, warm2700K              | 14 diameter×22 high, all shade/base inside envelope             | center(98,144),x91..105,y137..151,z21..43                                          |
| Brass small console lamp, warm2700K           | 8 diameter×22 high                                              | center(190,12),x186..194,y8..16,z21..43                                            |
| Tall bounded ficus, terracotta pot            | pot18 diameter×20 high; foliage maximum28 diameter,total78 high | center(158,20); pot x149..167,y11..29,z0..20; all foliage x144..172,y6..34,z20..78 |
| Small console fern, terracotta pot            | pot6 diameter×6; all foliage10 diameter,total14 high            | center(190,110); foliage x185..195,y105..115,z21..35                               |
| Olive sofa cushion                            | 22×8×22                                                         | x48..70,y54..62,z18..40                                                            |
| Rust sofa cushion                             | 22×8×22                                                         | x48..70,y89..97,z18..40                                                            |
| Olive sofa cushion                            | 22×8×22                                                         | x48..70,y134..142,z18..40                                                          |
| Coffee table dark tray                        | 14×18×1                                                         | x112..126,y88..106,z14..15; no other table objects                                 |
| Olive mineral plaster east wall               | 122×115,negligible finish thickness                             | x199,y0..122,z5..120 except oak below; fixtures exposed                            |
| Selective honey oak east strip                | 16 W×115 H×0.5                                                  | x198.5..199,y0..16,z5..120; no overlap TV or controls                              |
| Honey oak southeast return                    | 56 W×115 H×0.5                                                  | x143..199,y0..0.5,z5..120, ends at existing glass boundary                         |

No extra chair, floor lamp, curtains, art, book stacks, dining furniture, fireplace or other added objects. Existing fan/pendants/island/balcony objects retain reference locations; their unsurveyed dimensions are not invented.

## Fit validation before generation 1

- TV margins (122−85.8)/2=18.1 each; console margins(122−110)/2=6 each. TV height27..75 below alarm105; switch115.5 beyond screen103.9, horizontal separation11.6. Wood strip ends16, screen begins18.1:2.1 gap.
- Console top21; soundbar top24; TV bottom27:3 clear. Bar rests on console, no wall floating bar. Console lamp stops y16, screen starts18.1:2.1 gap. Fern starts105, TV ends103.9:1.1 gap. Installation access at data/outlet must be provided through removable console back.
- Sofa front82 to table104=22; table134 to console181=47. Seat eye x70 to wall199=129 (10ft9), to screen face195=125 design allowance.
- North sofa end158 to traced island south195.4=37.4; narrower than46 to tape boundary204. Side table north152 and rug160 leave43.4 and35.4 respectively, rug is flat, not standing obstruction. Console/office route x163..199,y>122 remains36 wide. Turn access x134..181 beside table is47; above table y122 full route open except side table ending106.
- Sofa south42 to column north36.8=5.2 separation, not a circulation aisle. Column rear-west edge47.8 and sofa back40 allow west route x0..40 beside sofa; use west bypass, not5.2-inch slot. Column-to-glass narrows to47.8 at column center. West door y144..184 is clear x0..40, swings outward; no plant/lamp blocks it.
- Ficus foliage ends y34 before rug40 (6); x172 before console181 (9); clear TV plane195 by23 and glass y0 by6. Column east80.8 to plant west144=63.2.
- Sofa end158 to island37.4; side table east90 leaves8 from sofa82; shade stays within table footprint. All solid furniture boxes disjoint. Rug intentionally beneath sofa/table. Column and rug gap3.2. Paneling may not cover fixtures. Existing balcony swing exact position unknown, no changes proposed.
- Camera(95,190,62) looks at(105,70,45), rectilinear24mm landscape; just south of island195.4. Entire seating zone, south glazing and thick inset column left-rear, TV wall right, north-end recess at right foreground; small original island/pendant context can be cropped at top/near edge without moving anything.
- Numeric layout PASSES against measured spans and traced positions with stated uncertainties. No claim every route is36: rear slot5.2 intentionally bypassed. Exact door sweep, island offset, mullions, electrical/mount service and product dimensions require onsite/product confirmation.

## Final visual QA — saved deliverable

- Native image_gen used twice: initial design and one targeted correction. ONE selected final deliverable, concept.png, 1536×1024 RGB PNG. Both full prompts and their preceding dimension schedules/checks are preserved above. Final source: exec-4899f9f6-15f7-4982-8b14-7770a643dc6c.png. Copied into assigned directory and reopened with view_image; pixel dimensions checked with sips.
- Visual result passes the expressive palette brief: olive plaster, honey oak accents, generous cognac sofa, dark walnut coffee table/console, rust-olive rug, two brass lamps, bounded plants and warm lighting. No generic beige refurnishing.
- Architecture topology visually retained: black west glazing with balcony access on left; south glazing behind seating; substantial exposed concrete column inset from glass; white ceiling/fan and pale wood flooring; opaque southeast return; TV wall on right ending at a north recess with a door beyond it. No invented south balcony door, fireplace or extra chair.
- Correction improved the north approach visibility by removing foreground island occlusion (camera south of existing island, NOT a proposed island removal), moved sofa-side lamp/table to the north end, and lowered the floating console/screen composition. Soundbar visibly rests ON console. Large screen occupies approximately the intended fraction of TV wall, not a tiny screen on an enlarged 12-foot wall.
- Numeric proposed layout PASSES the schedule:37.4 sofa/island,22 sofa/table,47 table/console,40 west route,36 office route; rear5.2 slot explicitly is not circulation. TV18.1 and console6 end margins; soundbar/screen3. Solid furniture envelopes do not collide. This validates proposed coordinates, NOT AI pixel fidelity.
- Residual visual deviations: an unwanted honey oak vertical trim persists at the north/recess edge even though scheduled oak is south-end strip/return only; recess depth and door orientation remain visually ambiguous from this single perspective, so exact surveyed office topology is NOT certified. Sofa-side table appears closely abutting the sofa rather than reliably showing the scheduled8-inch gap. Some panel/sofa/table shapes and cushion arrangements are approximate. TV and console appear lower after revision, but exact z27 TV bottom and z21 console top cannot be proven photographically. Rug/sofa footprint,33-inch column diameter and122-inch wall width cannot be metrically certified from generated pixels. Original mullion arrangement is approximate; no exact mullion measurements exist. Ficus crown size/placement is visually approximate; its requested envelope governs any real procurement/layout.
- Island is out of final frame, so the37.4 north clearance is calculated against its traced south face195.4, not verified by render. Original pendants remain; their exact projected positions/camera-lens relation are approximate. No claim of an actual surveyed camera reconstruction.
- Outcome: completed style concept with checked numerical furnishing fit and documented visual residuals; NOT construction documentation, proof of installation feasibility, or an exact measured rendering. Confirm island setback, door leaf/recess, mounting/stud locations and product sizes onsite before ordering/installing. No app code, shared files, git index, commits or pushes changed.
