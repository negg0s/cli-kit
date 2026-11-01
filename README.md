# cli-kit

TypeScript building blocks for Node.js command-line apps. Runtime dependencies: none. ESM only.

## Requirements and install

- Node.js 22.6 or newer
- TypeScript 5.9 or newer in the application project

```sh
npm install github:negg0s/cli-kit
```

The package builds during installation. It is published from this repository; install from GitHub until a registry package is available.

## Quick start

```ts
import { defineCommand, option, runCli } from "@negg0s/cli-kit";

const greet = defineCommand({
  name: "greet",
  description: "Greet someone",
  options: {
    loud: option.boolean({ description: "Use uppercase" }),
    format: option.enum(["text", "json"] as const, { default: "text" }),
  },
  args: [{ name: "name", required: true }],
  run({ options, args, stdout }) {
    const greeting = `Hello, ${args[0]}!`;
    stdout.write(options.loud ? `${greeting.toUpperCase()}\n` : `${greeting}\n`);
  },
});

const result = await runCli({
  name: "hello",
  version: "1.0.0",
  commands: [greet],
}, process.argv.slice(2));

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
```

Types for options and positionals are inferred from the command definition. `runCli` captures output and returns `{ exitCode, stdout, stderr }`; it does not write to process streams or call `process.exit`.

## Features

| Need | API |
| --- | --- |
| Typed string, number, boolean, and enum flags | `option.*`, `defineCommand` |
| Nested command trees | A command with `commands` instead of `run` |
| App-wide typed flags | `globalOptions`, `defineCommandWithGlobals` |
| Repeated flags and multiple input files | `multiple: true`, final `variadic: true` argument |
| Configurable inputs | Explicit JSON config file and opted-in env vars |
| Help and machine-readable help | `--help`, `--json-help`, `formatHelpJson` |
| Bash, Zsh, and Fish completion | `completionScript` |
| Small terminal prompts | `createPrompts`, `createReadlinePromptIO` |
| Deterministic text tables | `formatTable` |
| In-process tests | `runForTest` |
| Starter project | `createCliProject` / `create-cli-kit` |

## Options and positional arguments

- Long flags accept `--name value` and `--name=value`. One-letter aliases accept `-n value`.
- Boolean flags accept `--flag`, `--no-flag`, `--flag=true`, and `--flag=false`.
- `--` ends option parsing. Tokens after it are positional values.
- Repeated scalar options use the last CLI value. Define `multiple: true` on string, number, or enum options to collect repeated CLI values into an array, in order. Boolean flags cannot be repeated this way.
- Optional positionals are typed as `string | undefined`. A variadic positional is typed as `string[]` and must be the final argument. If required, it needs at least one value.
- Optional positional arguments cannot appear before required positional arguments. Extra positionals, unknown options, invalid values, and missing required values return an error result with exit code 2.

```ts
const upload = defineCommand({
  name: "upload",
  description: "Upload files with labels",
  options: { tag: option.string({ multiple: true }) },
  args: [{ name: "files", required: true, variadic: true }],
  run({ options, args }) {
    // options.tag: string[] | undefined
    // args[0]: string[]
  },
});
```

## Nested commands

Groups are declared with `commands`; leaves have `run`:

```ts
const list = defineCommand({ name: "list", description: "List users", run() {} });
const users = defineCommand({ name: "users", description: "Manage users", commands: [list] });
// Add users to the app's commands. Invoke: app users list
```

Command path tokens come before options. Root, group, and leaf levels provide help. Invoking a group without a child prints its help. The JSON help schema is version 2 and represents child commands recursively.

### App-wide options

Declare flags once on `globalOptions`. Use `defineCommandWithGlobals` for leaf commands whose handlers need typed access; those values are exposed separately from local `options`:

```ts
import { defineCommandWithGlobals, option } from "@negg0s/cli-kit";

const globalOptions = { verbose: option.boolean({ default: false, alias: "v" }) };
const deploy = defineCommandWithGlobals(globalOptions, {
  name: "deploy",
  description: "Deploy the app",
  run({ globalOptions }) {
    if (globalOptions.verbose) { /* enable app-specific verbose output */ }
  },
});

const app = { name: "ops", version: "1.0.0", globalOptions, commands: [deploy] };
```

Pass the same option map to the app and command factory to keep handler types aligned. Ordinary `defineCommand` handlers can coexist and receive an empty `globalOptions` type. A global flag may appear before the command path (`ops --verbose deploy`) or after the complete path (`ops deploy --verbose`), but not between a group and its child. Global/local names and aliases cannot collide; `--help`, `--json-help`, `--version`, and `-h` are reserved. Root, group, and leaf help show a separate **Global options** section; JSON help includes a `globalOptions` array.

