import { formatCommandHelp, formatGroupHelp, formatHelpJson, formatRootHelp } from "./help.js";
import { parseArgs } from "./parse.js";
import { resolveOptionSources } from "./config.js";
import type { RunCliOptions } from "./config.js";
import type { CliDefinition, CliResult } from "./help.js";
import type { ArgumentDefinition, CommandDefinition, CommandGroupDefinition, CommandNode, OptionMap } from "./types.js";

export function defineCommand<
  const TOptions extends OptionMap = {},
  const TArgs extends readonly ArgumentDefinition[] = [],
>(definition: CommandDefinition<TOptions, TArgs>): CommandDefinition<TOptions, TArgs>;

export function defineCommand<const TCommands extends readonly CommandNode[]>(
  definition: CommandGroupDefinition<TCommands>,
): CommandGroupDefinition<TCommands>;
export function defineCommand(definition: CommandNode): CommandNode {
  return definition;
}

export function defineCommandWithGlobals<
  const TGlobalOptions extends OptionMap,
  const TOptions extends OptionMap = {},
  const TArgs extends readonly ArgumentDefinition[] = [],
>(
  globalOptions: TGlobalOptions,
  definition: CommandDefinition<TOptions, TArgs, TGlobalOptions>,
): CommandDefinition<TOptions, TArgs, TGlobalOptions> {
  void globalOptions;
  return definition;
}

function writeResult(exitCode: number, stdout = "", stderr = ""): CliResult {
  return { exitCode, stdout, stderr };
}

function hasFlagBeforeTerminator(args: readonly string[], flags: readonly string[], definitions: OptionMap): boolean {
  const terminator = args.indexOf("--");
  const end = terminator === -1 ? args.length : terminator;
  for (let index = 0; index < end; index += 1) {
    const token = args[index]!;
    if (flags.includes(token)) return true;

    let definition: OptionMap[string] | undefined;
    let inlineValue = false;
    if (token.startsWith("--")) {
      const equalsAt = token.indexOf("=");
      const name = token.slice(2, equalsAt === -1 ? undefined : equalsAt);
      definition = definitions[name] ?? (name.startsWith("no-") ? definitions[name.slice(3)] : undefined);
      inlineValue = equalsAt !== -1;
    } else if (token.startsWith("-") && token !== "-") {
      const short = token.slice(1);
      const equalsAt = short.indexOf("=");
      const alias = short.slice(0, equalsAt === -1 ? undefined : equalsAt);
      if (alias.length === 1) {
        definition = Object.values(definitions).find((candidate) => candidate.alias === alias);
        inlineValue = equalsAt !== -1;
      }
    }

    if (definition && definition.type !== "boolean" && !inlineValue) index += 1;
  }
  return false;
}

const NUMBER_PATTERN = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function optionForToken(token: string, definitions: OptionMap): { name: string; definition: OptionMap[string]; inlineValue?: string } | undefined {
  if (token.startsWith("--")) {
    const equalsAt = token.indexOf("=");
    const name = token.slice(2, equalsAt === -1 ? undefined : equalsAt);
    const definition = definitions[name] ?? (name.startsWith("no-") ? definitions[name.slice(3)] : undefined);
    return definition ? { name, definition, ...(equalsAt === -1 ? {} : { inlineValue: token.slice(equalsAt + 1) }) } : undefined;
  }
  if (token.startsWith("-") && token !== "-") {
    const short = token.slice(1);
    const equalsAt = short.indexOf("=");
    const alias = short.slice(0, equalsAt === -1 ? undefined : equalsAt);
    if (alias.length !== 1) return undefined;
    const found = Object.entries(definitions).find(([, definition]) => definition.alias === alias);
    return found ? { name: found[0], definition: found[1], ...(equalsAt === -1 ? {} : { inlineValue: short.slice(equalsAt + 1) }) } : undefined;
  }
  return undefined;
}

