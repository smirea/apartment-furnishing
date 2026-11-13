# apartment-furnishing

Helps me furnish my apartment: what fits, where it goes, and what to buy.

## The apartment

A high-rise rental, floor plan **B4**.

|            |                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Rent       | $4,475/mo (HOA, trash and both parking spaces included; tenant pays electricity and internet)                                  |
| Size       | 2 bed, 2 bath, 1,176 sqft + 88 sqft balcony                                                                                    |
| Lease      | 12 months preferred, 1-month minimum, deposit one month's rent                                                                 |
| Parking    | 2 reserved garage spaces                                                                                                       |
| Laundry    | In-unit washer and dryer                                                                                                       |
| Appliances | Bosch dishwasher, oven, cooktop, microwave drawer, fridge/freezer                                                              |
| Floors     | Wide-plank hardwood, tile in baths                                                                                             |
| Ceilings   | 10 ft. Not on this listing or the floor plan; from listings for another unit with the same B4 plan in the same stack           |
| Pets       | Cats and dogs under 40 lb                                                                                                      |
| Views      | Lake and downtown, sunset from the primary suite                                                                               |
| Building   | 24-hour concierge, 41st-floor pool and sky lounge, gym with yoga and spin studios, co-working lounge, sky dog run and dog wash |

Listing data and photos were captured on 2026-10-30; the listing may have changed since.

### Room dimensions (tape-measured where noted, otherwise from the floor plan)

| Room                | Size                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Living room         | 16'7" x 17'0" measured (west glass to TV wall; south glass to the end of the kitchen counter). Round column 33" across, 3'9" from the west glass                   |
| Kitchen             | 11'7" x 7'10". Island 71" x 41" measured, 13'3" north of the column                                                                                                |
| Bedroom 1 (primary) | 13'6" x 10'2" measured (plan says 13'3" x 10'0"), walk-in closet, double-vanity bath. My bedroom, behind the kitchen, one west window                              |
| Bedroom 2           | 11'0" x 10'5" measured (plan says 10'8" x 10'2"), closet. Office / guest room, behind the living-room TV wall. One 48" south window starting 6'1" from the TV wall |
| Balcony             | 5'1" x 17'2"                                                                                                                                                       |

The builder's floor plan notes that dimensions are approximate and not to scale. Tape measurements from 2026-11-02 showed the plan draws the unit about 4.5% small, so the 3D plan is scaled to them.

**Living-room TV wall** (the wall shared with the office), measured, facing it (left = hallway end):

- 10'2" (122") wide from the living room (the same wall measures 10'5" inside the office; the 3D plan uses the office figure for the walls and 122" for the fixtures), 10' (120") floor to ceiling, 9'7" (115") above the 5" baseboard.
- Studs: the finder showed 8–10 cm wide studs with 30 cm between them (about 16" on center if 30 cm is the gap, 12" if it is center to center); the first starts 34 cm (13.4") from one end. Which end is not recorded.
- Light switch 6.5" from the hallway end, bottom 45" off the floor. Smoke alarm about 28" from the hallway end, 105" up. Data jack + outlet 16" off the floor, about centered (63" from the window end).

## Photos

Everything lives in [`listing/photos`](listing/photos). Zillow's original 1536px JPEGs, renamed by what they show.

- [`unit/floorplan-b4.jpg`](listing/photos/unit/floorplan-b4.jpg): the B4 floor plan with dimensions.
- [`unit/`](listing/photos/unit): the apartment itself. Living room, kitchen, both bedrooms, both baths, hallways, balcony and views. `bedroom-staged-example.jpg` is a staged bedroom, not this unit's actual furniture.
- [`building/`](listing/photos/building): amenities. Sky lounge, gym, rooftop pool and terraces, dog run, co-working room, entrance.

Names were assigned by looking at each image, so a couple are best guesses (`bedroom-empty-hardwood-corner` and `bedroom-empty-tall-window-highway-view` could be either bedroom).

## Seeing it in the room

[`app-ios/`](app-ios) is an iPhone and iPad AR app that places the same furniture in the real apartment, aligned from two floor corners you mark. Moves made in the app save back to the plan. Run it with `bun run ios`; see [`app-ios/README.md`](app-ios/README.md).

## Where it runs

