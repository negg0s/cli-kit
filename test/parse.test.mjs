import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "../dist/index.js";

test("parses typed options, aliases, defaults, and positionals", () => {
  const result = parseArgs(
    {
      name: { type: "string", alias: "n", required: true },
      count: { type: "number", default: 2 },
      loud: { type: "boolean", default: false },
      format: { type: "enum", values: ["text", "json"] },
    },
    ["--name", "Ada", "-n", "Grace", "--count=3", "--loud", "--format", "json", "file.txt"],
  );

  assert.deepEqual(result, {
    values: { name: "Grace", count: 3, loud: true, format: "json" },
    positionals: ["file.txt"],
  });
});

test("rejects malformed values and unknown options with a useful error", () => {
  assert.throws(
    () => parseArgs({ count: { type: "number" } }, ["--count", "NaN"]),
    /count.*finite number/i,
  );
  assert.throws(
    () => parseArgs({ count: { type: "number" } }, ["--count", " "]),
    /count.*finite number/i,
  );
  assert.throws(
    () => parseArgs({}, ["--mystery"]),
    /unknown option.*mystery/i,
  );
});

test("boolean negation and -- terminator are handled", () => {
  const result = parseArgs({ color: { type: "boolean", default: true } }, ["--no-color", "--", "--literal"]);
  assert.deepEqual(result, { values: { color: false }, positionals: ["--literal"] });
});
test("accepts negative finite numbers and uses the last repeated scalar value", () => {
  const result = parseArgs({ count: { type: "number" } }, ["--count", "-.5", "--count", "0"]);
  assert.deepEqual(result.values, { count: 0 });
});

test("rejects duplicate aliases and missing required values", () => {
  assert.throws(() => parseArgs({ one: { type: "string", alias: "x" }, two: { type: "string", alias: "x" } }, []), /duplicate option alias/i);
  assert.throws(() => parseArgs({ name: { type: "string", required: true } }, []), /missing required option --name/i);
});

test("rejects aliases that collide with another option's one-letter long name in either order", () => {
  assert.throws(
    () => parseArgs({ alpha: { type: "string", alias: "b" }, b: { type: "string" } }, []),
    /alias.*b.*option --b/i,
  );
  assert.throws(
    () => parseArgs({ b: { type: "string" }, alpha: { type: "string", alias: "b" } }, []),
    /alias.*b.*option --b/i,
  );
  assert.doesNotThrow(() => parseArgs({ beta: { type: "string", alias: "b" } }, []));
});

test("accepts a self-alias in short and long forms", () => {
  for (const token of ["-b", "--b"]) {
    assert.deepEqual(parseArgs({ b: { type: "boolean", alias: "b" } }, [token]).values, { b: true });
  }
});

test("rejects inline values on negated booleans while plain negation remains false", () => {
  for (const value of ["true", "false"]) {
    assert.throws(
      () => parseArgs({ boolean: { type: "boolean" } }, [`--no-boolean=${value}`]),
      /negat.*inline|inline.*negat|cannot.*value/i,
    );
  }
  assert.deepEqual(parseArgs({ boolean: { type: "boolean" } }, ["--no-boolean"]).values, { boolean: false });
});

test("allows declared option names beginning with no- without breaking boolean negation", () => {
  const parsed = parseArgs({
    "no-cache": { type: "boolean" },
    cache: { type: "boolean" },
  }, ["--no-cache", "--cache"]);
  assert.deepEqual(parsed.values, { "no-cache": true, cache: true });
});

test("collects repeated options in order and preserves array defaults", () => {
  const repeated = parseArgs({ tag: { type: "string", multiple: true, default: ["base"] } }, ["--tag", "red", "--tag=blue"]);
  assert.deepEqual(repeated.values, { tag: ["red", "blue"] });

  const defaults = parseArgs({ tag: { type: "string", multiple: true, default: ["base"] } }, []);
  assert.deepEqual(defaults.values, { tag: ["base"] });
});

test("validates each repeated option value and rejects repeated booleans", () => {
  assert.throws(
    () => parseArgs({ port: { type: "number", multiple: true } }, ["--port", "8080", "--port", "bad"]),
    /port.*finite number/i,
  );
  assert.throws(
    () => parseArgs({ loud: { type: "boolean", multiple: true } }, []),
    /boolean.*cannot be repeated/i,
  );
});