## Environment and JSON configuration

Configuration is opt-in. Declare the exact environment variable on an option and, if needed, select one JSON file on the app. Relative paths resolve against `RunCliOptions.cwd` or the current directory. No config file is searched automatically.

```ts
const deploy = defineCommand({
  name: "deploy",
  description: "Deploy an environment",
  options: {
    region: option.string({ default: "us-east-1", env: "APP_REGION" }),
    dryRun: option.boolean({ default: false, env: "APP_DRY_RUN" }),
  },
  run({ options }) { /* deploy using validated options */ },
});

const app = { name: "ops", version: "1.0.0", configFile: "ops.json", commands: [deploy] };
```

Example `ops.json`:

```json
{
  "global": {
    "verbose": true
  },
  "commands": {
    "deploy": {
      "region": "eu-west-1",
      "dryRun": true
    }
  }
}
```

For nested commands, config keys use the dotted path, such as `"data.import"`. Config option keys use long option names, not aliases. A shared file may include other command paths; only the selected command's options are applied and validated. Unknown keys for the selected command are errors.

Global option values are configured under the top-level `global` object. The `global` and `commands` sections are optional objects, and unknown top-level sections are errors. Environment variables are still opted in per option with `env`.

Values resolve by this order:

| Priority | Source | Notes |
| ---: | --- | --- |
| 1 | CLI | Explicit flag values win. Repeated CLI occurrences collect in order. |
| 2 | Environment | Only options with `env` participate. Defaults to `process.env`; pass `env` to `runCli` to replace it. |
| 3 | JSON config | Explicit `configFile` or injected parsed `config`; arrays replace lower-priority arrays. |
| 4 | Option default | Used when no higher-priority value is present. |

Boolean env values accept `true`, `false`, `1`, `0`, `yes`, and `no`, case-insensitively. Repeated-option env values must be JSON arrays, for example `APP_TAGS='["daily","urgent"]'`. Config, env, and CLI values are validated; invalid configured/env values are errors even when a CLI value overrides them.

For tests or embedding, `runCli(app, argv, { cwd, env, config })` injects runtime context. If `config` is provided, the file is not read.

## Prompts and tables

Prompts use an explicit I/O adapter, so importing the package does not capture process streams:

```ts
import { createPrompts, createReadlinePromptIO } from "@negg0s/cli-kit";

const io = createReadlinePromptIO(process.stdin, process.stdout);
const prompts = createPrompts(io);
try {
  const name = await prompts.text("Name?");
  const confirmed = await prompts.confirm("Continue?");
  const format = await prompts.select("Format?", [
    { label: "Text", value: "text" },
    { label: "JSON", value: "json" },
  ]);
  // EOF and AbortSignal cancellation return undefined.
} finally {
  io.close();
}
```

Confirmation accepts `y`, `yes`, `n`, or `no`. A selection displays numbered choices and returns the chosen value. Invalid answers are errors; helpers do not retry invisibly.

`formatTable(columns, rows)` renders plain text without ANSI sequences. Columns have a `key`, `header`, and optional `align: "left" | "right"`. Values are stringified with nullish values shown as blank; widths count Unicode code points, not terminal display cells.

## Help, completion, and tests

`runCli` handles `--help`, `--json-help`, and root `--version`. Static completion scripts are available for Bash, Zsh, and Fish:

```ts
import { completionScript } from "@negg0s/cli-kit";
const script = completionScript(app, "bash");
```

Completion includes nested command names and declared flags. It does not execute the app and does not suggest dynamic option values.

`runForTest(app, argv)` uses the same runner without starting a subprocess:

```ts
import { runForTest } from "@negg0s/cli-kit";
const result = await runForTest(app, ["deploy", "--dry-run"]);
```

## Starter project

```sh
npm exec --package=github:negg0s/cli-kit -- create-cli-kit --name sample-cli --dir ./sample-cli
cd sample-cli
npm install
npm run build
node dist/index.js greet Ada
```

The generator refuses an existing target and path traversal segments.

## Scope

cli-kit is a small command-definition and execution toolkit. It does not provide plugin loading, executable discovery, implicit config search, remote config, schema migrations, dynamic completion, or a general-purpose interactive UI. Applications own business logic, persistence, logging policy, and resource management.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run examples:check
npm pack --dry-run
```

Runtime dependencies: none. TypeScript and Node.js type declarations are development dependencies.

## License

MIT. See [LICENSE](LICENSE).
