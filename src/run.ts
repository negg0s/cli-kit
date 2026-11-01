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

function writeResult(exitCode: number, stdout = "", stderr = ""): CliResult {
  return { exitCode, stdout, stderr };
}

function hasFlagBeforeTerminator(args: readonly string[], flag: string): boolean {
  const terminator = args.indexOf("--");
  return args.slice(0, terminator === -1 ? undefined : terminator).includes(flag);
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
  const args = [...argv];
  if (args[0] === "--version") return writeResult(0, `${app.version}\n`);
  if (args[0] === "--json-help") return writeResult(0, formatHelpJson(app));
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return writeResult(0, formatRootHelp(app));
  }
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
        return writeResult(0, formatGroupHelp(app.name, command, commandPath.join(" ")));
      }
      if (args[0] === "--json-help") return writeResult(0, formatHelpJson(command));
      if (args.length === 0) {
        return writeResult(0, formatGroupHelp(app.name, command, commandPath.join(" ")));
      }
    } else break;
  }

  if (!command) return writeResult(0, formatRootHelp(app));
  if (!("run" in command)) return writeResult(2, "", `Expected a command after "${commandPath.join(" ")}". Run ${app.name} ${commandPath.join(" ")} --help.\n`);

  if (hasFlagBeforeTerminator(args, "--help") || hasFlagBeforeTerminator(args, "-h")) {
    return writeResult(0, formatCommandHelp(app.name, command, commandPath.join(" ")));
  }
  if (hasFlagBeforeTerminator(args, "--json-help")) return writeResult(0, formatHelpJson(command));

  let stdout = "";
  let stderr = "";
  try {
    const definitions = command.options ?? {};
    const sourceValues = await resolveOptionSources(definitions, commandPath, app.configFile, runtime);
    const parsed = parseArgs(definitions, args, sourceValues);
    const argumentDefinitions = command.args ?? [];
    const positionalValues = parsePositionals(argumentDefinitions, parsed.positionals);

    const result = await command.run({
      options: parsed.values,
      args: positionalValues as never,
      stdout: { write: (text) => { stdout += text; } },
      stderr: { write: (text) => { stderr += text; } },
    });
    return writeResult(typeof result === "number" ? result : 0, stdout, stderr);
  } catch (error) {
    stderr += `${error instanceof Error ? error.message : "Command failed"}\n`;
    return writeResult(2, stdout, stderr);
  }
}


