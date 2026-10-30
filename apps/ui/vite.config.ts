import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import env from '../../packages/shared/src/env.ts';
import { defineConfig } from 'vite';

const uiHost = new URL(env.UI_URL).hostname;

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter({
				fallback: 'index.html',
			}),
			compilerOptions: {
				warningFilter: warning => !warning.code.startsWith('a11y_'),
			},
		}),
	],
	clearScreen: false,
	optimizeDeps: {
		exclude: ['@tanstack/svelte-query'],
	},
	server: {
		allowedHosts: [uiHost],
		port: env.UI_PORT,
		strictPort: true,
		proxy: {
			'/api': {
				target: env.SERVER_URL,
				changeOrigin: true,
				secure: false,
			},
		},
	},
});
