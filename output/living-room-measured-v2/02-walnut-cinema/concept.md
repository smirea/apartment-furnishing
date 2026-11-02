# Walnut cinema — pre-generation dimension schedule

All coordinates inches; southwest interior glass corner is (0,0,0), x east, y north, z up. Furniture dimensions are design proposals, not purchased product specifications.

## Immutable shell and evidence

Read shared-geometry.md in full, README measured dimensions, floorplan.ts and inspected the original floorplan, living-room-island-corner-windows.jpg and kitchen-island-and-fridge.jpg.

- Room measured x0..199 by y0..204. Ceiling z120 from same-stack listings, not tape. Preserve white ceiling, original fan, pale oak floor, black glazing, existing island and pendants.
- East TV wall x199, y0..122, z0..120, tape measured 122 inches (10ft2), never 144 inches. Baseboard z0..5.
- Switch y115.5, bottom z45; smoke alarm approximately y94,z105; outlet/data approximately y63,z16. Keep switch and alarm visible, accessible; console removable cable-access panel to outlet.
- West glazing x0; ONLY balcony door approximately y144..184, about40.5 wide from trace, swings outward. Exact leaf and mullions unknown. No south door.
- South glass y0,x0..approximately143; opaque southeast return x143..199. Traced endpoints, retain topology.
- Exposed concrete column diameter33 taped, center approximately(64.3,20.3) traced. Bounds x47.8..80.8,y3.8..36.8. README's 45-inch west distance has unspecified endpoints; not used as a surveyed center/edge. Preserve original inset.
- Island71x41 taped; trace bounds x78.5..149.4,y195.4..236.5; counter z36 nominal. About9-inch discrepancy between modeled and tape living boundary; 159-inch column/island separation has unspecified endpoints. No relocation.
- Office entry on north cross-wall in recess beyond x199, approximately y133.7 from trace. Door gap trace592..663,y641. Never cut door in TV wall. Keep x163..199 above y122 clear.
- Balcony west, nominal61x206 from listing, preserve railing/outdoor swing; adjacent rooms unchanged.
- Ceiling fan and pendant dimensions/positions not surveyed: preserve appearance and location from reference, do not invent surveyed dimensions.

## Every addition

| Item                                                                                                                                                                                                                                                       | Dimensions                                                 | Bounds/position                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Wall TV98-inch diagonal, no stand                                                                                                                                                                                                                          | 85.8 along y x48 high; mount allowance4 deep               | x195..199,y18.1..103.9,z27..75; center y61,z51                                            |
| Floating walnut console                                                                                                                                                                                                                                    | 110 along y x18 deep x12 high                              | x181..199,y6..116,z9..21                                                                  |
| Soundbar, ON console                                                                                                                                                                                                                                       | 48 along y x5 deep x3 high                                 | x185..190,y37..85,z21..24                                                                 |
| Low charcoal sofa, no chaise                                                                                                                                                                                                                               | 116 along y x42 deep x30 overall high; seat17              | x40..82,y42..158,z0..30, faces east                                                       |
| Smoked-glass coffee table, bronze frame                                                                                                                                                                                                                    | 30 x48 x14 high                                            | x104..134,y74..122,z0..14                                                                 |
| Warm greige flat rug                                                                                                                                                                                                                                       | 120 x144 x0.25                                             | x30..150,y40..184,z0..0.25                                                                |
| Walnut flat veneer panels, deliberate vertical bookmatched grain                                                                                                                                                                                           | 122 along y x115 high x0.75 nominal thick                  | x198.25..199,y0..122,z5..120; fit around switch/alarm, retain visible devices; no slats   |
| Concealed LED under console                                                                                                                                                                                                                                | 108 long x0.3 wide,2700K                                   | x183,y7..115,z9                                                                           |
| Concealed upper panel wash LED                                                                                                                                                                                                                             | 120 long x0.3 wide,2700K                                   | x198,y1..121,z119, directed onto walnut; no ceiling rebuild                               |
| Tall plant, bronze pot                                                                                                                                                                                                                                     | pot18 diameter x18 high; foliage24 diameter x66 total high | center(170,22); pot x161..179,y13..31; foliage x158..182,y10..34,z18..66, kept off screen |
| Sofa cushions, two charcoal/tobacco                                                                                                                                                                                                                        | 20 x6 x20 each                                             | x43..63,y55..61,z17..37 and x43..63,y137..143,z17..37, contained over sofa                |
| Folded tobacco throw                                                                                                                                                                                                                                       | 24 x18 x1                                                  | x48..72,y112..130,z18..19, on sofa                                                        |
| No other added furniture, lamps, speakers, chairs, shelves, ornaments or architectural features. Bronze accents are table frame and plant pot. All panel and lighting projections included as design allowances, not surveyed construction specifications. |

