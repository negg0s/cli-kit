import { mkdir, lstat, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join, parse, resolve } from "node:path";

export type StarterOptions = { name: string; directory: string };

export async function createCliProject({ name, directory }: StarterOptions): Promise<string[]> {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) {
    throw new Error(`Invalid package name "${name}"`);
  }
  if (!directory || directory.split(/[\\/]/).includes("..")) {
    throw new Error("Project directory cannot contain path traversal");
  }

  const requested = resolve(directory);
  if (requested === parse(requested).root) throw new Error("Project directory cannot be a filesystem root");
  try {
    await lstat(requested);
    throw new Error(`Target already exists: ${requested}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Target already exists:")) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const parent = dirname(requested);
  await mkdir(parent, { recursive: true });
  const canonicalParent = await realpath(parent);
  const target = join(canonicalParent, basename(requested));
  try {
    await lstat(target);
    throw new Error(`Target already exists: ${target}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Target already exists:")) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const packageJson = {
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: { build: "tsc -p tsconfig.json", start: "node dist/index.js" },
    dependencies: { "@negg0s/cli-kit": "github:negg0s/cli-kit" },
    devDependencies: { "@types/node": "^24.10.0", typescript: "^5.9.3" },
  };
  const files: Record<string, string> = {
    "package.json": `${JSON.stringify(packageJson, null, 2)}\n`,
    "tsconfig.json": `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", outDir: "dist", rootDir: "src", strict: true, types: ["node"] }, include: ["src/**/*.ts"] }, null, 2)}\n`,
    "src/index.ts": `import { defineCommand, option, runCli } from "@negg0s/cli-kit";\n\nconst greet = defineCommand({\n  name: "greet",\n  description: "Greet someone",\n  options: { loud: option.boolean({ description: "Use uppercase" }) },\n  args: [{ name: "name", required: true }],\n  run({ options, args, stdout }) {\n    const name = options.loud ? args[0].toUpperCase() : args[0];\n    stdout.write(\`Hello, \${name}!\\n\`);\n  },\n});\n\nconst result = await runCli({ name: "${name}", version: "0.1.0", commands: [greet] }, process.argv.slice(2));\nprocess.stdout.write(result.stdout);\nprocess.stderr.write(result.stderr);\nprocess.exitCode = result.exitCode;\n`,
    "README.md": `# ${name}\n\nA command-line app built with [cli-kit](https://github.com/negg0s/cli-kit).\n\n\`\`\`sh\nnpm install\nnpm run build\nnode dist/index.js greet Ada\n\`\`\`\n`,
    ".gitignore": "node_modules/\ndist/\n",
  };

  try {
    await mkdir(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Target already exists: ${target}`);
    }
    throw error;
  }

  for (const [relative, contents] of Object.entries(files)) {
    const output = join(target, relative);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, contents, { flag: "wx" });
  }
  return Object.keys(files);
}
