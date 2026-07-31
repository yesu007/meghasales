import { describe, it, expect } from 'vitest';
import { resolveExchangeRate } from './exchangeRate';

describe('resolveExchangeRate', () => {
  it('returns 1 for the same currency, regardless of candidates', () => {
    expect(resolveExchangeRate([], 'USD', 'USD', '2026-07-01')).toBe(1);
  });

  it('picks the most recent direct match on or before onDate', () => {
    const candidates = [
      { fromCurrency: 'USD', toCurrency: 'INR', rate: 82, rateDate: '2026-06-01' },
      { fromCurrency: 'USD', toCurrency: 'INR', rate: 83.5, rateDate: '2026-07-01' },
    ];
    expect(resolveExchangeRate(candidates, 'USD', 'INR', '2026-07-15')).toBe(83.5);
  });

  it('ignores rows dated after onDate', () => {
    const candidates = [
      { fromCurrency: 'USD', toCurrency: 'INR', rate: 82, rateDate: '2026-06-01' },
      { fromCurrency: 'USD', toCurrency: 'INR', rate: 90, rateDate: '2026-08-01' },
    ];
    expect(resolveExchangeRate(candidates, 'USD', 'INR', '2026-07-15')).toBe(82);
  });

  it('falls back to inverting the most recent inverse-direction row when no direct row exists', () => {
    const candidates = [{ fromCurrency: 'INR', toCurrency: 'USD', rate: 0.012, rateDate: '2026-07-01' }];
    expect(resolveExchangeRate(candidates, 'USD', 'INR', '2026-07-15')).toBeCloseTo(1 / 0.012, 10);
  });

  it('returns null when no direct or inverse row applies', () => {
    const candidates = [{ fromCurrency: 'GBP', toCurrency: 'INR', rate: 106, rateDate: '2026-07-01' }];
    expect(resolveExchangeRate(candidates, 'USD', 'INR', '2026-07-15')).toBeNull();
  });
});
