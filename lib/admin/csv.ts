export type Cell = string | number | boolean | null | undefined | string[];

/** One column of an export: the same list makes the CSV and the PDF. */
export type Column<T> = { header: string; value: (row: T) => Cell };

/** What a cell says, before any file format touches it. */
export function cellText(value: Cell): string {
  return Array.isArray(value) ? value.join("; ") : value === null || value === undefined ? "" : String(value);
}

function cell(value: Cell): string {
  let text = cellText(value);
  // A cell starting with = + - @ is run as a formula by spreadsheet apps.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(","));
  // BOM so Excel opens it as UTF-8.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