## Numeric fit checks

- TV end margins=(122-85.8)/2=18.1 each; console end margins=(122-110)/2=6.
- TV bottom27 minus soundbar top24 =3; console top21 supports soundbar bottom21. TV top75 leaves45 to ceiling. Console lower edge9 clears5 baseboard.
- Sofa front82 to table104=22; table134 to console181=47. Sofa-to-console99; table ends y74..122 stay within sofa y42..158.
- North approach: island southern face195.4 minus sofa north158=37.4 inches (not falsely using room boundary204). No chaise. Island-to-rug11.4 is a flat rug edge, not obstruction.
- Column north36.8 to sofa south42=5.2 minimum projected separation, NOT a circulation aisle. Column center-to-nearest sofa point21.7 minus radius16.5=5.2.
- West balcony route x0..40 behind sofa=40 inches; rear column restricts x0..47.8, still a40-inch continuous route through x0..40; sofa does not obstruct west door y144..184. Exact handle/leaf clearance unverified.
- Office approach x163..199,y>122 is36 wide and empty. Along island east149.4 to wall199=49.6. Plant foliage y<=34 and console y<=116 do not enter office route.
- Rug south40 minus column north36.8=3.2; rug is flat; table/rug inside room. Plant pot east179 to console front181=2 at shared y13..31, no solid collision. Foliage overlaps console envelope by1 inch but is above console top21 where relevant; trim foliage to x<=180 below z24; no screen overlap because screen y>=18.1,z>=27 and foliage x<=182 while screen x>=195.
- Sofa eye x70 to screen front195 approximately125 inches (10ft5), or129 inches to wall; proposed eye elevation40. Camera eye separate.
- Panels require field cutouts around existing fixtures; outlet accessed behind removable console panel. Actual installation, electrical clearances and exact product sizes require site confirmation.
- No floor-object collisions in proposed footprints. These checks validate the plan, not generated pixel geometry.

## Camera

Kitchen-side position(95,190,62), looking at(105,70,45), rectilinear24mm. Whole room proportionally, TV wall image right, column left rear, west glass image left, south glass rear. Island is behind camera, retain it without moving it; do not force it into foreground. Recess at right edge should remain legible if within field of view.

## Full generation prompt

