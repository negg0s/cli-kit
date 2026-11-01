import assert from "node:assert/strict";
import test from "node:test";
import { defineCommand, runCli, runForTest, option } from "../dist/index.js";

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
    options: [],
    args: [],
    commands: [],
  });
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
