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
