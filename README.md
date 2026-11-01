# cli-kit

TypeScript tools for building command-line apps on Node.js. Runtime dependencies: none.

## Requirements

- Node.js 22.6 or newer
- TypeScript 5.9 or newer for building an app

## Install

Install from GitHub:

```sh
npm install github:negg0s/cli-kit
```

The package builds during installation. Its public entry point is ESM.

## Define a command

```ts
import { defineCommand, option, runCli } from "@negg0s/cli-kit";

const greet = defineCommand({
  name: "greet",
  description: "Greet someone",
  options: {
    loud: option.boolean({ description: "Use uppercase" }),
    format: option.enum(["text", "json"] as const, {
      default: "text",
      description: "Output format",
    }),
  },
  args: [{ name: "name", required: true }],
  run({ options, args, stdout }) {
    const greeting = `Hello, ${args[0]}!`;
    stdout.write(options.loud ? greeting.toUpperCase() + "\n" : greeting + "\n");
  },
});

const result = await runCli({
  name: "hello",
  version: "1.0.0",
  description: "A small greeting app",
  commands: [greet],
}, process.argv.slice(2));

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
```

`options` and positional arguments are inferred from their definitions. The runner captures output and returns it with an exit code. It does not call `process.exit` or write to the process streams.

## Argument behavior

- Long options use `--name value` or `--name=value`.
- A one-letter alias uses `-n value`.
- Boolean options use `--flag` and `--no-flag`.
- `--` ends option parsing. Remaining tokens are positional values.
- Repeated scalar options use the last value.
- Unknown options, missing values, invalid numbers, and invalid enum values return an error result.
- Extra or missing required positional arguments are rejected.

The first release supports a flat list of commands. Nested command trees and plugin loading are not included.

## Help and completion

`runCli` handles root help, per-command help, `--version`, and `--json-help`. JSON help uses a `schemaVersion` field so tools can detect format changes.

Generate static completions from the same command definitions:

```ts
import { completionScript } from "@negg0s/cli-kit";

const bashScript = completionScript(app, "bash");
const zshScript = completionScript(app, "zsh");
const fishScript = completionScript(app, "fish");
```

Completion is static. It includes command names and option flags, but does not execute the app or provide dynamic value suggestions.

## Test commands without a subprocess

`runForTest(app, argv)` calls the same runner and returns `{ exitCode, stdout, stderr }`. Use it with Node's built-in test runner or another test framework.

## Create a starter project

```sh
npm exec --package=github:negg0s/cli-kit -- create-cli-kit --name sample-cli --dir ./sample-cli
cd sample-cli
npm install
npm run build
node dist/index.js greet Ada
```

The generator refuses an existing target directory and rejects path traversal segments. Generated projects depend on this GitHub repository until a registry release is available.

## Development

```sh
npm ci
npm test
npm run typecheck
npm pack --dry-run
```

The runtime has no dependencies. TypeScript and Node.js type declarations are development dependencies.

## License

MIT. See [LICENSE](LICENSE).
