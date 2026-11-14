# Universal CLI Toolkit Implementation Plan

> **For agentic workers:** Use subagent-driven-development or executing-plans to implement task by task. Steps use checkbox syntax.

**Goal:** Extend cli-kit into a clear, typed foundation for common application, admin, DevOps, and data CLIs.

**Architecture:** Keep the existing ESM package and add capability to the declarative command definition. The parser remains pure; `runCli` orchestrates command routing, configuration precedence, and captured results. Prompt and formatting helpers stay independent and use Node built-ins only.

**Tech Stack:** TypeScript 5.9, Node.js 22.6+, Node test runner, npm.

**Spec:** `docs/superpowers/specs/2026-11-01-universal-cli-kit-design.md`

## Global Constraints

- Project and temporary work stay on D:.
- Node.js 22.6 or newer, ESM, TypeScript 5.9 or newer.
- Runtime dependencies: none.
- `runCli` returns captured output and never calls `process.exit`.
- Keep existing flat command declarations and scalar options valid.
- Do not add plugin discovery, telemetry, auto-update, AI features, remote config, or implicit config-file search.
- Use clear factual documentation. Do not use long dash punctuation.

## Review Focus

- CLI values must override env/config/defaults, including explicit false, zero, and empty string.
- Nested paths must route only to declared leaves and produce useful group and leaf help.
- Optional and variadic argument types must match runtime arity.
- Config paths and keys must not cause traversal, arbitrary file writes, or silent typo acceptance.
- Prompt EOF/cancellation and non-ASCII table data must not hang or corrupt output.

---

### Task 1: Typed repeated options and positional arguments

**Files:** `src/types.ts`, `src/parse.ts`, `src/help.ts`, `src/completion.ts`, `test/parse.test.mjs`, `test/run.test.mjs`, `test-types/api.ts`.

**Interfaces:** Add `multiple?: true` to string, number, and enum option factories. Add `variadic?: true` to `ArgumentDefinition`. `ParsedOptions<T>` returns arrays for repeated definitions. `ParsedArguments<T>` maps optional args to `string | undefined` and variadic args to `string[]`.

- [x] Add runtime tests for repeat accumulation, defaults, invalid repeated values, optional values, variadic values, and invalid declaration ordering.
- [x] Add compile-time assertions for inferred scalar, array, optional, and variadic handler types.
- [x] Run the focused tests and confirm failure on the missing behavior.
- [x] Implement parser and mapped types with required variadic checks and strict definition validation.
- [x] Run full tests and typecheck.

### Task 2: Nested command groups and generated help/completion

**Files:** `src/types.ts`, `src/run.ts`, `src/help.ts`, `src/completion.ts`, `test/run.test.mjs`, `test/completion.test.mjs`, `test-types/api.ts`.

**Interfaces:** Add a recursive group definition with `commands` and no `run`; retain leaf commands. Resolve command paths from leading tokens before options. Root, group, and leaf JSON help use schema version 2. Completion generation traverses groups and offers child names or leaf options for bash, zsh, and fish.

- [x] Add failing tests for group dispatch, unknown nested paths, root/group/leaf help and JSON help, JSON tree shape, and completion at two depths.
- [x] Add type tests that reject a group handler and preserve leaf handler inference.
- [x] Implement recursive routing and shared command-tree traversal for help and completion.
- [x] Run full tests and typecheck.

### Task 3: Explicit environment and JSON config precedence

**Files:** `src/types.ts`, `src/run.ts`, new `src/config.ts`, `src/parse.ts`, `src/help.ts`, `test/config.test.mjs`, `test/run.test.mjs`, `test-types/api.ts`.

**Interfaces:** Add `env?: string` to option definitions, `configFile?: string` to app definitions, and `RunCliOptions { cwd?: string; env?: Record<string, string | undefined>; config?: unknown }` as the third `runCli` argument. Resolve each leaf option by CLI > env > config > default. Config files use the exact JSON structure in the spec.

- [x] Add tests for each precedence level, explicit false/zero/empty values, repeated arrays, unknown config keys, malformed JSON, missing files, and injected config/env/cwd.
- [x] Confirm red before implementation.
- [x] Implement explicit JSON loading and validation without implicit search or writes.
- [x] Run full tests and typecheck.

### Task 4: Prompt and table helpers, examples, and documentation

**Files:** new `src/prompts.ts`, new `src/table.ts`, `src/index.ts`, `README.md`, new `examples/` files, tests, package workflow only if required.

**Interfaces:** `PromptIO.ask(question, signal?)` returns `Promise<string | undefined>`. `createPrompts(io)` returns `text(question, signal?)`, `confirm(question, signal?)`, and `select(question, choices, signal?)`. `createReadlinePromptIO(input, output)` returns the adapter plus `close()`. `formatTable(columns: TableColumn[], rows: Record<string, unknown>[])` renders deterministic plain text.

- [x] Add failing tests for prompt answers, invalid choices, EOF, AbortSignal cancellation, and table alignment/empty rows.
- [x] Implement helpers using Node built-ins and no captured process streams.
- [x] Add examples for a nested admin CLI, repeatable data input, and config/env use.
- [x] Rewrite README as a direct guide with feature map, exact precedence, examples, limits, and development commands.
- [x] Run clean install, full tests, typecheck, build, generated example build/run, and package dry-run.
- [x] Request a fresh whole-branch review, address Critical and Important findings, then push the feature branch to GitHub.
