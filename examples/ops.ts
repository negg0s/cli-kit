import { defineCommand, formatTable, option, runCli } from "@negg0s/cli-kit";

const userList = defineCommand({
  name: "list",
  description: "List users",
  options: { active: option.boolean({ default: true, env: "OPS_USERS_ACTIVE" }) },
  run({ options, stdout }) {
    const rows = options.active
      ? [{ name: "Ada", role: "admin" }, { name: "Grace", role: "operator" }]
      : [{ name: "Linus", role: "viewer" }];
    stdout.write(formatTable([
      { key: "name", header: "Name" },
      { key: "role", header: "Role" },
    ], rows));
  },
});

const users = defineCommand({ name: "users", description: "Manage users", commands: [userList] });
const admin = defineCommand({ name: "admin", description: "Administration commands", commands: [users] });

const dataImport = defineCommand({
  name: "import",
  description: "Import one or more files",
  options: {
    tag: option.string({ multiple: true, env: "OPS_IMPORT_TAGS" }),
    region: option.string({ default: "us-east-1", env: "OPS_REGION" }),
  },
  args: [{ name: "files", required: true, variadic: true }],
  run({ options, args, stdout }) {
    stdout.write(JSON.stringify({ files: args[0], tags: options.tag ?? [], region: options.region }) + "\n");
  },
});
const data = defineCommand({ name: "data", description: "Data operations", commands: [dataImport] });

const app = {
  name: "ops",
  version: "1.0.0",
  description: "Example administration and data CLI",
  configFile: "examples/ops.json",
  commands: [admin, data],
};

const result = await runCli(app, process.argv.slice(2));
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
