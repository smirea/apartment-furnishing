# Stack

- **Bun and TypeScript everywhere.** Bun runs the API, scripts, tests, and package management, pinned by `.bun-version` and `packageManager`.
- **UI.** SvelteKit as a static SPA in `apps/ui/`, with TanStack Query and Tailwind CSS. Vite proxies `/api/*` to the server in development.
- **Server.** `Bun.serve` in `apps/server/`. It serves the API and the built UI, and reads settings only through `apps/server/src/config.ts`.
- **Data.** One SQLite file, `data/app.db`, opened with `bun:sqlite` in `apps/server/src/db.ts`, which also holds the schema. Catalog items, placements, wall textures and TV models are tables; singletons (the TV size, the fixture picks) are JSON rows in `settings`. The file is local and gitignored: git can't merge a binary, so two branches that both changed data conflicted and one side's rows had to be re-imported. New worktrees copy the main checkout's database in `worktree:setup` (`scripts/seed-db.ts`). Photos, models and spec sheets stay as files under `data/items/<id>/`.
- **Shared code.** `packages/shared/` holds the generated env reader and code both apps import as `@repo/shared`.
- **Lint and format.** Oxlint and oxfmt, run on staged files by lefthook and checked read-only in CI.
