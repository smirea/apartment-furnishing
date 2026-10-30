# Decisions

- Read [`docs/decisions/README.md`](docs/decisions/README.md) and the area files your work touches before starting.
- Whenever a new concept, goal, paradigm, or high-level system decision comes up, record it in the matching area file under `docs/decisions/` in the same PR as the work. Add a new file and list it in the index when no area fits.

# Workflow

Full rules in [`docs/decisions/workflow.md`](docs/decisions/workflow.md).

- One PR per thread, never stacked. Rebase only when GitHub reports a real conflict.
- After opening a PR, run `bun scripts/pr-ship.ts [--merge]` in the foreground until it exits 0. Its exit code names the next step.
- Never skip git hooks. Fix the failure instead.
- Run only the relevant tests locally; CI runs the full suite.
- Development speed is a goal. When friction shows up (a manual step, a prompt you click through, a slow command, a flaky tool), fix it in the same thread if it is small; otherwise open a GitHub issue with what you found and a proposed fix, and say so in your reply.
- Set up for the default path. Dev and test environments start the way people use the app, with every permission granted and realistic data seeded; an agent testing a denied or empty state revokes or clears it itself.

# Stack

- Runtime: Bun API server
- Language: TypeScript, Svelte
- UI: SvelteKit SPA
- Styling: Svelte CSS with Tailwind CSS v4 available
- Data Fetching: TanStack Query
- Linting: Oxlint + oxfmt
- Git Hooks: Lefthook

# Architecture

- Vite serves the UI in dev and proxies same-origin `/api/*` requests to Bun.
- The Bun server owns API routes and serves the built UI for `bun run start`.
- Shared environment parsing lives in `packages/shared/src/env.ts`.

# Environment

Full rules in [`docs/decisions/environment.md`](docs/decisions/environment.md).

- Environment files are managed by `env-manager`. Keep `.env` tracked with harmless defaults and `.env.local` ignored for local values.
- Edit root `.env.local`, run `bun run env:generate`, and commit the reader exactly as generated. `local:true` avoids AWS calls and automatic Git updates.
- The server reads settings through `apps/server/src/config.ts`, which fails at startup when production lacks a setting.

# Frontend

- Tailwind CSS v4 is wired through `@tailwindcss/vite`.
- Global styles are imported from `apps/ui/src/routes/layout.css`.
- Theme values live in `apps/ui/src/routes/theme.css` and are selected with `html[data-theme]`.
- Prefer Svelte component CSS for styling. Use Tailwind only for small inline layout utilities when that is simpler than adding a class.
- TanStack Query is configured in `apps/ui/src/routes/+layout.svelte`.

- Local web host: apartment-furnishing.localhost -> 6160; browser API calls use the /api proxy.