```text
Use case: photorealistic-natural. Create ONE landscape photorealistic architectural interior photograph: Walnut cinema, furnishing this exact Vesper B4 apartment. Rich flat walnut veneer panels with deliberate large vertical grain, huge98-inch wall-mounted television, low large charcoal sofa, smoked glass low coffee table with bronze frame, restrained2700K indirect lighting, warm greige rug, plant in bronze pot. Cozy sophisticated modern cinema, softly illuminated daylight dusk, pale wood floor and white ceiling remain light, never black cave. TV shows subdued cinematic landscape without text. No labels, collage, people or watermark.
Input images: image1 original floorplan is TOPOLOGY reference, never copy staged furniture; image2 living room photo is SHELL reference for original glazing, inset thick round concrete column, pale floor, white ceiling and fan; image3 kitchen photo is CONTEXT reference for original island and pendants, behind camera. Reorient camera to kitchen side looking south/southeast; TV wall on image RIGHT, west glazing LEFT and south glazing REAR. Preserve shell aggressively. This is a small measured16ft7 by17ft room, not a showroom. Do not enlarge short122-inch TV wall to12ft. Television width is70.3% of that wall; console90.2%. Column thick33-inch diameter and inset, not attached to a mullion. Office door is in recessed north cross-wall beyond end of TV wall, never a door in the TV wall; south glass has NO balcony door; only west glazing has balcony door. South glass stops before opaque southeast return. Keep existing island fixed behind camera; no new island, fireplace, doors or windows.
FULL IMMUTABLE DIMENSIONS AND PROPOSED ITEMS, fit checks and camera follow. Follow every dimension; render no measurement marks:
# Walnut cinema — pre-generation dimension schedule

All coordinates inches; southwest interior glass corner is (0,0,0), x east, y north, z up. Furniture dimensions are design proposals, not purchased product specifications.

## Immutable shell and evidence
Read shared-geometry.md in full, README measured dimensions, floorplan.ts and inspected the original floorplan, living-room-island-corner-windows.jpg and kitchen-island-and-fridge.jpg.
- Room measured x0..199 by y0..204. Ceiling z120 from same-stack listings, not tape. Preserve white ceiling, original fan, pale oak floor, black glazing, existing island and pendants.
- East TV wall x199, y0..122, z0..120, tape measured 122 inches (10ft2), never 144 inches. Baseboard z0..5.
- Switch y115.5, bottom z45; smoke alarm approximately y94,z105; outlet/data approximately y63,z16. Keep switch and alarm visible, accessible; console removable cable-access panel to outlet.
- West glazing x0; ONLY balcony door approximately y144..184, about40.5 wide from trace, swings outward. Exact leaf and mullions unknown. No south door.
- South glass y0,x0..approximately143; opaque southeast return x143..199. Traced endpoints, retain topology.
- Exposed concrete column diameter33 taped, center approximately(64.3,20.3) traced. Bounds x47.8..80.8,y3.8..36.8. README's 45-inch west distance has unspecified endpoints; not used as a surveyed center/edge. Preserve original inset.
- Island71x41 taped; trace bounds x78.5..149.4,y195.4..236.5; counter z36 nominal. About9-inch discrepancy between modeled and tape living boundary; 159-inch column/island separation has unspecified endpoints. No relocation.
- Office entry on north cross-wall in recess beyond x199, approximately y133.7 from trace. Door gap trace592..663,y641. Never cut door in TV wall. Keep x163..199 above y122 clear.
- Balcony west, nominal61x206 from listing, preserve railing/outdoor swing; adjacent rooms unchanged.
- Ceiling fan and pendant dimensions/positions not surveyed: preserve appearance and location from reference, do not invent surveyed dimensions.

## Every addition
|Item|Dimensions|Bounds/position|
|---|---|---|
|Wall TV98-inch diagonal, no stand|85.8 along y x48 high; mount allowance4 deep|x195..199,y18.1..103.9,z27..75; center y61,z51|
|Floating walnut console|110 along y x18 deep x12 high|x181..199,y6..116,z9..21|
|Soundbar, ON console|48 along y x5 deep x3 high|x185..190,y37..85,z21..24|
|Low charcoal sofa, no chaise|116 along y x42 deep x30 overall high; seat17|x40..82,y42..158,z0..30, faces east|
|Smoked-glass coffee table, bronze frame|30 x48 x14 high|x104..134,y74..122,z0..14|
|Warm greige flat rug|120 x144 x0.25|x30..150,y40..184,z0..0.25|
|Walnut flat veneer panels, deliberate vertical bookmatched grain|122 along y x115 high x0.75 nominal thick|x198.25..199,y0..122,z5..120; fit around switch/alarm, retain visible devices; no slats|
|Concealed LED under console|108 long x0.3 wide,2700K|x183,y7..115,z9|
|Concealed upper panel wash LED|120 long x0.3 wide,2700K|x198,y1..121,z119, directed onto walnut; no ceiling rebuild|
|Tall plant, bronze pot|pot18 diameter x18 high; foliage24 diameter x66 total high|center(170,22); pot x161..179,y13..31; foliage x158..182,y10..34,z18..66, kept off screen|
|Sofa cushions, two charcoal/tobacco|20 x6 x20 each|x43..63,y55..61,z17..37 and x43..63,y137..143,z17..37, contained over sofa|
|Folded tobacco throw|24 x18 x1|x48..72,y112..130,z18..19, on sofa|
No other added furniture, lamps, speakers, chairs, shelves, ornaments or architectural features. Bronze accents are table frame and plant pot. All panel and lighting projections included as design allowances, not surveyed construction specifications.

## Numeric fit checks
- TV end margins=(122-85.8)/2=18.1 each; console end margins=(122-110)/2=6.
- TV bottom27 minus soundbar top24 =3; console top21 supports soundbar bottom21. TV top75 leaves45 to ceiling. Console lower edge9 clears5 baseboard.
- Sofa front82 to table104=22; table134 to console181=47. Sofa-to-console99; table ends y74..122 stay within sofa y42..158.
- North approach: island southern face195.4 minus sofa north158=37.4 inches (not falsely using room boundary204). No chaise. Island-to-rug11.4 is a flat rug edge, not obstruction.
- Column north36.8 to sofa south42=5.2 minimum projected separation, NOT a circulation aisle. Column center-to-nearest sofa point21.7 minus radius16.5=5.2.
- West balcony route x0..40 behind sofa=40 inches; rear column restricts x0..47.8, still a40-inch continuous route through x0..40; sofa does not obstruct west door y144..184. Exact handle/leaf clearance unverified.
- Office approach x163..199,y>122 is36 wide and empty. Along island east149.4 to wall199=49.6. Plant foliage y<=34 and console y<=116 do not enter office route.
- Rug south40 minus column north36.8=3.2; rug is flat; table/rug inside room. Plant pot east179 to console front181=2 at shared y13..31, no solid collision. Foliage overlaps console envelope by1 inch but is above console top21 where relevant; trim foliage to x<=180 below z24; no screen overlap because screen y>=18.1,z>=27 and foliage x<=182 while screen x>=195.
- Sofa eye x70 to screen front195 approximately125 inches (10ft5), or129 inches to wall; proposed eye elevation40. Camera eye separate.
- Panels require field cutouts around existing fixtures; outlet accessed behind removable console panel. Actual installation, electrical clearances and exact product sizes require site confirmation.
- No floor-object collisions in proposed footprints. These checks validate the plan, not generated pixel geometry.

## Camera
Kitchen-side position(95,190,62), looking at(105,70,45), rectilinear24mm. Whole room proportionally, TV wall image right, column left rear, west glass image left, south glass rear. Island is behind camera, retain it without moving it; do not force it into foreground. Recess at right edge should remain legible if within field of view.

## Full generation prompt

Produce a faithful, high quality landscape image using these dimensions, with flat walnut slab paneling (not fluted slats), visible large grain, floating console and soundbar clearly resting ON its top beneath the TV, ample reflected warm light, accurate compact room scale. Preserve original concrete column, glazing topology and distant cityscape. No extra furniture.
```