The web plan and its API live at [apartment.stf.lol](https://apartment.stf.lol), a Cloudflare Worker (`apps/server`). The data is in the D1 database `apartment-furnishing` and the photos, models and textures in the R2 bucket `apartment-furnishing-assets`, under `items/<id>/`. Every request needs the `API_TOKEN` from env-manager prod, the UI, photos and models included; only the sign-in form answers without it. A browser signs in once and keeps a cookie, and the iOS app and the runner send it as a bearer. The bucket has no public URL and the Worker no workers.dev one. `bun scripts/auth-sweep.ts --prod` sends every route in `apps/server/src/worker.ts`, a real photo and model, the UI and unknown paths without the token and with a wrong one, and fails on anything but a 401.

Imports and the Codex builds need tools a Worker can't run (Camoufox, `grok`, `codex`, `pdftotext` and Apple's USD tools), so they run in the job runner (`apps/runner`) on the Mac mini (`ssh mini`). The Worker queues each one in the `jobs` table and the runner claims it every 10 s, reading and writing through the Worker. An import waits for the runner and fails right away when it isn't running; a build waits in the queue until it comes back.

- `bun scripts/runner-service.ts setup` installs what the jobs need on the mini, checks out master in its `~/code/apartment-furnishing`, and (re)starts `bun run runner:prod` there as a LaunchAgent (logs in `~/Library/Logs/apartment-runner.log` on the mini). The runner doesn't follow master on its own: rerun `setup` to ship runner changes. `teardown` removes the agent and the checkout, and `status` shows the agent's state and log.
- `bun run dev` runs everything locally: `wrangler dev` with its own D1 and R2 on `PORT`, Vite on `UI_PORT`, and a runner against them. `bun run worktree:setup` copies production's rows into the local database once, and media the local bucket lacks comes from production.
- A push to master deploys from GitHub Actions after the checks pass: `bun run deploy` builds the UI, applies new migrations in `apps/server/migrations`, and runs `wrangler deploy`.
- `scripts/secrets.ts` bridges env-manager (`dev` and `prod`) to the Worker (`bun run secrets:push`), GitHub (`bun run secrets:github`) and the iOS build (`bun run env:ios`); `bun run secrets:check` reports drift.

## Ideas

Furniture ideas and inspiration photos live in [`ideas/`](ideas/README.md). The app shows them in the **Ideas** panel at the top right, collapsed until you open it.

## Adding furniture

Paste an Amazon or Walmart link into the **Import** box in the app (or run `bun run import <url> [...]`). For each link the runner:

