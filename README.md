# cli-kit

Typed building blocks for Node.js command-line apps. ESM only, with no runtime dependencies.

## Requirements and install

- Node.js 22.6 or newer
- TypeScript 5.9 or newer in the application project

```sh
npm install github:negg0s/cli-kit
```

The package builds during installation. Install it from GitHub for now.

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

TypeScript infers option and positional types from each command definition. `runCli` captures output and returns `{ exitCode, stdout, stderr }`. It does not write to process streams or call `process.exit`.

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
| Terminal prompts | `createPrompts`, `createReadlinePromptIO` |
| Deterministic text tables | `formatTable` |
| In-process tests | `runForTest` |
| Starter project | `createCliProject` / `create-cli-kit` |

## Options and positional arguments

- Long flags accept `--name value` and `--name=value`. Use `-n value` for a one-letter alias or a one-letter option name.
- Boolean flags accept `--flag`, `--no-flag`, `--flag=true`, and `--flag=false`. Negated flags do not accept inline values.
- `--` ends option parsing. Tokens after it are positional values.
- Repeated scalar options use the last CLI value. Set `multiple: true` on a string, number, or enum option to collect CLI values into an array. Boolean flags cannot use `multiple`.
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

Put command path tokens before command options. Root, group, and leaf commands provide help. Invoking a group without a child prints its help. JSON help uses schema version 2 and lists nested commands recursively.

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

Pass the same option map to the app and command factory so handler types stay aligned. Commands declared with `defineCommand` can also coexist; their `globalOptions` type is empty. Put global flags before the command path (`ops --verbose deploy`) or after the full path (`ops deploy --verbose`). Do not put them between a group and its child. Global and local option spellings must not conflict. Global options cannot use runner-reserved names or aliases. Leaf options cannot use `help`, `json-help`, or alias `h`. Help output has a separate **Global options** section. JSON help includes a `globalOptions` array.

## Environment and JSON configuration

Configuration is opt-in. Set `env` on each option that may read an environment variable. Set `configFile` on the app to load a JSON file. Relative paths resolve against `RunCliOptions.cwd`, or the current directory by default. The CLI does not search for config files.

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

For nested commands, use dotted command paths such as `"data.import"`. Config option keys use long names, not aliases. A shared file can contain settings for several commands. The CLI applies and validates settings for the selected command; unknown keys there are errors.

Put global option values under the top-level `global` object. Both `global` and `commands` are optional. Other top-level sections are errors. Environment variables remain opt-in through each option's `env` setting.

Values resolve by this order:

| Priority | Source | Notes |
| ---: | --- | --- |
| 1 | CLI | Explicit values win. Repeated CLI values collect in order. |
| 2 | Environment | Only options with `env` participate. Uses `process.env` by default; pass `env` to `runCli` to provide another object. |
| 3 | JSON config | Read from `configFile` or supplied as parsed `config`. Arrays replace lower-priority arrays. |
| 4 | Option default | Used when no higher-priority value is present. |

Boolean environment values accept `true`, `false`, `1`, `0`, `yes`, or `no`, in any letter case. Repeated-option values must be JSON arrays, for example `APP_TAGS='["daily","urgent"]'`. The CLI validates config and environment values even when a command-line value overrides them.

For tests or embedding, pass `{ cwd, env, config }` as the third argument to `runCli`. A supplied `config` object replaces file loading.

## Prompts and tables

Prompts use an explicit I/O adapter. Importing the package does not capture process streams:

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

Confirmations accept `y`, `yes`, `n`, or `no`. Selections show numbered choices and return the selected value. Invalid answers throw an error; the helpers do not retry.

`formatTable(columns, rows)` renders plain text without ANSI sequences. Columns have a `key`, `header`, and optional `align: "left" | "right"`. Values are stringified with nullish values shown as blank; widths count Unicode code points, not terminal display cells.

## Help, completion, and tests

`runCli` handles `-h`, `--help`, `--json-help`, and root `--version`. Generate static completion scripts for Bash, Zsh, or Fish:

```ts
import { completionScript } from "@negg0s/cli-kit";
const script = completionScript(app, "bash");
```

Completion lists nested command names and declared flags. It does not run the app or suggest dynamic option values.

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

The generator refuses to overwrite an existing target or accept path traversal segments.

## Scope

cli-kit defines commands and runs them. It does not load plugins, discover executables, search for config files, fetch remote config, migrate schemas, complete dynamic values, or provide a general-purpose interactive UI. Your application handles business logic, persistence, logging, and resource management.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run examples:check
npm pack --dry-run
```

The package has no runtime dependencies. TypeScript and Node.js type declarations are development dependencies.

## License

MIT. See [LICENSE](LICENSE).
