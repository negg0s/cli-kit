import assert from "node:assert/strict";
import test from "node:test";
import { formatTable } from "../dist/index.js";

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
