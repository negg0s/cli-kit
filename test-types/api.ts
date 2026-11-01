import { createPrompts, defineCommand, formatTable, option, runCli } from "../src/index.js";

defineCommand({
  name: "typed",
  description: "Check public types",
  options: {
    level: option.number({ required: true }),
    color: option.enum(["red", "blue"] as const),
    tags: option.string({ multiple: true }),
    include: option.string({ multiple: true, default: ["base"] }),
  },
  args: [{ name: "file", required: true }, { name: "target" }, { name: "sources", variadic: true }],
  run({ options, args }) {
    const level: number = options.level;
    const color: "red" | "blue" | undefined = options.color;
    const file: string = args[0];
    const target: string | undefined = args[1];
    const sources: string[] = args[2];
    const tags: string[] | undefined = options.tags;
    const include: string[] = options.include;
    // @ts-expect-error enum values stay narrowed
    const invalid: "green" = options.color;
    // @ts-expect-error optional positional values may be absent
    const requiredTarget: string = args[1];
    void [level, color, file, target, sources, tags, include, invalid, requiredTarget];
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

const nestedLeaf = defineCommand({
  name: "import",
  description: "Import data",
  options: { format: option.enum(["csv", "json"] as const, { required: true }) },
  run({ options }) {
    const format: "csv" | "json" = options.format;
    void format;
  },
});
const nestedGroup = defineCommand({ name: "data", description: "Data commands", commands: [nestedLeaf] });
void runCli({ name: "nested", version: "1", commands: [nestedGroup] }, ["data", "import"]);
void runCli({ name: "nested", version: "1", configFile: "settings.json", commands: [nestedGroup] }, ["data", "import"], {
  cwd: ".",
  env: { APP_FORMAT: "json" },
  config: { commands: { "data.import": { format: "json" } } },
});

// @ts-expect-error groups dispatch to children and cannot define a run handler
defineCommand({ name: "invalid-group", description: "Invalid", commands: [nestedLeaf], run() {} });

const prompts = createPrompts({ async ask() { return "2"; } });
void prompts.text("Name?");
void prompts.confirm("Continue?");
void prompts.select("Format?", [{ label: "JSON", value: "json" }, { label: "Text", value: "text" }]).then((value) => {
  const format: "json" | "text" | undefined = value;
  void format;
});
formatTable([{ key: "name", header: "Name" }], [{ name: "Ada" }]);
