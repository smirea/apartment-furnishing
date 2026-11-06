# Living-room layout council (no balcony door), round 1

You are one of five independent councillors scoring a proposed furniture layout for a living room. Work read-only:

- Do not edit, create or delete files in the repository `/Users/stefan/code/apartment-furnishing`.
- Do not start subagents.
- Write any scratch files under `/tmp`.

Every file named here is in `/Users/stefan/code/apartment-furnishing/output/living-room-builder/council-nodoor/round-1/`.

## The owner's goals

Score the layout on two things: how well it uses the space, and how well it meets these targets.

- **Couch:** at least 3 seats; 4–5 is ideal. Seats should watch the TV well.
- **TV:** up to 98″. Bigger is better, at an appropriate viewing distance.
- **Dining table:** seats 6, with real room to pull chairs out.
- **No balcony door.** The owner will probably never use it. Treat the whole west wall as glass you can put furniture against, and drop the walking route to the balcony.
- **Minimize odd pockets of empty space.** Floor that no seat, chair, table, view or walking route uses should be as small as possible.
- **Floor plan:** everything must adhere strictly to it. Nothing else about placement is restricted.

## Scoring scale

| Score | Meaning                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10    | Nothing in this room could do better on any criterion.                                                                                                                   |
| 9     | You would not change anything material.                                                                                                                                  |
| Lower | Deduct only for a shortfall a buildable alternative in this room would fix. Give that alternative in numbers (dimensions and positions) so it can be built and measured. |

A limit every arrangement shares (the column, the glass walls, the island aisle, the one solid TV wall, the 98″ cap) is not a deduction against this layout. If you think a limit is not forced, prove it with numbers.

## The room (facts)

Read `README.md` → "Room dimensions" and "Living-room TV wall" in the repo. Then look at `listing/photos/unit/floorplan-b4.jpg` and `listing/photos/unit/living-room-island-corner-windows.jpg`.

Inches. x grows east from the west glass; y grows north from the south glass.

- **Room:** 199″ × 204″, with a 120″ ceiling. The north side is open to the kitchen.
- **West wall:** glass along its full length. For this brief, the balcony door at y 144–185 is treated as fixed glass.
- **South wall:** glass at x 0–146 (the lake view), solid at x 146–199.
- **East wall (TV wall):** solid, from y 0 to y 122. Light switch at y 115.5 (45–49.5″ up), smoke alarm at y 94 (105″ up), outlet and data at y 63 (16″ up).
- **East side, north of the TV wall:** the walking route from the kitchen and entry to the office landing (y 122–175) and the Bath 2 door (y 180–215).
- **Column:** 33″ across, centered at (61.5, 20.5), so it spans x 45–78 and y 4–37.
- **Island:** x 78–149, y 195.4–236.4. **West kitchen counter:** ends at y 204, spanning x 0–35. You walk in from the north-east (x ≈ 175).

## How the builder measures odd pockets

The builder rasterizes the living room (x 0–199, y 0–195) on a 1″ grid. Floor counts as used when it is:

- inside a piece of furniture, plant or lamp
- a seat's 13″ legroom, or within 18″ of a reading chair's front
- a dining chair's seat and its 32–36″ pull-out zone
- within 18″ of the coffee table
- inside the viewing wedge: the convex hull of the seated eyes and the two TV edges
- within 15″ of a walking path (so a 30″ corridor) from the kitchen entry to each seat, each dining chair, the reading chair, the TV front, the office landing and the Bath 2 door

Everything else is an odd pocket. Strips narrower than 8″ (clearance against walls and glass) and specks under 1 sq ft are ignored. The plan shades pockets dark red.

For reference: with the door removed, the earlier picks leave 75–91 sq ft of pockets (H1 74.8, H2 91.1, G2 89.1). H2 strands the whole lake bay behind its floated sofa.

## Earlier council context

With the balcony door in use, the last council approved H2: an 85″ wall TV at 8 ft (38–42° of view) and a 4-seat sofa floated east of the column, at 4 of 5 councillors 9 or higher. It left the strip behind the sofa as a reading nook on the balcony route. Without the door, that strip has no purpose, so this round starts from a different arrangement.

## The submission: layout N1

Files: `N1.png`, `N1.json`, `N1-eval.txt`. Run `./eval.ts N1` in `output/living-room-builder/` to reproduce the metrics.

| Piece               | Spec                                     | Position and notes                                                                                                                                                                   |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sofa                | 133″ × 38″, 5 seats of 25″               | Back against the west glass, facing east: x 3–41, y 33.5–166.5. The south end stays clear of the column and its legroom.                                                             |
| TV                  | 98″ (86.5″ × 49″ with bezel), on a stand | On a 56″ × 18″ corner console across the south-east corner, facing north-west (heading 315°). Screen center 48″ up.                                                                  |
| Coffee table        | 52″ × 28″                                | Center (71, 91), long side parallel to the sofa, 16″ from the sofa front.                                                                                                            |
| Dining table        | 72″ × 36″, 6 chairs                      | x 96–132, y 122–194, off the island. Every chair has 48″ of pull-out room.                                                                                                           |
| Swivel lounge chair | 32″                                      | (104, 23), turned toward the TV, between the column and the corner console, by the lake glass.                                                                                       |
| Side tables         | 18″ round, two                           | At the sofa's south arm (34, 22) and north arm (32, 178).                                                                                                                            |
| Plants and a lamp   | 20–24″ plants; a 14″ uplight             | South-west corner (14, 15), north-west corner (13, 185), a tall plant on the east wall between the TV and the landing (186, 104), the uplight in the corner behind the TV (189, 10). |

Builder checks:

- **Seats:** 5 (3 prime, 2 good). Eye-to-screen 12′1″–15′5″; the screen fills 26–29° of view.
- **Dining:** 6 chairs, minimum pull-out 48″.
- **Walking routes:** office 43″, bath 35″.
- **Odd pockets:** 19.7 sq ft in 6 pieces; the largest is 6.5 sq ft (the triangle behind the corner console).
- **Other:** no collisions, no column warnings, no sightline cuts.

## The trade-off to judge

N1 puts the sofa against the glass so no floor is stranded behind it. The cost is viewing distance: the 98″ fills 26–29°, against 38–42° for H2's 85″ at 8 ft.

What the builder found when trying to close that gap without new pockets:

- A 14″ sofa console behind the sofa (sofa at x 17–55, table moved 12″ east to x 108–144) brings the screen to 11′0″–14′9″ and 27–32°. Pockets rise to 35.5 sq ft, and the office route pinches to 31″.
- The same with a 4-seat sofa: 29–32° of view, 49.1 sq ft of pockets.
- A 98″ on the east wall instead of the corner: 14′5″–16′8″, 21–28°, and chair backs cut the bottom of the screen for seat 1.
- Floating the sofa to 8 ft from the TV (as in H2) strands the 80″ × 120″ lake bay behind it, about 60 sq ft.

## What to return

1. **Score: N/10**, on the scale above.
2. **Sub-scores (1–10)** for:
   - couch
   - TV size, distance and placement
   - dining table
   - use of space, including odd pockets
   - floor-plan adherence
3. **For each point deducted:**
   - the measured shortfall
   - the buildable alternative in this room that fixes it, with dimensions and positions
   - your estimate of the score it would reach
4. **Anything in this brief or the files that you find wrong** after checking it yourself.
5. **A one-sentence summary** of your verdict, for the score table.
