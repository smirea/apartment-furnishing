// Usage: bun scripts/import-item.ts <product-url> [more urls...]
// Same pipeline as the "Import" box in the UI; see apps/server/src/catalog.ts.
import { importProducts } from '../apps/server/src/catalog';

const urls = process.argv.slice(2);
if (!urls.length) {
	console.error('usage: bun scripts/import-item.ts <product-url> [...]');
	process.exit(1);
}
await importProducts(urls, console.log);
