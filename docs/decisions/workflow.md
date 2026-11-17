# Workflow

- **Hooks install with `bun install`.** Bun skips dependency lifecycle scripts, so lefthook's own installer never runs; the root `postinstall` runs `lefthook install`.
- **Hooks run the checks for the stacks a change touches.** Pre-commit runs oxlint and oxfmt one after the other on staged files, since in parallel one overwrote the other's fix. The typecheck runs when a script or JSON file is staged, and the whole test suite, which takes milliseconds, when a script is staged.
- **Git hooks are never skipped.** A Claude Code hook in `.claude/settings.json` blocks `--no-verify` and lefthook overrides. A failing hook gets its cause fixed; a flaky test is a bad test.
- **Friction gets fixed or filed.** Development speed is a goal in itself. An agent that hits a manual step, a repeated prompt, a slow command, or a flaky tool fixes it in the same thread when the fix is small, and otherwise opens a GitHub issue with its findings and a proposed fix.
- **Environments start on the default path.** The common case is someone using the app with everything allowed and real-looking data, so dev environments grant every permission and seed data up front. Testing a denied, limited, or empty state is the exception: the agent revokes the permission or clears the data for that test.
