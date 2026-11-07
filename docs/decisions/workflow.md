# Workflow

- **Hooks install with `bun install`.** Bun skips dependency lifecycle scripts, so lefthook's own installer never runs; the root `postinstall` runs `lefthook install`.
- **Hooks run only what the change touches.** Pre-commit runs oxlint and oxfmt one after the other on staged files, since in parallel one overwrote the other's fix. The typecheck runs only when a script or JSON file is staged. Pre-commit and pre-push run `scripts/test-changed.ts`, which picks every test whose imports reach a changed file. It runs with `--no-env-file`, so it sees the same environment as CI.
- **Tests run in a pinned zone and never against a remote database.** `bunfig.toml` preloads `scripts/test-timezone.ts` and `scripts/test-guard.ts`.
- **Git hooks are never skipped.** A Claude Code hook in `.claude/settings.json` blocks `--no-verify` and lefthook overrides. A failing hook gets its cause fixed; a flaky test is a bad test.
- **Run only the relevant tests locally.** CI runs the full suite.
- **Friction gets fixed or filed.** Development speed is a goal in itself. An agent that hits a manual step, a repeated prompt, a slow command, or a flaky tool fixes it in the same thread when the fix is small, and otherwise opens a GitHub issue with its findings and a proposed fix.
- **Environments start on the default path.** The common case is someone using the app with everything allowed and real-looking data, so dev environments grant every permission and seed data up front. Testing a denied, limited, or empty state is the exception: the agent revokes the permission or clears the data for that test.
