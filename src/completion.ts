import type { CliDefinition } from "./help.js";
import type { OptionDefinition } from "./types.js";

export type CompletionShell = "bash" | "zsh" | "fish";

function assertSafeName(value: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) {
    throw new Error(`Invalid ${label}: use letters, numbers, underscores, or hyphens`);
  }
}

function commandsFor(app: CliDefinition) {
  assertSafeName(app.name, "CLI name");
  return app.commands.map((command) => {
    assertSafeName(command.name, "command name");
    const options = (Object.entries(command.options ?? {}) as [string, OptionDefinition][]).flatMap(([name, definition]) => {
      assertSafeName(name, "option name");
      if (definition.alias) assertSafeName(definition.alias, "option alias");
      return [`--${name}`, ...(definition.alias ? [`-${definition.alias}`] : [])];
    });
    return { name: command.name, options: [...options, "--help", "--json-help"] };
  });
}

export function completionScript(app: CliDefinition, shell: CompletionShell): string {
  if (shell !== "bash" && shell !== "zsh" && shell !== "fish") {
    throw new Error(`Unsupported shell "${shell}". Use bash, zsh, or fish.`);
  }
  const commands = commandsFor(app);

  if (shell === "bash") {
    const cases = commands.map(({ name, options }) => `    ${name}) words='${options.join(" ")}' ;;`).join("\n");
    const names = [...commands.map(({ name }) => name), "--help", "--version"].join(" ");
    return [
      `_${app.name}_complete() {`,
      "  local cur words",
      "  cur=\"${COMP_WORDS[COMP_CWORD]}\"",
      "  if (( COMP_CWORD == 1 )); then",
      `    words='${names}'`,
      "  else",
      "    case \"${COMP_WORDS[1]}\" in",
      cases,
      "      *) words='--help --version' ;;",
      "    esac",
      "  fi",
      "  COMPREPLY=( $(compgen -W \"$words\" -- \"$cur\") )",
      "}",
      `complete -F _${app.name}_complete ${app.name}`,
      "",
    ].join("\n");
  }

  if (shell === "zsh") {
    const commandList = [...commands.map(({ name }) => name), "--help", "--version"].join(" ");
    const cases = commands.map(({ name, options }) => `    ${name}) _arguments ${options.map((value) => `'${value}[${value}]'`).join(" ")} ;;`).join("\n");
    return [
      `#compdef ${app.name}`,
      `_${app.name}() {`,
      "  if (( CURRENT == 2 )); then",
      `    _describe 'command' '(${commandList})'`,
      "    return",
      "  fi",
      "  case \"$words[2]\" in",
      cases,
      "  esac",
      "}",
      `compdef _${app.name} ${app.name}`,
      "",
    ].join("\n");
  }

  const lines = commands.flatMap(({ name, options }) => [
    `complete -c ${app.name} -f -n '__fish_use_subcommand' -a '${name}'`,
    ...options.map((value) => value.startsWith("--")
      ? `complete -c ${app.name} -n '__fish_seen_subcommand_from ${name}' -l '${value.slice(2)}'`
      : `complete -c ${app.name} -n '__fish_seen_subcommand_from ${name}' -s '${value.slice(1)}'`),
  ]);
  lines.push(`complete -c ${app.name} -f -l help -s h -d 'Show help'`);
  lines.push(`complete -c ${app.name} -f -l version -d 'Show version'`);
  return `${lines.join("\n")}\n`;
}
