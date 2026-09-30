import { describe, it, expect } from 'vitest';
import { computeAutoLopDaysFromRequests, computeAccruedPoolDays, countsTowardAnnualLeave, ANNUAL_LEAVE_EXCLUDED_CODES, allocateLeaveByDate } from './leaveEngine';

describe('countsTowardAnnualLeave', () => {
  it('excludes Loss of Pay, Earned Leave, and Paid Holidays (MATERNITY)', () => {
    expect(countsTowardAnnualLeave('LOP')).toBe(false);
    expect(countsTowardAnnualLeave('EARNED')).toBe(false);
    expect(countsTowardAnnualLeave('MATERNITY')).toBe(false);
  });

  it('counts Casual and Sick, which are not in the exclusion list', () => {
    expect(countsTowardAnnualLeave('CASUAL')).toBe(true);
    expect(countsTowardAnnualLeave('SICK')).toBe(true);
  });

  it('is exclusion-based: any new/unknown leave type code counts by default', () => {
    expect(countsTowardAnnualLeave('COMP_OFF')).toBe(true);
    expect(countsTowardAnnualLeave('MATERNITY_LEAVE')).toBe(true);
  });

  it('also excludes ANNUAL, the Annual Leave entitlement config row itself', () => {
    expect(countsTowardAnnualLeave('ANNUAL')).toBe(false);
  });

  it('the exclusion list itself holds exactly the four excluded codes', () => {
    expect(ANNUAL_LEAVE_EXCLUDED_CODES).toEqual(['LOP', 'EARNED', 'MATERNITY', 'ANNUAL']);
  });
});

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

describe('computeAccruedPoolDays', () => {
  // Scenario 1 — Time-off Policy configured at the old default of 12 days:
  // behaves exactly as before (1 day/month, capped at 12).
  it('12-day entitlement: accrues 1 day per elapsed month within the current year (January = 1)', () => {
    expect(computeAccruedPoolDays(12, 2026, new Date('2026-01-15'))).toBe(1);
  });

  it('12-day entitlement: accrues cumulatively by March (3 days) — matches the worked example', () => {
    expect(computeAccruedPoolDays(12, 2026, new Date('2026-03-20'))).toBe(3);
  });

  it('12-day entitlement: caps at 12 days even in December', () => {
    expect(computeAccruedPoolDays(12, 2026, new Date('2026-12-31'))).toBe(12);
  });

  it('12-day entitlement: treats a past year as fully accrued (12)', () => {
    expect(computeAccruedPoolDays(12, 2025, new Date('2026-06-01'))).toBe(12);
  });

  it('12-day entitlement: treats a future year as not yet accrued (0)', () => {
    expect(computeAccruedPoolDays(12, 2027, new Date('2026-06-01'))).toBe(0);
  });

  // Scenario 2 — a 15-day entitlement accrues at 15/12 = 1.25/month, not
  // the old fixed 1/month, and caps at 15 (not 12).
  it('15-day entitlement: accrues 1.25/month, 3.75 by March — matches the requirement\'s worked example (1.25/month)', () => {
    expect(computeAccruedPoolDays(15, 2026, new Date('2026-03-20'))).toBe(3.75);
  });

  it('15-day entitlement: caps at 15 (not 12) in December', () => {
    expect(computeAccruedPoolDays(15, 2026, new Date('2026-12-31'))).toBe(15);
  });

  // Scenario 3 — an 18-day entitlement accrues at 18/12 = 1.5/month and
  // caps at 18.
  it('18-day entitlement: accrues 1.5/month, 4.5 by March', () => {
    expect(computeAccruedPoolDays(18, 2026, new Date('2026-03-20'))).toBe(4.5);
  });

  it('18-day entitlement: caps at 18 (not 12) in December', () => {
    expect(computeAccruedPoolDays(18, 2026, new Date('2026-12-31'))).toBe(18);
  });
});

