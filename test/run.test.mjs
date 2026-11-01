import assert from "node:assert/strict";
import test from "node:test";
import { defineCommand, defineCommandWithGlobals, runCli, runForTest, option } from "../dist/index.js";

test("dispatches a command and captures handler output", async () => {
  const greet = defineCommand({
    name: "greet",
    description: "Say hello",
    options: { loud: option.boolean({ description: "Use uppercase" }) },
    args: [{ name: "name", required: true }],
    run({ options, args, stdout }) {
      const name = options.loud ? args[0].toUpperCase() : args[0];
      stdout.write(`Hello, ${name}!\n`);
    },
  });

  const result = await runCli({ name: "hello", version: "1.0.0", description: "A greeting app", commands: [greet] }, ["greet", "Ada", "--loud"]);
  assert.deepEqual(result, { exitCode: 0, stdout: "Hello, ADA!\n", stderr: "" });
});

test("awaits asynchronous command handlers", async () => {
  const command = defineCommand({
    name: "async",
    description: "Async output",
    async run({ stdout }) {
      await Promise.resolve();
      stdout.write("finished");
    },
  });
  assert.deepEqual(await runCli({ name: "sample", version: "1.0.0", commands: [command] }, ["async"]), {
    exitCode: 0,
    stdout: "finished",
    stderr: "",
  });
});

test("shows root and command help and returns versioned JSON help", async () => {
  const greet = defineCommand({ name: "greet", description: "Say hello", run() {} });
  const app = { name: "hello", version: "1.2.3", description: "A greeting app", commands: [greet] };
  const root = await runCli(app, ["--help"]);
  assert.match(root.stdout, /A greeting app/);
  assert.match(root.stdout, /greet\s+Say hello/);
  assert.match(root.stdout, /--json-help/);
  assert.equal(root.exitCode, 0);
  const rootJson = await runCli(app, ["--json-help"]);
  assert.equal(JSON.parse(rootJson.stdout).schemaVersion, 2);
  assert.equal(JSON.parse(rootJson.stdout).commands[0].name, "greet");

  const commandHelp = await runCli(app, ["greet", "--help"]);
  assert.match(commandHelp.stdout, /Usage: hello greet/);

  const json = await runCli(app, ["greet", "--json-help"]);
  assert.deepEqual(JSON.parse(json.stdout), {
    schemaVersion: 2,
    name: "greet",
    description: "Say hello",
    globalOptions: [],
    options: [],
    args: [],
    commands: [],
  });
});

test("does not treat help tokens consumed as option values as help requests", async () => {
  const command = defineCommand({
    name: "show",
    description: "Show a value",
    options: { name: option.string() },
    run() {},
  });
  const app = { name: "tool", version: "1", commands: [command] };

  const missingHelpValue = await runCli(app, ["show", "--name", "--help"]);
  assert.equal(missingHelpValue.exitCode, 2);
  assert.match(missingHelpValue.stderr, /option --name requires a value/i);

  const missingJsonHelpValue = await runCli(app, ["show", "--name", "--json-help"]);
  assert.equal(missingJsonHelpValue.exitCode, 2);
  assert.match(missingJsonHelpValue.stderr, /option --name requires a value/i);

  const helpAfterValue = await runCli(app, ["show", "--name", "Ada", "--help"]);
  assert.equal(helpAfterValue.exitCode, 0);
  assert.match(helpAfterValue.stdout, /Usage: tool show/);
});

test("reports parse errors without throwing and honors handler exit codes", async () => {
  const fail = defineCommand({
    name: "fail",
    description: "Fail safely",
    options: { count: option.number({ required: true }) },
    run() { return 7; },
  });
  const app = { name: "sample", version: "0.1.0", commands: [fail] };
  const bad = await runCli(app, ["fail", "--count", "nope"]);
  assert.equal(bad.exitCode, 2);
  assert.match(bad.stderr, /finite number/);

  const done = await runCli(app, ["fail", "--count", "3"]);
  assert.equal(done.exitCode, 7);
});

test("test helper uses the same runner behavior", async () => {
  const echo = defineCommand({ name: "echo", description: "Echo", run({ stdout }) { stdout.write("ok"); } });
  const app = { name: "echoer", version: "1.0.0", commands: [echo] };
  assert.deepEqual(await runForTest(app, ["echo"]), await runCli(app, ["echo"]));
});

