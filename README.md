# Corporate Premium Allocation Engine

Allocates a master commercial insurance premium across subsidiary locations by a chosen basis
(SOV value, square footage, revenue or unit count) and exports a journal entry CSV for ERP
batch upload (e.g. Yardi Voyager).


## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # allocation / validation / CSV unit tests
npm run build    # production build → dist/
```

## How allocation works

- Each location's share = basis value ÷ total basis.
- Math runs in integer cents using the **largest-remainder method**: allocations are floored to the
  cent, then the leftover cents go to the rows with the largest fractional remainders. Debits
  therefore always sum to the master premium exactly. Plain per-row rounding can be off by a penny.
- Export stays disabled until there are no blocking errors: premium is zero or empty, GL account is
  missing, a location code is blank or duplicated, a basis value is invalid or negative, or the
  total basis is zero.

## CSV format

```
Date,Account Code,Location Code,Debit Amount
11/09/2026,6110-0000,RIV001,47486.03
```

- Date is today, formatted `MM/DD/YYYY`.
- Fields are RFC 4180-quoted. Values starting with `= + - @` get a leading `'` so they can't run as
  formulas when the file is opened in Excel.

## Structure

- `src/lib/allocation.ts`: parsing, allocation math, validation, formatting
- `src/lib/csv.ts`: CSV builder and Blob download
- `src/App.tsx`: dashboard (Setup → Locations grid → Summary & export)
- `src/components/ui/`: shadcn/ui components (Button, Card, Input, Label, Select, Table, Alert)
