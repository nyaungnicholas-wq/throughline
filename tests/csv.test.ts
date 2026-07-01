import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";

describe("CSV parse/serialize", () => {
  it("parses quoted fields with embedded commas and newlines", () => {
    const rows = parseCsv('Title,Notes\n"a, b","line1\nline2"\n');
    expect(rows[0]).toEqual(["Title", "Notes"]);
    expect(rows[1]).toEqual(["a, b", "line1\nline2"]);
  });

  it("handles escaped double-quotes", () => {
    expect(parseCsv('"she said ""hi"""')[0]).toEqual(['she said "hi"']);
  });

  it("round-trips through serialize → parse", () => {
    const data = [["a", "b,c"], ['d"e', "f\ng"]];
    expect(parseCsv(toCsv(data))).toEqual(data);
  });

  it("skips fully-blank rows", () => {
    expect(parseCsv("a\n\n\nb").length).toBe(2);
  });

  it("neutralizes spreadsheet formula injection on export", () => {
    // Cells starting with = + - @ | get a leading tab so Excel/Sheets won't execute them.
    const out = toCsv([["=cmd|' /C calc'!A0", "+1+1", "@SUM(A1)", "-2", "safe"]]);
    expect(out).toContain("\t=cmd"); // formula-lead cells are tab-prefixed
    expect(out).toContain("\t+1+1");
    expect(out).toContain("\t@SUM(A1)");
    expect(out).toContain("\t-2");
    expect(out).not.toMatch(/(^|,)=cmd/); // never starts a field with a bare formula char
    expect(out.endsWith("safe")).toBe(true); // ordinary text untouched
  });
});
