# Living-room layout council, round 1

You are one of five independent councillors scoring a proposed furniture layout for a living room. Work read-only:

- Do not edit, create or delete files in the repository `/Users/stefan/code/apartment-furnishing`.
- Do not start subagents.
- Write any scratch files under `/tmp`.

Every file named here is in `/Users/stefan/code/apartment-furnishing/output/living-room-builder/council/round-1/`.

## The owner's goals

Score the layout on two things: how well it uses the space, and how well it meets these targets.

- **Couch:** at least 3 seats; 4–5 is ideal. Seats should watch the TV well.
- **TV:** up to 98″. Bigger is better, at an appropriate viewing distance.
- **Dining table:** seats 4; ideally 6, with real room to pull chairs out.
- **Floor plan:** everything must adhere strictly to it. Nothing else about placement is restricted. A TV on a stand, a corner, or any wall is allowed if it makes better use of the space.

## Scoring scale

| Score | Meaning                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10    | Nothing in this room could do better on any criterion.                                                                                                                   |
| 9     | You would not change anything material.                                                                                                                                  |
| Lower | Deduct only for a shortfall a buildable alternative in this room would fix. Give that alternative in numbers (dimensions and positions) so it can be built and measured. |

A limit every arrangement shares (the column, glass walls, door swings, the island aisle, the one solid TV wall) is not a deduction against this layout. If you think a limit is not forced, prove it with numbers.

## The room (facts)

Read `README.md` → "Room dimensions" and "Living-room TV wall" in the repo. Then look at `listing/photos/unit/floorplan-b4.jpg` and `listing/photos/unit/living-room-island-corner-windows.jpg`.

Inches. x grows east from the west glass; y grows north from the south glass.

- **Room:** 199″ × 204″, with a 120″ ceiling. The north side is open to the kitchen.
- **West wall:** glass, with the balcony door at y 144–185. The door swings out.
- **South wall:** glass at x 0–146 (the lake view), solid at x 146–199.
- **East wall (TV wall):** solid, from y 0 to y 122.
  - Light switch at y 115.5, 45–49.5″ up.
  - Smoke alarm at y 94, 105″ up.
  - Outlet and data at y 63, 16″ up.
- **East side, north of the TV wall:** the walking route from the kitchen and entry to the office landing (y 122–175) and the Bath 2 door (y 180–215).
- **Column:** 33″ across, centered at (61.5, 20.5). Its distance from the south glass is traced, not tape-measured.
- **Island:** x 78–149, y 195.4–236.4.
- **West kitchen counter:** ends at y 204, spanning x 0–35. You walk in from the north-east (x ≈ 175).

## The submission: layout H1

Files:

- `H1.png`: the plan (north up), with sightlines, walking routes labeled at their narrowest point, metrics, the TV-wall elevation and a seat table.
- `H1.json`: every component, with its dimensions and position.
- `H1-eval.txt`: the computed metrics.

To reprint the metrics, run `./eval.ts H1` in `output/living-room-builder/`. `README.md` there explains every check.

| Component        | Size                                  | Position and notes                                                                                                                                       |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TV               | 98″ (86.5″ × 49″ with bezel)          | Wall-mounted on the east wall, centered at y 68. Screen center is 52″ up. Clears the switch and the smoke alarm.                                         |
| Floating console | 90″ × 14″                             | Under the TV.                                                                                                                                            |
| Sofa             | 108″ × 38″, 4 seats about 25″ each    | Faces east. Spans x 25–63, y 41–149. The back is 25″ off the west glass. 3″ clear of the column. Its north end is 5″ past the balcony door's south jamb. |
| Coffee table     | 56″ × 26″                             | Center (92, 84), 16″ off the sofa front.                                                                                                                 |
| Rug              | 10′ × 7′                              | —                                                                                                                                                        |
| Dining table     | 72″ × 36″, 6 chairs (3 per long side) | Runs north–south off the island's south face. Table spans x 102–138, y 122–194. Chairs west of it at x 78–102, east of it at x 138–162.                  |

Builder checks on H1:

- **Collisions:** none.
- **Couch seats:** 4 seats, all prime. Eye-to-screen distance is 12′7″–13′8″; the screen fills 27–31° of view.
- **Dining chairs:** the tightest has 38″ of pull-out room behind the table edge. The builder treats 32–36″ as comfortable.
- **Sightlines:** no dining chair back cuts the screen from any seat.
- **Walking routes:** office route 37″, bath 35″, balcony 41″.
- **Island aisle:** 49″ behind the sofa.

Seat ratings:

- **Prime:** at most 30° off the screen axis, a head turn of at most 35°, and a screen filling 26–46° of view.
- **Good:** at most 45° off-axis and a head turn of at most 50°.

## Why this arrangement

A search screened about 400,000 combinations of TV position (east wall at y 48–66, or the south-east corner), sofa type and pose (3- and 4-seat sofas, sofa with chaise, L sectional), and dining position and type (north–south table off the island, east–west table against the island, free tables in the north band, round tables north-west and south-west).

Ranked on the goals above, the top results all put dining by the kitchen and living by the lake. A south-east corner TV ranked level with the east-wall TV.

The trade-off you should judge: the 6-seat table holds the sofa on the west side, so the 98″ screen is seen from 12½–13½ ft. That is enough for a 30° view, though less than 40°.

## What to return

1. **Score: N/10**, on the scale above.
2. **Sub-scores (1–10)** for:
   - couch
   - TV size, distance and placement
   - dining table
   - use of space
   - floor-plan adherence
3. **For each point deducted:**
   - the measured shortfall
   - the buildable alternative in this room that fixes it, with dimensions and positions
   - your estimate of the score it would reach
4. **Anything in this brief or the files that you find wrong** after checking it yourself.
5. **A one-sentence summary** of your verdict, for the score table.
