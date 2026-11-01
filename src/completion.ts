import type { CliDefinition } from "./help.js";
import type { CommandNode, OptionDefinition } from "./types.js";

export type CompletionShell = "bash" | "zsh" | "fish";

function assertSafeName(value: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) {
    throw new Error(`Invalid ${label}: use letters, numbers, underscores, or hyphens`);
  }
}

type CompletionContext = { path: string[]; candidates: string[] };

function contextsFor(app: CliDefinition): CompletionContext[] {
  assertSafeName(app.name, "CLI name");
  const contexts: CompletionContext[] = [{ path: [], candidates: [...app.commands.map((command) => command.name), "--help", "--json-help", "--version"] }];
  const visit = (commands: readonly CommandNode[], path: string[]) => {
    for (const command of commands) {
      assertSafeName(command.name, "command name");
      const commandPath = [...path, command.name];
      if (!("run" in command)) {
        const children = command.commands as readonly CommandNode[];
        contexts.push({ path: commandPath, candidates: [...children.map((child) => child.name), "--help", "--json-help"] });
        visit(children, commandPath);
      } else {
        const options = (Object.entries(command.options ?? {}) as [string, OptionDefinition][]).flatMap(([name, definition]) => {
          assertSafeName(name, "option name");
          if (definition.alias) assertSafeName(definition.alias, "option alias");
          return [`--${name}`, ...(definition.alias ? [`-${definition.alias}`] : [])];
        });
        contexts.push({ path: commandPath, candidates: [...options, "--help", "--json-help"] });
      }
    }
  };
  visit(app.commands, []);
  return contexts;
}

export function completionScript(app: CliDefinition, shell: CompletionShell): string {
  if (shell !== "bash" && shell !== "zsh" && shell !== "fish") {
    throw new Error(`Unsupported shell "${shell}". Use bash, zsh, or fish.`);
  }
  const contexts = contextsFor(app);

  if (shell === "bash") {
    const pathCases = [...contexts].sort((a, b) => b.path.length - a.path.length).map(({ path }) => {
      if (path.length === 0) return "    '') command_path='' ;;";
      const joined = path.join(" ");
      return `    '${joined}'|'${joined} '*) command_path='${joined}' ;;`;
    }).join("\n");
    const candidatesForPath = contexts.map(({ path, candidates }) => `    '${path.join(" ")}') words='${candidates.join(" ")}' ;;`).join("\n");
    return [
      `_${app.name}_complete() {`,
      "  local cur words command_path words_before",
      '  cur="${COMP_WORDS[COMP_CWORD]}"',
      '  words_before="${COMP_WORDS[*]:1:COMP_CWORD-1}"',
      '  command_path=""',
      '  case "$words_before" in',
      pathCases,
      "  esac",
      '  case "$command_path" in',
      candidatesForPath,
      "    *) words='' ;;",
      "  esac",
      '  COMPREPLY=( $(compgen -W "$words" -- "$cur") )',
      "}",
      `complete -F _${app.name}_complete ${app.name}`,
      "",
    ].join("\n");
  }

  if (shell === "zsh") {
    const commandList = contexts[0]!.candidates.map((value) => `'${value}:${value}'`).join(" ");
    const cases = [...contexts.slice(1)].sort((a, b) => b.path.length - a.path.length).map(({ path, candidates }) => {
      const optionSpecs = candidates.map((value) => `'${value}[${value}]'`).join(" ");
      const joined = path.join(" ");
      return `    '${joined}'|'${joined} '*) command_options=(${optionSpecs}) ;;`;
    }).join("\n");
    return [
      `#compdef ${app.name}`,
      `_${app.name}() {`,
      "  local -a command_list command_options",
      `  command_list=(${commandList})`,
      "  local command_path=\"${(j: :)words[2,CURRENT-1]}\"",
      "  case \"$command_path\" in",
      cases,
      "  esac",
      "  if (( CURRENT == 2 )); then _describe -t commands 'command' command_list; return; fi",
      "  (( $#command_options )) && _arguments $command_options",
      "}",
      `compdef _${app.name} ${app.name}`,
      "",
    ].join("\n");
  }

  const functionName = `__${app.name}_path_is`;
  const lines: string[] = [
    `function ${functionName}`,
    "  set -l expected $argv",
    "  set -l actual (commandline -opc)",
    "  test (count $actual) -ge (count $expected); or return 1",
    "  for index in (seq (count $expected))",
    "    test \"$actual[$index]\" = \"$expected[$index]\"; or return 1",
    "  end",
    "  return 0",
    "end",
  ];
  for (const { path, candidates } of contexts) {
    const condition = path.length ? `${functionName} ${app.name} ${path.join(" ")}` : "__fish_use_subcommand";
    for (const value of candidates) {
      const prior = value.startsWith("--") ? `-l '${value.slice(2)}'` : value.startsWith("-") ? `-s '${value.slice(1)}'` : `-a '${value}'`;
      lines.push(`complete -c ${app.name} -f -n '${condition}' ${prior}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
