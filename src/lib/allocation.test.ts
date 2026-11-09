import { describe, expect, it } from "vitest";
import { allocate, parseAmount, validate, type LocationRow } from "./allocation";
import { buildJournalCsv, escapeCsvField } from "./csv";

const row = (id: string, code: string, basisValue: string, name = `Loc ${id}`): LocationRow => ({ id, name, code, basisValue });

describe("parseAmount", () => {
  it("accepts currency formatting", () => {
    expect(parseAmount("$1,250,000.50")).toBe(1250000.5);
    expect(parseAmount(" 42 ")).toBe(42);
  });
  it("rejects blanks and garbage", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1.2.3")).toBeNull();
  });
});

describe("allocate", () => {
  it("splits proportionally", () => {
    const r = allocate([row("1", "A", "100"), row("2", "B", "300")], 150000);
    expect(r.rows.map((x) => x.allocatedCents)).toEqual([3750000, 11250000]);
    expect(r.allocatedTotalCents).toBe(15000000);
  });

  it("always sums to the premium to the penny", () => {
    const r = allocate([row("1", "A", "1"), row("2", "B", "1"), row("3", "C", "1")], 100);
    expect(r.rows.map((x) => x.allocatedCents)).toEqual([3334, 3333, 3333]);
    expect(r.allocatedTotalCents).toBe(10000);

    const many = Array.from({ length: 37 }, (_, i) => row(String(i), `L${i}`, String(1000 + i * 7.3)));
    expect(allocate(many, 150000.01).allocatedTotalCents).toBe(15000001);
  });

  it("gives zero to blank/invalid/negative rows", () => {
    const r = allocate([row("1", "A", "50"), row("2", "B", ""), row("3", "C", "-5"), row("4", "D", "x")], 1000);
    expect(r.rows.map((x) => x.allocatedCents)).toEqual([100000, 0, 0, 0]);
  });

  it("allocates nothing when premium is missing", () => {
    expect(allocate([row("1", "A", "50")], null).allocatedTotalCents).toBe(0);
  });
});

describe("validate", () => {
  it("flags zero/empty premium, blank and duplicate codes", () => {
    const issues = validate("0", "", [row("1", "", "10"), row("2", "X", "10"), row("3", "x", "10")], "SOV Value");
    const msgs = issues.filter((i) => i.level === "error").map((i) => i.message).join("|");
    expect(msgs).toMatch(/greater than/);
    expect(msgs).toMatch(/GL Account Code/);
    expect(msgs).toMatch(/Location Code is blank/);
    expect(msgs).toMatch(/duplicated/);
    expect(validate("", "6100", [row("1", "A", "1")], "SOV").some((i) => /empty/.test(i.message))).toBe(true);
  });
  it("passes a clean setup", () => {
    expect(validate("150000", "6100-000", [row("1", "A", "10")], "SOV").filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("csv", () => {
  it("builds the ERP journal format", () => {
    const { rows } = allocate([row("1", "NYC01", "1"), row("2", "LA02", "3")], 1000);
    const csv = buildJournalCsv(rows, "6100-000", new Date(2026, 10, 9));
    expect(csv).toBe(
      "Date,Account Code,Location Code,Debit Amount\r\n" +
        "11/09/2026,6100-000,NYC01,250.00\r\n" +
        "11/09/2026,6100-000,LA02,750.00\r\n",
    );
  });
  it("escapes quotes, commas and formula injection", () => {
    expect(escapeCsvField('a,"b"')).toBe('"a,""b"""');
    expect(escapeCsvField("=SUM(A1)")).toBe("'=SUM(A1)");
  });
});
