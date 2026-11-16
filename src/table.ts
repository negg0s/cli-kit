export type TableColumn = {
  key: string;
  header: string;
  align?: "left" | "right";
};

export type TableOptions = {
  maxWidth?: number;
};

export function getTerminalWidth(fallback = 80): number {
  const columns = process.stdout?.columns;
  if (typeof columns === "number" && columns > 0) {
    return columns;
  }
  return fallback > 0 ? fallback : 80;
}

function cell(value: unknown): string {
  return String(value ?? "");
}

function width(value: string): number {
  return [...value].length;
}

function truncateString(str: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  const chars = [...str];
  if (chars.length <= maxLen) return str;
  if (maxLen <= 3) return chars.slice(0, maxLen).join("");
  return `${chars.slice(0, maxLen - 3).join("")}...`;
}

export function formatTable(
  columns: readonly TableColumn[],
  rows: readonly Record<string, unknown>[],
  options?: TableOptions,
): string {
  if (columns.length === 0) throw new Error("A table requires at least one column");

  let maxWidth = options?.maxWidth;
  if (maxWidth !== undefined && maxWidth <= 0) {
    maxWidth = getTerminalWidth(80);
  }

  let values = rows.map((row) => columns.map(({ key }) => cell(row[key])));
  let widths = columns.map((column, index) => Math.max(width(column.header), ...values.map((row) => width(row[index]!))));

  if (maxWidth !== undefined && maxWidth > 0) {
    const separatorOverhead = (columns.length - 1) * 3;
    const availableForCols = Math.max(columns.length, maxWidth - separatorOverhead);
    const totalCurrentWidth = widths.reduce((sum, w) => sum + w, 0);

    if (totalCurrentWidth > availableForCols) {
      let remaining = availableForCols;
      const newWidths: number[] = [];
      for (let i = 0; i < widths.length; i += 1) {
        if (i === widths.length - 1) {
          newWidths.push(Math.max(1, remaining));
        } else {
          const share = Math.max(1, Math.min(widths[i]!, Math.floor((widths[i]! / totalCurrentWidth) * availableForCols)));
          newWidths.push(share);
          remaining -= share;
        }
      }
      widths = newWidths;
    }
  }

  const render = (cells: readonly string[]) => cells.map((value, index) => {
    const colWidth = widths[index]!;
    const cellValue = truncateString(value, colWidth);
    const padding = Math.max(0, colWidth - width(cellValue));
    return columnAlign(columns[index]!) === "right" ? `${" ".repeat(padding)}${cellValue}` : `${cellValue}${" ".repeat(padding)}`;
  }).join(" | ");

  const header = render(columns.map(({ header }) => header));
  const separator = widths.map((size) => "-".repeat(size)).join("-+-");
  const body = values.map((row) => render(row)).join("\n");
  return `${header}\n${separator}\n${body}${body ? "\n" : ""}`;
}

function columnAlign(column: TableColumn): "left" | "right" {
  return column.align ?? "left";
}

