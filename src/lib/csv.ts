import type { AllocatedRow } from "./allocation";

/** MM/DD/YYYY — the date format Yardi Voyager's JE import expects by default. */
export function formatJournalDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

/**
 * Quote a CSV field per RFC 4180, and neutralise leading = + - @ so a
 * user-entered code can't execute as a spreadsheet formula when opened in Excel.
 */
export function escapeCsvField(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildJournalCsv(rows: AllocatedRow[], accountCode: string, date: Date = new Date()): string {
  const header = ["Date", "Account Code", "Location Code", "Debit Amount"];
  const dateStr = formatJournalDate(date);
  const lines = rows.map((r) =>
    [dateStr, accountCode.trim(), r.code.trim(), (r.allocatedCents / 100).toFixed(2)].map(escapeCsvField).join(","),
  );
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