test("preserves captured output when a handler throws and respects the option terminator", async () => {
  const command = defineCommand({
    name: "write",
    description: "Write then fail",
    args: [{ name: "value" }],
    run({ args, stdout }) {
      stdout.write(args[0]);
      throw new Error("handler failed");
    },
  });
  const app = { name: "sample", version: "1.0.0", commands: [command] };
  const result = await runCli(app, ["write", "--", "--help"]);
  assert.deepEqual(result, { exitCode: 2, stdout: "--help", stderr: "handler failed\n" });
});

test("preserves optional positional slots", async () => {
  const command = defineCommand({
    name: "copy",
    description: "Copy files",
    args: [
      { name: "source", required: true },
      { name: "label" },
    ],
    run({ args, stdout }) {
      stdout.write(`${args[0]}:${args[1] ?? "none"}`);
    },
  });
  const result = await runCli({ name: "files", version: "1.0.0", commands: [command] }, ["copy", "src"]);
  assert.deepEqual(result, { exitCode: 0, stdout: "src:none", stderr: "" });
});

test("collects a required variadic positional argument", async () => {
  const command = defineCommand({
    name: "copy",
    description: "Copy files",
    args: [{ name: "source", required: true }, { name: "files", required: true, variadic: true }],
    run({ args, stdout }) { stdout.write(`${args[0]}:${args[1].join(",")}`); },
  });
  const result = await runCli({ name: "files", version: "1.0.0", commands: [command] }, ["copy", "src", "first.txt", "second.txt"]);
  assert.deepEqual(result, { exitCode: 0, stdout: "src:first.txt,second.txt", stderr: "" });
});

test("rejects invalid positional definitions and missing variadic values", async () => {
  const optionalBeforeRequired = defineCommand({
    name: "bad-args",
    description: "Invalid arguments",
    args: [{ name: "optional" }, { name: "required", required: true }],
    run() {},
  });
  const invalidDefinition = await runCli({ name: "tool", version: "1", commands: [optionalBeforeRequired] }, ["bad-args", "a", "b"]);
  assert.equal(invalidDefinition.exitCode, 2);
  assert.match(invalidDefinition.stderr, /optional.*before required/i);

  const variadic = defineCommand({
    name: "many",
    description: "Needs files",
    args: [{ name: "files", required: true, variadic: true }],
    run() {},
  });
  const missing = await runCli({ name: "tool", version: "1", commands: [variadic] }, ["many"]);
  assert.equal(missing.exitCode, 2);
  assert.match(missing.stderr, /missing required argument <files>/i);
});

test("dispatches nested commands and shows help at root, group, and leaf levels", async () => {
  const leaf = defineCommand({ name: "import", description: "Import records", run({ stdout }) { stdout.write("imported"); } });
  const group = defineCommand({ name: "data", description: "Data tools", commands: [leaf] });
  const app = { name: "tool", version: "1.0.0", commands: [group] };

  assert.deepEqual(await runCli(app, ["data", "import"]), { exitCode: 0, stdout: "imported", stderr: "" });
  assert.match((await runCli(app, ["--help"])).stdout, /data\s+Data tools/);
  assert.match((await runCli(app, ["data"])).stdout, /Usage: tool data/);
  assert.match((await runCli(app, ["data", "--help"])).stdout, /import\s+Import records/);
  assert.match((await runCli(app, ["data", "import", "--help"])).stdout, /Usage: tool data import/);
  assert.deepEqual(JSON.parse((await runCli(app, ["data", "--json-help"])).stdout), {
    schemaVersion: 2,
    name: "data",
    description: "Data tools",
    globalOptions: [],
    options: [],
    args: [],
    commands: [{ name: "import", description: "Import records", options: [], args: [], commands: [] }],
  });
});

test("reports unknown nested command paths with the nearest help hint", async () => {
  const group = defineCommand({ name: "data", description: "Data tools", commands: [defineCommand({ name: "import", description: "Import", run() {} })] });
  const result = await runCli({ name: "tool", version: "1", commands: [group] }, ["data", "missing"]);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /Unknown command "data missing".*tool data --help/);
});

test("rejects unknown root flags instead of reporting successful help", async () => {
  const app = { name: "tool", version: "1", commands: [] };
  const result = await runCli(app, ["--bogus"]);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /unknown option "--bogus".*tool --help/i);
});

