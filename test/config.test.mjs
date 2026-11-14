import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand, defineCommandWithGlobals, option, runCli } from "../dist/index.js";
import { resolveOptionSources } from "../dist/config.js";

async function tempDirectory() {
  const parent = join(process.cwd(), ".tmp");
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, "cli-kit-config-"));
}

function buildApp(configFile) {
  const command = defineCommand({
    name: "set",
    description: "Set values",
    options: {
      mode: option.enum(["safe", "fast"]),
      enabled: option.boolean({ default: true, env: "APP_ENABLED" }),
      limit: option.number({ env: "APP_LIMIT" }),
      label: option.string({ env: "APP_LABEL" }),
      tag: option.string({ multiple: true, env: "APP_TAGS" }),
    },
    run({ options, stdout }) { stdout.write(JSON.stringify(options)); },
  });
  return { name: "tool", version: "1", configFile, commands: [command] };
}

test("resolves CLI over env over selected JSON config over defaults", async () => {
  const app = buildApp();
  const config = { commands: { set: { mode: "safe", enabled: false, limit: 0, label: "", tag: ["config"] } } };
  const env = { APP_ENABLED: "yes", APP_LIMIT: "2", APP_LABEL: "env", APP_TAGS: '["env"]' };
  const result = await runCli(app, ["set", "--mode", "fast", "--limit", "3", "--tag", "cli"], { env, config });
  assert.deepEqual(JSON.parse(result.stdout), {
    mode: "fast",
    enabled: true,
    limit: 3,
    label: "env",
    tag: ["cli"],
  });

  const fromConfig = await runCli(app, ["set"], { env: {}, config });
  assert.deepEqual(JSON.parse(fromConfig.stdout), { mode: "safe", enabled: false, limit: 0, label: "", tag: ["config"] });

  const defaults = await runCli(app, ["set"], { env: {}, config: { commands: {} } });
  assert.deepEqual(JSON.parse(defaults.stdout), { enabled: true });
});

test("documents environment mappings and defaults in command help", async () => {
  const app = buildApp();
  const help = await runCli(app, ["set", "--help"]);
  assert.match(help.stdout, /--enabled.*default: true.*env: APP_ENABLED/);
  const json = await runCli(app, ["set", "--json-help"]);
  const enabled = JSON.parse(json.stdout).options.find((entry) => entry.name === "enabled");
  assert.deepEqual(enabled, {
    name: "enabled",
    type: "boolean",
    description: "",
    env: "APP_ENABLED",
    default: true,
  });
});

