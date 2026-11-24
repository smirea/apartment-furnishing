// Which of a furniture listing's combinations become the item's looks, kept apart from the import so it can be tested
// without the runner's tools.
import type { Variations } from "./catalog";
import { slug } from "./slug";

type Combo = Variations["combos"][number];

export type ListedLook = { id: string; name: string; combo: Combo };

// One look per value of the look dimensions (color, fabric, finish), each in the combination closest to the one the
// page shows: the same size and configuration where the listing sells it, so its link and price are for the item as
// imported. The other dimensions change the shape, which a recolor can't show. Sorted by name, the page's own look
// wherever it falls. Null when the listing sells one look.
export function listedLooks(
  variations: Variations,
  lookDims: number[],
): { current: ListedLook; looks: ListedLook[]; label: string } | null {
  const dims = lookDims.filter((i) => i >= 0 && i < variations.dimensions.length);
  const current =
    variations.combos.find((c) => c.url === variations.current) ?? variations.combos[0]!;
  const nameOf = (c: Combo) => dims.map((i) => c.values[i]).join(" / ");
  const closeness = (c: Combo) =>
    c === current
      ? Infinity
      : c.values.filter((v, i) => !dims.includes(i) && v === current.values[i]).length;
  const best = new Map<string, Combo>();
  for (const combo of variations.combos) {
    const name = nameOf(combo);
    if (!name) continue;
    const kept = best.get(name);
    if (!kept || closeness(combo) > closeness(kept)) best.set(name, combo);
  }
  const looks: ListedLook[] = [];
  for (const [name, combo] of [...best].toSorted(([a], [b]) => a.localeCompare(b))) {
    const base = slug(name) || "look";
    let id = base;
    for (let n = 2; looks.some((l) => l.id === id); n++) id = `${base}-${n}`;
    looks.push({ id, name, combo });
  }
  if (looks.length < 2) return null;
  return {
    current: looks.find((l) => l.combo === current) ?? looks[0]!,
    looks,
    label: dims.map((i) => variations.dimensions[i]).join(" / "),
  };
}