test("parses typed global options before and after nested command paths", async () => {
  const globalOptions = {
    verbose: option.boolean({ alias: "v", default: false }),
    region: option.enum(["us", "eu"], { default: "us" }),
    tag: option.string({ multiple: true }),
  };
  const deploy = defineCommandWithGlobals(globalOptions, {
    name: "deploy",
    description: "Deploy files",
    options: { dryRun: option.boolean() },
    args: [{ name: "file", required: true }],
    run({ globalOptions, options, args, stdout }) {
      stdout.write(JSON.stringify({ globalOptions, options, args }));
    },
  });
  const group = defineCommand({ name: "ops", description: "Operations", commands: [deploy] });
  const app = { name: "tool", version: "1", globalOptions, commands: [group] };

  const before = await runCli(app, ["-v", "--region", "eu", "ops", "deploy", "file.txt", "--dryRun", "--tag", "nightly"]);
  assert.deepEqual(JSON.parse(before.stdout), {
    globalOptions: { verbose: true, region: "eu", tag: ["nightly"] },
    options: { dryRun: true },
    args: ["file.txt"],
  });

  const after = await runCli(app, ["ops", "deploy", "file.txt", "--no-verbose", "--region=us", "--tag", "release"]);
  assert.deepEqual(JSON.parse(after.stdout), {
    globalOptions: { verbose: false, region: "us", tag: ["release"] },
    options: {},
    args: ["file.txt"],
  });
});

test("rejects conflicting global/local option names, aliases, and reserved names", async () => {
  const conflict = defineCommand({
    name: "run",
    description: "Conflict",
    options: { verbose: option.string({ alias: "v" }) },
    run() {},
  });
  const nameConflict = await runCli({
    name: "tool", version: "1", globalOptions: { verbose: option.boolean() }, commands: [conflict],
  }, ["run"]);
  assert.equal(nameConflict.exitCode, 2);
  assert.match(nameConflict.stderr, /global.*local.*verbose/i);

  const rootHelpConflict = await runCli({
    name: "tool", version: "1", globalOptions: { verbose: option.boolean() }, commands: [conflict],
  }, ["--help"]);
  assert.equal(rootHelpConflict.exitCode, 2);
  assert.match(rootHelpConflict.stderr, /global.*local.*verbose/i);

  const leafHelpConflict = await runCli({
    name: "tool", version: "1", globalOptions: { verbose: option.boolean() }, commands: [conflict],
  }, ["run", "--json-help"]);
  assert.equal(leafHelpConflict.exitCode, 2);
  assert.match(leafHelpConflict.stderr, /global.*local.*verbose/i);

  const aliasConflict = await runCli({
    name: "tool", version: "1", globalOptions: { trace: option.boolean({ alias: "v" }) }, commands: [conflict],
  }, ["run"]);
  assert.equal(aliasConflict.exitCode, 2);
  assert.match(aliasConflict.stderr, /alias.*v/i);

  const reserved = await runCli({
    name: "tool", version: "1", globalOptions: { help: option.boolean() }, commands: [conflict],
  }, ["run"]);
  assert.equal(reserved.exitCode, 2);
  assert.match(reserved.stderr, /Global option --help is reserved/i);

  const reservedAlias = await runCli({
    name: "tool", version: "1", globalOptions: { verbose: option.boolean({ alias: "h" }) }, commands: [conflict],
  }, ["--help"]);
  assert.equal(reservedAlias.exitCode, 2);
  assert.match(reservedAlias.stderr, /alias -h is reserved/i);
});

test("rejects leaf runner-reserved options before handling help requests", async () => {
  for (const [name, optionDefinition, error] of [
    ["help", option.boolean(), "Local option --help is reserved by the runner\n"],
    ["json-help", option.boolean(), "Local option --json-help is reserved by the runner\n"],
    ["verbose", option.boolean({ alias: "h" }), "Local option alias -h is reserved by the runner\n"],
  ]) {
    const leaf = defineCommand({ name: "run", description: "Run", options: { [name]: optionDefinition }, run() {} });
    const sibling = defineCommand({ name: "ok", description: "OK", run() {} });
    const group = defineCommand({ name: "group", description: "Group", commands: [sibling, leaf] });
    const app = { name: "tool", version: "1", commands: [group] };
    for (const argv of [["--help"], ["--json-help"], ["group", "--help"], ["group", "--json-help"], ["group", "ok", "--help"], ["group", "run", "--help"]]) {
      const result = await runCli(app, argv);
      assert.equal(result.exitCode, 2);
      assert.equal(result.stderr, error);
    }
  }
});

