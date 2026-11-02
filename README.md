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

### Room dimensions (from the floor plan, approximate)

| Room                | Size                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Living room         | 16'5" x 15'6"                                                                                       |
| Kitchen             | 11'7" x 7'10" (with island)                                                                         |
| Bedroom 1 (primary) | 13'3" x 10'0", walk-in closet, double-vanity bath. My bedroom, behind the kitchen, one north window |
| Bedroom 2           | 10'8" x 10'2", closet. Office / guest room, behind the living-room TV wall                          |
| Balcony             | 5'1" x 17'2"                                                                                        |

The builder's floor plan notes that dimensions are approximate and not to scale.

## Photos

Everything lives in [`listing/photos`](listing/photos). Zillow's original 1536px JPEGs, renamed by what they show.

- [`unit/floorplan-b4.jpg`](listing/photos/unit/floorplan-b4.jpg): the B4 floor plan with dimensions.
- [`unit/`](listing/photos/unit): the apartment itself. Living room, kitchen, both bedrooms, both baths, hallways, balcony and views. `bedroom-staged-example.jpg` is a staged bedroom, not this unit's actual furniture.
- [`building/`](listing/photos/building): amenities. Sky lounge, gym, rooftop pool and terraces, dog run, co-working room, entrance.

Names were assigned by looking at each image, so a couple are best guesses (`bedroom-empty-hardwood-corner` and `bedroom-empty-tall-window-highway-view` could be either bedroom).

## Adding furniture

Paste an Amazon or Walmart link into the **Import** box in the app (or run `bun run import <url> [...]`). For each link the server:

1. Captures the page with a headless [Camoufox](https://camoufox.com) browser (`scripts/fetch-pages.py`, run through `uv`). Walmart's bot check blocks headless Chrome, Playwright and agent-browser, but lets Camoufox through.
2. Has the `grok` CLI turn the capture into structured product info: name, brand, price, dimensions in inches, weight, summary, highlights, image and 3D model URLs.
3. Downloads the image and any GLB model into `data/items/<id>/` and writes `data/catalog/<id>.json`. Re-importing the same product updates its entry.

grok also decides how the item mounts (floor, wall, ceiling or on a surface), a default height, and which parts of the 3D model to drop for that mount (the TV's stand when wall mounted).

New imports drop into the living room. Select an item for three move arrows and a turn ring (15° steps; wall-mounted items have no ring because the wall decides which way they face), or drag it to slide it across the floor. Items snap flush to walls; wall-mounted ones also turn to face out of the wall. Floor and surface items always rest on the floor, a counter or another item below them, and ceiling items hang from the ceiling. The card sets height off the floor, turns in 15°/90° steps, duplicates or removes (Delete). Placements save to `data/placements.json`.

Walmart products with "View in 3D" come with a real GLB model. When a listing has none, the server has `codex exec` look at the product photo and write a procedural [trimesh](https://trimesh.org) script that exports a GLB at the listed size (prompt in `apps/server/src/model-prompt.md`). The script is kept as `data/items/<id>/model.py`. This runs in the background after the import (1–3 minutes). The item shows as a box until the model is ready, and the card has a **Regenerate 3D model** button.
