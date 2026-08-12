import { describe, it, expect } from 'vitest';
import { computePayableDays, daysInMonth, resolveStructureLineItems, round2 } from './runEngine';

describe('daysInMonth', () => {
  it('returns 31 for a 31-day month', () => {
    expect(daysInMonth(2026, 8)).toBe(31);
  });
  it('returns 28 for February in a non-leap year', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });
  it('returns 29 for February in a leap year', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });
});

describe('computePayableDays', () => {
  const base = { year: 2026, month: 8, totalDays: 31, lopDays: 0, dateOfJoining: null, dateOfLeaving: null };

  it('is the full month with no LOP and no joining/exit', () => {
    expect(computePayableDays(base)).toBe(31);
  });

  it('subtracts LOP days', () => {
    expect(computePayableDays({ ...base, lopDays: 2 })).toBe(29);
  });

  it('pro-rates a mid-month joiner', () => {
    // Joined on the 10th — present from the 10th through the 31st = 22 days.
    expect(computePayableDays({ ...base, dateOfJoining: '2026-08-10' })).toBe(22);
  });

  it('pro-rates a mid-month exit', () => {
    // Left on the 20th (last working day inclusive) — present days 1-20 = 20 days.
    expect(computePayableDays({ ...base, dateOfLeaving: '2026-08-20' })).toBe(20);
  });

  it('combines a mid-month join and exit in the same period', () => {
    // Joined the 10th, left the 20th — present days 10-20 inclusive = 11 days.
    expect(computePayableDays({ ...base, dateOfJoining: '2026-08-10', dateOfLeaving: '2026-08-20' })).toBe(11);
  });

  it('combines a mid-month joiner with LOP', () => {
    expect(computePayableDays({ ...base, dateOfJoining: '2026-08-10', lopDays: 2 })).toBe(20);
  });

  it('ignores a joining date before the period', () => {
    expect(computePayableDays({ ...base, dateOfJoining: '2026-01-01' })).toBe(31);
  });

  it('ignores an exit date after the period', () => {
    expect(computePayableDays({ ...base, dateOfLeaving: '2026-12-31' })).toBe(31);
  });

  it('never goes negative', () => {
    expect(computePayableDays({ ...base, lopDays: 100 })).toBe(0);
  });

  it('never exceeds totalDays', () => {
    // Defensive: a joining date somehow before the period combined with no
    // other reduction shouldn't inflate payable days past the month length.
    expect(computePayableDays({ ...base, dateOfJoining: '2020-01-01', lopDays: -5 })).toBe(31);
  });
});

describe('resolveStructureLineItems', () => {
  const BASIC = { id: 1, name: 'Basic', code: 'BASIC', type: 'EARNING', calculationType: 'FLAT' };
  const HRA = { id: 2, name: 'HRA', code: 'HRA', type: 'EARNING', calculationType: 'PERCENT_OF_BASIC' };
  const PF = { id: 3, name: 'Employee PF', code: 'EMPLOYEE_PF', type: 'DEDUCTION', calculationType: 'PERCENT_OF_BASIC' };

  it('resolves a FLAT component to its literal value', () => {
    const result = resolveStructureLineItems([{ component: BASIC, value: 30000 }]);
    expect(result).toEqual([{ componentId: 1, label: 'Basic', type: 'EARNING', amount: 30000 }]);
  });

  it('resolves a PERCENT_OF_BASIC component against the Basic component in the same structure', () => {
    const result = resolveStructureLineItems([
      { component: BASIC, value: 30000 },
      { component: HRA, value: 40 },
    ]);
    expect(result.find((r) => r.label === 'HRA')?.amount).toBe(12000);
  });

  it('treats a missing Basic component as zero for percent calculations', () => {
    const result = resolveStructureLineItems([{ component: HRA, value: 40 }]);
    expect(result[0].amount).toBe(0);
  });

  it('handles multiple percent-of-basic deductions correctly', () => {
    const result = resolveStructureLineItems([
      { component: BASIC, value: 30000 },
      { component: PF, value: 12 },
    ]);
    expect(result.find((r) => r.label === 'Employee PF')?.amount).toBe(3600);
  });
});

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1234.5678)).toBe(1234.57);
    expect(round2(100 / 3)).toBe(33.33);
  });
});
