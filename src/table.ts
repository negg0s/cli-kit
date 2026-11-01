export type TableColumn = {
  key: string;
  header: string;
  align?: "left" | "right";
};

function cell(value: unknown): string {
  return String(value ?? "");
}

function width(value: string): number {
  return [...value].length;
}

export function formatTable(columns: readonly TableColumn[], rows: readonly Record<string, unknown>[]): string {
  if (columns.length === 0) throw new Error("A table requires at least one column");
  const values = rows.map((row) => columns.map(({ key }) => cell(row[key])));
  const widths = columns.map((column, index) => Math.max(width(column.header), ...values.map((row) => width(row[index]!))));
  const render = (cells: readonly string[]) => cells.map((value, index) => {
    const padding = widths[index]! - width(value);
    return columnAlign(columns[index]!) === "right" ? `${" ".repeat(padding)}${value}` : `${value}${" ".repeat(padding)}`;
  }).join(" | ");
  const header = render(columns.map(({ header }) => header));
  const separator = widths.map((size) => "-".repeat(size)).join("-+-");
  const body = values.map((row) => render(row)).join("\n");
  return `${header}\n${separator}\n${body}${body ? "\n" : ""}`;
}

function columnAlign(column: TableColumn): "left" | "right" {
  return column.align ?? "left";
}
