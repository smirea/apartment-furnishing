import { join, normalize } from 'node:path';
import { ROOT } from './catalog';

const IDEAS_DIR = join(ROOT, 'ideas');
const FILES_PREFIX = '/api/ideas/files/';
const isRelative = (url: string) => !/^([a-z]+:|\/|#)/i.test(url);

// ideas/README.md stays the one source so it reads the same on GitHub; its image paths are relative to that folder.
export async function ideasHtml() {
	const html = Bun.markdown.html(await Bun.file(join(IDEAS_DIR, 'README.md')).text());
	return new HTMLRewriter()
		.on('img[src]', {
			element(el) {
				const src = el.getAttribute('src')!;
				if (isRelative(src)) el.setAttribute('src', FILES_PREFIX + src);
				el.setAttribute('loading', 'lazy');
			},
		})
		.on('a[href]', {
			element(el) {
				const href = el.getAttribute('href')!;
				if (isRelative(href)) el.setAttribute('href', FILES_PREFIX + href);
				el.setAttribute('target', '_blank');
				el.setAttribute('rel', 'noreferrer');
			},
		})
		.transform(html);
}

export async function ideaFile(pathname: string) {
	const rel = normalize(decodeURIComponent(pathname.slice(FILES_PREFIX.length)));
	if (rel.startsWith('..')) return new Response('Bad path', { status: 400 });
	const file = Bun.file(join(IDEAS_DIR, rel));
	return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 });
}
