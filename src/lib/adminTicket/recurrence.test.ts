import { describe, it, expect } from 'vitest';
import { computeNextRunDate } from './recurrence';

function ymd(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

describe('computeNextRunDate', () => {
  it('advances DAILY by intervalValue days', () => {
    const next = computeNextRunDate({ frequency: 'DAILY', intervalValue: 3 }, new Date('2026-01-01T00:00:00Z'));
    expect(ymd(next)).toBe('2026-01-04');
  });

  it('advances WEEKLY and snaps to dayOfWeek', () => {
    // 2026-01-01 is a Thursday (day 4); snap to Monday (day 1) of the target week.
    const next = computeNextRunDate({ frequency: 'WEEKLY', intervalValue: 1, dayOfWeek: 1 }, new Date('2026-01-01T00:00:00Z'));
    expect(next.getUTCDay()).toBe(1);
  });

  it('clamps the 31st to February in a non-leap year', () => {
    // 2026 is not a leap year — Feb has 28 days.
    const next = computeNextRunDate({ frequency: 'MONTHLY', intervalValue: 1, dayOfMonth: 31 }, new Date('2026-01-31T00:00:00Z'));
    expect(ymd(next)).toBe('2026-02-28');
  });

  it('clamps to Feb 29 in a leap year', () => {
    const next = computeNextRunDate({ frequency: 'MONTHLY', intervalValue: 1, dayOfMonth: 31 }, new Date('2028-01-31T00:00:00Z'));
    expect(ymd(next)).toBe('2028-02-29');
  });

  it('honors intervalValue > 1 for MONTHLY', () => {
    const next = computeNextRunDate({ frequency: 'MONTHLY', intervalValue: 3, dayOfMonth: 15 }, new Date('2026-01-15T00:00:00Z'));
    expect(ymd(next)).toBe('2026-04-15');
  });

  it('QUARTERLY advances by 3 months per intervalValue', () => {
    const next = computeNextRunDate({ frequency: 'QUARTERLY', intervalValue: 1, dayOfMonth: 10 }, new Date('2026-01-10T00:00:00Z'));
    expect(ymd(next)).toBe('2026-04-10');
  });

  it('YEARLY advances a year and applies monthOfYear', () => {
    const next = computeNextRunDate(
      { frequency: 'YEARLY', intervalValue: 1, monthOfYear: 3, dayOfMonth: 20 },
      new Date('2026-01-10T00:00:00Z')
    );
    expect(ymd(next)).toBe('2027-03-20');
  });

  it('throws for CUSTOM_CRON (not yet supported)', () => {
    expect(() => computeNextRunDate({ frequency: 'CUSTOM_CRON', intervalValue: 1 }, new Date('2026-01-01T00:00:00Z'))).toThrow();
  });
});
