# cli-kit expansion design

## Intent

Make cli-kit useful for ordinary product, admin, DevOps, and data command-line tools, not only a one-command demo. A developer should be able to define a typed command tree, read validated input from flags, environment, or an explicit JSON config file, test the result without a subprocess, and add small interactive prompts without importing a large framework.

## Goals

- Keep one declarative command definition as the source for parsing, help, JSON help, shell completion, and tests.
- Support nested commands, repeatable options, optional positional values, and a final variadic positional argument with accurate TypeScript types.
- Define deterministic precedence: command-line values, then explicit environment values, then the selected command's JSON config, then declared defaults.
- Keep filesystem and interactive behavior explicit and injectable.
- Provide small prompt and table helpers for human-facing CLIs.
- Keep examples and documentation direct enough to use without reading implementation code.

## Non-goals

- Plugin discovery, executable child commands, telemetry, auto-update, AI features, remote config, or implicit config-file search.
- Multiple config formats in this iteration. Config files are JSON.
- Dynamic shell completion that executes the user's application.
- A UI framework, general validation DSL, or promise of supporting every terminal convention.

## Constraints

- Project and temporary work stay on D:.
- Node.js 22.6 or newer, ESM, TypeScript 5.9 or newer.
- Zero runtime dependencies. Node built-ins are allowed.
- `runCli` returns captured output and never calls `process.exit`.
- Existing flat command declarations and scalar options remain valid.
- Keep user-facing docs factual and avoid AI-generated marketing language and long dash punctuation.

## API and behavior decisions

### Typed values

- Add `multiple: true` to string, number, and enum option definitions. Repetitions from the command line collect into an array. A value from a higher-precedence source replaces the lower-precedence value rather than merging with it.
- A repeated-option default is an array. CLI repetitions accumulate in order. Config arrays replace lower-priority arrays.
- Validate supplied environment/config values for the selected command before choosing the winning value. Invalid lower-priority values remain errors even when a CLI flag also supplies the option.
- Booleans remain scalar. Negated booleans are supported only through `--no-name`.
- Positional definitions gain `variadic: true`, allowed only on the final positional. Optional positionals are typed as `string | undefined`; variadic positionals are typed as `string[]`.
- A required variadic positional requires at least one value. Optional arguments cannot precede required arguments.

### Command tree

- A command may be a leaf with `run`, or a group with `commands`. Groups cannot define `run`, options, or positional arguments in this iteration.
- Existing flat `commands: [leaf]` declarations continue to work.
- Command paths must appear before options, for example `tool data import --format json`.
- Root and group help list children. Leaf help lists local arguments and options. JSON help moves to schema version 2 and includes nested commands.
- `tool group --help` prints group help; `tool group leaf --help` prints leaf help. An unknown child names the nearest known path and includes a help hint.
- Invoking a group without a child prints that group's help with exit code 0. `--json-help` is supported at the app, group, and leaf levels.
- Each schema 2 object has `name`, `description`, `options`, `args`, and `commands` fields. Leaf `commands` is an empty array.
- Static completion reflects command paths and leaf options. It does not execute app code.

### Configuration

- `CliDefinition.configFile` is optional and explicit. Relative paths resolve against `RunCliOptions.cwd`. There is no implicit filename search.
- Config JSON has this shape: `{ "commands": { "data.import": { "format": "json" } } }`. Keys under a command path must match that leaf's option names.
- Each option may declare `env: "APP_FORMAT"`. Environment mapping is opt-in and exact, with no guessed variable names.
- If `RunCliOptions.env` is omitted, use `process.env`; if provided, use that map instead. Boolean environment values accept case-insensitive `true`/`false`, `1`/`0`, and `yes`/`no`. Empty boolean values are invalid.
- `RunCliOptions` may inject `cwd`, `env`, or a parsed `config` object for tests and embedding. If `config` is supplied, the file is not read.
- Unknown keys and invalid values in the selected command config are errors. `false`, `0`, and empty strings are values, not missing values.
- Config top-level shape contains only `commands`; unknown command paths are ignored so a shared file can hold settings for other commands. Unknown keys in the selected command object are errors. Config option keys use long names, not aliases.
- Multi-value environment variables use a JSON array string. Config arrays must be arrays of valid option values.

### Prompts and tables

- `createPrompts` accepts a small `PromptIO` adapter. Text, confirmation, and choice prompts return `undefined` on EOF or cancellation. Invalid answers return a clear error rather than looping invisibly.
- `PromptIO.ask(question, signal?)` returns `Promise<string | undefined>`. `createPrompts(io)` exposes `text(question, signal?)`, `confirm(question, signal?)`, and `select(question, choices, signal?)`. Confirm accepts case-insensitive `y`, `yes`, `n`, or `no`; select displays 1-based choices and returns the selected value.
- `createReadlinePromptIO(input, output)` adapts caller-supplied Node readable and writable streams and exposes `close()`. No process streams are captured at import time.
- Choice entries are `{ label, value }`. Empty choice lists are invalid. Text prompts preserve empty input as an empty string; EOF and abort return `undefined`.
- `formatTable(columns, rows)` accepts columns with a `key`, `header`, and optional `align`, renders deterministic plain text, and uses no ANSI codes. Cells use `String(value ?? "")`; width is measured in Unicode code points, not terminal display cells.

## Success criteria

- Existing apps continue to typecheck and existing tests remain green.
- Existing two-argument `runCli(app, argv)` calls remain valid. Its third runtime options argument is optional.
- New runtime and type tests pin down source precedence, nested dispatch, optional/variadic types, cancellation, and output formatting.
- A generated example builds and runs on Node 22 and Node 24 CI.
- README includes a quick start, feature map, precedence table, completion notes, examples, and clear non-goals.

## Builder choices

The implementation may choose internal helpers and exact error wording, but must preserve the API, precedence, no-implicit-I/O rules, and compatibility constraints above.
