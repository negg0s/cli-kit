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
  assert.match(fish, /-l 'output'/);
  assert.match(fish, /-s 'o'/);
  for (const output of [bash, zsh, fish]) assert.match(output, /help/);
  assert.doesNotMatch(bash, /quotes|\$ signs/);
});

test("rejects names that could produce unsafe completion code", () => {
  assert.throws(() => completionScript({ name: "bad;touch", version: "1", commands: [] }, "bash"), /invalid CLI name/i);
  assert.throws(() => completionScript(buildApp(), "powershell"), /unsupported shell/i);
});
