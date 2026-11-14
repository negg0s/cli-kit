# CLI Reliability Hardening Design

## Intent

Fix small but surprising edge cases in config loading, option parsing, built-in help handling, and shell completion before they become user-facing compatibility problems.

## Goals

- Read the selected JSON config at most once per `runCli` invocation and resolve global/local options from the same snapshot.
- Treat inherited properties of injected env objects as unset variables.
- Reject ambiguous option namespaces: an alias may not shadow another option's long name, and runner-owned help names/aliases may not be declared as local options.
- Reject inline values on negated boolean options instead of silently reversing the meaning.
- Offer the supported `-h` help alias in generated Bash, Zsh, and Fish completion.

## Decisions

- Add an internal `loadConfig` helper in `src/config.ts`; `runCli` loads once and passes the parsed snapshot into both source-resolution calls. `resolveOptionSources` remains usable without a snapshot for existing internal callers.
- Use `Object.hasOwn(env, envName)` before reading an opted-in variable.
- Detect a long-name/short-alias collision when the alias names a different declared option. An option may use its own one-letter name as its alias.
- Reject local `help`, `json-help`, and alias `h`, because leaf dispatch reserves these spellings. Keep local `version` available; version is a root-only built-in.
- `--no-flag` remains valid for booleans; `--no-flag=true|false` is invalid. Exact declared `no-*` long names continue to take precedence over negation.
- Completion includes `-h` at root, group, and leaf contexts.

## Non-goals

- No new runtime dependencies or public package exports.
- No changes to CLI/env/config/default precedence, command grammar, or existing help output beyond completion candidates.
- No automatic config discovery or config schema migrations.

## Constraints

- Node.js 22.6+, TypeScript 5.9+, ESM, zero runtime dependencies.
- Preserve the `runCli` result contract and keep changes on `feat/cli-kit-universal`; do not modify `main`.

## Success criteria

- Regression tests fail against the current behavior and pass after each change.
- Existing tests, typecheck, examples, and package dry-run remain green.
- Each option/config edge case produces deterministic behavior with an actionable error or expected completion candidate.
