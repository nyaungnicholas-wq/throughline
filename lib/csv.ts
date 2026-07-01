/** Minimal RFC-4180-ish CSV. Handles quoted fields, embedded commas/newlines, "" escapes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// A leading =, +, -, @, |, tab or CR makes Excel/Sheets treat the cell as a formula.
// Prefixing a tab neutralizes that (CSV-injection defense) while keeping the value readable.
const FORMULA_LEAD = /^[=+\-@\t\r|]/;

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          let s = cell == null ? "" : String(cell);
          if (FORMULA_LEAD.test(s)) s = `\t${s}`;
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}