describe('allocateLeaveByDate — month-wise leave / LOP split', () => {
  // Annual pool 12/yr accruing 1/month, 0 used: available by a month = month number.
  const accrualOnly = (used: number) => (day: string) => Number(day.slice(5, 7)) - used;

  it('Scenario 1: 30 Sep–10 Oct (11 days), 9 available and no new October balance → Sep 1 paid; Oct 8 paid + 2 LOP', () => {
    const r = allocateLeaveByDate({ startDate: '2026-09-30', endDate: '2026-10-10', days: 11, availableAsOf: () => 9 });
    expect(r).toMatchObject({ paidDays: 9, lopDays: 2 });
    expect(r.byMonth).toEqual([{ month: '2026-09', paidDays: 1, lopDays: 0 }, { month: '2026-10', paidDays: 8, lopDays: 2 }]);
    expect(r.segments).toEqual([
      { kind: 'PAID', startDate: '2026-09-30', endDate: '2026-09-30', days: 1 },
      { kind: 'PAID', startDate: '2026-10-01', endDate: '2026-10-08', days: 8 },
      { kind: 'LOP', startDate: '2026-10-09', endDate: '2026-10-10', days: 2 },
    ]);
  });
  it('Scenario 2: October accrues 1 more day → 10 paid, 1 LOP, the extra day only covers October', () => {
    // 9 available by September, 10 by October
    const r = allocateLeaveByDate({ startDate: '2026-09-30', endDate: '2026-10-10', days: 11, availableAsOf: (d) => (d < '2026-10-01' ? 9 : 10) });
    expect(r).toMatchObject({ paidDays: 10, lopDays: 1 });
    expect(r.byMonth).toEqual([{ month: '2026-09', paidDays: 1, lopDays: 0 }, { month: '2026-10', paidDays: 9, lopDays: 1 }]);
    expect(r.segments.find((s) => s.kind === 'LOP')).toEqual({ kind: 'LOP', startDate: '2026-10-10', endDate: '2026-10-10', days: 1 });
  });
  it("October's new balance never covers September: nothing left in September → September is LOP", () => {
    // all 9 September days already used; October adds 1
    const r = allocateLeaveByDate({ startDate: '2026-09-29', endDate: '2026-10-02', days: 4, availableAsOf: accrualOnly(9) });
    expect(r.byMonth).toEqual([{ month: '2026-09', paidDays: 0, lopDays: 2 }, { month: '2026-10', paidDays: 1, lopDays: 1 }]);
    expect(r.segments.map((s) => `${s.kind} ${s.startDate}→${s.endDate} ${s.days}`)).toEqual([
      'LOP 2026-09-29→2026-09-30 2', 'PAID 2026-10-01→2026-10-01 1', 'LOP 2026-10-02→2026-10-02 1',
    ]);
  });
  it('within balance, single month → one paid segment (unchanged behaviour)', () => {
    const r = allocateLeaveByDate({ startDate: '2026-09-07', endDate: '2026-09-09', days: 3, availableAsOf: () => 5 });
    expect(r).toMatchObject({ paidDays: 3, lopDays: 0, segments: [{ kind: 'PAID', startDate: '2026-09-07', endDate: '2026-09-09', days: 3 }] });
  });
  it('half-day and fractional balance', () => {
    expect(allocateLeaveByDate({ startDate: '2026-09-07', endDate: '2026-09-07', days: 0.5, availableAsOf: () => 0.25 })).toMatchObject({ paidDays: 0.25, lopDays: 0.25 });
    const r = allocateLeaveByDate({ startDate: '2026-09-07', endDate: '2026-09-09', days: 3, availableAsOf: () => 1.5 });
    expect(r.segments).toEqual([
      { kind: 'PAID', startDate: '2026-09-07', endDate: '2026-09-08', days: 1.5 },
      { kind: 'LOP', startDate: '2026-09-08', endDate: '2026-09-09', days: 1.5 },
    ]);
  });
  it('crossing into a new year starts on the new year\'s balance', () => {
    // December: 0 left; January: 1 accrued
    const r = allocateLeaveByDate({ startDate: '2026-12-31', endDate: '2027-01-02', days: 3, availableAsOf: (d) => (d.startsWith('2027') ? 1 : 0) });
    expect(r.byMonth).toEqual([{ month: '2026-12', paidDays: 0, lopDays: 1 }, { month: '2027-01', paidDays: 1, lopDays: 1 }]);
  });
});
