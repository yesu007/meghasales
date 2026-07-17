import { describe, it, expect } from 'vitest';
import { resolveTaxRates, computeTaxTotals } from './taxCalculation';

describe('resolveTaxRates', () => {
  describe('India, same state as supplier', () => {
    it('uses configured StateTaxMaster rows when present', () => {
      const rates = resolveTaxRates({
        countryCode: 'IN',
        isSameState: true,
        hasStateCode: true,
        stateTaxRows: [
          { taxName: 'CGST', taxType: 'CGST', rate: 6 },
          { taxName: 'SGST', taxType: 'SGST', rate: 6 },
        ],
        countryTaxRows: [],
      });
      expect(rates).toEqual([
        { taxName: 'CGST', taxType: 'CGST', rate: 6 },
        { taxName: 'SGST', taxType: 'SGST', rate: 6 },
      ]);
    });

    it('falls back to hardcoded CGST/SGST 9%/9% when no config rows exist', () => {
      const rates = resolveTaxRates({
        countryCode: 'IN',
        isSameState: true,
        hasStateCode: true,
        stateTaxRows: [],
        countryTaxRows: [],
      });
      expect(rates).toEqual([
        { taxName: 'CGST', taxType: 'CGST', rate: 9 },
        { taxName: 'SGST', taxType: 'SGST', rate: 9 },
      ]);
    });
  });

  describe('India, different state from supplier (IGST)', () => {
    it('uses a configured IGST rate from CountryTaxMaster (bug-fix regression case)', () => {
      // Previously IGST was unconditionally hardcoded at 18%, ignoring any
      // configured rate entirely. This proves the config path is now live.
      const rates = resolveTaxRates({
        countryCode: 'IN',
        isSameState: false,
        hasStateCode: true,
        stateTaxRows: [],
        countryTaxRows: [{ taxName: 'IGST', taxType: 'IGST', rate: 12 }],
      });
      expect(rates).toEqual([{ taxName: 'IGST', taxType: 'IGST', rate: 12 }]);
    });

    it('falls back to hardcoded 18% when no IGST config row exists', () => {
      const rates = resolveTaxRates({
        countryCode: 'IN',
        isSameState: false,
        hasStateCode: true,
        stateTaxRows: [],
        countryTaxRows: [],
      });
      expect(rates).toEqual([{ taxName: 'IGST', taxType: 'IGST', rate: 18 }]);
    });

    it('treats no state code as different-state (IGST) too', () => {
      const rates = resolveTaxRates({
        countryCode: 'IN',
        isSameState: false,
        hasStateCode: false,
        stateTaxRows: [],
        countryTaxRows: [],
      });
      expect(rates).toEqual([{ taxName: 'IGST', taxType: 'IGST', rate: 18 }]);
    });

    it('ignores non-IGST CountryTaxMaster rows when picking the IGST rate', () => {
      const rates = resolveTaxRates({
        countryCode: 'IN',
        isSameState: false,
        hasStateCode: true,
        stateTaxRows: [],
        countryTaxRows: [
          { taxName: 'GST', taxType: 'GST', rate: 18 },
          { taxName: 'IGST', taxType: 'IGST', rate: 12 },
        ],
      });
      expect(rates).toEqual([{ taxName: 'IGST', taxType: 'IGST', rate: 12 }]);
    });
  });

  describe('non-India (VAT / sales tax)', () => {
    it('uses configured CountryTaxMaster rows with a positive rate', () => {
      const rates = resolveTaxRates({
        countryCode: 'AE',
        isSameState: false,
        hasStateCode: false,
        stateTaxRows: [],
        countryTaxRows: [{ taxName: 'VAT', taxType: 'VAT', rate: 5 }],
      });
      expect(rates).toEqual([{ taxName: 'VAT', taxType: 'VAT', rate: 5 }]);
    });

    it('produces no tax line for a zero-rate row', () => {
      const rates = resolveTaxRates({
        countryCode: 'US',
        isSameState: false,
        hasStateCode: false,
        stateTaxRows: [],
        countryTaxRows: [{ taxName: 'Sales Tax', taxType: 'SALES_TAX', rate: 0 }],
      });
      expect(rates).toEqual([]);
    });

    it('appends US state sales tax rows alongside any country-level rate', () => {
      const rates = resolveTaxRates({
        countryCode: 'US',
        isSameState: false,
        hasStateCode: true,
        stateTaxRows: [{ taxName: 'CA Sales Tax', taxType: 'SALES_TAX', rate: 7.25 }],
        countryTaxRows: [{ taxName: 'Sales Tax', taxType: 'SALES_TAX', rate: 0 }],
      });
      expect(rates).toEqual([{ taxName: 'CA Sales Tax', taxType: 'SALES_TAX', rate: 7.25 }]);
    });

    it('handles a non-India GST country the same generic way as VAT (Singapore, seeded at 9%)', () => {
      // Confirms the non-IN branch doesn't special-case the tax *name* —
      // GST outside India (Singapore) flows through identically to VAT
      // (UAE/Thailand/UK/Saudi Arabia) or Sales Tax (US).
      const rates = resolveTaxRates({
        countryCode: 'SG',
        isSameState: false,
        hasStateCode: false,
        stateTaxRows: [],
        countryTaxRows: [{ taxName: 'GST', taxType: 'GST', rate: 9 }],
      });
      expect(rates).toEqual([{ taxName: 'GST', taxType: 'GST', rate: 9 }]);
    });
  });
});

