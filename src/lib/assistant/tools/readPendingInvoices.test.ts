import { describe, it, expect } from 'vitest';
import { summarizeByCurrency } from './readPendingInvoices';

describe('summarizeByCurrency', () => {
  it('sums balances separately per currency rather than blending them', () => {
    const totals = summarizeByCurrency([
      { currencyCode: 'INR', balanceDue: 1000 },
      { currencyCode: 'USD', balanceDue: '50.5' },
      { currencyCode: 'INR', balanceDue: '250' },
    ]);

    expect(totals).toEqual({ INR: 1250, USD: 50.5 });
  });

  it('defaults a missing currency code to INR', () => {
    const totals = summarizeByCurrency([{ currencyCode: null, balanceDue: 100 }]);
    expect(totals).toEqual({ INR: 100 });
  });

  it('returns an empty object for no rows', () => {
    expect(summarizeByCurrency([])).toEqual({});
  });
});