1. Captures the page with a headless [Camoufox](https://camoufox.com) browser (`apps/runner/src/fetch-pages.py`, run through `uv`). Walmart's bot check blocks headless Chrome, Playwright and agent-browser, but lets Camoufox through.
2. Has the `grok` CLI turn the capture into structured product info: name, brand, price, dimensions in inches, weight, summary, highlights, image and 3D model URLs.
3. Downloads the main photo, the listing's photo gallery (`gallery/`, up to 12) and any GLB model (with its USDZ for the AR app) into the bucket under `items/<id>/` and saves it to the `catalog_items` table. Re-importing the same product updates its entry.

grok also decides how the item mounts (floor, wall, ceiling or on a surface), a default height, and which parts of the 3D model to drop for that mount (the TV's stand when wall mounted).

New imports drop into the living room. Select an item for three move arrows and a turn ring (15° steps), or drag it to slide it across the floor. Items snap flush to walls. Wall-mounted items are listed and placed under **Wall** (below). Floor and surface items always rest on the floor, a counter or another item below them, and ceiling items hang from the ceiling. The card sets height off the floor, turns in 15°/90° steps, duplicates or removes (Delete). Placements save to the `placements` table.

Walmart products with "View in 3D" come with a real GLB model. When a listing has none, the runner has `codex exec` study the main photo and the gallery and write a procedural [trimesh](https://trimesh.org) script that exports a GLB (prompt in `apps/runner/src/model-prompt.md`). Retail spec tables are often wrong (Amazon lists the AMERLIFE corner sectional as 22.5" deep, its seat depth), so Codex reads the size and layout off the gallery's dimension diagrams. It writes the overall size it modeled to `dimensions.json`, and that replaces the catalog's dimensions, with a note on where each number came from. Re-importing keeps those corrected dimensions while it keeps the generated model. The script is kept as `items/<id>/model.py` in the bucket. This runs in the background after the import (2–5 minutes). The item list shows a spinner while it runs, and the item is a box until the model is ready. The card has a **Regenerate 3D model** button. Jobs live in the `jobs` table, and a runner that restarts mid-job runs it again.

## Fixtures

The TV, the bed and the living-room wall texture are fixtures: built-in spots that each hold one of several imported options. They share one API, so the web plan and the AR app list, switch and import them the same way:

- `GET /api/fixtures` lists every fixture with its options, each with a name, a one-line `detail`, an optional red `warning`, a build `job` and whether it is `ready` to pick.
- `PUT /api/fixtures/:key` with `{ "selected": <option id or null> }` switches it, or leaves the spot empty.
- `POST /api/fixtures/:key/import` with `{ "url" }` imports a product link as a new option, and picks it when it can show right away.
- `POST /api/fixtures/:key/options/:id/build` retries a failed model or texture build; `DELETE /api/fixtures/:key/options/:id` drops an option where the fixture allows it (TVs).

The registry is `apps/server/src/fixtures.ts`. Picks save to the `fixtures` row of the `settings` table, and the TV's size and mount to its `tv` row. A fixture of kind `item` is a catalog category standing at a wall spot: its back flush to a wall face and centered on it, facing into the room. Adding one, say nightstands or a desk, is one `FIXTURES` entry with its category and the wall face from `packages/shared/src/floorplan.ts`. The web plan gives it a panel and the AR app a picker and its model with no other code. Products of that category then leave the Furniture list, and a link for one pasted in the Furniture box becomes that fixture's pick.

## TV

The **TV** panel sets the living-room TV, which is built in rather than imported. It hangs on a tilting mount 2.5" out from the wall or its panels, with no stand, at one of three spots the **Placement** menu picks: the **Back wall** (the TV wall, centered on its measured 122" span), the **Pillar wall** (the south wall, centered between the column and the back wall), or the **Corner** where those two meet, angled at 45°. A corner TV stands out from the corner until its back edges clear both walls by the mount's standoff, so a bigger TV sits farther out; the panel shows how far along each wall it reaches. Type a diagonal and pick a ratio, or type the width and height directly; the others follow. The **Center** slider moves it up and down, **Tilt** tips the top out by up to 15°, and the size is written on the screen. The settings save to the `tv` row of the `settings` table.

Paste a TV's product link under it to keep that TV as a candidate: grok reads only its name, the diagonal it is sold as and its aspect ratio (`apps/runner/src/tvs.ts`, saved to the `tv_models` table). Each one shows its diagonal and size with a link to the listing; click it to switch to that size, × to drop it. A hand-typed size shows as **Custom size**.

## Bed

The **Bed** panel picks the primary bedroom's bed from the imported beds (catalog items grok files under `bed`). The bed is not placed by hand. Its headboard sits flush to the bedroom's north wall, and it is centered on that wall's measured 162", so both sides keep the same room for a nightstand. Each bed in the list shows its size, its price and the room left on each side (red under 18"). The bed in the plan has its width, length, height and side room written across its top. Click a bed to switch to it, or click it again to leave the room empty. The bed is the `bed` item fixture (see Fixtures).

Paste a bed link at the bottom of the panel to import it the same way as furniture (photos, dimensions, a generated 3D model) and switch to it. That box refuses anything grok doesn't read as a bed. A bed link pasted in the Furniture box lands in the Bed panel too.

## Living room wall texture

The **Living room wall texture** panel (under the furniture list; both panels collapse) imports wall-panel products such as wood slats on acoustic felt, and dresses the TV wall and the column with them. Paste a product link and the runner:

1. Captures the page and has grok read the panel: name, price, panels per pack, and one panel's width, height and thickness (`apps/runner/src/textures.ts`).
2. Uploads the main photo and gallery under `items/<id>/` and saves it to the `wall_textures` table.
3. Has `codex exec` study the photos and write a Pillow/numpy script that synthesizes a seamless tile at real scale (prompt in `apps/runner/src/texture-prompt.md`): `texture.png`, a matching `texture-normal.png` for the slat relief, the inches of wall one tile covers, and the panel thickness. The script is kept as `texture.py`, with a 3 × 3 tiling check in `texture-preview.png`. This takes 2–5 minutes, in the background like 3D models; three run at a time and the rest queue.

`bun run import-textures <url> [...]` imports many at once in one browser session and queues their textures for the runner. The swatches hold every [slats.co](https://slats.co) finish, imported that way: samples, kits and end pieces left out, and each finish at the height that best fits the 120" ceiling (118" where sold, else 141" cut down rather than 106" plus a seam). Page captures read the full product gallery from Amazon, Walmart and Shopify stores, and the schema.org product images elsewhere. They also pick up the PDFs a page links (spec sheets first), whose text `pdftotext` saves as `items/<id>/spec.txt`. Grok reads it for panel sizes and Codex for exact slat geometry, since stores publish no 3D models or texture files (slats.co offers only these spec sheets) and photo estimates of slat and groove widths drift. `--rebuild` rebuilds textures the products already have, after a prompt or spec change.

Textures show as swatches at a common scale, so slat widths compare at a glance, in rows by product type (grok names the types in one pass over the whole collection, so every colorway of a line lands together). Hovering one shows its price, pack, panel size, panels and cost for the TV wall and the column, the material, and how Codex sized the tile. Click a swatch to put it on both the TV wall and the column, and again to take it off. A dimmed swatch with a spinner is queued or building, a red one failed (click it to retry), and the import bar sits under the swatches. It covers the TV wall's whole living-room face, floor to ceiling, and wraps the column in a sleeve, using whole tiles so the seam matches. Both stand out by the panel thickness. The switch, data jack, outlet and smoke alarm move out onto the panels. Wall-mounted items snap to the panel face; a TV placed before the panels went up re-seats the next time you drag it. The choice is the `wallTexture` fixture. The list estimates panels and cost for both surfaces from the measured TV wall (122" × 120") and the column (104" around). Shorter panels count the top-up strips as cut from shared panels.

## Wall

The **Wall** panel (under Furniture) holds things that hang on a wall: art, mirrors, shelves. Paste a link there and it imports like furniture (photos, dimensions, a 3D model), except that grok is told the product hangs on a wall, so it reads its usual hanging height and the item is saved as wall-mounted whatever else it reads (`mount` on the `importItem` job). A link already imported as furniture becomes a wall piece, at 48″ off the floor when it had no height. Furniture grok reads as wall-mounted lists here too.

A wall piece only ever hangs on a wall: flush against the face of a solid wall that looks into a room of the apartment, never on glass, the outside of the shell or the balcony, and never across the end of a wall (`wallFaces` and `hangOnWall` in `packages/shared/src/walls.ts`). Dragging it moves it to the spot on a wall nearest the pointer, so it slides along a wall and hops to another one, and it always faces into the room. Selected, it has one move arrow along its wall and one for height, and no turn ring; the card has no turn buttons, and sets its height off the floor. On the TV wall it hangs on the face of any wall panels.

## Carpets

The **Carpets** panel (under Furniture) imports rugs. Paste a rug's product link and the runner:

1. Captures the page, including the listing's grid of looks (colors, patterns, styles) and sizes with a link for each combination: Amazon's variation data, Walmart's variant map, or a Shopify store's product JSON (`apps/runner/src/fetch-pages.py`). grok reads the rug's name, brand and summary, and which variation is the size, with each size in inches (`apps/runner/src/carpets.ts`). Sets and bundles are left out. It refuses a product that isn't a rug.
2. Captures one more page per look on Amazon and Walmart, where each look's photos live only on its own page. An Amazon page shows every look's price at that page's size only, so those pages spread across the sizes until every size has been seen (`apps/runner/src/carpet-pages.ts`); a few more pages cover the rest when there are more sizes than looks. A Shopify product lists every price at once and shares one gallery. A listing without a variation grid gets the sizes grok reads off the page, as one look.
3. Uploads each look's main photo and gallery under `items/<id>/<look>/` (a listing with one look keeps them at `items/<id>/`) and saves the rug, with every look and the sizes and prices it comes in, to the `carpets` table.
4. Has `codex exec` turn each look's photos into one top-down image of the whole rug, cropped to its edge, with no lighting or perspective, and transparent outside the outline of a round or oval rug (prompt in `apps/runner/src/carpet-prompt.md`). The script is kept as `carpet.py`, with a side-by-side check against the listing photo in `carpet-preview.png`. Every look is drawn, the listing's own first, in the background like 3D models (2–5 minutes each, three at a time); a look shows as a plain beige rectangle until its image is ready.

A new rug lands in the middle of the living room, turned whichever way clears the walls and the column. Carpets lie on their own layer, just above the floor and under all furniture: furniture stays on the floor when dragged onto a rug, and clicking where furniture stands on a rug picks the furniture. Where two rugs overlap, the one imported later lies on top.

Drag a rug to slide it across the floor, or use the move arrows and the turn ring. A rug can't cross a floor-plan wall or the column: dragged into one, it stops flush against it and slides along it, and a turn or a bigger size that would cross one is refused with a message. The server checks the same rule (`carpetHitsWalls` in `packages/shared/src/carpets.ts`) and answers 400 to a pose that crosses a wall. Kitchen counters, the island and other fixtures don't stop a rug.

Selecting a rug in the plan floats its choices just above it: a swatch for each look, showing its drawn image once ready (a spinner while it's drawn), and a menu of the sizes that look comes in with their prices. Its card has the same choices, and the image stretches to the size picked. Another look keeps the size when it comes in it, else takes the closest one, and a look or size that would cross a wall is refused like a turn. Each layout keeps its own look, size and spot for every rug (`layout_carpets`). The choices are a generic list of axes (`apps/ui/src/lib/Configurator.svelte`), so other products can offer theirs the same way. The card also turns a rug in 15° or 90° steps, takes it out of the room (or press Delete), or redraws the look shown. The panel's **Add** and **Remove** put a rug in the room and take it out. Carpets show only in the web plan; the AR app doesn't draw them yet.
