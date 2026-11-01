import { runCli } from "./run.js";
import type { CliDefinition, CliResult } from "./help.js";

export function runForTest(app: CliDefinition, argv: readonly string[]): Promise<CliResult> {
  return runCli(app, argv);
}
