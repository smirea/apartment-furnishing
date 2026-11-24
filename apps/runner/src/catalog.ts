// Product import pipeline behind the importItem job (POST /api/catalog/import) and scripts/import-item.ts.
// Captures each page with a headless Camoufox browser, has Codex read it into
// structured product info, uploads the photos and any 3D model, and saves the item to the catalog table.
import { MOUNTS, type CatalogItem, type ItemVariant, type Mount } from "@repo/shared/items";
import { productKey } from "@repo/shared/layouts";
import { join } from "node:path";
import { codexStructured } from "./codex";
import { readGlb } from "./glb";
import { listedLooks } from "./item-variants";
import { assets, db } from "./remote";
import { slug } from "./slug";
import { uploadModel } from "./usdz";

export const ROOT = join(import.meta.dir, "../../..");
export const GALLERY_DIR = "gallery";
for (const bin of ["uv", "pdftotext"])
  if (!Bun.which(bin)) throw new Error(`${bin} CLI not found on PATH`);

const { catalog } = db;

const productSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "brand",
    "price",
    "currency",
    "category",
    "dimensions",
    "dimensionsNote",
    "weightLb",
    "summary",
    "highlights",
    "imageUrl",
    "modelUrl",
    "mount",
    "defaultElevationIn",
    "removeNodes",
    "lookDimensions",
  ],
  properties: {
    name: {
      type: "string",
      description: "Short product name a person would say, without retailer noise",
    },
    brand: { type: ["string", "null"] },
    price: { type: ["number", "null"], description: "Current selling price" },
    currency: { type: "string" },
    category: {
      type: "string",
      enum: [
        "tv",
        "sofa",
        "chair",
        "table",
        "desk",
        "bed",
        "storage",
        "lamp",
        "rug",
        "curtain",
        "decor",
        "appliance",
        "other",
      ],
      description:
        "curtain covers curtains and drapes of any kind, including sheers and blackout panels",
    },
    dimensions: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["width", "height", "depth"],
      properties: {
        width: { type: "number" },
        height: { type: "number" },
        depth: { type: "number" },
      },
      description:
        "Overall assembled size in inches as placed in a room (for TVs: without stand). Width is side to side seen from the front. For sectionals and L-shapes this is the whole footprint.",
    },
    dimensionsNote: {
      type: ["string", "null"],
      description:
        "Say which values were derived rather than listed, and how. Retail spec tables often give the seat depth or one module as the product depth; flag values that look implausible for the product.",
    },
    weightLb: { type: ["number", "null"] },
    summary: { type: "string", description: "One or two plain sentences" },
    highlights: { type: "array", items: { type: "string" }, maxItems: 5 },
    imageUrl: {
      type: ["string", "null"],
      description: "Main product photo URL, copied exactly from the input",
    },
    mount: {
      type: "string",
      enum: [...MOUNTS],
      description:
        "How this is normally placed in a home: floor (sofas, beds, bookcases, floor lamps, TV stands, rugs), wall (wall-mounted TVs, art, mirrors, floating shelves), ceiling (pendants, fans), surface (table lamps, decor that sits on furniture). Large TVs default to wall.",
    },
    defaultElevationIn: {
      type: "number",
      description:
        "Typical height of the item bottom above the floor for that mount, in inches: 0 for floor, about 30 for an 85in wall TV, 0 for surface items (they sit on whatever is below)",
    },
    removeNodes: {
      type: "array",
      items: { type: "string" },
      description:
        "Names from the chosen 3D model's node list to remove for that mount, e.g. a stand node when wall mounted. Empty if none or no model.",
    },
    modelUrl: {
      type: ["string", "null"],
      description: "GLB 3D model URL, copied exactly from the input candidates, or null",
    },
    lookDimensions: {
      type: "array",
      items: { type: "integer" },
      description:
        "Indexes of the listed variation dimensions that change only the product's color, fabric, finish or pattern, never its size, shape, configuration or pack count. Empty when none do or none are listed",
    },
  },
};
type Product = {
  name: string;
  brand: string | null;
  price: number | null;
  currency: string;
  category: string;
  dimensions: { width: number; height: number; depth: number } | null;
  dimensionsNote: string | null;
  weightLb: number | null;
  summary: string;
  highlights: string[];
  imageUrl: string | null;
  modelUrl: string | null;
  mount: Mount;
  defaultElevationIn: number;
  removeNodes: string[];
  lookDimensions: number[];
};

// Every combination of looks and sizes a listing sells, each with its own link; `values` follow `dimensions`.
// `perLook` says whether each look's photos are only on its own page. A swatch's price is known only when that
// swatch shows on the captured page.
export type Variations = {
  dimensions: string[];
  // `image` is the combination's own photo where the store lists one with it.
  combos: { url: string; values: string[]; price: number | null; image?: string | null }[];
  current: string | null;
  perLook: boolean;
};