describe('computeTaxTotals', () => {
  const cgstSgst9 = [
    { taxName: 'CGST', taxType: 'CGST', rate: 9 },
    { taxName: 'SGST', taxType: 'SGST', rate: 9 },
  ];

  describe('exclusive (default)', () => {
    it('adds tax on top of the taxable amount', () => {
      const result = computeTaxTotals(1000, cgstSgst9, false);
      expect(result.taxBreakdown).toEqual([
        { taxName: 'CGST', taxType: 'CGST', rate: 9, amount: 90 },
        { taxName: 'SGST', taxType: 'SGST', rate: 9, amount: 90 },
      ]);
      expect(result.totalTax).toBe(180);
      expect(result.grandTotal).toBe(1180);
    });

    it('handles no applicable tax rates', () => {
      const result = computeTaxTotals(500, [], false);
      expect(result.taxBreakdown).toEqual([]);
      expect(result.totalTax).toBe(0);
      expect(result.grandTotal).toBe(500);
    });
  });

  describe('inclusive', () => {
    it('backs the tax out of the taxable amount instead of adding it', () => {
      // 1180 inclusive of 18% (9%+9%) => base 1000, tax 180 — the exact
      // inverse of the exclusive case above, and grandTotal stays at the
      // quoted 1180 rather than becoming 1180+180.
      const result = computeTaxTotals(1180, cgstSgst9, true);
      expect(result.taxBreakdown).toEqual([
        { taxName: 'CGST', taxType: 'CGST', rate: 9, amount: 90 },
        { taxName: 'SGST', taxType: 'SGST', rate: 9, amount: 90 },
      ]);
      expect(result.totalTax).toBe(180);
      expect(result.grandTotal).toBe(1180);
    });

    it('leaves the amount untouched when there are no applicable tax rates', () => {
      const result = computeTaxTotals(500, [], true);
      expect(result.taxBreakdown).toEqual([]);
      expect(result.totalTax).toBe(0);
      expect(result.grandTotal).toBe(500);
    });

    it('never produces a grand total larger than the quoted (inclusive) amount', () => {
      const result = computeTaxTotals(31914.89, [{ taxName: 'IGST', taxType: 'IGST', rate: 18 }], true);
      expect(result.grandTotal).toBe(31914.89);
      expect(result.totalTax).toBeLessThan(result.grandTotal);
    });
  });
});
