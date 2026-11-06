# Review rounds

Each round, one layout went to a panel of three reviewers (grok-4.7, gpt-6.1-terra, claude-sonnet-5-5). Each reviewer scored it 1–10 against the brief, on its own, and checked the geometry itself. Every `round-N-<id>.json` holds the layout exactly as it was reviewed, the scores and the main findings. To open a layout in the builder, paste its `layout` object into **Layout JSON → Load JSON**.

| Round | Layout                                                              | grok           | terra | sonnet | What changed next                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------- | -------------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | A5: 6-seat L against the west glass, soft ottoman                   | 6              | 7     | 7.5    | Cleared the door and column, put a hard top on the ottoman, moved the TV 2″ off the switch, added a legroom check to the builder                                                    |
| 2     | A7: the same L, clear of the door and column, walnut-topped ottoman | 7.5            | 7.5   | 8      | Shortened and shifted the main run for 4″ margins, switched to a buyable ottoman and tray, kept the rug under the sofa, added a sightline-occlusion check and stricter seat ratings |
| 3     | A8: the same L at 115″, buyable Aries ottoman and tray, 4″ margins  | — (superseded) | 9     | 8.5    | The owner capped the TV at 98″, so every layout was re-searched; a corner TV beat every wall-TV pose                                                                                |
| 4     | G2: 98″ corner TV, 6-seat L facing it                               | 8              | 9     | 9      | Moved the sofa, ottoman and rug 4″ north to clear the column (grok's numbers)                                                                                                       |

Sub-scores per reviewer (seating, TV, coffee table, use of space, floor-plan adherence) are in each JSON file.
