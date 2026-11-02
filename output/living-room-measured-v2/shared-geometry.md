# Fixed geometry and generation protocol

Read README.md lines 25–43, apps/ui/src/lib/floorplan.ts and inspect the three original reference JPEGs before designing. Tape measurements supersede listing text and earlier concept prompts. Do not use output/living-room-concepts as a geometry reference.

## Coordinate system

All numbers below are inches. Origin is southwest interior glass corner at floor. x increases east toward TV wall; y increases north toward kitchen; z is height. Kitchen-side view looks south/southeast; TV wall is image right, west glazing image left, south glazing rear. These are furnishing coordinates derived from measured dimensions plus traced positions, not a certified survey.

## Immutable elements

- Living area: x=0..199 (16 ft 7), y=0..204 (17 ft), ceiling z=120. Measured room spans; ceiling 120 documented from same-stack B4 listings, not taped onsite. Preserve existing white ceiling, fan, flooring, black glazing framing.
- East TV wall: x=199, y=0..122, z=0..120; tape-measured uninterrupted wall 122 wide, NOT 12 feet! Its north end is adjacent to the recessed office/bedroom access. Baseboard 5 high.
- East wall light switch: 6.5 from hallway/north end => y=115.5; bottom z=45. Smoke alarm about 28 from north end => y=94, z=105. Data/outlet about 63 from south/window end => y=63, z=16. These must remain accessible; panels cannot conceal switch or smoke alarm.
- West glazing: x=0, south corner up to kitchen-side balcony access. In normalized trace, west balcony door lies approximately y=144..184 (80 trace px /23.7*12 =40.5 wide), outward swing onto balcony. Never add a balcony door in south glass. Exact mullions and door measurements unavailable; retain topology and use photos.
- South wall: y=0, glass from x=0 to about143; opaque southeast return about x=143..199. These endpoints are traced, not tape-measured. Do not extend glass behind TV wall or erase opaque return.
- Round concrete column: diameter33 measured. Traced center approximately x=64.3,y=20.3 (trace307,865 relative180,905 at23.7px/ft); radius16.5. README also says 45 from west glass without naming center or edge; do NOT present an inferred edge interpretation as a measurement. Use the traced center for this round, disclose uncertainty. Column north edge y=36.8, west edge47.8, east80.8. Preserve thick exposed column in rear left, inset from glass.
- Kitchen island: 71x41 measured, counter z36 nominal modeled. Trace location maps roughly x=78.5..149.4,y=195.4..236.5 (origin trace180,905, scale23.7px/ft). Living room north span uses end of kitchen counter, so model boundary and tape boundary differ about9 inches here; do not assert exact island setback. README states island13ft3 north of column with endpoints unspecified. Preserve existing island and pendants; camera can be just south of island looking into room so island need not obscure furniture. Never move island to improve composition.
- Bedroom/office access north of TV wall: actual door on cross-wall in recessed area, NOT a new doorway cut into 122-inch TV wall. Trace east recess extends beyond x199, door gap at trace592..663 on y641. Access approximately y=133.7 north of south glass; preserve north-side access and keep x163..199 clear above y122. No new door in south glass.
- Balcony west of glass:61 wide x206 long nominal listing dimensions, original railing and outdoor swing. Adjacent rooms stay unchanged.

## Common furniture targets, adjustable only with recalculated checks

- Wall-mounted 98-inch 16:9 TV:85.8 W x48 H, along y-axis on east wall, centered y61; y18.1..103.9. Bottom z27, top75, center51. Model thickness/mount allowance4 is a design allowance, not verified product spec. No stand.
- Floating console:110 W along y x18 D x12 H; x181..199,y6..116,z9..21. Soundbar48 W x5 D x3 H, centered y61, rests ON console, z21..24. TV bottom27 leaves3 clear above soundbar. Console end clearance6; switch above console and outside TV footprint.
- Big sofa: target120 long north-south x42 deep, footprint x40..82,y44..164; faces east. Seat eyes around x70 yields129 inches /10ft9 to screen wall. Optional kitchen-side chaise only, max extent x104,y128..164. Do not silently use an imported sofa with different dimensions. These are proposed custom/generic furniture sizes.
- Example coffee table: x104..134,y74..122 =>30x48. 22 clearance from sofa front,47 from console front. Chaise north edge does not overlap this table (6 gap in y if starts128).
- Example rug120x144: x30..174,y40..160, flat under furniture. No collision with column top36.8.
- Tall plant suggestion: pot18 diameter centered x176,y22, foliage kept off TV. Second small plant can rest on console only if soundbar and screen remain clear, or fit floor elsewhere with explicit dimensions.
- No extra chair unless its full footprint and circulation demonstrably fit. No fireplace, invented wall, invented windows, island relocation or architectural enlargement.

## Validation before EVERY generation call

Write concept.md FIRST, listing EVERY fixed element above with measured/traced/unknown status, then enumerate ALL proposed furnishings, wood treatments, lamps and plants with dimensions, coordinates and elevations. State camera position/lens. Calculate TV margins, console margins, TV/soundbar clearance, sofa-to-table gap, north approach, west route (column narrows x0..47.8 in rear), office route and collision checks. North approach must be evaluated against island southern face195.4, NOT just204: sofa end164 gives31.4, so move sofa south or shorten it if this route needs36. A120 sofa y39..159 gives36.4 to island but only2.2 to column north edge; west circulation can bypass column at x0..40. Better choose116 sofa y42..158 leaves37.4 to island and5.2 to column; still big9ft8. Deliberately solve tradeoffs rather than claiming36 everywhere. Exact mullions, door leaf and island offsets are unverified; report honestly.

Before generating, send a user-facing commentary summarizing immutable dimensions, enumerating furnishings with positions/dimensions, and clearance validation. Include FULL dimension schedule and constraints in image prompt. Read imagegen skill /Users/stefan/.codex/skills/.system/imagegen/SKILL.md. Use native image_gen only, view_image original local files before passing referenced_image_paths. Input roles explicit: floorplan topology; living room photo shell; kitchen photo context. Create one landscape photorealistic image with warm2700K lights, massive correctly scaled TV, couch, modern furniture, plants, wood panel treatment and floating console with soundbar. Camera from kitchen side around x95,y190,z62 looking at x105,y70,z45, wide rectilinear24–28mm, TV wall right and column left-rear. Preserve proportions over dramatic styling. Not a collage, no labels in render.

Save final PNG, full final prompt and pre-generation schedule into your assigned output directory. Inspect result with view_image; compare architecture to references and size targets. Correct major topology errors using a new generation only AFTER writing updated dimension checks first. Be candid about residual AI geometry drift; never assert exactness on visual evidence alone. If native tool fails, report; no CLI fallback. Do not edit app code, placements, other designs, shared files, git index or commit/push. Parent handles commit. Do not spawn children.
