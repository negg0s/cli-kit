import type { ArgumentDefinition, CommandDefinition, OptionMap } from "./types.js";

export type CliDefinition = {
  name: string;
  version: string;
  description?: string;
  commands: readonly CommandDefinition<any, any>[];
};

export type CliResult = { exitCode: number; stdout: string; stderr: string };
export type HelpCommand = Pick<CommandDefinition<any, any>, "name" | "description"> & {
  options?: OptionMap;
  args?: readonly ArgumentDefinition[];
};

function optionRows(options: OptionMap = {}) {
  return Object.entries(options).map(([name, definition]) => ({
    name,
    type: definition.type,
    description: definition.description ?? "",
    ...(definition.alias ? { alias: definition.alias } : {}),
    ...( "required" in definition && definition.required ? { required: true } : {}),
    ...(definition.type === "enum" ? { values: [...definition.values] } : {}),
  }));
}

export function formatHelpJson(command: HelpCommand) {
  return JSON.stringify({
    schemaVersion: 1,
    name: command.name,
    description: command.description,
    options: optionRows(command.options),
    args: (command.args ?? []).map(({ name, description, required }) => ({
      name,
      description: description ?? "",
      required: required ?? false,
    })),
  }, null, 2) + "\n";
}

export function formatCommandHelp(appName: string, command: HelpCommand): string {
  const args = (command.args ?? []).map((arg) => arg.required ? `<${arg.name}>` : `[${arg.name}]`).join(" ");
  const usage = [`Usage: ${appName} ${command.name}`, args, "[options]"].filter(Boolean).join(" ");
  const lines = [usage, "", command.description];
  const options = optionRows(command.options);
  if (options.length) {
    lines.push("", "Options:");
    for (const option of options) {
      const alias = option.alias ? `-${option.alias}, ` : "";
      const values = option.values ? ` (${option.values.join(" | ")})` : "";
      lines.push(`  ${alias}--${option.name}${values}${option.required ? " (required)" : ""}`);
      if (option.description) lines.push(`      ${option.description}`);
    }
  }
  lines.push("  -h, --help", "      Show this help", "  --json-help", "      Print help as versioned JSON");
  return `${lines.join("\n")}\n`;
}

export function formatRootHelp(app: CliDefinition): string {
  const lines = [`Usage: ${app.name} <command> [options]`];
  if (app.description) lines.push("", app.description);
  lines.push("", "Commands:");
  for (const command of app.commands) lines.push(`  ${command.name.padEnd(16)}${command.description}`);
  lines.push("", "Options:", "  -h, --help       Show this help", "  --version        Show version");
  return `${lines.join("\n")}\n`;
}

