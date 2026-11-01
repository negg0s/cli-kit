#!/usr/bin/env node
import { parseArgs } from "../parse.js";
import { createCliProject } from "../create.js";

async function main(): Promise<void> {
  let values: { name?: string; dir?: string };
  try {
    ({ values } = parseArgs({
      name: { type: "string", required: true, description: "Package name" },
      dir: { type: "string", required: true, description: "New project directory" },
    }, process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Invalid arguments"}\nUsage: create-cli-kit --name <name> --dir <directory>\n`);
    process.exitCode = 2;
    return;
  }

  try {
    const files = await createCliProject({ name: values.name!, directory: values.dir! });
    process.stdout.write(`Created ${values.name} with ${files.length} files.\nNext: cd ${values.dir} && npm install && npm run build\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Project creation failed"}\n`);
    process.exitCode = 1;
  }
}

await main();
