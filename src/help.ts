import type { ArgumentDefinition, CommandNode, OptionMap } from "./types.js";

export type CliDefinition = {
  name: string;
  version: string;
  description?: string;
  configFile?: string;
  globalOptions?: OptionMap;
  commands: readonly CommandNode[];
};

export type CliResult = { exitCode: number; stdout: string; stderr: string };
export type HelpCommand = { name: string; description?: string } & {
  options?: OptionMap;
  globalOptions?: OptionMap;
  args?: readonly ArgumentDefinition[];
  commands?: readonly CommandNode[];
};

function optionRows(options: OptionMap = {}) {
  return Object.entries(options).map(([name, definition]) => ({
    name,
    type: definition.type,
    description: definition.description ?? "",
    ...("multiple" in definition && definition.multiple ? { multiple: true } : {}),
    ...(definition.env ? { env: definition.env } : {}),
    ...("default" in definition && definition.default !== undefined ? { default: definition.default } : {}),
    ...(definition.alias ? { alias: definition.alias } : {}),
    ...( "required" in definition && definition.required ? { required: true } : {}),
    ...(definition.type === "enum" ? { values: [...definition.values] } : {}),
  }));
}

export function formatHelpJson(command: HelpCommand) {
  return JSON.stringify({
    schemaVersion: 2,
    name: command.name,
    description: command.description ?? "",
    globalOptions: optionRows(command.globalOptions),
    options: optionRows(command.options),
    args: (command.args ?? []).map(({ name, description, required, variadic }) => ({
      name,
      description: description ?? "",
      required: required ?? false,
      variadic: variadic ?? false,
    })),
    commands: (command.commands ?? []).map(commandHelpJson),
  }, null, 2) + "\n";
}

function commandHelpJson(command: CommandNode): object {
  const { schemaVersion: _schemaVersion, globalOptions: _globalOptions, ...help } = JSON.parse(formatHelpJson(command as HelpCommand)) as Record<string, unknown>;
  return help;
}

function optionSection(title: string, options: OptionMap = {}): string[] {
  const rows = optionRows(options);
  if (rows.length === 0) return [];
  const lines = ["", `${title}:`];
  for (const option of rows) {
    const alias = option.alias ? `-${option.alias}, ` : "";
    const takesValue = option.type !== "boolean";
    const placeholder = takesValue ? (option.multiple ? " <value...>" : " <value>") : "";
    const values = option.values ? ` (${option.values.join(" | ")})` : "";
    const defaultValue = option.default === undefined ? "" : ` (default: ${JSON.stringify(option.default)})`;
    const envValue = option.env ? ` (env: ${option.env})` : "";
    lines.push(`  ${alias}--${option.name}${placeholder}${values}${option.required ? " (required)" : ""}${defaultValue}${envValue}`);
    if (option.description) lines.push(`      ${option.description}`);
  }
  return lines;
}

export function formatCommandHelp(appName: string, command: HelpCommand, commandPath = command.name): string {
  const args = (command.args ?? []).map((arg) => {
    const name = `${arg.name}${arg.variadic ? "..." : ""}`;
    return arg.required ? `<${name}>` : `[${name}]`;
  }).join(" ");
  const usage = [`Usage: ${appName} ${commandPath}`, args, "[options]"].filter(Boolean).join(" ");
  const lines = [usage, "", command.description ?? ""];
  lines.push(...optionSection("Global options", command.globalOptions));
  lines.push(...optionSection("Options", command.options));
  lines.push("  -h, --help", "      Show this help", "  --json-help", "      Print help as versioned JSON");
  return `${lines.join("\n")}\n`;
}

export function formatRootHelp(app: CliDefinition): string {
  const lines = [`Usage: ${app.name} <command> [options]`];
  if (app.description) lines.push("", app.description);
  lines.push("", "Commands:");
  for (const command of app.commands) lines.push(`  ${command.name.padEnd(16)}${command.description}`);
  lines.push(...optionSection("Global options", app.globalOptions));
  lines.push("", "Options:", "  -h, --help       Show this help", "  --json-help      Print help as versioned JSON", "  --version        Show version");
  return `${lines.join("\n")}\n`;
}

export function formatGroupHelp(appName: string, group: HelpCommand, commandPath: string): string {
  const lines = [`Usage: ${appName} ${commandPath} <command> [options]`, "", group.description ?? "", "", "Commands:"];
  for (const command of group.commands ?? []) lines.push(`  ${command.name.padEnd(16)}${command.description}`);
  lines.push(...optionSection("Global options", group.globalOptions));
  lines.push("", "Options:", "  -h, --help       Show this help", "  --json-help      Print help as versioned JSON");
  return `${lines.join("\n")}\n`;
}

