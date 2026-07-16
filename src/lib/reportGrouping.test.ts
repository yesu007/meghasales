import { describe, it, expect } from 'vitest';
import { groupSumsByCurrency } from './reportGrouping';

interface Fixture { customer: string; currency: string; amount: number }

describe('groupSumsByCurrency', () => {
  it('sums a single-currency dataset into one group per key', () => {
    const items: Fixture[] = [
      { customer: 'Acme', currency: 'INR', amount: 100 },
      { customer: 'Acme', currency: 'INR', amount: 250 },
    ];
    const groups = groupSumsByCurrency(items, (i) => i.customer, (i) => i.currency, (i) => i.amount);
    expect(groups).toEqual([{ key: 'Acme', currencyCode: 'INR', total: 350, count: 2 }]);
  });

  it('keeps mixed-currency amounts for the same key in separate groups instead of summing across currencies', () => {
    const items: Fixture[] = [
      { customer: 'Acme', currency: 'INR', amount: 1000 },
      { customer: 'Acme', currency: 'USD', amount: 50 },
    ];
    const groups = groupSumsByCurrency(items, (i) => i.customer, (i) => i.currency, (i) => i.amount);
    expect(groups).toHaveLength(2);
    expect(groups).toContainEqual({ key: 'Acme', currencyCode: 'INR', total: 1000, count: 1 });
    expect(groups).toContainEqual({ key: 'Acme', currencyCode: 'USD', total: 50, count: 1 });
  });

  it('groups independently per key, not just per currency', () => {
    const items: Fixture[] = [
      { customer: 'Acme', currency: 'INR', amount: 100 },
      { customer: 'Globex', currency: 'INR', amount: 200 },
    ];
    const groups = groupSumsByCurrency(items, (i) => i.customer, (i) => i.currency, (i) => i.amount);
    expect(groups).toHaveLength(2);
    expect(groups).toContainEqual({ key: 'Acme', currencyCode: 'INR', total: 100, count: 1 });
    expect(groups).toContainEqual({ key: 'Globex', currencyCode: 'INR', total: 200, count: 1 });
  });

  it('returns an empty array for an empty dataset', () => {
    expect(groupSumsByCurrency([] as Fixture[], (i) => i.customer, (i) => i.currency, (i) => i.amount)).toEqual([]);
  });
});
