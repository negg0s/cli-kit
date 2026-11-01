import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createCliProject } from "../dist/index.js";

async function withTemp(callback) {
  const parent = join(process.cwd(), ".tmp");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "cli-kit-test-"));
  try { await callback(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("creates a starter project with a runnable TypeScript command", async () => {
  await withTemp(async (root) => {
    const target = join(root, "sample-cli");
    const files = await createCliProject({ name: "sample-cli", directory: target });
    assert.ok(files.includes("package.json"));
    assert.ok(files.includes("src/index.ts"));
    assert.match(await readFile(join(target, "src/index.ts"), "utf8"), /defineCommand/);
    const manifest = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
    assert.equal(manifest.dependencies["@negg0s/cli-kit"], "github:negg0s/cli-kit");
  });
});

test("create-cli-kit binary creates a project from flags", async () => {
  await withTemp(async (root) => {
    const target = join(root, "from-bin");
    const output = execFileSync(process.execPath, [
      join(process.cwd(), "dist/bin/create.js"),
      "--name", "from-bin",
      "--dir", target,
    ], { encoding: "utf8" });
    assert.match(output, /Created from-bin/);
    assert.ok((await readFile(join(target, "src/index.ts"), "utf8")).includes("runCli"));
  });
});

test("rejects path traversal and existing targets without overwriting", async () => {
  await withTemp(async (root) => {
    await assert.rejects(createCliProject({ name: "sample-cli", directory: `${root}/../outside` }), /traversal/i);
    const target = join(root, "existing");
    await mkdir(target);
    await writeFile(join(target, "keep.txt"), "keep");
    await assert.rejects(createCliProject({ name: "sample-cli", directory: target }), /already exists/i);
    assert.equal(await readFile(join(target, "keep.txt"), "utf8"), "keep");
  });
});

test("concurrent creation never replaces the winning project", async () => {
  await withTemp(async (root) => {
    const target = join(root, "raced-project");
    const results = await Promise.allSettled([
      createCliProject({ name: "raced-project", directory: target }),
      createCliProject({ name: "raced-project", directory: target }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.match(await readFile(join(target, "package.json"), "utf8"), /raced-project/);
  });
});
