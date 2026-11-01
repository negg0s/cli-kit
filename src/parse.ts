import type { OptionDefinition, OptionMap, ParsedOptions } from "./types.js";

const NUMBER_PATTERN = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export type ParseResult<T extends OptionMap> = {
  values: ParsedOptions<T>;
  positionals: string[];
};

export function parseArgs<T extends OptionMap>(definitions: T, argv: readonly string[]): ParseResult<T> {
  const values: Record<string, unknown> = {};
  const aliases = new Map<string, string>();

  for (const [name, definition] of Object.entries(definitions)) {
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) {
      throw new Error(`Invalid option name "${name}"`);
    }
    if (definition.alias !== undefined) {
      if (!/^[a-zA-Z]$/.test(definition.alias)) {
        throw new Error(`Invalid alias for --${name}: use one letter`);
      }
      if (aliases.has(definition.alias)) {
        throw new Error(`Duplicate option alias "${definition.alias}"`);
      }
      aliases.set(definition.alias, name);
    }
  }

  const positionals: string[] = [];
  let optionsEnded = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (optionsEnded) {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      optionsEnded = true;
      continue;
    }
    if (!token.startsWith("-") || token === "-") {
      positionals.push(token);
      continue;
    }

    let rawName: string;
    let inlineValue: string | undefined;
    if (token.startsWith("--")) {
      const equalsAt = token.indexOf("=");
      rawName = token.slice(2, equalsAt === -1 ? undefined : equalsAt);
      inlineValue = equalsAt === -1 ? undefined : token.slice(equalsAt + 1);
    } else {
      const short = token.slice(1);
      const equalsAt = short.indexOf("=");
      rawName = short.slice(0, equalsAt === -1 ? undefined : equalsAt);
      inlineValue = equalsAt === -1 ? undefined : short.slice(equalsAt + 1);
      if (rawName.length !== 1) {
        throw new Error(`Unknown option "${token}"`);
      }
      rawName = aliases.get(rawName) ?? rawName;
    }

    let negated = false;
    let name = rawName;
    if (name.startsWith("no-")) {
      name = name.slice(3);
      negated = true;
    }
    const definition = definitions[name];
    if (!definition) throw new Error(`Unknown option "${token}"`);
    if (negated && definition.type !== "boolean") {
      throw new Error(`Option --${name} is not boolean and cannot be negated`);
    }

    if (definition.type === "boolean") {
      if (inlineValue !== undefined) {
        if (inlineValue !== "true" && inlineValue !== "false") {
          throw new Error(`Invalid value for --${name}: expected true or false`);
        }
        values[name] = inlineValue === "true";
      } else {
        values[name] = !negated;
      }
      continue;
    }

    if (negated) throw new Error(`Option --${name} cannot be negated`);
    let value = inlineValue;
    if (value === undefined) {
      const next = argv[index + 1];
      if (next === undefined || next === "--" || (next.startsWith("-") && !(definition.type === "number" && NUMBER_PATTERN.test(next)))) {
        throw new Error(`Option --${name} requires a value`);
      }
      value = next;
      index += 1;
    }

    if (definition.type === "number") {
      const numberValue = Number(value);
      if (!NUMBER_PATTERN.test(value) || !Number.isFinite(numberValue)) throw new Error(`Invalid value for --${name}: expected a finite number`);
      values[name] = numberValue;
    } else if (definition.type === "enum") {
      if (!definition.values.includes(value)) {
        throw new Error(`Invalid value for --${name}: expected one of ${definition.values.join(", ")}`);
      }
      values[name] = value;
    } else {
      values[name] = value;
    }
  }

  for (const [name, definition] of Object.entries(definitions)) {
    if (values[name] === undefined && "default" in definition && definition.default !== undefined) {
      values[name] = definition.default;
    }
    if (definition.type !== "boolean" && definition.required && values[name] === undefined) {
      throw new Error(`Missing required option --${name}`);
    }
  }

  return { values: values as ParsedOptions<T>, positionals };
}
