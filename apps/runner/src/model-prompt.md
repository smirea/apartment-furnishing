Build a 3D model of the product in the attached photos, for previewing furniture in an apartment floor plan.

Product: {{name}}
Category: {{category}}
Size on record: {{size}}
Description: {{summary}}

Photos, attached in this order and saved in the current directory:

{{photos}}

The first photo is the main listing photo and shows the color being bought. The rest come from the listing's gallery: other angles, close-ups, dimension diagrams, and sometimes other colorways. Use them for geometry, but take colors from the first photo.

## 1. Work out the real size and shape

Open and study every photo before writing code, not just the first few. Together they show the product from several angles, and each angle settles something the others can't: the front shows the width and the arrangement of parts, a side view the depth, the back's height and rake, and the profile of the arms and seat, a three-quarter view how those meet, a back view the rear panel and legs, and close-ups the shapes of legs, feet, seams and edges.

Write `views.md` with one line per photo: its file name, the angle it shows (front, back, left or right side, three-quarter front or back, top, close-up, dimension diagram, or lifestyle scene), and what it shows about the shape that no other photo does. Then add a short paragraph per view (front, side, top) describing the silhouette you will build from it: the outline, where each part starts and ends, and how high or deep it reaches compared to the overall size. Where no photo shows an angle, say so and say what you infer it from.

Retail spec tables are often wrong. They give the seat depth as the product depth, list one module of a sectional, or swap width and depth. Dimension diagrams in the gallery are the most reliable source, so read every number on them and what it measures.

Work out:

- The overall bounding box in inches: width (left to right, seen from the front), height, and depth (front to back). For an L-shaped or U-shaped piece, this is the whole footprint, not one arm of it.
- The layout seen from above: straight, L-shaped (and which side the corner run goes), U-shaped, curved or round. Count the seats, modules, consoles, arms, drawers, shelves or doors, and note where each one sits.
- Proportions: seat height, arm height, back height, seat depth, leg height, thicknesses. Use diagram numbers where they exist, otherwise estimate from the photos against the known sizes.

Write `dimensions.json`:

    {"width": 112, "height": 36, "depth": 68, "note": "Width and depth from the gallery's dimension diagram; the spec table's 21 in depth is the seat depth. Height from the spec table."}

Its width, height and depth are the overall bounding box you will model. The note is one or two plain sentences naming where each value came from (diagram, spec table, or estimate) and any listed value you rejected and why. When the size on record is already right, say so.

## 2. Build it

Write `build.py` in the current directory that builds the model with trimesh and exports `model.glb` here. Run it with:

    uv run -p 3.12 --with trimesh --with numpy --with scipy --with matplotlib python build.py

Requirements:

- Model only the product. Ignore people, pets, decor, the floor and the background in the photos. Leave out staging the listing does not include: mattresses and bedding on a bed frame, throw pillows and blankets on a sofa, items on shelves or tables.
- Units are meters, +Y is up, and the front of the product faces +Z. The base rests on y = 0. For an L or U shape, the backs run along the rear (-Z) and the sides, and the open side faces +Z.
- The overall bounding box matches `dimensions.json` within 2%.
- Match the layout and proportions from step 1. Getting the footprint and the arrangement of parts right matters more than surface detail.
- Recognizable shape: compose many parts (cylinders, capsules, spheres, revolved profiles, extruded polygons, rounded boxes) for the silhouette, curves, cushions, legs, bases, frames and seams. Avoid a plain box unless the product is one.
- Upholstered parts are thick padded volumes with rounded edges, as thick as the photos show: a back is a cushioned shell, not a flat board, and arms are padded rolls or wings that join the back and seat without gaps, not discs or plates. Cross-check each part's thickness on the side photos. Build a cushion, arm or back as the convex hull of spheres placed along its outline (`trimesh.convex.convex_hull` of their vertices), which gives a solid padded shape with soft edges; a bent or curved part is several such hulls chained together.
- A printed or pieced pattern (patchwork, stripes, plaid blocks) is made of patches that follow the surface they sit on, each its own material, flush with it and inside its outline. Nothing sticks out of or floats off the upholstery.
- Model the product in its normal resting state: recliners closed, drawers shut, extensions folded.
- Each part gets a PBR material (`trimesh.visual.material.PBRMaterial`) with the base color, roughness and metalness seen in the first photo. Fabric is rough, metal is shiny, and screens are dark and glossy.
- Keep it under 60k faces. Use watertight meshes where it is cheap to.

## 3. Check it

After exporting, reload `model.glb` and print its bounds in inches. Render `preview.png` with matplotlib, one panel per angle the photos show (front, side, three-quarter, back) plus top-down, each seen from the same direction and height as its photo. Compare each panel to its photos in `views.md` and to the dimension diagram: silhouette, part thicknesses, footprint shape, seat and module count, part positions, proportions and colors. Colors should be as saturated as in the photos, not washed toward gray. A side view that doesn't match the side photo's outline means the depth or the back, arms or seat are wrong, even when the front looks right. Fix mismatches, then render again. Do at most three revisions.

Finish with one line that names the layout, the parts you modeled, and the photos each view was matched against.
