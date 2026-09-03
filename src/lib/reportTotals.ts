// Shared totals calculation for every report surface — the on-screen footer
// and the PDF export both call this, so a printed total can never disagree
// with the one on screen. Two implementations would eventually drift; there
// is deliberately only one.

export interface TotalsColumn { key: string; label: string; align?: 'left' | 'right'; type?: 'currency' | 'number' | 'text' }

export interface CurrencyTotals {
  currencyCode: string;
  // Only the columns that actually summed — a column that is null on every
  // row is absent rather than zero, so "no budget set" never renders as ₹0.
  values: Record<string, number>;
}

// Sums every 'currency' and 'number' column, grouped per currency. Never
// blends currencies: reports here are grouped per currency precisely because
// adding ₹ to $ produces a figure that means nothing.
export function computeReportTotals(columns: TotalsColumn[], rows: Record<string, any>[]): CurrencyTotals[] {
  const summable = columns.filter((c) => c.type === 'currency' || c.type === 'number');
  if (summable.length === 0 || rows.length === 0) return [];

  const byCurrency = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const ccy = String(row.currencyCode || 'INR');
    if (!byCurrency.has(ccy)) byCurrency.set(ccy, {});
    const bucket = byCurrency.get(ccy)!;
    for (const col of summable) {
      const v = row[col.key];
      // null means "not set" and must not be coerced to 0.
      if (typeof v === 'number') bucket[col.key] = (bucket[col.key] || 0) + v;
    }
  }

  return Array.from(byCurrency.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currencyCode, values]) => ({ currencyCode, values }));
}