function extractLeadingGlobals(argv: readonly string[], definitions: OptionMap): { prefix: string[]; remaining: string[]; error?: string } {
  const prefix: string[] = [];
  let index = 0;
  while (index < argv.length) {
    const token = argv[index]!;
    if (!token.startsWith("-") || token === "-" || token === "--" || ["--help", "-h", "--json-help", "--version"].includes(token)) break;
    const found = optionForToken(token, definitions);
    if (!found) return { prefix, remaining: argv.slice(index), error: `Unknown option "${token}". Run the CLI with --help for usage.` };
    prefix.push(token);
    if (found.definition.type !== "boolean" && found.inlineValue === undefined) {
      const value = argv[index + 1];
      if (value === undefined || value === "--" || ["--help", "-h", "--json-help", "--version"].includes(value) || (value.startsWith("-") && !(found.definition.type === "number" && NUMBER_PATTERN.test(value)))) {
        return { prefix, remaining: argv.slice(index), error: `Option --${found.name} requires a value` };
      }
      prefix.push(value);
      index += 2;
    } else {
      index += 1;
    }
  }
  return { prefix, remaining: argv.slice(index) };
}

function mergeOptionMaps(globalOptions: OptionMap, localOptions: OptionMap): OptionMap {
  for (const name of ["help", "json-help", "version"]) {
    if (Object.hasOwn(globalOptions, name)) throw new Error(`Global option --${name} is reserved`);
  }
  if (Object.values(globalOptions).some((definition) => definition.alias === "h")) {
    throw new Error("Global option alias -h is reserved");
  }
  for (const [name, definition] of Object.entries(globalOptions)) {
    if (Object.hasOwn(localOptions, name)) throw new Error(`Global and local options conflict on --${name}`);
    if (definition.alias) {
      for (const [localName, localDefinition] of Object.entries(localOptions)) {
        if (localDefinition.alias === definition.alias) {
          throw new Error(`Global and local option aliases conflict on -${definition.alias} (--${name} and --${localName})`);
        }
      }
    }
  }
  return { ...globalOptions, ...localOptions };
}

function validateGlobalOptionCollisions(commands: readonly CommandNode[], globalOptions: OptionMap): void {
  for (const command of commands) {
    if ("run" in command) mergeOptionMaps(globalOptions, command.options ?? {});
    else validateGlobalOptionCollisions(command.commands, globalOptions);
  }
}

function splitParsedOptions(values: Record<string, unknown>, definitions: OptionMap): Record<string, unknown> {
  return Object.fromEntries(Object.keys(definitions).filter((name) => Object.hasOwn(values, name)).map((name) => [name, values[name]]));
}

function parsePositionals(definitions: readonly ArgumentDefinition[], values: readonly string[]): unknown[] {
  let optionalSeen = false;
  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index]!;
    if (definition.variadic && index !== definitions.length - 1) {
      throw new Error(`Variadic argument <${definition.name}> must be last`);
    }
    if (!definition.required) optionalSeen = true;
    else if (optionalSeen) throw new Error(`Optional arguments cannot appear before required argument <${definition.name}>`);
  }

  const parsed: unknown[] = [];
  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index]!;
    if (definition.variadic) {
      const remaining = values.slice(index);
      if (definition.required && remaining.length === 0) throw new Error(`Missing required argument <${definition.name}>`);
      parsed.push(remaining);
      return parsed;
    }
    const value = values[index];
    if (definition.required && value === undefined) throw new Error(`Missing required argument <${definition.name}>`);
    parsed.push(value);
  }

  if (values.length > definitions.length) {
    throw new Error(`Unexpected argument "${values[definitions.length]}"`);
  }
  return parsed;
}

