# apartment-furnishing

Helps me furnish my apartment: what fits, where it goes, and what to buy.

## The apartment

[84 East Ave #2209, Austin, TX 78701](https://www.zillow.com/homedetails/84-East-Ave-2209-Austin-TX-78701/446364037_zpid/) — The Vesper, 22nd floor, plan **B4**.

|            |                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Rent       | $4,475/mo (HOA, trash and both parking spaces included; tenant pays electricity and internet)                                  |
| Size       | 2 bed, 2 bath, 1,176 sqft + 88 sqft balcony                                                                                    |
| Lease      | 12 months preferred, 1-month minimum, deposit one month's rent                                                                 |
| Parking    | 2 reserved garage spaces                                                                                                       |
| Laundry    | In-unit washer and dryer                                                                                                       |
| Appliances | Bosch dishwasher, oven, cooktop, microwave drawer, fridge/freezer                                                              |
| Floors     | Wide-plank hardwood, tile in baths                                                                                             |
| Ceilings   | 10 ft. Not on this listing or the floor plan; from listings for #3909, the same B4 plan in the same stack                      |
| Pets       | Cats and dogs under 40 lb                                                                                                      |
| Views      | Hotel Van Zandt, Lady Bird Lake, sunset from the primary suite                                                                 |
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

[`app-ios/`](app-ios) is an iPhone AR app that places the same furniture in the real apartment, aligned from two floor corners you mark. Moves made in the app save back to the plan. Run it with `bun run ios` while the server runs; see [`app-ios/README.md`](app-ios/README.md).

## Ideas

Furniture ideas and inspiration photos live in [`ideas/`](ideas/README.md).

## Adding furniture

Paste an Amazon or Walmart link into the **Import** box in the app (or run `bun run import <url> [...]`). For each link the server:

1. Captures the page with a headless [Camoufox](https://camoufox.com) browser (`scripts/fetch-pages.py`, run through `uv`). Walmart's bot check blocks headless Chrome, Playwright and agent-browser, but lets Camoufox through.
2. Has the `grok` CLI turn the capture into structured product info: name, brand, price, dimensions in inches, weight, summary, highlights, image and 3D model URLs.
3. Downloads the main photo, the listing's photo gallery (`gallery/`, up to 12) and any GLB model into `data/items/<id>/` and writes `data/catalog/<id>.json`. Re-importing the same product updates its entry.

grok also decides how the item mounts (floor, wall, ceiling or on a surface), a default height, and which parts of the 3D model to drop for that mount (the TV's stand when wall mounted).

New imports drop into the living room. Select an item for three move arrows and a turn ring (15° steps; wall-mounted items have no ring because the wall decides which way they face), or drag it to slide it across the floor. Items snap flush to walls; wall-mounted ones also turn to face out of the wall. Floor and surface items always rest on the floor, a counter or another item below them, and ceiling items hang from the ceiling. The card sets height off the floor, turns in 15°/90° steps, duplicates or removes (Delete). Placements save to `data/placements.json`.

Walmart products with "View in 3D" come with a real GLB model. When a listing has none, the server has `codex exec` study the main photo and the gallery and write a procedural [trimesh](https://trimesh.org) script that exports a GLB (prompt in `apps/server/src/model-prompt.md`). Retail spec tables are often wrong (Amazon lists the AMERLIFE corner sectional as 22.5" deep, its seat depth), so Codex reads the size and layout off the gallery's dimension diagrams. It writes the overall size it modeled to `dimensions.json`, and that replaces the catalog's dimensions, with a note on where each number came from. Re-importing keeps those corrected dimensions while it keeps the generated model. The script is kept as `data/items/<id>/model.py`. This runs in the background after the import (2–5 minutes). The item list shows a spinner while it runs, and the item is a box until the model is ready. The card has a **Regenerate 3D model** button. Jobs live in server memory, so restarting the server drops a running job and the item shows "no 3D" until you regenerate it.
