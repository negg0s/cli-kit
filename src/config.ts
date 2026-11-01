import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { parseOptionValue } from "./parse.js";
import type { OptionDefinition, OptionMap } from "./types.js";

export type RunCliOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  config?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readConfigFile(path: string, cwd: string): Promise<unknown> {
  const resolvedPath = isAbsolute(path) ? path : resolve(cwd, path);
  let text: string;
  try {
    text = await readFile(resolvedPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unable to read file";
    throw new Error(`Unable to read config file "${resolvedPath}": ${detail}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Invalid JSON config in "${resolvedPath}"`);
  }
}

function parseEnvironmentValue(definition: OptionDefinition, raw: string, name: string): unknown {
  let value: unknown = raw;
  if (definition.type !== "boolean" && definition.multiple) {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      throw new Error(`Invalid environment variable ${name}: expected a JSON array`);
    }
  }
  return parseOptionValue(definition, value, `environment variable ${name}`, true);
}

export async function resolveOptionSources(
  options: OptionMap,
  commandPath: readonly string[],
  appConfigFile: string | undefined,
  runtime: RunCliOptions = {},
): Promise<Record<string, unknown>> {
  const cwd = runtime.cwd ?? process.cwd();
  const env = runtime.env ?? process.env;
  let config: unknown;
  if (runtime.config !== undefined) config = runtime.config;
  else if (appConfigFile !== undefined) config = await readConfigFile(appConfigFile, cwd);
  else config = { commands: {} };

  if (!isRecord(config)) throw new Error("Invalid JSON config: expected an object");
  for (const key of Object.keys(config)) {
    if (key !== "commands") throw new Error(`Unknown config key "${key}"`);
  }
  if (!isRecord(config.commands)) throw new Error('Invalid JSON config: expected a "commands" object');

  const commands = config.commands;
  const selectedConfigKey = commandPath.join(".");
  const selectedConfig = Object.hasOwn(commands, selectedConfigKey) ? commands[selectedConfigKey] : undefined;
  if (selectedConfig !== undefined && !isRecord(selectedConfig)) {
    throw new Error(`Invalid config for command "${selectedConfigKey}": expected an object`);
  }
  const configValues = (selectedConfig ?? {}) as Record<string, unknown>;
  const sourceValues: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(configValues)) {
    if (!Object.hasOwn(options, name)) throw new Error(`Unknown config option "${name}" for command "${selectedConfigKey}"`);
    const definition = options[name]!;
    sourceValues[name] = parseOptionValue(definition, value, `config option ${name}`);
  }

  for (const [name, definition] of Object.entries(options)) {
    if (!definition.env) continue;
    const value = env[definition.env];
    if (value !== undefined) sourceValues[name] = parseEnvironmentValue(definition, value, definition.env);
  }
  return sourceValues;
}
