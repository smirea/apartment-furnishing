# Headless page capture for scripts/import-item.ts. Prints one JSON array of page data.
# Camoufox (a fingerprint-hardened Firefox) because Walmart's bot check blocks headless Chrome,
# stealth-flagged Chrome, Playwright/agent-browser and patchright.
# Run: uv run -p 3.12 --with 'camoufox[geoip]' python -I scripts/fetch-pages.py <url>...
import json
import sys

from camoufox.sync_api import Camoufox

SETTLE_MS = 6000

EXTRACT = r"""async () => {
	const html = document.documentElement.outerHTML;
	const meta = (p) => document.querySelector(`meta[property="${p}"],meta[name="${p}"]`)?.content ?? null;
	const uniq = (a) => [...new Set(a)];
	const unescape = (s) => s.replace(/\\u002F/g, '/').replace(/\\/g, '');
	// indexOf scan instead of a regex: Firefox's regex engine overflows its stack on Amazon-sized HTML.
	const glbs = [];
	const stop = new Set(['"', "'", ' ', '\n', '(', ')', '<', '>']);
	for (let i = html.indexOf('.glb'); i !== -1; i = html.indexOf('.glb', i + 4)) {
		let a = i;
		while (a > 0 && !stop.has(html[a - 1])) a--;
		let b = i + 4;
		while (b < html.length && !stop.has(html[b])) b++;
		glbs.push(html.slice(a, b));
	}
	const models = uniq(glbs.map(unescape))
		.map((u) => (u.startsWith('http') ? u : u.includes('asset-ingested/') ? 'https://3d.walmartimages.com/' + u.slice(u.indexOf('asset-ingested/')) : null))
		.filter(Boolean);
	const specs = uniq((html.match(/"name":"[^"]{1,60}","value":"[^"]{1,120}"/g) ?? []).map(unescape)).slice(0, 150);
	// Full-size gallery photos, which include the dimension diagrams the spec table often gets wrong.
	const gallery = () => {
		const at = html.indexOf("'colorImages'");
		if (at !== -1) {
			const start = html.indexOf("parseJSON('", at) + 11;
			const images = JSON.parse(html.slice(start, html.indexOf("')", start)).replace(/\\'/g, "'"));
			return images.map((i) => i.hiRes ?? i.large).filter(Boolean);
		}
		const next = document.getElementById('__NEXT_DATA__');
		if (next) return JSON.parse(next.textContent).props.pageProps.initialData.data.product.imageInfo.allImages.map((i) => i.url);
		return [];
	};
	// Shopify stores serve the whole product, gallery included, at <product path>.js. Camoufox evaluates in an
	// isolated world without the page's globals, so detect the store from its CDN instead of window.Shopify.
	const shopify = async () =>
		html.includes('cdn.shopify.com') && location.pathname.includes('/products/')
			? (await (await fetch(`${location.pathname}.js`)).json()).images.map((u) => (u.startsWith('//') ? `https:${u}` : u))
			: [];
	// Any other store: the schema.org Product's images.
	const ldImages = () =>
		[...document.querySelectorAll('script[type="application/ld+json"]')]
			.flatMap((s) => {
				try {
					return [JSON.parse(s.textContent)].flat();
				} catch {
					return [];
				}
			})
			.filter((d) => d['@type'] === 'Product')
			.flatMap((d) => [d.image].flat().map((i) => (typeof i === 'string' ? i : i?.url)))
			.filter(Boolean);
	let images = [];
	try {
		images = uniq(gallery());
		if (!images.length) images = uniq(await shopify());
		if (!images.length) images = uniq(ldImages());
	} catch {}
	// Linked PDFs, spec sheets first: manufacturers put exact dimensions there that product pages round or omit.
	const pdfs = [];
	for (let i = html.indexOf('.pdf'); i !== -1; i = html.indexOf('.pdf', i + 4)) {
		let a = i;
		while (a > 0 && !stop.has(html[a - 1])) a--;
		let b = i + 4;
		while (b < html.length && !stop.has(html[b])) b++;
		try {
			pdfs.push(new URL(unescape(html.slice(a, b)), location.href).href);
		} catch {}
	}
	const documents = uniq(pdfs.filter((u) => /^https?:/.test(u) && /\/[^/]+\.pdf$/i.test(new URL(u).pathname)))
		.sort((x, y) => Number(/spec|dimension|guide|sheet/i.test(y)) - Number(/spec|dimension|guide|sheet/i.test(x)))
		.slice(0, 3);
	// Every combination of colors, patterns and sizes the listing sells, each with its own link: `values` follow
	// `dimensions`. `perLook` says whether each look's photos are only on its own page.
	const amazonVariations = () => {
		const base = html.indexOf('"dimensionValuesDisplayData"');
		if (base === -1) return null;
		const jsonAt = (at) => {
			let i = html.indexOf(':', at) + 1;
			while (/\s/.test(html[i])) i++;
			const open = html[i];
			const close = { '{': '}', '[': ']' }[open];
			let depth = 0;
			let quoted = false;
			for (let j = i; j < html.length; j++) {
				const c = html[j];
				if (quoted) {
					if (c === '\\') j++;
					else if (c === '"') quoted = false;
				} else if (c === '"') quoted = true;
				else if (c === open) depth++;
				else if (c === close && --depth === 0) return JSON.parse(html.slice(i, j + 1));
			}
			return null;
		};
		const display = jsonAt(base);
		const keys = jsonAt(html.lastIndexOf('"dimensions"', base));
		const labelsAt = html.indexOf('"variationDisplayLabels"', base);
		const labels = labelsAt === -1 ? {} : jsonAt(labelsAt);
		// A swatch shows the price of the combination it links to, which is only known for the swatches on this page.
		const prices = {};
		for (const li of document.querySelectorAll('[id^="inline-twister-row-"] li[data-asin], #twister li[data-defaultasin]')) {
			const price = li.innerText.match(/\$\s?([\d,]+\.\d{2})/);
			if (price) prices[li.dataset.asin ?? li.dataset.defaultasin] = Number(price[1].replace(/,/g, ''));
		}
		const current = location.pathname.match(/\/dp\/([A-Z0-9]{10})/)?.[1];
		return {
			dimensions: keys.map((k) => labels[k] ?? k),
			combos: Object.entries(display).map(([asin, values]) => ({
				url: `${location.origin}/dp/${asin}`,
				values,
				price: prices[asin] ?? null,
			})),
			current: current ? `${location.origin}/dp/${current}` : null,
			perLook: true,
		};
	};
	const walmartVariations = () => {
		const next = document.getElementById('__NEXT_DATA__');
		const product = next && JSON.parse(next.textContent).props?.pageProps?.initialData?.data?.product;
		if (!product?.variantCriteria?.length || !product.variantsMap) return null;
		const criteria = product.variantCriteria;
		return {
			dimensions: criteria.map((c) => c.name),
			combos: Object.values(product.variantsMap).map((v) => ({
				url: `${location.origin}/ip/${v.usItemId}`,
				values: criteria.map((c) => c.variantList.find((x) => v.variants.includes(x.id))?.name ?? ''),
				price: v.priceInfo?.currentPrice?.price ?? null,
			})),
			current: `${location.origin}/ip/${product.usItemId}`,
			perLook: true,
		};
	};
	const shopifyVariations = (product) => {
		if (!product?.variants?.length) return null;
		const url = (v) => `${location.origin}${location.pathname}?variant=${v.id}`;
		const current = new URLSearchParams(location.search).get('variant');
		return {
			dimensions: product.options.map((o) => (typeof o === 'string' ? o : o.name)),
			combos: product.variants.map((v) => ({ url: url(v), values: v.options, price: v.price / 100 })),
			current: url(product.variants.find((v) => String(v.id) === current) ?? product.variants[0]),
			perLook: false,
		};
	};
	// Furniture imports share this capture, so a store that changed its markup costs only the other looks.
	let variations = null;
	let variationsError = null;
	try {
		const shopifyProduct = html.includes('cdn.shopify.com') && location.pathname.includes('/products/')
			? await (await fetch(`${location.pathname}.js`)).json()
			: null;
		variations = amazonVariations() ?? walmartVariations() ?? shopifyVariations(shopifyProduct);
		if (variations && variations.combos.length < 2) variations = null;
	} catch (error) {
		variationsError = String(error);
	}
	const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).join('\n').slice(0, 15000);
	return {
		url: location.href,
		title: document.title,
		ogImage: meta('og:image'),
		mainImage: document.querySelector('#landingImage, [data-testid="hero-image"] img, main img')?.src ?? null,
		models: uniq(models),
		images: images.slice(0, 12),
		documents,
		specs,
		variations,
		variationsError,
		jsonLd,
		text: document.body.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 40000),
	};
}"""

pages = []
with Camoufox(headless=True, humanize=True) as browser:
    page = browser.new_page()
    for url in sys.argv[1:]:
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(SETTLE_MS)
        pages.append(page.evaluate(EXTRACT))
print(json.dumps(pages))
