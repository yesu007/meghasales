import { describe, it, expect } from 'vitest';
import { computeBillItem, computeBillTotals, GSTIN_REGEX } from './billCalc';

describe('computeBillItem', () => {
  it('computes Payable = Item Value − TDS + GST (BRD example)', () => {
    const r = computeBillItem({ itemValue: 45000, cgstRate: 9, sgstRate: 9, igstRate: 0, tdsPercent: 2 });
    expect(r.cgstAmount).toBe(4050);
    expect(r.sgstAmount).toBe(4050);
    expect(r.gstAmount).toBe(8100);
    expect(r.tdsAmount).toBe(900);
    expect(r.payableAmount).toBe(52200);
  });

  it('computes TDS on item value only, independent of GST', () => {
    const r = computeBillItem({ itemValue: 10000, cgstRate: 0, sgstRate: 0, igstRate: 18, tdsPercent: 1 });
    expect(r.igstAmount).toBe(1800);
    expect(r.tdsAmount).toBe(100);
    expect(r.payableAmount).toBe(11700);
  });

  it('rounds each amount to 2 decimals', () => {
    const r = computeBillItem({ itemValue: 333.33, cgstRate: 2.5, sgstRate: 2.5, igstRate: 0, tdsPercent: 0 });
    expect(r.cgstAmount).toBe(8.33);
    expect(r.payableAmount).toBe(349.99);
  });
});

describe('computeBillTotals', () => {
  it('sums line amounts', () => {
    const t = computeBillTotals([
      { itemValue: 45000, cgstRate: 9, sgstRate: 9, igstRate: 0, tdsPercent: 2 },
      { itemValue: 5000, cgstRate: 6, sgstRate: 6, igstRate: 0, tdsPercent: 0 },
    ]);
    expect(t.itemTotal).toBe(50000);
    expect(t.gstTotal).toBe(8700);
    expect(t.tdsTotal).toBe(900);
    expect(t.payableAmount).toBe(57800);
  });
});

describe('GSTIN_REGEX', () => {
  it('accepts a valid GSTIN and rejects malformed ones', () => {
    expect(GSTIN_REGEX.test('33AAAAA0000A1Z5')).toBe(true);
    expect(GSTIN_REGEX.test('33AAAAA0000A1Y5')).toBe(false);
    expect(GSTIN_REGEX.test('33AAAAA0000A1Z')).toBe(false);
  });
});
