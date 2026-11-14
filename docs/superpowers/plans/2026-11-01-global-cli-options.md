# Global CLI Options Implementation Plan

> **For agentic workers:** Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add typed app-wide options accepted across nested CLI commands.

**Architecture:** The app owns a global option map; the parser receives a validated merge of globals and leaf options, then the runner separates the parsed values into `context.globalOptions` and `context.options`. The existing source resolver gains a global config scope while retaining the same precedence and validation contract.

**Tech Stack:** TypeScript 5.9, Node.js 22.6+, Node test runner, npm.

**Spec:** `docs/superpowers/specs/2026-11-01-global-cli-options-design.md`

## Global Constraints

- Node.js 22.6 or newer, ESM, TypeScript 5.9 or newer.
- Runtime dependencies: none.
- Preserve existing two-argument `runCli`, flat commands, and command-local scalar options.
- `runCli` captures output and does not call `process.exit`.
- Do not merge the feature branch into `main`.

## Review Focus

- Global flags before command paths must not be mistaken for command names; typed values must be consumed once.
- Global flags after the leaf path must not disrupt local positional parsing.
- A global/local name or alias collision, or a reserved built-in name, must fail clearly, not overwrite a definition.
- Config and env global values must retain CLI > env > config > default precedence, including false and zero.
- Help must display global and local options distinctly at every nesting depth.

---

### Task 1: Public global option types

**Files:** `src/types.ts`, `src/run.ts`, `src/index.ts`, `test-types/api.ts`.

**Interfaces:** Add `CommandContext<TOptions, TArgs, TGlobalOptions>` with `globalOptions: ParsedOptions<TGlobalOptions>`; add `defineCommandWithGlobals(globalOptions, definition)`; add `CliDefinition.globalOptions?: OptionMap`.

- [x] Add type tests for declared global value inference, enum narrowing, empty globals for ordinary commands, and untouched local option inference.
- [x] Run typecheck and confirm the new assertions fail before implementation.
- [x] Implement the third generic on command context/definitions and export `defineCommandWithGlobals(globalOptions, definition)`.
- [x] Run full tests and typecheck.

### Task 2: Global flag parsing, dispatch, and help

**Files:** `src/run.ts`, `src/config.ts`, `src/help.ts`, `src/completion.ts`, `test/run.test.mjs`, `test/config.test.mjs`, `test/completion.test.mjs`.

**Interfaces:** `runCli(app, argv, runtime?)` accepts global flags before or after command path. Leaf handler context keeps local `options` separate from `globalOptions`. Root/group/leaf help and schema v2 JSON expose global option metadata without merging it into leaf option schemas.

- [x] Add failing runtime tests for globals before/after nested paths, boolean negation/value-taking flags, repeatable globals, local/global collisions, reserved names, required options, global env/config/default precedence, all help depths, JSON schema shape, and completion candidates.
- [x] Implement global config resolution from `{ "global": { ... }, "commands": { ... } }`; validate all global sources even when overridden.
- [x] Implement safe option-map merging, leading global-flag-aware path discovery, value separation, and global help/completion rendering.
- [x] Run full tests and typecheck, including the pre-existing completion tests.

### Task 3: Docs, example, and final verification

**Files:** `README.md`, `examples/ops.ts`, `examples/ops.json`, CI if needed.

- [x] Extend the example with a typed `--verbose` global flag available in nested commands and a global JSON config value.
- [x] Document declaration, typed handler access, accepted positions, collision errors, and config shape.
- [x] Run `npm test`, `npm run typecheck`, `npm run examples:check`, `npm run examples:smoke`, and `npm pack --dry-run`.
- [x] Review the final diff and push the separate feature branch; do not merge `main`.
