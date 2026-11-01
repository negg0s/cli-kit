import type { CliDefinition } from "./help.js";
import type { CommandNode, OptionDefinition, OptionMap } from "./types.js";

export type CompletionShell = "bash" | "zsh" | "fish";

function assertSafeName(value: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) {
    throw new Error(`Invalid ${label}: use letters, numbers, underscores, or hyphens`);
  }
}

type CompletionContext = { path: string[]; candidates: string[]; kind: "root" | "group" | "leaf" };
type CommandTransition = { parent: string[]; child: string; path: string[]; leaf: boolean };

function optionFlags(options: OptionMap): string[] {
  return (Object.entries(options) as [string, OptionDefinition][]).flatMap(([name, definition]) => {
    assertSafeName(name, "option name");
    if (definition.alias) assertSafeName(definition.alias, "option alias");
    return [
      `--${name}`,
      ...(definition.alias ? [`-${definition.alias}`] : []),
      ...(definition.type === "boolean" ? [`--no-${name}`] : []),
    ];
  });
}

function contextsFor(app: CliDefinition): { contexts: CompletionContext[]; transitions: CommandTransition[]; globalOptions: OptionMap } {
  assertSafeName(app.name, "CLI name");
  const globalOptions = app.globalOptions ?? {};
  const globalFlags = optionFlags(globalOptions);
  const contexts: CompletionContext[] = [{
    path: [],
    candidates: [...app.commands.map((command) => command.name), ...globalFlags, "--help", "-h", "--json-help", "--version"],
    kind: "root",
  }];
  const transitions: CommandTransition[] = [];
  const visit = (commands: readonly CommandNode[], path: string[]) => {
    for (const command of commands) {
      assertSafeName(command.name, "command name");
      const commandPath = [...path, command.name];
      transitions.push({ parent: path, child: command.name, path: commandPath, leaf: "run" in command });
      if (!("run" in command)) {
        const children = command.commands as readonly CommandNode[];
        contexts.push({ path: commandPath, candidates: [...children.map((child) => child.name), "--help", "-h", "--json-help"], kind: "group" });
        visit(children, commandPath);
      } else {
        const options = optionFlags(command.options ?? {});
        contexts.push({ path: commandPath, candidates: [...new Set([...options, ...globalFlags, "--help", "-h", "--json-help"])], kind: "leaf" });
      }
    }
  };
  visit(app.commands, []);
  return { contexts, transitions, globalOptions };
}

