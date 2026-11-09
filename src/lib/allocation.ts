export type AllocationBasis = "sov" | "sqft" | "revenue" | "units";

export const BASIS_OPTIONS: Record<AllocationBasis, { label: string; column: string; isCurrency: boolean }> = {
  sov: { label: "SOV Value (Statement of Values)", column: "SOV Value", isCurrency: true },
  sqft: { label: "Square Footage", column: "Square Footage", isCurrency: false },
  revenue: { label: "Revenue", column: "Revenue", isCurrency: true },
  units: { label: "Unit Count", column: "Unit Count", isCurrency: false },
};

export interface LocationRow {
  id: string;
  name: string;
  code: string;
  /** Raw text as typed by the user; parsed with parseAmount. */
  basisValue: string;
}

export interface AllocatedRow extends LocationRow {
  basis: number; // parsed basis (0 if invalid/blank)
  share: number; // 0..1
  allocatedCents: number;
}

export interface AllocationResult {
  rows: AllocatedRow[];
  totalBasis: number;
  premiumCents: number;
  allocatedTotalCents: number;
}

/**
 * Parse a user-entered number, tolerating "$", commas and whitespace.
 * Returns null for blank or non-numeric input.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Proportionally allocate the premium across rows.
 *
 * Works in integer cents and uses the largest-remainder method so the sum of
 * allocations always equals the master premium exactly — the journal entry
 * must balance to the penny, which naive per-row rounding does not guarantee.
 * Rows with invalid or negative basis values receive a basis of 0.
 */
export function allocate(rows: LocationRow[], premium: number | null): AllocationResult {
  const premiumCents = premium !== null && premium > 0 ? toCents(premium) : 0;
  const bases = rows.map((r) => {
    const v = parseAmount(r.basisValue);
    return v !== null && v > 0 ? v : 0;
  });
  const totalBasis = bases.reduce((a, b) => a + b, 0);

  if (totalBasis <= 0 || premiumCents <= 0) {
    return {
      rows: rows.map((r, i) => ({ ...r, basis: bases[i], share: totalBasis > 0 ? bases[i] / totalBasis : 0, allocatedCents: 0 })),
      totalBasis,
      premiumCents,
      allocatedTotalCents: 0,
    };
  }

  const exact = bases.map((b) => (b / totalBasis) * premiumCents);
  const floored = exact.map(Math.floor);
  let remainder = premiumCents - floored.reduce((a, b) => a + b, 0);

  // Hand leftover cents to rows with the largest fractional parts (ties → earlier row).
  const order = exact
    .map((v, i) => ({ i, frac: v - floored[i] }))
    .filter(({ i }) => bases[i] > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0 && order.length > 0; k = (k + 1) % order.length) {
    floored[order[k].i] += 1;
    remainder -= 1;
  }

  return {
    rows: rows.map((r, i) => ({ ...r, basis: bases[i], share: bases[i] / totalBasis, allocatedCents: floored[i] })),
    totalBasis,
    premiumCents,
    allocatedTotalCents: floored.reduce((a, b) => a + b, 0),
  };
}

export type IssueLevel = "error" | "warning";
export interface Issue {
  level: IssueLevel;
  message: string;
  rowId?: string;
  field?: "name" | "code" | "basisValue" | "premium" | "account";
}

export function validate(premiumRaw: string, accountCode: string, rows: LocationRow[], basisColumn: string): Issue[] {
  const issues: Issue[] = [];
  const premium = parseAmount(premiumRaw);

  if (premiumRaw.trim() === "") {
    issues.push({ level: "error", field: "premium", message: "Total Master Premium is empty." });
  } else if (premium === null) {
    issues.push({ level: "error", field: "premium", message: "Total Master Premium is not a valid number." });
  } else if (premium <= 0) {
    issues.push({ level: "error", field: "premium", message: "Total Master Premium must be greater than $0.00." });
  }

  if (accountCode.trim() === "") {
    issues.push({ level: "error", field: "account", message: "GL Account Code is required for the journal entry." });
  }

  if (rows.length === 0) {
    issues.push({ level: "error", message: "Add at least one location." });
  }

  const codeCounts = new Map<string, number>();
  rows.forEach((r) => {
    const c = r.code.trim().toUpperCase();
    if (c) codeCounts.set(c, (codeCounts.get(c) ?? 0) + 1);
  });

  rows.forEach((r, idx) => {
    const label = r.name.trim() || `Row ${idx + 1}`;
    if (r.code.trim() === "") {
      issues.push({ level: "error", rowId: r.id, field: "code", message: `${label}: Location Code is blank.` });
    } else if ((codeCounts.get(r.code.trim().toUpperCase()) ?? 0) > 1) {
      issues.push({ level: "error", rowId: r.id, field: "code", message: `${label}: Location Code "${r.code.trim()}" is duplicated.` });
    }

    const v = parseAmount(r.basisValue);
    if (r.basisValue.trim() === "") {
      issues.push({ level: "warning", rowId: r.id, field: "basisValue", message: `${label}: ${basisColumn} is blank — this location will receive $0.00.` });
    } else if (v === null) {
      issues.push({ level: "error", rowId: r.id, field: "basisValue", message: `${label}: ${basisColumn} "${r.basisValue}" is not a valid number.` });
    } else if (v < 0) {
      issues.push({ level: "error", rowId: r.id, field: "basisValue", message: `${label}: ${basisColumn} cannot be negative.` });
    } else if (v === 0) {
      issues.push({ level: "warning", rowId: r.id, field: "basisValue", message: `${label}: ${basisColumn} is 0 — this location will receive $0.00.` });
    }

    if (r.name.trim() === "") {
      issues.push({ level: "warning", rowId: r.id, field: "name", message: `Row ${idx + 1}: Location Name is blank.` });
    }
  });

  const totalBasis = rows.reduce((sum, r) => {
    const v = parseAmount(r.basisValue);
    return sum + (v !== null && v > 0 ? v : 0);
  }, 0);
  if (rows.length > 0 && totalBasis <= 0) {
    issues.push({ level: "error", message: `Total ${basisColumn} is 0 — enter basis values to allocate the premium.` });
  }

  return issues;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export const formatCents = (cents: number) => usd.format(cents / 100);
export const formatCurrency = (n: number) => usd.format(n);
export const formatNumber = (n: number) => num.format(n);
export const formatPercent = (share: number) => `${(share * 100).toFixed(4)}%`;