## Second-call full prompt (unchanged schedule revalidated before generation)

```text
Use case: precise-object-edit. Image1 is the EDIT TARGET Walnut cinema render. Images2/3/4 are original topology/shell/context references. Correct ONE architectural error: on the rear SOUTH wall, glass must END at x143 of the199-inch room width, leaving a56-inch OPAQUE WHITE SOUTHEAST RETURN between rear glass and the east walnut TV wall. This return is perpendicular to the walnut wall, behind the plant; clearly show a substantial white rear-wall section at the rear right, about28% of room width. Do not leave glass running all the way into walnut wall corner. Preserve remaining image and furnishings. Keep walnut TV wall only122 inches wide; do NOT widen it to compensate. Preserve north office recess and west-only balcony door, no south door. Preserve33-inch inset exposed column, white ceiling and original fan, pale floor. Do not move furniture or change scale. Same camera. Full unchanged dimension schedule and numeric fit checks follow:
# Walnut cinema — pre-generation dimension schedule

All coordinates inches; southwest interior glass corner is (0,0,0), x east, y north, z up. Furniture dimensions are design proposals, not purchased product specifications.

## Immutable shell and evidence
Read shared-geometry.md in full, README measured dimensions, floorplan.ts and inspected the original floorplan, living-room-island-corner-windows.jpg and kitchen-island-and-fridge.jpg.
- Room measured x0..199 by y0..204. Ceiling z120 from same-stack listings, not tape. Preserve white ceiling, original fan, pale oak floor, black glazing, existing island and pendants.
- East TV wall x199, y0..122, z0..120, tape measured 122 inches (10ft2), never 144 inches. Baseboard z0..5.
- Switch y115.5, bottom z45; smoke alarm approximately y94,z105; outlet/data approximately y63,z16. Keep switch and alarm visible, accessible; console removable cable-access panel to outlet.
- West glazing x0; ONLY balcony door approximately y144..184, about40.5 wide from trace, swings outward. Exact leaf and mullions unknown. No south door.
- South glass y0,x0..approximately143; opaque southeast return x143..199. Traced endpoints, retain topology.
- Exposed concrete column diameter33 taped, center approximately(64.3,20.3) traced. Bounds x47.8..80.8,y3.8..36.8. README's 45-inch west distance has unspecified endpoints; not used as a surveyed center/edge. Preserve original inset.
- Island71x41 taped; trace bounds x78.5..149.4,y195.4..236.5; counter z36 nominal. About9-inch discrepancy between modeled and tape living boundary; 159-inch column/island separation has unspecified endpoints. No relocation.
- Office entry on north cross-wall in recess beyond x199, approximately y133.7 from trace. Door gap trace592..663,y641. Never cut door in TV wall. Keep x163..199 above y122 clear.
- Balcony west, nominal61x206 from listing, preserve railing/outdoor swing; adjacent rooms unchanged.
- Ceiling fan and pendant dimensions/positions not surveyed: preserve appearance and location from reference, do not invent surveyed dimensions.

## Every addition
|Item|Dimensions|Bounds/position|
|---|---|---|
|Wall TV98-inch diagonal, no stand|85.8 along y x48 high; mount allowance4 deep|x195..199,y18.1..103.9,z27..75; center y61,z51|
|Floating walnut console|110 along y x18 deep x12 high|x181..199,y6..116,z9..21|
|Soundbar, ON console|48 along y x5 deep x3 high|x185..190,y37..85,z21..24|
|Low charcoal sofa, no chaise|116 along y x42 deep x30 overall high; seat17|x40..82,y42..158,z0..30, faces east|
|Smoked-glass coffee table, bronze frame|30 x48 x14 high|x104..134,y74..122,z0..14|
|Warm greige flat rug|120 x144 x0.25|x30..150,y40..184,z0..0.25|
|Walnut flat veneer panels, deliberate vertical bookmatched grain|122 along y x115 high x0.75 nominal thick|x198.25..199,y0..122,z5..120; fit around switch/alarm, retain visible devices; no slats|
|Concealed LED under console|108 long x0.3 wide,2700K|x183,y7..115,z9|
|Concealed upper panel wash LED|120 long x0.3 wide,2700K|x198,y1..121,z119, directed onto walnut; no ceiling rebuild|
|Tall plant, bronze pot|pot18 diameter x18 high; foliage24 diameter x66 total high|center(170,22); pot x161..179,y13..31; foliage x158..182,y10..34,z18..66, kept off screen|
|Sofa cushions, two charcoal/tobacco|20 x6 x20 each|x43..63,y55..61,z17..37 and x43..63,y137..143,z17..37, contained over sofa|
|Folded tobacco throw|24 x18 x1|x48..72,y112..130,z18..19, on sofa|
No other added furniture, lamps, speakers, chairs, shelves, ornaments or architectural features. Bronze accents are table frame and plant pot. All panel and lighting projections included as design allowances, not surveyed construction specifications.

## Numeric fit checks
- TV end margins=(122-85.8)/2=18.1 each; console end margins=(122-110)/2=6.
- TV bottom27 minus soundbar top24 =3; console top21 supports soundbar bottom21. TV top75 leaves45 to ceiling. Console lower edge9 clears5 baseboard.
- Sofa front82 to table104=22; table134 to console181=47. Sofa-to-console99; table ends y74..122 stay within sofa y42..158.
- North approach: island southern face195.4 minus sofa north158=37.4 inches (not falsely using room boundary204). No chaise. Island-to-rug11.4 is a flat rug edge, not obstruction.
- Column north36.8 to sofa south42=5.2 minimum projected separation, NOT a circulation aisle. Column center-to-nearest sofa point21.7 minus radius16.5=5.2.
- West balcony route x0..40 behind sofa=40 inches; rear column restricts x0..47.8, still a40-inch continuous route through x0..40; sofa does not obstruct west door y144..184. Exact handle/leaf clearance unverified.
- Office approach x163..199,y>122 is36 wide and empty. Along island east149.4 to wall199=49.6. Plant foliage y<=34 and console y<=116 do not enter office route.
- Rug south40 minus column north36.8=3.2; rug is flat; table/rug inside room. Plant pot east179 to console front181=2 at shared y13..31, no solid collision. Foliage overlaps console envelope by1 inch but is above console top21 where relevant; trim foliage to x<=180 below z24; no screen overlap because screen y>=18.1,z>=27 and foliage x<=182 while screen x>=195.
- Sofa eye x70 to screen front195 approximately125 inches (10ft5), or129 inches to wall; proposed eye elevation40. Camera eye separate.
- Panels require field cutouts around existing fixtures; outlet accessed behind removable console panel. Actual installation, electrical clearances and exact product sizes require site confirmation.
- No floor-object collisions in proposed footprints. These checks validate the plan, not generated pixel geometry.

## Camera
Kitchen-side position(95,190,62), looking at(105,70,45), rectilinear24mm. Whole room proportionally, TV wall image right, column left rear, west glass image left, south glass rear. Island is behind camera, retain it without moving it; do not force it into foreground. Recess at right edge should remain legible if within field of view.


Preserve photo quality, warm2700K lighting, walnut grain, flat panels, charcoal sofa, bronze glass table. No extra objects or labels.
```