export type PageData = {
  url: string;
  title: string;
  ogImage: string | null;
  mainImage: string | null;
  models: string[];
  images: string[];
  // Linked PDFs, spec sheets first.
  documents: string[];
  specs: string[];
  variations: Variations | null;
  variationsError: string | null;
  jsonLd: string;
  text: string;
};

export async function fetchPages(urls: string[]): Promise<PageData[]> {
  const proc = Bun.spawn(
    [
      "uv",
      "run",
      "-q",
      "-p",
      "3.12",
      "--with",
      "camoufox[geoip]",
      "python",
      "-I",
      join(import.meta.dir, "fetch-pages.py"),
      ...urls,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`fetch-pages.py exited ${code}: ${err.slice(-2000)}`);
  const pages: PageData[] = JSON.parse(out);
  for (const page of pages) {
    if (/robot or human|captcha|access denied/i.test(page.title))
      throw new Error(`Blocked by bot check on ${page.url} (page title "${page.title}")`);
    // fetch-pages.py already reloaded it; saving what's left would give a product with no photo or facts.
    if (!page.images.length && !page.mainImage && !page.ogImage)
      throw new Error(
        `${page.url} rendered no product, even after reloading it. Try the import again.`,
      );
  }
  return pages;
}

async function glbNodeNames(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    return (readGlb(new Uint8Array(await res.arrayBuffer())).nodes ?? []).flatMap((n) =>
      n.name ? [n.name] : [],
    );
  } catch {
    return [];
  }
}

export const pageContext = (page: PageData) => `URL: ${page.url}
Title: ${page.title}
Image candidates: ${[page.ogImage, page.mainImage].filter(Boolean).join(" ") || "none"}

Spec pairs:
${page.specs.join("\n")}

JSON-LD:
${page.jsonLd}

Visible page text:
${page.text}`;

// The listing's variation dimensions, numbered, with their values.
export const variationLines = (variations: Variations | null) =>
  variations?.dimensions
    .map(
      (d, i) =>
        `${i}. ${d}: ${[...new Set(variations.combos.map((c) => c.values[i]))].join(" | ")}`,
    )
    .join("\n") ?? "none";

async function readProduct(page: PageData, mount?: Mount): Promise<Product> {
  const modelLines = await Promise.all(
    page.models
      .slice(0, 3)
      .map(async (url) => `${url} (nodes: ${(await glbNodeNames(url)).join(", ") || "unknown"})`),
  );
  return codexStructured<Product>(
    `Extract product information from this retailer page capture. Use only facts in the input. If width/height/depth are not all listed but can be derived (for example a TV's width from its diagonal and 16:9 aspect), derive them and explain in dimensionsNote; otherwise use null. Convert sizes to inches and weight to pounds. Pick imageUrl from the image candidates and modelUrl from the 3D model candidates exactly as written. ${mount ? `It will be mounted on a ${mount}: set mount to ${mount}, defaultElevationIn to the usual height of its bottom edge when hung there, and removeNodes to any model nodes it doesn't need there.` : "Decide how the item mounts in a home and which model nodes to drop for that mount."}

3D model candidates:
${modelLines.join("\n") || "none"}

Variation dimensions the listing sells, with their values:
${variationLines(page.variations)}

${pageContext(page)}`,
    productSchema,
  );
}

// Text of the page's linked spec sheets, for prompts that need exact dimensions.
export async function readDocuments(urls: string[]): Promise<string> {
  const texts = await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`${res.status} downloading ${url}`);
      const proc = Bun.spawn(["pdftotext", "-layout", "-", "-"], {
        stdin: new Uint8Array(await res.arrayBuffer()),
        stdout: "pipe",
        stderr: "pipe",
      });
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      if (code !== 0) throw new Error(`pdftotext failed on ${url}: ${err}`);
      return `Document ${url}:\n${out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n")}`;
    }),
  );
  return texts.join("\n\n").slice(0, 30000);
}

