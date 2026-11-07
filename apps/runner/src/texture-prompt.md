Make a seamless, tileable wall texture of the wall-panel product in the attached photos. A 3D apartment planner (three.js) repeats it at real scale across a 10 ft wall and around a round column.

Product: {{name}}
One panel on record: {{size}}
Description: {{summary}}

Manufacturer spec sheet text. Its numbers (slat face width, groove width and profile, slats per panel, thickness, finishes) are exact: use them over anything you estimate from photos, and say so in the note.

```
{{spec}}
```

Photos, attached in this order and saved in the current directory:

{{photos}}

The first photo is the main listing photo and shows the color being bought. The rest come from the listing's gallery: installed shots, close-ups, dimension diagrams, and sometimes other colorways. Use them for structure and scale, but take colors from the first photo.

## 1. Work out the pattern and its real size

Read the spec sheet, then study every photo before writing code. The spec sheet beats dimension diagrams, which beat spec tables and estimates. Work out, in inches:

- The repeating structure as installed on a wall: for slat panels, the slat width, the gap between slats, the slat pitch (width + gap) and how many slats one panel has. For fluted, shiplap, tile or 3D panels, the equivalent repeating unit.
- The panel thickness, front of the slats to the back of the backing.
- The colors: the wood or face material (with its grain and tone variation) and the backing showing in the gaps (often black or grey acoustic felt).

## 2. Build it

Write `build.py` in the current directory and run it with:

    uv run -p 3.12 --with pillow --with numpy --with scipy python build.py

It writes, in the current directory:

- `texture.png`: the color map, 1024 to 2048 px on its long side, seen straight on as installed (slats run vertically).
- `normal.png`: a tangent-space normal map of the same size, OpenGL convention (green points up, flat is RGB 128,128,255). Build it from a height map: slat faces high, gaps and backing low, rounded or chamfered slat edges, a little grain.
- `texture.json`:

        {"repeatWidthIn": 9.45, "repeatHeightIn": 18.9, "depthIn": 0.83, "note": "5 slats at 1.1 in on a 1.89 in pitch from the dimension diagram; tile is 5 pitches wide and 18.9 in tall."}

  `repeatWidthIn` and `repeatHeightIn` are how many inches of wall one copy of the image covers. `depthIn` is the panel thickness. The note is one or two plain sentences on where the sizes and colors came from.

Requirements:

- It tiles seamlessly left to right and top to bottom. Make the tile a whole number of pattern repeats wide (slat pitches), and make the wood grain wrap vertically.
- The image's pixel aspect ratio equals `repeatWidthIn / repeatHeightIn`, so the planner can scale it without distortion. A tile taller than it is wide (about 18 to 30 in tall) keeps the grain from repeating visibly.
- No baked-in lighting: no shadows, highlights, vignetting or perspective. The planner lights it through the normal map. Gaps and backing can be darker in the color map because that is their real color.
- Synthesize the pattern procedurally with realistic wood grain and per-slat tone variation sampled from the photos. Listing photos are shot in perspective under uneven light, so pasted photo crops seam and repeat badly. Only use photo pixels if you rectify them and flatten the lighting.

## 3. Check it

Write `preview.png`: the color map tiled 3 × 3 next to the normal map shaded by a light from the upper left. Look at it next to the photos: seams, visible repetition, slat count and proportions, colors. Fix mismatches and render again. Do at most three revisions.

Finish with one line naming the pattern and its repeat size.
