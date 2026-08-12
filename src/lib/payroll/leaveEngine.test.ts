import { describe, it, expect } from 'vitest';
import { computeAutoLopDaysFromRequests } from './leaveEngine';

describe('computeAutoLopDaysFromRequests', () => {
  const periodStart = new Date('2026-08-01');
  const periodEnd = new Date('2026-08-31');

  it('counts a request entirely inside the period at its full days', () => {
    const result = computeAutoLopDaysFromRequests(
      [{ startDate: new Date('2026-08-10'), endDate: new Date('2026-08-12'), days: 3 }],
      periodStart,
      periodEnd
    );
    expect(result).toBe(3);
  });

  it('sums multiple requests in the same period', () => {
    const result = computeAutoLopDaysFromRequests(
      [
        { startDate: new Date('2026-08-05'), endDate: new Date('2026-08-05'), days: 1 },
        { startDate: new Date('2026-08-20'), endDate: new Date('2026-08-21'), days: 2 },
      ],
      periodStart,
      periodEnd
    );
    expect(result).toBe(3);
  });

  it('ignores a request entirely outside the period', () => {
    const result = computeAutoLopDaysFromRequests(
      [{ startDate: new Date('2026-09-05'), endDate: new Date('2026-09-06'), days: 2 }],
      periodStart,
      periodEnd
    );
    expect(result).toBe(0);
  });

  it('pro-rates a request that starts before the period and ends inside it', () => {
    // 5-day request spanning Jul 30 - Aug 3 (5 calendar days), 2 of which
    // (Aug 1-2... let's use Aug 1-3, 3 days) fall in August.
    const result = computeAutoLopDaysFromRequests(
      [{ startDate: new Date('2026-07-30'), endDate: new Date('2026-08-03'), days: 5 }],
      periodStart,
      periodEnd
    );
    // Total span = Jul30..Aug3 = 5 days. Overlap = Aug1..Aug3 = 3 days.
    // 5 * (3/5) = 3.
    expect(result).toBe(3);
  });

  it('pro-rates a request that starts inside the period and ends after it', () => {
    // Aug 30 - Sep 2 = 4-day span, overlap with August = Aug30-31 = 2 days.
    const result = computeAutoLopDaysFromRequests(
      [{ startDate: new Date('2026-08-30'), endDate: new Date('2026-09-02'), days: 4 }],
      periodStart,
      periodEnd
    );
    expect(result).toBe(2);
  });

  it('handles a half-day request', () => {
    const result = computeAutoLopDaysFromRequests(
      [{ startDate: new Date('2026-08-15'), endDate: new Date('2026-08-15'), days: 0.5 }],
      periodStart,
      periodEnd
    );
    expect(result).toBe(0.5);
  });

  it('returns 0 for no requests', () => {
    expect(computeAutoLopDaysFromRequests([], periodStart, periodEnd)).toBe(0);
  });
});
