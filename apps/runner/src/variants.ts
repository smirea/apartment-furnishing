// An item's looks (colors, fabrics, finishes) all share its model's shape, so each look's model is that model with its
// materials recolored. Codex reads every look's photo against the model's materials once and answers each material's
// color per look; the runner writes the recolored copies.
import type { CatalogItem, ItemVariant } from "@repo/shared/items";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { codexStructured } from "./codex";
import { fromHex, readGlb, recolorGlb, toHex } from "./glb";
import { assets, db } from "./remote";

const HEX = "^#[0-9a-fA-F]{6}$";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["looks"],
  properties: {
    looks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "swatch", "materials"],
        properties: {
          id: { type: "string" },
          swatch: { type: "string", pattern: HEX },
          materials: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["index", "color"],
              properties: { index: { type: "integer" }, color: { type: "string", pattern: HEX } },
            },
          },
        },
      },
    },
  },
};

type Answer = {
  looks: { id: string; swatch: string; materials: { index: number; color: string }[] }[];
};

const assetPath = (url: string) =>
  decodeURIComponent(new URL(url, "http://x").pathname.replace(/^\/api\/assets\//, ""));

async function fetchAsset(path: string) {
  const res = await assets.get(path);
  if (!res) throw new Error(`${path} is missing from the bucket`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function buildVariants(id: string, log: (line: string) => void = () => {}) {
  const item = await db.catalog.read(id);
  if (item.variants.length < 2) return;
  if (!item.model) throw new Error(`${id} has no model to recolor yet`);
  const listed = item.variants.find((v) => v.id === item.variant);
  if (!listed) throw new Error(`${id} lists no look ${item.variant}`);
  const glb = await fetchAsset(assetPath(item.model));
  const materials = readGlb(glb).materials ?? [];
  if (!materials.length) throw new Error(`${id}'s model has no materials to recolor`);

  const work = await mkdtemp(join(tmpdir(), `variants-${id}-`));
  try {
    // The listing's look first: the model's colors were read from it.
    const ordered = [listed, ...item.variants.filter((v) => v !== listed)];
    const photos: { look: ItemVariant; file: string }[] = [];
    for (const look of ordered) {
      const image = look === listed ? (item.image ?? look.image) : look.image;
      if (!image) continue;
      const path = assetPath(image);
      const file = join(work, `${photos.length + 1}-${look.id}${extname(path)}`);
      await Bun.write(file, await fetchAsset(path));
      photos.push({ look, file });
    }
    const unseen = ordered.filter((look) => !photos.some((p) => p.look === look));
    log(
      `codex: reading ${item.variants.length} looks of ${id} against ${materials.length} material(s)`,
    );
    const answer = await codexStructured<Answer>(
      prompt(item, listed, materials, photos, unseen),
      schema,
      {
        images: photos.map((p) => p.file),
        effort: "medium",
      },
    );
    const read = new Map(answer.looks.map((look) => [look.id, look]));
    const missing = item.variants.filter((v) => !read.has(v.id)).map((v) => v.id);
    if (missing.length) throw new Error(`codex gave no colors for ${missing.join(", ")}`);

    const built = new Map<string, Pick<ItemVariant, "swatch" | "model">>();
    const version = Date.now();
    for (const look of item.variants) {
      const colors = read.get(look.id)!;
      fromHex(colors.swatch);
      if (look === listed) {
        built.set(look.id, { swatch: colors.swatch, model: null });
        continue;
      }
      const byIndex = new Map(colors.materials.map((m) => [m.index, m.color]));
      const unset = materials.map((_, i) => i).filter((i) => !byIndex.has(i));
      if (unset.length)
        throw new Error(`codex gave ${look.id} no color for material(s) ${unset.join(", ")}`);
      const path = `${id}/variants/${look.id}/model.glb`;
      await assets.put(path, recolorGlb(glb, byIndex));
      built.set(look.id, { swatch: colors.swatch, model: `/api/assets/${path}?v=${version}` });
    }

    // Read back, so a model rebuilt or a reimport saved meanwhile isn't overwritten with copies of the old one.
    const current = await db.catalog.read(id);
    if (current.model !== item.model)
      throw new Error(`${id}'s model changed while its looks were recolored`);
    await db.catalog.put({
      ...current,
      variants: current.variants.map((v) => ({ ...v, ...built.get(v.id) })),
    });
    log(`codex: ${id} looks done: ${answer.looks.map((l) => `${l.id} ${l.swatch}`).join(", ")}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function prompt(
  item: CatalogItem,
  listed: ItemVariant,
  materials: NonNullable<ReturnType<typeof readGlb>["materials"]>,
  photos: { look: ItemVariant }[],
  unseen: ItemVariant[],
) {
  const materialLines = materials.map((m, i) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    return `${i}. "${m.name ?? `material ${i}`}": ${toHex(pbr.baseColorFactor)}, roughness ${pbr.roughnessFactor ?? 1}, metalness ${pbr.metallicFactor ?? 1}`;
  });
  return `${item.name} (${item.category}) is sold in ${item.variants.length} looks, which its listing calls ${item.variantLabel}. A 3D model of it was colored to match the look "${listed.name}" with these materials, by index:

${materialLines.join("\n")}

Photos of the looks, attached in this order:

${photos.map(({ look }, i) => `${i + 1}. id ${look.id}: ${look.name}${look === listed ? " (the look the model shows)" : ""}`).join("\n")}
${unseen.length ? `\nLooks without a photo, to judge from their name alone:\n\n${unseen.map((look) => `- id ${look.id}: ${look.name}`).join("\n")}\n` : ""}
For every look id, give each material index's color in that look as #rrggbb. A part the looks share (a liner, rings, hardware, legs that look the same in every photo) keeps the color it has now. A part the look changes takes the color the product has in that look's photo. Listing photos are often staged in warm or dim rooms and the models are lit evenly, so judge each look against the first photo and the colors the model has for it: a look that is darker, warmer or more saturated than the first one in the photos should be that much darker, warmer or more saturated than the model's colors. For the look the model shows, repeat its colors.

Also give each look a swatch: its main color as #rrggbb, the one a person would pick from a swatch card.`;
}
