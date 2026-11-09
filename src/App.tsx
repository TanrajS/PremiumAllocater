import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Plus, RotateCcw, Trash2, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  allocate,
  BASIS_OPTIONS,
  formatCents,
  formatCurrency,
  formatNumber,
  formatPercent,
  parseAmount,
  validate,
  type AllocationBasis,
  type Issue,
  type LocationRow,
} from "@/lib/allocation";
import { buildJournalCsv, downloadCsv } from "@/lib/csv";

const newRow = (partial: Partial<LocationRow> = {}): LocationRow => ({
  id: crypto.randomUUID(),
  name: "",
  code: "",
  basisValue: "",
  ...partial,
});

const SAMPLE_ROWS: Omit<LocationRow, "id">[] = [
  { name: "Riverside Apartments", code: "RIV001", basisValue: "42,500,000" },
  { name: "Oak Park Plaza", code: "OAK002", basisValue: "18,750,000" },
  { name: "Harbor View Towers", code: "HBR003", basisValue: "63,200,000" },
  { name: "Maple Commons", code: "MPL004", basisValue: "9,800,000" },
];

export default function App() {
  const [premiumRaw, setPremiumRaw] = useState("");
  const [basis, setBasis] = useState<AllocationBasis>("sov");
  const [accountCode, setAccountCode] = useState("");
  const [rows, setRows] = useState<LocationRow[]>(() => [newRow(), newRow(), newRow()]);

  const basisMeta = BASIS_OPTIONS[basis];
  const premium = parseAmount(premiumRaw);
  const result = useMemo(() => allocate(rows, premium), [rows, premium]);
  const issues = useMemo(() => validate(premiumRaw, accountCode, rows, basisMeta.column), [premiumRaw, accountCode, rows, basisMeta.column]);

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const balanced = result.premiumCents > 0 && result.allocatedTotalCents === result.premiumCents;
  const canExport = errors.length === 0 && balanced;

  const fieldError = (field: Issue["field"], rowId?: string) =>
    errors.some((i) => i.field === field && i.rowId === rowId);

  const updateRow = (id: string, patch: Partial<LocationRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));
  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const loadSample = () => {
    setPremiumRaw("150,000.00");
    setBasis("sov");
    setAccountCode("6110-0000");
    setRows(SAMPLE_ROWS.map((r) => newRow(r)));
  };
  const reset = () => {
    setPremiumRaw("");
    setAccountCode("");
    setRows([newRow(), newRow(), newRow()]);
  };

  const handleExport = () => {
    if (!canExport) return;
    const csv = buildJournalCsv(result.rows, accountCode);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `premium_allocation_JE_${stamp}.csv`);
  };

  const formatBasis = (n: number) => (basisMeta.isCurrency ? formatCurrency(n) : formatNumber(n));

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Corporate Premium Allocation Engine</h1>
            <p className="text-sm text-muted-foreground">
              Allocate a master commercial premium across locations and export a journal entry batch for your ERP.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadSample}>
              Load sample data
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw /> Reset
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        {/* 1. Global setup */}
        <Card>
          <CardHeader>
            <CardTitle>1. Setup</CardTitle>
            <CardDescription>Policy-level inputs applied to every location.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="premium">Total Master Premium</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
                <Input
                  id="premium"
                  inputMode="decimal"
                  placeholder="150,000.00"
                  className="pl-7 tabular-nums"
                  value={premiumRaw}
                  aria-invalid={fieldError("premium")}
                  onChange={(e) => setPremiumRaw(e.target.value)}
                  onBlur={() => {
                    const v = parseAmount(premiumRaw);
                    if (v !== null && v > 0) setPremiumRaw(v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                  }}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="basis">Allocation Basis</Label>
              <Select value={basis} onValueChange={(v) => setBasis(v as AllocationBasis)}>
                <SelectTrigger id="basis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BASIS_OPTIONS) as AllocationBasis[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {BASIS_OPTIONS[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account">GL Account Code</Label>
              <Input
                id="account"
                placeholder="e.g. 6110-0000"
                value={accountCode}
                aria-invalid={fieldError("account")}
                onChange={(e) => setAccountCode(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* 2. Entity grid */}
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div className="grid gap-1.5">
              <CardTitle>2. Locations</CardTitle>
              <CardDescription>
                Enter each operating location and its {basisMeta.column.toLowerCase()}. Allocations update as you type.
              </CardDescription>
            </div>
            <Button size="sm" onClick={addRow}>
              <Plus /> Add location
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead className="min-w-48">Location Name</TableHead>
                  <TableHead className="min-w-32">Location Code</TableHead>
                  <TableHead className="min-w-40 text-right">{basisMeta.column}</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                  <TableHead className="text-right">Allocated Premium</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No locations yet. Click “Add location” to begin.
                    </TableCell>
                  </TableRow>
                )}
                {result.rows.map((r, idx) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Location name, row ${idx + 1}`}
                        placeholder="Location name"
                        value={r.name}
                        onChange={(e) => updateRow(r.id, { name: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Location code, row ${idx + 1}`}
                        placeholder="Code"
                        className="font-mono"
                        value={r.code}
                        aria-invalid={fieldError("code", r.id)}
                        onChange={(e) => updateRow(r.id, { code: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`${basisMeta.column}, row ${idx + 1}`}
                        inputMode="decimal"
                        placeholder="0"
                        className="text-right tabular-nums"
                        value={r.basisValue}
                        aria-invalid={fieldError("basisValue", r.id)}
                        onChange={(e) => updateRow(r.id, { basisValue: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {result.totalBasis > 0 ? formatPercent(r.share) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCents(r.allocatedCents)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" aria-label={`Remove row ${idx + 1}`} onClick={() => removeRow(r.id)}>
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total ({result.rows.length} locations)</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBasis(result.totalBasis)}</TableCell>
                  <TableCell className="text-right tabular-nums">{result.totalBasis > 0 ? "100.0000%" : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(result.allocatedTotalCents)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {/* Validation */}
        {issues.length > 0 && (
          <div className="grid gap-3">
            {errors.length > 0 && (
              <Alert variant="destructive">
                <XCircle />
                <AlertTitle>
                  {errors.length} issue{errors.length === 1 ? "" : "s"} must be fixed before export
                </AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {errors.map((i, k) => (
                      <li key={k}>{i.message}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {warnings.length > 0 && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertTitle>
                  {warnings.length} warning{warnings.length === 1 ? "" : "s"}
                </AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {warnings.map((i, k) => (
                      <li key={k}>{i.message}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* 3. Summary & export */}
        <Card>
          <CardHeader>
            <CardTitle>3. Journal Entry Summary</CardTitle>
            <CardDescription>Read-only preview of the rows that will be exported for ERP batch upload.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Master Premium" value={formatCents(result.premiumCents)} />
              <Stat label="Total Allocated" value={formatCents(result.allocatedTotalCents)} />
              <Stat
                label="Variance"
                value={formatCents(result.premiumCents - result.allocatedTotalCents)}
                tone={balanced ? "good" : "bad"}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account Code</TableHead>
                  <TableHead>Location Code</TableHead>
                  <TableHead>Location Name</TableHead>
                  <TableHead className="text-right">Debit Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">{new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}</TableCell>
                    <TableCell className="font-mono">{accountCode.trim() || <span className="text-destructive">—</span>}</TableCell>
                    <TableCell className="font-mono">{r.code.trim() || <span className="text-destructive">—</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{r.name.trim() || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{(r.allocatedCents / 100).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4}>Total Debits</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(result.allocatedTotalCents)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-3">
            <p className="flex items-center gap-2 text-sm">
              {canExport ? (
                <>
                  <CheckCircle2 className="size-4 text-success" />
                  <span>Balanced to the penny. Ready for upload.</span>
                </>
              ) : (
                <>
                  <XCircle className="size-4 text-destructive" />
                  <span className="text-muted-foreground">Resolve the issues above to enable export.</span>
                </>
              )}
            </p>
            <Button size="lg" onClick={handleExport} disabled={!canExport}>
              <Download /> Download CSV for ERP Upload
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={
          "mt-1 text-lg font-semibold tabular-nums " + (tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
