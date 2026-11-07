Build a 3D model of the product in the attached photos, for previewing furniture in an apartment floor plan.

Product: {{name}}
Category: {{category}}
Size on record: {{size}}
Description: {{summary}}

Photos, attached in this order and saved in the current directory:

{{photos}}

The first photo is the main listing photo and shows the color being bought. The rest come from the listing's gallery: other angles, close-ups, dimension diagrams, and sometimes other colorways. Use them for geometry, but take colors from the first photo.

## 1. Work out the real size and shape

Study every photo before writing code. Retail spec tables are often wrong. They give the seat depth as the product depth, list one module of a sectional, or swap width and depth. Dimension diagrams in the gallery are the most reliable source, so read every number on them and what it measures.

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
- Model the product in its normal resting state: recliners closed, drawers shut, extensions folded.
- Each part gets a PBR material (`trimesh.visual.material.PBRMaterial`) with the base color, roughness and metalness seen in the first photo. Fabric is rough, metal is shiny, and screens are dark and glossy.
- Keep it under 60k faces. Use watertight meshes where it is cheap to.

## 3. Check it

After exporting, reload `model.glb` and print its bounds in inches. Render `preview.png` with matplotlib as three views side by side: front three-quarter, top-down, and side. Compare them to the photos and the dimension diagram: footprint shape, seat and module count, part positions, proportions and colors. Fix mismatches, then render again. Do at most three revisions.

Finish with one line that names the layout and the parts you modeled.
