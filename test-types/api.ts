import { defineCommand, option, runCli } from "../src/index.js";

defineCommand({
  name: "typed",
  description: "Check public types",
  options: {
    level: option.number({ required: true }),
    color: option.enum(["red", "blue"] as const),
  },
  args: [{ name: "file", required: true }],
  run({ options, args }) {
    const level: number = options.level;
    const color: "red" | "blue" | undefined = options.color;
    const file: string = args[0];
    // @ts-expect-error enum values stay narrowed
    const invalid: "green" = options.color;
    void [level, color, file, invalid];
  },
});

void runCli({ name: "typed-app", version: "1.0.0", commands: [
  defineCommand({
    name: "typed",
    description: "Typed command",
    args: [{ name: "file", required: true }],
    run({ args }) { const file: string = args[0]; void file; },
  }),
] }, []);