test("reads an explicitly selected relative JSON config file against cwd", async () => {
  const directory = await tempDirectory();
  try {
    await writeFile(join(directory, "settings.json"), JSON.stringify({ commands: { set: { label: "from-file" } } }));
    const result = await runCli(buildApp("settings.json"), ["set"], { cwd: directory, env: {} });
    assert.deepEqual(JSON.parse(result.stdout), { enabled: true, label: "from-file" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects malformed selected config and invalid env even when CLI overrides", async () => {
  const app = buildApp();
  const unknown = await runCli(app, ["set"], { env: {}, config: { commands: { set: { typo: true } } } });
  assert.equal(unknown.exitCode, 2);
  assert.match(unknown.stderr, /unknown config option.*typo/i);

  const invalidConfigType = await runCli(app, ["set"], { env: {}, config: { commands: { set: { limit: "2" } } } });
  assert.equal(invalidConfigType.exitCode, 2);
  assert.match(invalidConfigType.stderr, /config option limit.*finite number/i);

  const unrelatedCommand = await runCli(app, ["set"], { env: {}, config: { commands: { "other.command": { unused: true } } } });
  assert.equal(unrelatedCommand.exitCode, 0);

  const invalidEnv = await runCli(app, ["set", "--limit", "5"], { env: { APP_LIMIT: "not-a-number" }, config: { commands: {} } });
  assert.equal(invalidEnv.exitCode, 2);
  assert.match(invalidEnv.stderr, /APP_LIMIT.*finite number/i);

  const invalidBoolean = await runCli(app, ["set"], { env: { APP_ENABLED: "" }, config: { commands: {} } });
  assert.equal(invalidBoolean.exitCode, 2);
  assert.match(invalidBoolean.stderr, /APP_ENABLED.*boolean/i);
});

test("rejects malformed or missing explicit config files", async () => {
  const directory = await tempDirectory();
  try {
    await writeFile(join(directory, "bad.json"), "{");
    const malformed = await runCli(buildApp("bad.json"), ["set"], { cwd: directory, env: {} });
    assert.equal(malformed.exitCode, 2);
    assert.match(malformed.stderr, /invalid JSON config/i);

    const missing = await runCli(buildApp("missing.json"), ["set"], { cwd: directory, env: {} });
    assert.equal(missing.exitCode, 2);
    assert.match(missing.stderr, /config file/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("resolves global options with CLI, env, global config, and default precedence", async () => {
  const globalOptions = {
    verbose: option.boolean({ default: false, env: "APP_VERBOSE" }),
    region: option.enum(["us", "eu"], { default: "us", env: "APP_REGION" }),
    tag: option.string({ multiple: true, env: "APP_TAGS" }),
  };
  const command = defineCommandWithGlobals(globalOptions, {
    name: "show",
    description: "Show global inputs",
    run({ globalOptions, stdout }) { stdout.write(JSON.stringify(globalOptions)); },
  });
  const app = { name: "tool", version: "1", globalOptions, commands: [command] };
  const config = { global: { verbose: true, region: "eu", tag: ["config"] }, commands: {} };

  const fromEnv = await runCli(app, ["show"], { env: { APP_VERBOSE: "no", APP_REGION: "us", APP_TAGS: '["env"]' }, config });
  assert.deepEqual(JSON.parse(fromEnv.stdout), { verbose: false, region: "us", tag: ["env"] });

  const fromConfig = await runCli(app, ["show"], { env: {}, config });
  assert.deepEqual(JSON.parse(fromConfig.stdout), { verbose: true, region: "eu", tag: ["config"] });

  const globalOnly = await runCli(app, ["show"], { env: {}, config: { global: { verbose: true } } });
  assert.deepEqual(JSON.parse(globalOnly.stdout), { verbose: true, region: "us" });

  const fromDefault = await runCli(app, ["show"], { env: {}, config: { commands: {} } });
  assert.deepEqual(JSON.parse(fromDefault.stdout), { verbose: false, region: "us" });

  const fromCli = await runCli(app, ["--no-verbose", "--region", "us", "show", "--tag", "cli"], { env: {}, config });
  assert.deepEqual(JSON.parse(fromCli.stdout), { verbose: false, region: "us", tag: ["cli"] });

  const invalidOverridden = await runCli(app, ["--region", "us", "show"], {
    env: { APP_REGION: "invalid" },
    config,
  });
  assert.equal(invalidOverridden.exitCode, 2);
  assert.match(invalidOverridden.stderr, /APP_REGION.*one of us, eu/i);
});

test("rejects unknown and malformed global config values", async () => {
  const globalOptions = { verbose: option.boolean() };
  const command = defineCommandWithGlobals(globalOptions, { name: "show", description: "Show", run() {} });
  const app = { name: "tool", version: "1", globalOptions, commands: [command] };

  const unknown = await runCli(app, ["show"], { env: {}, config: { global: { typo: true }, commands: {} } });
  assert.equal(unknown.exitCode, 2);
  assert.match(unknown.stderr, /unknown global config option.*typo/i);

  const malformed = await runCli(app, ["show"], { env: {}, config: { global: true, commands: {} } });
  assert.equal(malformed.exitCode, 2);
  assert.match(malformed.stderr, /global.*object/i);
});

test("loads one config snapshot for global and command options", async () => {
  const globalOptions = { verbose: option.boolean() };
  const command = defineCommandWithGlobals(globalOptions, {
    name: "show",
    description: "Show",
    options: { label: option.string() },
    run({ options, globalOptions, stdout }) { stdout.write(JSON.stringify({ ...globalOptions, ...options })); },
  });
  const config = { global: { verbose: true }, commands: { show: { label: "same-snapshot" } } };
  let configReads = 0;
  const runtime = { env: {}, get config() { configReads += 1; return configReads === 1 ? config : { global: { verbose: false }, commands: { show: { label: "different-snapshot" } } }; } };

  const result = await runCli({ name: "tool", version: "1", globalOptions, commands: [command] }, ["show"], runtime);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), { verbose: true, label: "same-snapshot" });
  assert.equal(configReads, 1);
});

test("rejects an explicit undefined config snapshot without re-reading runtime config", async () => {
  let configReads = 0;
  const runtime = { get config() { configReads += 1; return { commands: {} }; } };
  await assert.rejects(
    resolveOptionSources({}, [], undefined, runtime, "command", undefined),
    /Invalid JSON config: expected an object/,
  );
  assert.equal(configReads, 0);
});

test("ignores inherited environment properties when resolving an env mapping", async () => {
  const command = defineCommand({
    name: "show",
    description: "Show",
    options: { value: option.string({ env: "toString" }) },
    run({ options, stdout }) { stdout.write(JSON.stringify(options)); },
  });
  const result = await runCli({ name: "tool", version: "1", commands: [command] }, ["show"], { env: {} });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
});