test("rejects global and local effective negation collisions before dispatch", async () => {
  for (const [globalOptions, options] of [
    [{ cache: option.boolean() }, { "no-cache": option.string() }],
    [{ "no-cache": option.boolean() }, { cache: option.boolean() }],
  ]) {
    const leaf = defineCommand({ name: "run", description: "Run", options, run() { throw new Error("dispatched"); } });
    const app = { name: "tool", version: "1", globalOptions, commands: [leaf] };
    for (const argv of [["--no-cache", "run"], ["run", "--no-cache"]]) {
      const result = await runCli(app, argv);
      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /global.*local.*--no-cache/i);
    }
  }
});

test("resolves implicit short options in leading globals and help scanning", async () => {
  const globalOptions = { x: option.string() };
  const leaf = defineCommand({ name: "run", description: "Run", options: { y: option.string() }, run({ globalOptions, options, stdout }) { stdout.write(JSON.stringify({ globalOptions, options })); } });
  const app = { name: "tool", version: "1", globalOptions, commands: [leaf] };
  assert.deepEqual(await runCli(app, ["-x", "value", "run", "-y", "other"]), { exitCode: 0, stdout: '{"globalOptions":{"x":"value"},"options":{"y":"other"}}', stderr: "" });
  for (const flag of ["--help", "--json-help"]) {
    for (const short of ["-x", "-y"]) {
      const result = await runCli(app, ["run", short, flag]);
      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /requires a value/);
    }
  }
});

test("allows a leaf --version option to be parsed", async () => {
  const leaf = defineCommand({
    name: "run", description: "Run", options: { version: option.boolean() },
    run({ options, stdout }) { stdout.write(String(options.version)); },
  });
  const result = await runCli({ name: "tool", version: "1.0", commands: [leaf] }, ["run", "--version"]);
  assert.deepEqual(result, { exitCode: 0, stdout: "true", stderr: "" });
});

test("accepts a global option with a no-prefixed name", async () => {
  const globalOptions = { "no-cache": option.boolean({ default: false }) };
  const command = defineCommandWithGlobals(globalOptions, {
    name: "show", description: "Show", run({ globalOptions, stdout }) { stdout.write(String(globalOptions["no-cache"])); },
  });
  const result = await runCli({ name: "tool", version: "1", globalOptions, commands: [command] }, ["--no-cache", "show"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "true");
});

test("lists globals at each help level and in schema version 2 JSON", async () => {
  const globalOptions = { verbose: option.boolean({ alias: "v", description: "Verbose output" }) };
  const leaf = defineCommandWithGlobals(globalOptions, { name: "list", description: "List data", run() {} });
  const group = defineCommand({ name: "data", description: "Data commands", commands: [leaf] });
  const app = { name: "tool", version: "1", globalOptions, commands: [group] };

  for (const argv of [["--help"], ["data", "--help"], ["data", "list", "--help"]]) {
    const result = await runCli(app, argv);
    assert.match(result.stdout, /Global options:/);
    assert.match(result.stdout, /--verbose/);
  }
  const json = await runCli(app, ["data", "list", "--json-help"]);
  const parsed = JSON.parse(json.stdout);
  assert.deepEqual(parsed.globalOptions, [{ name: "verbose", type: "boolean", description: "Verbose output", alias: "v" }]);
  assert.equal(parsed.options.length, 0);
});

test("checks required global options and rejects globals between group and leaf", async () => {
  const globalOptions = { token: option.string({ required: true }) };
  const leaf = defineCommandWithGlobals(globalOptions, { name: "run", description: "Run", run() {} });
  const group = defineCommand({ name: "ops", description: "Operations", commands: [leaf] });
  const app = { name: "tool", version: "1", globalOptions, commands: [group] };

  const missing = await runCli(app, ["ops", "run"]);
  assert.equal(missing.exitCode, 2);
  assert.match(missing.stderr, /missing required option --token/i);

  const misplaced = await runCli(app, ["ops", "--token", "secret", "run"]);
  assert.equal(misplaced.exitCode, 2);
  assert.match(misplaced.stderr, /global options must appear before/i);
});
