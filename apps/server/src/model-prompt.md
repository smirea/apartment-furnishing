Build a 3D model of the product in the attached photo, for previewing furniture in an apartment floor plan.

Product: {{name}}
Category: {{category}}
Listed size: {{size}}
Description: {{summary}}

Write `build.py` in the current directory that builds the model with trimesh and exports `model.glb` here. Run it with:

    uv run -p 3.12 --with trimesh --with numpy --with scipy --with matplotlib python build.py

Requirements:

- Model only the product. Ignore people, pets, decor, the floor and the background in the photo.
- Units are meters, +Y is up, and the front of the product faces +Z. The base rests on y = 0.
- The overall bounding box matches the size within 2%.
- Recognizable shape: compose many parts (cylinders, capsules, spheres, revolved profiles, extruded polygons, rounded boxes) for the silhouette, curves, cushions, legs, bases, frames and seams. Avoid a plain box unless the product is one.
- Each part gets a PBR material (`trimesh.visual.material.PBRMaterial`) with the base color, roughness and metalness seen in the photo. Fabric is rough, metal is shiny, and screens are dark and glossy.
- Keep it under 60k faces. Use watertight meshes where it is cheap to.
- After exporting, reload `model.glb`, print its bounds in inches, and render a front three-quarter preview to `preview.png` with matplotlib. Look at the preview, compare it to the photo, and fix obvious mismatches. Do at most two revisions.

Finish with one line that names the parts you modeled.
