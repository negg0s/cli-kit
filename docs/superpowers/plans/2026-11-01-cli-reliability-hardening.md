# CLI Reliability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove several surprising edge cases in config loading, option namespace validation, boolean negation, and shell help completion.

**Architecture:** Load one config snapshot in `runCli` and pass it to both global and command source resolution. Keep CLI option validation in the parser/runner boundaries where the spelling ambiguity is introduced. Add the short help spelling to the existing completion candidate model.

**Tech Stack:** TypeScript 5.9, Node.js 22.6+, Node test runner, npm.

**Spec:** `docs/superpowers/specs/2026-11-01-cli-reliability-design.md`

## Global Constraints

- Node.js 22.6 or newer, ESM, TypeScript 5.9 or newer.
- Runtime dependencies: none.
- Preserve the `runCli` result contract and existing precedence behavior.
- Do not modify `main`.

## Review Focus

- A changing config source must not make global and local options observe different snapshots (Task 1: a getter-backed injected config is read once).
- Inherited env properties must not be parsed as explicit environment values (Task 1: `toString` mapping with an empty env object).
- Ambiguous alias/long-name pairs must be rejected independent of option declaration order (Task 2: both object orders).
- Negated boolean inline values must not silently produce the opposite value (Task 2: true and false inline values).
- Help must remain discoverable in each generated shell, while runner-owned local option spellings fail clearly (Tasks 3 and 4).

---

### Task 1: Single config snapshot and own env keys

**Files:** `src/config.ts`, `src/run.ts` (snapshot wiring only), `test/config.test.mjs`.

**Interfaces:** Add `export async function loadConfig(appConfigFile: string | undefined, runtime: RunCliOptions = {}): Promise<unknown>` in `src/config.ts`. Extend `resolveOptionSources(options, commandPath, appConfigFile, runtime = {}, scope = "command", configSnapshot?: unknown)`; when a snapshot is passed, do not read `runtime.config` or the config file again. Do not re-export either helper from package `src/index.ts`.

- [x] Add a regression using a getter-backed `runtime.config`; assert one config read and both global/local values from the same object.
- [x] Add a regression mapping an option to inherited env key `toString`; with `env: {}`, the option must stay unset/default.
- [x] Run focused config tests and observe the new failures.
- [x] Implement one-time loading/snapshot passing and own-key env lookup.
- [x] Run `node --test test/config.test.mjs` and `npm run typecheck`.

### Task 2: Unambiguous option parsing

**Files:** `src/parse.ts`, `test/parse.test.mjs`.

**Interfaces:** No public API changes.

- [x] Test that an alias equal to another option's long name is rejected in either declaration order.
- [x] Test that `--no-boolean=true` and `--no-boolean=false` are errors while plain `--no-boolean` remains false.
- [x] Run focused parse tests and observe the new failures.
- [x] Validate alias/long-name namespaces and reject inline values on negated booleans.
- [x] Run `node --test test/parse.test.mjs`.

### Task 3: Local runner-reserved options

**Files:** `src/run.ts`, `test/run.test.mjs`.

**Interfaces:** No public API changes.

- [x] Test that leaf definitions with `help`, `json-help`, or alias `h` return a clear configuration error even on help requests; preserve local `version`.
- [x] Run focused runner tests and observe the new failures.
- [x] Validate runner-reserved spellings for every leaf before help/dispatch handling.
- [x] Run `node --test test/run.test.mjs`.

### Task 4: Complete short help candidates

**Files:** `src/completion.ts`, `test/completion.test.mjs`.

**Interfaces:** No public API changes.

- [x] Test generated Bash, Zsh, and Fish scripts offer `-h` at root and leaf command contexts.
- [x] Run focused completion tests and observe the new failures.
- [x] Add `-h` to the root, group, and leaf candidate sets.
- [x] Run `node --test test/completion.test.mjs`.

### Task 5: Integrated verification

- [x] Run `npm test`, `npm run typecheck`, `npm run examples:check`, `npm run examples:smoke`, and `npm pack --dry-run`.
- [x] Review the aggregate diff and receive a fresh whole-branch review. One Minor completion-context issue was parked in the SDD ledger; no Critical or Important findings remain.
- [x] Commit final plan bookkeeping on `feat/cli-kit-universal` and confirm `main` is unchanged.
- [ ] Push the feature branch only after explicit authorization; do not merge `main`.