## Visual QA

First image inspected: style and soundbar placement pass; major deviation is missing opaque southeast return. Targeted correction planned. All dimensions, placements and fit checks above revalidated unchanged before second call. Camera unchanged. Exact rendered geometry cannot be certified from perspective.

## Final visual QA and limitations

- Native image_gen used twice: original generation and one targeted architectural correction. Final selected image is concept.png, 1536 x 1024 PNG. Viewed the saved final PNG with view_image and verified its PNG signature/dimensions.
- Corrected the major original error: south glazing no longer extends into the TV corner; a substantial white opaque southeast area is now visible behind the plant. The exact 56-inch return width and the plane transition are still not established by the perspective render. A short white area meets the walnut at the rear, so full-width walnut treatment is not faithfully demonstrated.
- Visible passes: rich flat walnut grain; low charcoal sofa; bronze smoked-glass low table; warm indirect lighting without darkening the whole room; large wall-mounted TV; floating console; soundbar visibly ON console; retained pale flooring, white ceiling and fan; thick exposed inset column; west-side door only; no south-glass door; right/north recessed access remains beyond TV wall rather than cut into panel face.
- Planned fit checks PASS numerically with no solid furnishing collisions. Those are coordinate-plan results, not a claim that generated furniture or walkways measure exactly as specified. In particular the 37.4-inch island approach cannot be seen because the island is behind the camera. The 40-inch west path appears open but cannot be certified from pixels. Exact column setback, sofa end spacing, office-route width and 122-inch TV-wall length need the coordinate schedule/site checks rather than image inference.
- Residual geometry drift: TV-to-console proportions and soundbar gap are approximate; panel appears to stop short of the rear corner; plant foliage is broader than its target envelope; rug and sofa outlines cannot be dimensionally certified. Alarm appears closer to the north end than target y94; switch/alarm faces remain visible, but their measured offsets are not faithfully proven. Glazing mullion counts/spacing and west door leaf do not reproduce a survey, which was unavailable. Ceiling includes a small rectangular vent not explicitly dimensioned in the brief; its exact original location was not surveyed.
- Kitchen/island and pendant continuity are unverified visually because they are outside this kitchen-side camera view; they have not been intentionally relocated. The exact north approach and recessed door swing still need site verification. No product procurement or installation validation is claimed.
- Deliverable is one final concept image plus this full schedule, prompts, fit calculations and QA record. No application code, shared files, other design directories or git index were changed; no commit/push performed as instructed.
