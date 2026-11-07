Make a top-down image of the whole rug in the attached photos. A 3D apartment planner (three.js) lays it flat on the floor, stretched over the rug's real footprint, so it must look like the rug seen from straight above.

Product: {{name}}
Size shown in the planner: {{size}} (width × length)
Description: {{summary}}

Photos, attached in this order and saved in the current directory:

{{photos}}

The first photo is the main listing photo and shows the colorway being bought. The rest come from the listing's gallery: room shots, close-ups of the pile and the back, size charts, and sometimes other colorways. Use them for the pattern and its detail, but take colors from the first photo.

## 1. Study it

Look at every photo before writing code. Work out:

- The rug's outline: rectangle, round, oval, runner, or an irregular shape such as a cowhide.
- The full design from edge to edge: border bands, medallions, the field pattern and how it repeats, fringe at the short ends.
- The colors and the texture of the pile (flat weave, low pile, shag, jute).

## 2. Build it

Write `build.py` in the current directory and run it with:

    uv run -p 3.12 --with pillow --with numpy --with scipy --with opencv-python-headless python build.py

It writes, in the current directory:

- `texture.png`: the rug seen straight down, cropped exactly to its outer edge, 1024 to 2048 px on its long side. The image's width runs along the rug's width and its height along its length, and its pixel aspect ratio equals width ÷ length of the size above. For a rug that is not a rectangle, make everything outside its outline fully transparent (RGBA).
- `texture.json`:

        {"note": "Rectified from the main photo's flat top-down shot; border and fringe kept, lighting flattened."}

  One or two plain sentences on how the image was made and where the colors came from.

Requirements:

- No perspective, no lighting, no shadows or highlights, no floor or room around it. The planner lights it.
- Prefer the listing's own flat top-down photo when it has one: find the rug's corners, warp it to a rectangle at the right aspect ratio with OpenCV, and flatten uneven lighting. When every photo is a room shot or at an angle, rectify the clearest one, or synthesize the design procedurally from what the photos show.
- Keep the rug's real proportions of border to field. Do not tile or repeat a crop to fill the frame.

## 3. Check it

Write `preview.png`: the texture next to the first photo. Compare the outline, the design, the border widths and the colors. Fix mismatches and render again. Do at most three revisions.

Finish with one line naming the rug and how its image was made.
