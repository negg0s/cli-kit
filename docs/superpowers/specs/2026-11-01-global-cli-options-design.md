# Global CLI options design

## Intent

Let application-wide flags such as `--verbose`, `--region`, or `--config` be declared once and used by every leaf command without losing the existing local option types.

## Goals

- Declare one `globalOptions` map on the app.
- Allow declared global flags before or after the nested command path.
- Give leaf handlers typed access through `context.globalOptions`, separate from their local `context.options`.
- Resolve global options using the established CLI > env > config > default order.
- Show global options in root, group, leaf, and JSON help.
- Reject collisions between global and local option names or aliases rather than silently choosing one.

## Non-goals

- Inheriting group-specific options or changing command-local option behavior.
- Automatically binding global options to process-wide logging, color, or network behavior.
- Adding global positional arguments.

## API decisions

- `CliDefinition.globalOptions?: OptionMap` declares the application's global flags.
- `defineCommandWithGlobals(globalOptions, definition)` is the typed command factory for commands that need the values. Its handler receives `context.globalOptions` inferred from the provided map. Ordinary `defineCommand` remains supported and receives an empty global-options object type.
- A leaf may still be declared with ordinary `defineCommand`; it can ignore global values while the parser accepts the global flags.
- Global and leaf options may not share a long name or short alias. The error identifies the conflicting spelling.
- Global flags may appear before the first command token or after the full command path. Command path tokens must still appear in order before local options.
- Built-in `--help`, `--json-help`, and root `--version` remain reserved runner flags; they are not custom global option names.
- Global config values live under the top-level `global` object. Leaf values remain under `commands["path.to.leaf"]`.
- `global` and `commands` sections are optional objects; either can be used alone. Unknown top-level sections are errors.
- Global flags use the same source precedence and validation rules as leaf flags. Global `env` mappings are exact opt-in mappings.
- Help lists globals in a distinct `Global options` section. JSON help includes a `globalOptions` array; leaf command options stay local.
- A declared global option named `config` is an ordinary handler value; it does not change the explicitly selected `CliDefinition.configFile`.

## Constraints

- Node.js 22.6+, TypeScript 5.9+, ESM, no runtime dependencies.
- Preserve existing two-argument `runCli`, flat commands, and command-local scalar options.
- Keep captured output and never call `process.exit`.
- Stay in the D: feature worktree and do not merge to `main`.

## Success criteria

- Type assertions prove global option inference for opted-in commands and preserve ordinary leaf inference.
- Runtime tests cover global flags before/after command paths, global env/config/default precedence, help, and name/alias collisions.
- Existing tests remain green; examples compile and run; README explains the API.
