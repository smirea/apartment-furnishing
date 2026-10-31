# Headless page capture for scripts/import-item.ts. Prints one JSON array of page data.
# Camoufox (a fingerprint-hardened Firefox) because Walmart's bot check blocks headless Chrome,
# stealth-flagged Chrome, Playwright/agent-browser and patchright.
# Run: uv run -p 3.12 --with 'camoufox[geoip]' python -I scripts/fetch-pages.py <url>...
import json
import sys

from camoufox.sync_api import Camoufox

SETTLE_MS = 6000

EXTRACT = r"""() => {
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
	const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).join('\n').slice(0, 15000);
	return {
		url: location.href,
		title: document.title,
		ogImage: meta('og:image'),
		mainImage: document.querySelector('#landingImage, [data-testid="hero-image"] img, main img')?.src ?? null,
		models: uniq(models),
		specs,
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
