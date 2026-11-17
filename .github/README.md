# Continuous integration

`workflows/ci.yml` runs on pull requests, pushes to master, and manual dispatches. Each of the root scripts `lint:ci`, `typecheck`, `test` and `build` is its own job, and they run in parallel on every change with a 5-minute timeout. The pre-commit hook calls the same scripts. A newer push cancels a pull request's run in progress; a push to master is never cancelled, because it deploys.

`deploy` needs every check and runs only on pushes to master. It builds the UI, applies new D1 migrations and deploys the Worker. Add its `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets with `bun run secrets:github`.

Actions are pinned to commit SHAs. Dependabot checks for action updates weekly.

Keep CI checks read-only. `.bun-version` and `packageManager` pin Bun; update them together. Commit `bun.lock` after changing dependencies. CI caches package downloads, then always installs with `--frozen-lockfile`.

Apps using env-manager never install or run it in CI. The committed reader (`packages/shared/src/env.ts`) validates the environment, and Bun loads the tracked `.env` defaults for the scripts CI runs from the repository root. Keep defaults harmless and complete enough for CI. If a test needs a credential, supply it explicitly through GitHub Actions secrets. Never commit `.env.local` or native local secrets, and never cache environment outputs.

`app-ios` has no CI job.
