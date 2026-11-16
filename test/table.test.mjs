import assert from "node:assert/strict";
import test from "node:test";
import { formatTable, getTerminalWidth } from "../dist/index.js";

test("formats aligned plain-text columns using code-point widths", () => {
  const output = formatTable(
    [
      { key: "name", header: "Name" },
      { key: "count", header: "Count", align: "right" },
    ],
    [{ name: "é", count: 12 }, { name: "Ada", count: 3 }],
  );
  assert.equal(output, "Name | Count\n-----+------\né    |    12\nAda  |     3\n");
});

test("formats empty tables and stringifies nullish cells as blanks", () => {
  assert.equal(formatTable([{ key: "value", header: "Value" }], []), "Value\n-----\n");
  assert.equal(formatTable([{ key: "value", header: "Value" }], [{ value: null }]), "Value\n-----\n     \n");
});

test("rejects a table without columns", () => {
  assert.throws(() => formatTable([], []), /at least one column/i);
});

test("falls back to default width when terminal width is 0 or negative", () => {
  assert.equal(getTerminalWidth(0), 80);
  assert.equal(getTerminalWidth(-10), 80);
  assert.equal(getTerminalWidth(120), 120);

  const output = formatTable(
    [{ key: "k", header: "Key" }],
    [{ k: "value" }],
    { maxWidth: 0 },
  );
  assert.match(output, /Key/);
});

test("formats table within explicit maxWidth constraining width", () => {
  const output = formatTable(
    [
      { key: "desc", header: "Description" },
      { key: "extra", header: "ExtraInformation" },
    ],
    [{ desc: "Very long description that should be wrapped or truncated", extra: "ExtraData" }],
    { maxWidth: 25 },
  );
  const lines = output.trim().split("\n");
  for (const line of lines) {
    assert.ok([...line].length <= 30);
  }
});