export async function download(url: string) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${res.status} downloading ${url}`);
  return res.arrayBuffer();
}

const extension = (url: string) => url.match(/\.(png|webp|jpe?g)/i)?.[1] ?? "jpg";

// Main photo as image.<ext> plus the listing gallery, under <id>/ in the bucket. Returns the main photo's asset URL,
// versioned because a reimport overwrites the file and the iOS app keeps every asset URL on disk for good.
export async function downloadPhotos(
  id: string,
  imageUrl: string | null,
  gallery: string[],
): Promise<string | null> {
  await assets.removeAll(`${id}/${GALLERY_DIR}/`);
  await Promise.all(
    gallery.map(async (url, i) =>
      assets.put(
        `${id}/${GALLERY_DIR}/${String(i + 1).padStart(2, "0")}.${extension(url)}`,
        await download(url),
      ),
    ),
  );
  if (!imageUrl) return null;
  const ext = extension(imageUrl);
  await assets.put(`${id}/image.${ext}`, await download(imageUrl));
  return `/api/assets/${id}/image.${ext}?v=${Date.now()}`;
}

// `category` limits an import to one kind of product, so a link pasted in the Bed panel can't add a lamp nobody sees.
// `mount` sets how it is placed, so a link pasted in the Wall panel hangs on a wall.
export async function importProducts(
  urls: string[],
  log: (line: string) => void = () => {},
  category?: string,
  mount?: Mount,
): Promise<CatalogItem[]> {
  log(`capturing ${urls.length} page(s)…`);
  const imported: CatalogItem[] = [];
  for (const page of await fetchPages(urls)) {
    log(`→ ${page.title.slice(0, 80)} (${page.models.length} model candidate(s))`);
    const { imageUrl, modelUrl, lookDimensions, ...product } = await readProduct(page, mount);
    if (mount) product.mount = mount;
    // TVs are built into the plan; the TV panel only needs their size.
    if (product.category === "tv")
      throw new Error(
        `${product.name} is a TV: paste its link in the TV panel, which reads its size`,
      );
    if (category && product.category !== category)
      throw new Error(`${product.name} is not a ${category} (read as ${product.category})`);
    const brandPrefix =
      product.brand && !product.name.toLowerCase().startsWith(product.brand.toLowerCase())
        ? `${product.brand} `
        : "";
    if (page.variationsError)
      log(`  could not read the listing's other looks: ${page.variationsError}`);
    const looks = page.variations && listedLooks(page.variations, lookDimensions);
    // Same product, same entry: re-importing a link updates it instead of adding a near-duplicate under whatever name
    // the LLM picks this time.
    const existing = (await catalog.all()).find(
      (item) => productKey(item.url) === productKey(page.url),
    );
    const id = existing?.id ?? slug(brandPrefix + product.name);

    const image = await downloadPhotos(id, imageUrl, page.images);
    let model: string | null = null;
    let modelSource: CatalogItem["modelSource"] = null;
    if (modelUrl) {
      model = await uploadModel(id, new Uint8Array(await download(modelUrl)));
      modelSource = "listing";
    } else if (existing?.modelSource === "generated") {
      ({ model, modelSource } = existing);
      // The generated model was sized from the photos, which beat the spec table it was read from.
      ({ dimensions: product.dimensions, dimensionsNote: product.dimensionsNote } = existing);
    }

    // Recolored looks stay good while the model they were made from does.
    const kept = model && model === existing?.model ? existing.variants : [];
    const variants = looks
      ? await lookVariants(id, looks, page, image, product.price, kept, log)
      : [];

    const item: CatalogItem = {
      id,
      url: page.url.split("?")[0]!,
      importedAt: new Date().toISOString(),
      ...product,
      group: existing?.group ?? null,
      image,
      model,
      modelSource,
      variantLabel: looks?.label ?? "Color",
      variants,
      variant: looks?.current.id ?? null,
    };
    await catalog.put(item);
    log(
      `  saved ${id}: ${product.price ?? "?"} ${product.currency}, dims ${JSON.stringify(product.dimensions)}, ${page.images.length} photo(s), model ${model ? "yes" : "no"}, ${variants.length} look(s)`,
    );
    // Without a model the Worker queues one, whose build recolors the looks after.
    if (model && variants.some((v) => !recolored(item, v)))
      await db.jobs.enqueue("buildVariants", id);
    imported.push(item);
  }
  // The group is only a list heading: a failed call leaves the items under "Other" and the next run retries them.
  await groupFurniture(log).catch((error) =>
    log(`grouping failed, new items stay ungrouped: ${error}`),
  );
  return Promise.all(imported.map((item) => catalog.read(item.id)));
}

