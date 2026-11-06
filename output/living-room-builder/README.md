# Living room layout builder

A plan-view mock-up of the living room for trying out sofas, TVs, consoles and coffee tables at real sizes. Every layout is scored the same way: seat sightlines, legroom, collisions and walking routes.

Open [`builder.html`](builder.html) in a browser. Pick a layout from the menu, then edit it:

- Drag a piece to move it.
- Arrow keys nudge the selected piece 1″, or 6″ with Shift.
- `R` and `Shift-R` turn it 15°.
- `D` duplicates it and `Delete` removes it.

The panel on the right edits every dimension: run and return lengths, seat count, depth, chaise or seat returns, the TV's diagonal (capped at 98″), its mount and height, and table sizes. Edits re-score as you type. Your last layout is kept in the browser. **Copy JSON** exports a layout, and **Load JSON** imports one, such as a `layout` from [`rounds/`](rounds/README.md).

## Room model

`model.ts` holds the fixed room in inches. x runs east from the west glass and y runs north from the south glass. Tape measurements from the project README come first; the rest is traced from `packages/shared/src/floorplan.ts`.

- The room is 199″ × 204″.
- The TV wall is the 122″ solid east wall. The light switch, smoke alarm and outlet are on it.
- The 33″ column stands near the south glass, 3′9″ from the west glass.
- The balcony door is in the west glass, at y 144–185.
- The island and the west kitchen counter close off the north side.
- The office landing and the Bath 2 door open off the east side, north of the TV wall.

Not taped yet: the column's distance from the south glass, the balcony door jamb, and the stud positions. Measure these before ordering a sofa that fits within a few inches.

## What a layout is checked for

- **Fit:** every piece inside the room, with no overlaps with the column, island, counter or other furniture.
- **Legroom:** 13″ clear in front of every cushion, and that includes the column.
- **Sightlines:** no one seated on another sofa blocks a seat's view of the screen.
- **Seat quality**, for each seat:
  - **Prime:** within 30° of the screen's axis, a head turn of 35° or less, and a screen filling 26–46° of view.
  - **Good:** within 45° off-axis, a head turn of 50° or less, and a fill of 50° or less.
  - **Side:** anything else.
- **Walking routes:** measured on a 1″ clearance grid from the kitchen entry, at the narrowest point of each route.
  - Office door: 32″ minimum.
  - Bath 2 door: 28″ minimum.
  - Balcony door: 28″ minimum.
- **Coffee table:** distance to the seat fronts, where 14–18″ is the norm.
- **Island:** clearance behind the island stools.
- **TV wall:** a wall TV must stay clear of the switch and the smoke alarm, and stay flat on a solid wall.

## Scripts

- `./eval.ts [ids…]` prints the metrics, seats and issues for each layout.
- `./build.ts` rebuilds `builder.html` and `gallery.html`.
  - `./build.ts --gallery out.html [ids…]` writes a gallery of only the layouts listed.
  - `./build.ts --compact out.html [ids…]` writes a two-column overview.
- These scripts search placements:
  - `search.ts`: a straight sofa.
  - `search-l.ts`: an L sectional, facing a wall TV or a corner TV (`CORNER=1`).
  - `search-pair.ts` and `search-v.ts`: two-sofa arrangements.

Layouts live in `layouts.ts`. Review rounds, with their scores, are in [`rounds/`](rounds/README.md).
