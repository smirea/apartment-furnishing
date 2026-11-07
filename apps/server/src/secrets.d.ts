// Secrets live outside wrangler.jsonc, so `wrangler types` can't see them.
declare namespace Cloudflare {
	interface Env {
		API_TOKEN: string;
	}
}