export async function runCli(app: CliDefinition, argv: readonly string[], runtime: RunCliOptions = {}): Promise<CliResult> {
  const globalDefinitions = app.globalOptions ?? {};
  try {
    mergeOptionMaps(globalDefinitions, {});
    validateGlobalOptionCollisions(app.commands, globalDefinitions);
  } catch (error) {
    return writeResult(2, "", `${error instanceof Error ? error.message : "Invalid global options"}\n`);
  }
  if (argv[0] === "--version") return writeResult(0, `${app.version}\n`);
  if (argv[0] === "--json-help") return writeResult(0, formatHelpJson(app));
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    return writeResult(0, formatRootHelp(app));
  }

  const leading = extractLeadingGlobals(argv, globalDefinitions);
  if (leading.error) return writeResult(2, "", `${leading.error.replace("Run the CLI with --help", `Run ${app.name} --help`)}\n`);
  const args = [...leading.remaining];
  if (args[0] === "--version") return writeResult(0, `${app.version}\n`);
  if (args[0] === "--json-help") return writeResult(0, formatHelpJson(app));
  if (args[0] === "--help" || args[0] === "-h" || args.length === 0) return writeResult(0, formatRootHelp(app));
  if (args[0]!.startsWith("-")) return writeResult(2, "", `Unknown option "${args[0]}". Run ${app.name} --help for usage.\n`);

  let commands: readonly CommandNode[] = app.commands;
  const commandPath: string[] = [];
  let command: CommandNode | undefined;
  while (args.length > 0 && !args[0]!.startsWith("-")) {
    const name = args[0]!;
    command = commands.find((entry) => entry.name === name);
    if (!command) {
      const path = [...commandPath, name].join(" ");
      const hint = commandPath.length ? `${app.name} ${commandPath.join(" ")} --help` : `${app.name} --help`;
      return writeResult(2, "", `Unknown command "${path}". Run ${hint} for a list of commands.\n`);
    }
    args.shift();
    commandPath.push(name);
    if (!("run" in command)) {
      commands = command.commands;
      if (args[0] === "--help" || args[0] === "-h") {
        return writeResult(0, formatGroupHelp(app.name, { ...command, globalOptions: globalDefinitions }, commandPath.join(" ")));
      }
      if (args[0] === "--json-help") return writeResult(0, formatHelpJson({ ...command, globalOptions: globalDefinitions }));
      if (args.length === 0) {
        return writeResult(0, formatGroupHelp(app.name, { ...command, globalOptions: globalDefinitions }, commandPath.join(" ")));
      }
      if (args[0]!.startsWith("-")) {
        return writeResult(2, "", `Global options must appear before the command path or after the complete path. Run ${app.name} ${commandPath.join(" ")} --help.\n`);
      }
    } else break;
  }

  if (!command) return writeResult(0, formatRootHelp(app));
  if (!("run" in command)) return writeResult(2, "", `Expected a command after "${commandPath.join(" ")}". Run ${app.name} ${commandPath.join(" ")} --help.\n`);

  const optionDefinitions = { ...globalDefinitions, ...(command.options ?? {}) };
  if (hasFlagBeforeTerminator(args, ["--help", "-h"], optionDefinitions)) {
    return writeResult(0, formatCommandHelp(app.name, { ...command, globalOptions: globalDefinitions }, commandPath.join(" ")));
  }
  if (hasFlagBeforeTerminator(args, ["--json-help"], optionDefinitions)) return writeResult(0, formatHelpJson({ ...command, globalOptions: globalDefinitions }));

  let stdout = "";
  let stderr = "";
  try {
    const definitions = command.options ?? {};
    const allDefinitions = mergeOptionMaps(globalDefinitions, definitions);
    const globalSources = await resolveOptionSources(globalDefinitions, [], app.configFile, runtime, "global");
    const localSources = await resolveOptionSources(definitions, commandPath, app.configFile, runtime);
    const parsed = parseArgs(allDefinitions, [...leading.prefix, ...args], { ...globalSources, ...localSources });
    const globalValues = splitParsedOptions(parsed.values as Record<string, unknown>, globalDefinitions);
    const localValues = splitParsedOptions(parsed.values as Record<string, unknown>, definitions);
    const argumentDefinitions = command.args ?? [];
    const positionalValues = parsePositionals(argumentDefinitions, parsed.positionals);

    const result = await command.run({
      options: localValues as never,
      args: positionalValues as never,
      globalOptions: globalValues as never,
      stdout: { write: (text) => { stdout += text; } },
      stderr: { write: (text) => { stderr += text; } },
    });
    return writeResult(typeof result === "number" ? result : 0, stdout, stderr);
  } catch (error) {
    stderr += `${error instanceof Error ? error.message : "Command failed"}\n`;
    return writeResult(2, stdout, stderr);
  }
}


