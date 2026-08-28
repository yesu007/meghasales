import { describe, it, expect } from 'vitest';
import { computeMonthlyVariance, totalVariance, defaultMonthlySpread } from './expenseBudgetVariance';

describe('computeMonthlyVariance', () => {
  it('matches budgeted and actual amounts for the same month', () => {
    const result = computeMonthlyVariance(
      [{ month: '2026-08-01', amount: 100000 }],
      [{ date: '2026-08-15', amount: 80000 }]
    );
    expect(result).toEqual([
      { month: '2026-08', budgeted: 100000, actual: 80000, varianceAmount: -20000, variancePercent: -20 },
    ]);
  });

  it('sums multiple actuals within the same month', () => {
    const result = computeMonthlyVariance(
      [{ month: '2026-08-01', amount: 50000 }],
      [
        { date: '2026-08-02', amount: 30000 },
        { date: '2026-08-20', amount: 40000 },
      ]
    );
    expect(result[0].actual).toBe(70000);
    expect(result[0].varianceAmount).toBe(20000);
  });

  it('surfaces a month with actual spend but no budget line, without dividing by zero', () => {
    const result = computeMonthlyVariance([], [{ date: '2026-09-05', amount: 15000 }]);
    expect(result).toEqual([
      { month: '2026-09', budgeted: 0, actual: 15000, varianceAmount: 15000, variancePercent: null },
    ]);
  });

  it('surfaces an unspent budget month with zero actual', () => {
    const result = computeMonthlyVariance([{ month: '2026-10-01', amount: 25000 }], []);
    expect(result).toEqual([
      { month: '2026-10', budgeted: 25000, actual: 0, varianceAmount: -25000, variancePercent: -100 },
    ]);
  });
});

describe('totalVariance', () => {
  it('aggregates budgeted, actual and variance across all months', () => {
    const rows = computeMonthlyVariance(
      [
        { month: '2026-08-01', amount: 100000 },
        { month: '2026-09-01', amount: 100000 },
      ],
      [{ date: '2026-08-10', amount: 120000 }]
    );
    expect(totalVariance(rows)).toEqual({ budgeted: 200000, actual: 120000, varianceAmount: -80000, variancePercent: -40 });
  });
});

describe('defaultMonthlySpread', () => {
  it('splits evenly across a 12-month financial year', () => {
    const spread = defaultMonthlySpread(1200000, '2026-08-01', '2027-07-31');
    expect(spread).toHaveLength(12);
    expect(spread.every((m) => m.amount === 100000)).toBe(true);
    expect(spread.reduce((sum, m) => sum + m.amount, 0)).toBe(1200000);
  });

  it('folds the rounding remainder into the last month so the total is always exact', () => {
    const spread = defaultMonthlySpread(1000, '2026-08-01', '2026-10-31');
    expect(spread).toHaveLength(3);
    expect(spread.reduce((sum, m) => sum + m.amount, 0)).toBe(1000);
  });
});
