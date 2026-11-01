import assert from "node:assert/strict";
import test from "node:test";
import { completionScript, defineCommand, option } from "../dist/index.js";

const buildApp = () => ({
  name: "workbench",
  version: "1.0.0",
  commands: [
    defineCommand({
      name: "make-report",
      description: "Make a report with punctuation: 'quotes' and $ signs",
      options: { format: option.enum(["text", "json"]), output: option.string({ alias: "o" }) },
      run() {},
    }),
  ],
});

test("generates static bash, zsh, and fish completions for commands and options", () => {
  const app = buildApp();
  const bash = completionScript(app, "bash");
  const zsh = completionScript(app, "zsh");
  const fish = completionScript(app, "fish");
  for (const output of [bash, zsh, fish]) assert.match(output, /make-report/);
  assert.match(bash, /--format/);
  assert.match(zsh, /--format/);
  assert.match(fish, /-l 'format'/);
  assert.match(bash, /--output/);
  assert.match(bash, /-o/);
  assert.match(zsh, /--output/);
  assert.match(zsh, /-o/);
  assert.match(zsh, /local -a command_list command_options/);
  assert.match(zsh, /_describe -t commands 'command' command_list/);
  assert.doesNotMatch(zsh, /_describe[^\n]*'\(/);
  assert.match(fish, /-l 'output'/);
  assert.match(fish, /-s 'o'/);
  for (const output of [bash, zsh, fish]) assert.match(output, /help/);
  assert.doesNotMatch(bash, /quotes|\$ signs/);
});

test("rejects names that could produce unsafe completion code", () => {
  assert.throws(() => completionScript({ name: "bad;touch", version: "1", commands: [] }, "bash"), /invalid CLI name/i);
  assert.throws(() => completionScript(buildApp(), "powershell"), /unsupported shell/i);
});

test("generates completions for nested command paths and leaf options", () => {
  const app = {
    name: "workbench",
    version: "1.0.0",
    commands: [{
      name: "data",
      description: "Data commands",
      commands: [{ name: "import", description: "Import", options: { format: option.string() }, run() {} }],
    }],
  };
  const bash = completionScript(app, "bash");
  const zsh = completionScript(app, "zsh");
  const fish = completionScript(app, "fish");
  for (const script of [bash, zsh, fish]) {
    assert.match(script, /data/);
    assert.match(script, /import/);
    assert.match(script, /format/);
  }
});

test("uses ordered path checks for fish completions with overlapping command names", () => {
  const app = {
    name: "workbench",
    version: "1.0.0",
    commands: [
      { name: "data", description: "Data", commands: [{ name: "import", description: "Import", options: { input: option.string() }, run() {} }] },
      { name: "admin", description: "Admin", commands: [{ name: "data", description: "Nested data", options: { token: option.string() }, run() {} }] },
    ],
  };
  const fish = completionScript(app, "fish");
  assert.match(fish, /function __workbench_path_is/);
  assert.match(fish, /__workbench_path_is workbench data import/);
  assert.match(fish, /__workbench_path_is workbench admin data/);
  assert.match(completionScript(app, "bash"), /--json-help/);
});

test("keeps bash and zsh completion context after leaf flags and their values", () => {
  const app = {
    name: "workbench",
    version: "1.0.0",
    commands: [{
      name: "data",
      description: "Data",
      commands: [{ name: "import", description: "Import", options: { format: option.string() }, run() {} }],
    }],
  };
  const bash = completionScript(app, "bash");
  const zsh = completionScript(app, "zsh");
  assert.match(bash, /'data import '\*\) command_path='data import'/);
  assert.match(zsh, /'data import '\*\) command_options=/);
});
