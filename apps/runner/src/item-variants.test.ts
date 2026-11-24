import { expect, test } from "bun:test";
import type { Variations } from "./catalog";
import { listedLooks } from "./item-variants";

const listing = (combos: [color: string, size: string][], current: string): Variations => ({
  dimensions: ["Color", "Size"],
  combos: combos.map(([color, size]) => ({
    url: `${color}-${size}`,
    values: [color, size],
    price: null,
  })),
  current,
  perLook: true,
});

test("one look per color, each in the size the page shows where the color comes in it", () => {
  const looks = listedLooks(
    listing(
      [
        ["Olive Green", "84"],
        ["Olive Green", "120"],
        ["Black", "84"],
        ["Black", "120"],
        ["Navy", "84"],
      ],
      "Olive Green-120",
    ),
    [0],
  )!;
  expect(looks.looks.map((l) => [l.id, l.combo.url])).toEqual([
    ["black", "Black-120"],
    ["navy", "Navy-84"],
    ["olive-green", "Olive Green-120"],
  ]);
  expect(looks.current.id).toBe("olive-green");
  expect(looks.label).toBe("Color");
});

test("a listing with one color, or no dimension that only recolors it, sells one look", () => {
  expect(
    listedLooks(
      listing(
        [
          ["Olive", "84"],
          ["Olive", "120"],
        ],
        "Olive-84",
      ),
      [0],
    ),
  ).toBeNull();
  expect(
    listedLooks(
      listing(
        [
          ["Olive", "84"],
          ["Black", "84"],
        ],
        "Olive-84",
      ),
      [],
    ),
  ).toBeNull();
});

test("names that slug the same get their own ids", () => {
  const looks = listedLooks(
    listing(
      [
        ["Grey", "84"],
        ["Grey!", "84"],
      ],
      "Grey-84",
    ),
    [0],
  )!;
  expect(looks.looks.map((l) => l.id)).toEqual(["grey", "grey-2"]);
});
