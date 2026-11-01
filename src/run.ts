import { formatCommandHelp, formatHelpJson, formatRootHelp } from "./help.js";
import { parseArgs } from "./parse.js";
import type { CliDefinition, CliResult } from "./help.js";
import type { ArgumentDefinition, CommandDefinition, OptionMap } from "./types.js";

export function defineCommand<
  const TOptions extends OptionMap = {},
  const TArgs extends readonly ArgumentDefinition[] = [],
>(definition: CommandDefinition<TOptions, TArgs>): CommandDefinition<TOptions, TArgs> {
  return definition;
}

function writeResult(exitCode: number, stdout = "", stderr = ""): CliResult {
  return { exitCode, stdout, stderr };
}

function hasFlagBeforeTerminator(args: readonly string[], flag: string): boolean {
  const terminator = args.indexOf("--");
  return args.slice(0, terminator === -1 ? undefined : terminator).includes(flag);
}

export async function runCli(app: CliDefinition, argv: readonly string[]): Promise<CliResult> {
  const args = [...argv];
  if (args[0] === "--version") return writeResult(0, `${app.version}\n`);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return writeResult(0, formatRootHelp(app));
  }

  const commandName = args.shift()!;
  const command = app.commands.find((entry) => entry.name === commandName);
  if (!command) return writeResult(2, "", `Unknown command "${commandName}". Run ${app.name} --help for a list of commands.\n`);

  if (hasFlagBeforeTerminator(args, "--help") || hasFlagBeforeTerminator(args, "-h")) {
    return writeResult(0, formatCommandHelp(app.name, command));
  }
  if (hasFlagBeforeTerminator(args, "--json-help")) return writeResult(0, formatHelpJson(command));

  let stdout = "";
  let stderr = "";
  try {
    const parsed = parseArgs(command.options ?? {}, args);
    const definitions = command.args ?? [];
    for (let index = 0; index < definitions.length; index += 1) {
      const definition = definitions[index]!;
      if (definition.required && parsed.positionals[index] === undefined) {
        throw new Error(`Missing required argument <${definition.name}>`);
      }
    }
    if (parsed.positionals.length > definitions.length) {
      throw new Error(`Unexpected argument "${parsed.positionals[definitions.length]}"`);
    }

    const result = await command.run({
      options: parsed.values,
      args: parsed.positionals as never,
      stdout: { write: (text) => { stdout += text; } },
      stderr: { write: (text) => { stderr += text; } },
    });
    return writeResult(typeof result === "number" ? result : 0, stdout, stderr);
  } catch (error) {
    stderr += `${error instanceof Error ? error.message : "Command failed"}\n`;
    return writeResult(2, stdout, stderr);
  }
}


