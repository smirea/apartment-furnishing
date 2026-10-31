// Usage: bun scripts/import-item.ts <product-url> [more urls...]
// Same pipeline as the "Import" box in the UI; see apps/server/src/catalog.ts.
import { importProducts } from '../apps/server/src/catalog';
import { generateModel } from '../apps/server/src/generate-model';

const urls = process.argv.slice(2);
if (!urls.length) {
	console.error('usage: bun scripts/import-item.ts <product-url> [...]');
	process.exit(1);
}
for (const item of await importProducts(urls, console.log)) if (!item.model) await generateModel(item, console.log);
