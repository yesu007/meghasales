import { describe, it, expect } from 'vitest';
import { computeProbationEndDate, isProbationEmploymentType } from './probationEngine';

describe('computeProbationEndDate', () => {
  it('matches the requirement\'s own worked example: 10-Jan-2026 + 3 months = 10-Apr-2026', () => {
    const result = computeProbationEndDate(new Date('2026-01-10'), 3);
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-10');
  });

  it('6 months', () => {
    const result = computeProbationEndDate(new Date('2026-01-10'), 6);
    expect(result.toISOString().slice(0, 10)).toBe('2026-07-10');
  });

  it('12 months (crosses a calendar year)', () => {
    const result = computeProbationEndDate(new Date('2026-01-10'), 12);
    expect(result.toISOString().slice(0, 10)).toBe('2027-01-10');
  });

  it('uses proper calendar-month arithmetic, not a naive +30-days-per-month approximation: 31-Jan + 1 month clamps to the last day of February', () => {
    const result = computeProbationEndDate(new Date('2026-01-31'), 1);
    expect(result.toISOString().slice(0, 10)).toBe('2026-02-28');
  });
});

describe('isProbationEmploymentType', () => {
  it('true only for the PROBATION code', () => {
    expect(isProbationEmploymentType('PROBATION')).toBe(true);
  });

  it('false for other employment types and for null/undefined', () => {
    expect(isProbationEmploymentType('FULL_TIME')).toBe(false);
    expect(isProbationEmploymentType(null)).toBe(false);
    expect(isProbationEmploymentType(undefined)).toBe(false);
  });
});
