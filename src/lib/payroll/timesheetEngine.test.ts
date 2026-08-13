import { describe, it, expect } from 'vitest';
import { computeLeaveHoursFromRequests, computePaidHolidayHours } from './timesheetEngine';

describe('computeLeaveHoursFromRequests', () => {
  const periodStart = new Date('2026-08-01');
  const periodEnd = new Date('2026-08-31');

  it('buckets a SICK request into sickLeaveHours at 8h/day', () => {
    const result = computeLeaveHoursFromRequests(
      [{ startDate: new Date('2026-08-10'), endDate: new Date('2026-08-11'), days: 2, leaveType: { code: 'SICK', isPaid: true } }],
      periodStart,
      periodEnd
    );
    expect(result).toEqual({ sickLeaveHours: 16, ptoHours: 0 });
  });

  it('buckets every other paid type into ptoHours', () => {
    const result = computeLeaveHoursFromRequests(
      [
        { startDate: new Date('2026-08-05'), endDate: new Date('2026-08-05'), days: 1, leaveType: { code: 'CASUAL', isPaid: true } },
        { startDate: new Date('2026-08-20'), endDate: new Date('2026-08-20'), days: 1, leaveType: { code: 'EARNED', isPaid: true } },
      ],
      periodStart,
      periodEnd
    );
    expect(result).toEqual({ sickLeaveHours: 0, ptoHours: 16 });
  });

  it('excludes unpaid leave (LOP) entirely', () => {
    const result = computeLeaveHoursFromRequests(
      [{ startDate: new Date('2026-08-05'), endDate: new Date('2026-08-06'), days: 2, leaveType: { code: 'LOP', isPaid: false } }],
      periodStart,
      periodEnd
    );
    expect(result).toEqual({ sickLeaveHours: 0, ptoHours: 0 });
  });

  it('pro-rates a request spanning a period boundary', () => {
    // Jul 30 - Aug 3 = 5-day span, overlap with August = Aug1-3 = 3 days.
    // 5 * (3/5) = 3 days -> 24 hours.
    const result = computeLeaveHoursFromRequests(
      [{ startDate: new Date('2026-07-30'), endDate: new Date('2026-08-03'), days: 5, leaveType: { code: 'CASUAL', isPaid: true } }],
      periodStart,
      periodEnd
    );
    expect(result).toEqual({ sickLeaveHours: 0, ptoHours: 24 });
  });

  it('returns zeros for no requests', () => {
    expect(computeLeaveHoursFromRequests([], periodStart, periodEnd)).toEqual({ sickLeaveHours: 0, ptoHours: 0 });
  });
});

describe('computePaidHolidayHours', () => {
  const periodStart = new Date('2026-08-01');
  const periodEnd = new Date('2026-08-31');
  const holidays = [{ date: new Date('2026-08-15') }, { date: new Date('2026-08-28') }, { date: new Date('2026-09-01') }];

  it('counts every active-employment holiday inside the period at 8h each', () => {
    const result = computePaidHolidayHours(holidays, periodStart, periodEnd, { dateOfJoining: new Date('2026-01-01'), dateOfLeaving: null });
    expect(result).toBe(16);
  });

  it('excludes a holiday before the employee joined', () => {
    const result = computePaidHolidayHours(holidays, periodStart, periodEnd, { dateOfJoining: new Date('2026-08-16'), dateOfLeaving: null });
    expect(result).toBe(8); // only Aug 28
  });

  it('excludes a holiday after the employee left', () => {
    const result = computePaidHolidayHours(holidays, periodStart, periodEnd, { dateOfJoining: new Date('2026-01-01'), dateOfLeaving: new Date('2026-08-20') });
    expect(result).toBe(8); // only Aug 15
  });

  it('ignores holidays outside the period', () => {
    const result = computePaidHolidayHours(holidays, periodStart, periodEnd, { dateOfJoining: null, dateOfLeaving: null });
    expect(result).toBe(16); // Sep 1 excluded
  });
});
