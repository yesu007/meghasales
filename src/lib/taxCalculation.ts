export interface TaxRate {
  taxName: string;
  taxType: string;
  rate: number;
}

export interface ResolveTaxRatesInput {
  countryCode: string;
  isSameState: boolean;
  hasStateCode: boolean;
  // Raw StateTaxMaster rows for India same-state (CGST/SGST), or for US
  // state sales tax — unfiltered, caller doesn't pre-select a fallback.
  stateTaxRows: TaxRate[];
  // Raw CountryTaxMaster rows: for India this is IGST-typed rows only; for
  // non-India this is every active row for the country (may include
  // zero-rate rows, which are deliberately excluded from the result).
  countryTaxRows: TaxRate[];
}

// Pure rate-selection logic, split out of calculateTaxes() so it's testable
// without a database. Decides WHICH tax rates apply — the caller is
// responsible for turning a rate into a rupee/dollar/etc. amount.
//
// India same-state: uses configured StateTaxMaster rows (CGST/SGST) if any
// exist, else falls back to a hardcoded 9%/9% split — this fallback existed
// before and is preserved for compatibility with unconfigured states.
//
// India different-state (or no state given): uses a configured IGST row
// from CountryTaxMaster if one exists, else falls back to hardcoded 18%.
// Previously IGST was ALWAYS the hardcoded 18%, ignoring config entirely —
// this closes that gap while keeping the same fallback rate.
//
// Non-India: every active CountryTaxMaster row with a positive rate (VAT,
// sales tax, etc.), plus any state-level rows the caller supplies (used for
// US state sales tax). Zero-rate rows produce no tax line.
export interface TaxTotals {
  taxBreakdown: (TaxRate & { amount: number })[];
  totalTax: number;
  grandTotal: number;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Turns a taxable amount + resolved rates into a breakdown and grand total.
// Exclusive (the historical default): tax is added on top of the taxable
// amount. Inclusive: the taxable amount already contains the tax (e.g. a
// sales rep quoted a round, tax-inclusive figure), so the tax is backed out
// of it instead of being added again — grandTotal then equals the taxable
// amount rather than exceeding it.
export function computeTaxTotals(taxableAmount: number, taxRates: TaxRate[], taxInclusive: boolean): TaxTotals {
  if (taxInclusive) {
    const totalRate = taxRates.reduce((sum, t) => sum + t.rate, 0);
    const baseAmount = totalRate > 0 ? round(taxableAmount / (1 + totalRate / 100)) : taxableAmount;
    const taxBreakdown = taxRates.map((t) => ({ ...t, amount: round(baseAmount * t.rate / 100) }));
    const totalTax = round(taxBreakdown.reduce((sum, t) => sum + t.amount, 0));
    return { taxBreakdown, totalTax, grandTotal: round(taxableAmount) };
  }

  const taxBreakdown = taxRates.map((t) => ({ ...t, amount: round(taxableAmount * t.rate / 100) }));
  const totalTax = round(taxBreakdown.reduce((sum, t) => sum + t.amount, 0));
  return { taxBreakdown, totalTax, grandTotal: round(taxableAmount + totalTax) };
}

export function resolveTaxRates(input: ResolveTaxRatesInput): TaxRate[] {
  const { countryCode, isSameState, hasStateCode, stateTaxRows, countryTaxRows } = input;

  if (countryCode === 'IN') {
    if (isSameState && hasStateCode) {
      if (stateTaxRows.length > 0) return stateTaxRows;
      return [
        { taxName: 'CGST', taxType: 'CGST', rate: 9 },
        { taxName: 'SGST', taxType: 'SGST', rate: 9 },
      ];
    }
    const igstRow = countryTaxRows.find((t) => t.taxType === 'IGST');
    if (igstRow) return [igstRow];
    return [{ taxName: 'IGST', taxType: 'IGST', rate: 18 }];
  }

  return [...countryTaxRows.filter((t) => t.rate > 0), ...stateTaxRows];
}
