// ideas/README.md stays the one source so it reads the same on GitHub. The UI shows it from static files: the rendered
// page at /ideas/readme.html with its photos beside it, written into the UI's static folder before Vite runs.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = join(import.meta.dir, '../ideas');
const OUT = join(import.meta.dir, '../apps/ui/static/ideas');
const isRelative = (url: string) => !/^([a-z]+:|\/|#)/i.test(url);

const html = new HTMLRewriter()
	.on('img[src]', {
		element(el) {
			const src = el.getAttribute('src')!;
			if (isRelative(src)) el.setAttribute('src', `/ideas/${src}`);
			el.setAttribute('loading', 'lazy');
		},
	})
	.on('a[href]', {
		element(el) {
			const href = el.getAttribute('href')!;
			if (isRelative(href)) el.setAttribute('href', `/ideas/${href}`);
			el.setAttribute('target', '_blank');
			el.setAttribute('rel', 'noreferrer');
		},
	})
	.transform(Bun.markdown.html(await Bun.file(join(SOURCE, 'README.md')).text()));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SOURCE, OUT, { recursive: true, filter: src => !src.endsWith('.md') });
writeFileSync(join(OUT, 'readme.html'), html);
