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
  assert.equal(root.exitCode, 0);

  const commandHelp = await runCli(app, ["greet", "--help"]);
  assert.match(commandHelp.stdout, /Usage: hello greet/);

  const json = await runCli(app, ["greet", "--json-help"]);
  assert.deepEqual(JSON.parse(json.stdout), {
    schemaVersion: 1,
    name: "greet",
    description: "Say hello",
    options: [],
    args: [],
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
