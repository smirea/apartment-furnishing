// Usage: bun scripts/import-item.ts <product-url> [more urls...]
// Same pipeline as the "Import" box in the UI, run here instead of through the runner; see apps/runner/src/catalog.ts.
// It writes to SERVER_URL, so `bun run dev` must be up, or run it with prod's env to import straight into production.
import { importProducts } from '../apps/runner/src/catalog';
import { generateModel } from '../apps/runner/src/generate-model';

const urls = process.argv.slice(2);
if (!urls.length) {
	console.error('usage: bun scripts/import-item.ts <product-url> [...]');
	process.exit(1);
}
for (const item of await importProducts(urls, console.log)) if (!item.model) await generateModel(item, console.log);
