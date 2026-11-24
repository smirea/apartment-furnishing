// Usage: bun scripts/add-looks.ts [--dry] [item ids...]
// Gives furniture imported before looks existed every color, fabric and finish its listing sells, and queues the
// recolored models. With no ids it checks every item that has no looks yet. `--dry` only prints what each listing sells.
// It writes to SERVER_URL, so `bun run dev` must be up, or run it with prod's env to update production; the runner
// there builds the recolored models.
import { addLooks } from "../apps/runner/src/catalog";
import { db } from "../apps/runner/src/remote";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const ids = args.filter((a) => a !== "--dry");
const items = (await db.catalog.all()).filter((item) =>
  ids.length ? ids.includes(item.id) : !item.variants.length && item.category !== "rug",
);
const missing = ids.filter((id) => !items.some((item) => item.id === id));
if (missing.length) throw new Error(`no catalog item ${missing.join(", ")}`);

const failed: string[] = [];
for (const item of items) {
  try {
    await addLooks(item, console.log, dry);
  } catch (error) {
    failed.push(item.id);
    console.error(`✗ ${item.id}:`, error instanceof Error ? error.message : error);
  }
}
if (failed.length) {
  console.error(`failed: ${failed.join(" ")}`);
  process.exit(1);
}
