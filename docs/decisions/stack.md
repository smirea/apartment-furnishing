# Stack

- **Bun and TypeScript everywhere.** Bun runs the API, scripts, tests, and package management, pinned by `.bun-version` and `packageManager`.
- **UI.** SvelteKit as a static SPA in `apps/ui/`, with TanStack Query and Tailwind CSS. Vite proxies `/api/*` to the server in development.
- **Server.** `Bun.serve` in `apps/server/`. It serves the API and the built UI, and reads settings only through `apps/server/src/config.ts`.
- **Shared code.** `packages/shared/` holds the generated env reader and code both apps import as `@repo/shared`.
- **Lint and format.** Oxlint and oxfmt, run on staged files by lefthook and checked read-only in CI.