export function completionScript(app: CliDefinition, shell: CompletionShell): string {
  if (shell !== "bash" && shell !== "zsh" && shell !== "fish") {
    throw new Error(`Unsupported shell "${shell}". Use bash, zsh, or fish.`);
  }
  const { contexts, transitions, globalOptions } = contextsFor(app);
  const globalFlags = optionFlags(globalOptions);

  if (shell === "bash") {
    const skipCases = Object.entries(globalOptions).flatMap(([name, definition]) => {
      const spellings = [`--${name}`, ...(definition.alias ? [`-${definition.alias}`] : [])];
      if (definition.type === "boolean") {
        spellings.push(`--no-${name}`);
        return [
          `      ${spellings.join("|")}) ((i += 1)); continue ;;`,
          `      ${spellings.map((value) => `${value}=*`).join("|")}) ((i += 1)); continue ;;`,
        ];
      }
      return [
        `      ${spellings.join("|")}) ((i += 2)); continue ;;`,
        `      ${spellings.map((value) => `${value}=*`).join("|")}) ((i += 1)); continue ;;`,
      ];
    }).join("\n");
    const transitionCases = transitions.map(({ parent, child, path, leaf }) =>
      `      '${parent.join(" ")}|${child}') command_path='${path.join(" ")}'; ${leaf ? "break" : ""} ;;`,
    ).join("\n");
    const candidatesForPath = contexts.map(({ path, candidates }) => `    '${path.join(" ")}') words='${candidates.join(" ")}' ;;`).join("\n");
    return [
      `_${app.name}_complete() {`,
      "  local cur words command_path word i",
      '  cur="${COMP_WORDS[COMP_CWORD]}"',
      '  command_path=""',
      "  i=1",
      "  while (( i < COMP_CWORD )); do",
      '    word="${COMP_WORDS[i]}"',
      '    if [[ -z "$command_path" ]]; then',
      '      case "$word" in',
      skipCases,
      "      esac",
      "    fi",
      '    case "$command_path|$word" in',
      transitionCases,
      "      *) break ;;",
      "    esac",
      "    ((i += 1))",
      "  done",
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
    const commandList = app.commands.map((command) => `'${command.name}:${command.name}'`).join(" ");
    const rootOptions = [...globalFlags, "--help", "-h", "--json-help", "--version"]
      .map((value) => `'${value}[${value}]'`).join(" ");
    const skipCases = Object.entries(globalOptions).flatMap(([name, definition]) => {
      const spellings = [`--${name}`, ...(definition.alias ? [`-${definition.alias}`] : [])];
      if (definition.type === "boolean") return [
        `      ${[...spellings, `--no-${name}`].join("|")}) ((i += 1)); continue ;;`,
        `      ${[...spellings, `--no-${name}`].map((value) => `${value}=*`).join("|")}) ((i += 1)); continue ;;`,
      ];
      return [
        `      ${spellings.join("|")}) ((i += 2)); continue ;;`,
        `      ${spellings.map((value) => `${value}=*`).join("|")}) ((i += 1)); continue ;;`,
      ];
    }).join("\n");
    const transitionCases = transitions.map(({ parent, child, path, leaf }) =>
      `      '${parent.join(" ")}|${child}') command_path='${path.join(" ")}'; ${leaf ? "break" : ""} ;;`,
    ).join("\n");
    const cases = [...contexts.slice(1)].map(({ path, candidates }) => {
      const optionSpecs = candidates.map((value) => `'${value}[${value}]'`).join(" ");
      const joined = path.join(" ");
      return `    '${joined}') command_options=(${optionSpecs}) ;;`;
    }).join("\n");
    return [
      `#compdef ${app.name}`,
      `_${app.name}() {`,
      "  local -a command_list command_options root_options",
      `  command_list=(${commandList})`,
      `  root_options=(${rootOptions})`,
      "  local command_path='' word i=2",
      "  while (( i < CURRENT )); do",
      "    word=$words[i]",
      '    if [[ -z "$command_path" ]]; then',
      '      case "$word" in',
      skipCases,
      "      esac",
      "    fi",
      '    case "$command_path|$word" in',
      transitionCases,
      "      *) break ;;",
      "    esac",
      "    ((i += 1))",
      "  done",
      "  case \"$command_path\" in",
      cases,
      "  esac",
      "  if [[ -z \"$command_path\" ]]; then _describe -t commands 'command' command_list; _arguments $root_options; return; fi",
      "  (( $#command_options )) && _arguments $command_options",
      "}",
      `compdef _${app.name} ${app.name}`,
      "",
    ].join("\n");
  }

  const functionName = `__${app.name}_path_is`;
  const lines: string[] = [
    `function ${functionName}`,
    "  set -l mode $argv[1]",
    "  set -l expected $argv[2..-1]",
    "  set -l actual (commandline -opc)",
    "  set -l tokens $actual[2..-1]",
    "  set -l path_tokens",
    "  set -l index 1",
    "  while test $index -le (count $tokens)",
    "    set -l token $tokens[$index]",
    "    switch $token",
  ];
  for (const [name, definition] of Object.entries(globalOptions)) {
    const spellings = [`--${name}`, ...(definition.alias ? [`-${definition.alias}`] : [])];
    if (definition.type === "boolean") {
      lines.push(`      case ${[...spellings, `--no-${name}`, ...spellings.map((value) => `${value}=*`), `--no-${name}=*`].map((value) => `'${value}'`).join(" ")}`);
      lines.push("        set index (math $index + 1)", "        continue");
    } else {
      lines.push(`      case ${spellings.map((value) => `'${value}'`).join(" ")}`);
      lines.push("        set index (math $index + 2)", "        continue");
      lines.push(`      case ${spellings.map((value) => `'${value}=*'`).join(" ")}`);
      lines.push("        set index (math $index + 1)", "        continue");
    }
  }
  lines.push(
    "    end",
    "    set -a path_tokens $token",
    "    set index (math $index + 1)",
    "  end",
    "  if test $mode = exact",
    "    test (count $path_tokens) -eq (count $expected); or return 1",
    "  else",
    "    test (count $path_tokens) -ge (count $expected); or return 1",
    "  end",
    "  for index in (seq (count $expected))",
    "    test \"$path_tokens[$index]\" = \"$expected[$index]\"; or return 1",
    "  end",
    "  return 0",
    "end",
  );
  for (const { path, candidates, kind } of contexts) {
    const condition = `${functionName} ${kind === "leaf" ? "prefix" : "exact"}${path.length ? ` ${path.join(" ")}` : ""}`;
    for (const value of candidates) {
      const prior = value.startsWith("--") ? `-l '${value.slice(2)}'` : value.startsWith("-") ? `-s '${value.slice(1)}'` : `-a '${value}'`;
      lines.push(`complete -c ${app.name} -f -n '${condition}' ${prior}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