// Gives items imported before looks existed every look their listing sells, without reimporting them: a reimport would
// read the name, category and dimensions again and undo fixes made by hand since. Answers how many looks it found.
export async function addLooks(
  item: CatalogItem,
  log: (line: string) => void = () => {},
  dry = false,
) {
  const [page] = await fetchPages([item.url]);
  if (page!.variationsError)
    throw new Error(`could not read the listing's looks: ${page!.variationsError}`);
  if (!page!.variations) return 0;
  const { lookDimensions } = await codexStructured<{ lookDimensions: number[] }>(
    `${item.name} (${item.category}) is listed at ${page!.url} as "${page!.title}". The listing sells these variation dimensions, with their values:

${variationLines(page!.variations)}`,
    {
      type: "object",
      additionalProperties: false,
      required: ["lookDimensions"],
      properties: { lookDimensions: productSchema.properties.lookDimensions },
    },
  );
  const looks = listedLooks(page!.variations, lookDimensions);
  log(
    `${item.id}: ${variationLines(page!.variations).replace(/\n/g, "; ")} → ${looks ? `${looks.looks.length} ${looks.label} looks, the model's ${looks.current.name}` : "one look"}`,
  );
  if (!looks || dry) return looks?.looks.length ?? 0;
  const variants = await lookVariants(item.id, looks, page!, item.image, item.price, [], log);
  const current = await catalog.read(item.id);
  await catalog.put({ ...current, variantLabel: looks.label, variants, variant: looks.current.id });
  if (current.model) await db.jobs.enqueue("buildVariants", item.id);
  return variants.length;
}

export const recolored = (item: Pick<CatalogItem, "variant">, look: ItemVariant) =>
  look.swatch !== null && (look.id === item.variant || look.model !== null);

// Each look's photo, from its own page where the store shows a look's photos only there. Prices are the swatches'
// where a captured page showed them.
async function lookVariants(
  id: string,
  { current, looks }: NonNullable<ReturnType<typeof listedLooks>>,
  page: PageData,
  image: string | null,
  price: number | null,
  kept: ItemVariant[],
  log: (line: string) => void,
): Promise<ItemVariant[]> {
  const prices = new Map(page.variations!.combos.map((c) => [c.url, c.price]));
  const photos = new Map(looks.map((look) => [look, look.combo.image ?? null]));
  const capture = page.variations!.perLook
    ? looks.filter((look) => look !== current && !photos.get(look))
    : [];
  if (capture.length) {
    log(`  capturing ${capture.length} more page(s) for the photos of ${looks.length} looks…`);
    const pages = await fetchPages(capture.map((look) => look.combo.url));
    pages.forEach((other, i) => {
      photos.set(capture[i]!, other.images[0] ?? other.mainImage ?? other.ogImage);
      for (const c of other.variations?.combos ?? [])
        if (c.price !== null) prices.set(c.url, c.price);
    });
  }
  const variants: ItemVariant[] = [];
  for (const look of looks) {
    const photo = photos.get(look);
    const old = kept.find((v) => v.id === look.id);
    variants.push({
      id: look.id,
      name: look.name,
      url: look.combo.url,
      price: look === current ? price : (prices.get(look.combo.url) ?? null),
      image:
        look === current
          ? image
          : photo
            ? await downloadPhotos(`${id}/variants/${look.id}`, photo, [])
            : null,
      swatch: old?.swatch ?? null,
      model: old?.model ?? null,
    });
  }
  return variants;
}

let groupingQueue = Promise.resolve();

// One run at a time, so the startup backfill and an import never both send the same ungrouped items, and each run
// sees the groups the previous one coined.
export function groupFurniture(log: (line: string) => void = () => {}) {
  const run = groupingQueue.then(() => assignGroups(log));
  groupingQueue = run.catch(() => {});
  return run;
}

// Names the type of every item that has none, in one call over the whole catalog so new imports join the groups
// already in use instead of coining near-duplicates.
async function assignGroups(log: (line: string) => void) {
  const all = await catalog.all();
  const missing = all.filter((item) => !item.group);
  if (!missing.length) return;
  const groups = [...new Set(all.map((item) => item.group).filter(Boolean))];
  const { assignments } = await codexStructured<{ assignments: { id: string; group: string }[] }>(
    `Group these furniture products by type, so a furniture list can show each type under a small section header. Keep types high level and plural, in sentence case: for example "Couches", "Chairs", "Dining tables", "Coffee tables", "Standing desks", "Beds", "Lamps", "Rugs". A sectional, a sofa and a loveseat are all "Couches"; an accent chair, a swivel chair and an armchair are all "Chairs". Never split a type by style, material, color or size. Reuse these existing groups where a product fits: ${groups.join(", ") || "none yet"}.

${missing.map((item) => `${item.id}: ${item.name} (${item.category}). ${item.summary}`).join("\n")}`,
    {
      type: "object",
      additionalProperties: false,
      required: ["assignments"],
      properties: {
        assignments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "group"],
            properties: { id: { type: "string" }, group: { type: "string" } },
          },
        },
      },
    },
  );
  const byId = new Map(assignments.map((a) => [a.id, a.group]));
  for (const item of missing) {
    const group = byId.get(item.id);
    if (!group) throw new Error(`codex assigned no group to ${item.id}`);
    await catalog.put({ ...(await catalog.read(item.id)), group });
  }
  log(`grouped ${missing.length} item(s): ${[...new Set(byId.values())].join(", ")}`);
}
