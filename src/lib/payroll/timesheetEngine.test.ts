import { describe, it, expect } from 'vitest';
import { computeLeaveHoursFromRequests, computePaidHolidayHours, computeOtherLeaveDaysFromRequests, computeTotalDaysFromHours, isWeeklyOff } from './timesheetEngine';

describe('computeLeaveHoursFromRequests', () => {
  const periodStart = new Date('2026-08-01');
  const periodEnd = new Date('2026-08-31');

  it('buckets a SICK request into sickLeaveHours at 8h/day', () => {
    const result = computeLeaveHoursFromRequests(
      [{ startDate: new Date('2026-08-10'), endDate: new Date('2026-08-11'), days: 2, leaveType: { code: 'SICK', isPaid: true } }],
      periodStart,
      periodEnd
    );
    expect(result).toEqual({ sickLeaveHours: 16, ptoHours: 0, earnedLeaveHours: 0, paidHolidayLeaveHours: 0 });
  });

  it('buckets a CASUAL request into ptoHours (PTO/Casual Leave)', () => {
    const result = computeLeaveHoursFromRequests(
      [{ startDate: new Date('2026-08-05'), endDate: new Date('2026-08-05'), days: 1, leaveType: { code: 'CASUAL', isPaid: true } }],
      periodStart,
      periodEnd
    );
    expect(result).toEqual({ sickLeaveHours: 0, ptoHours: 8, earnedLeaveHours: 0, paidHolidayLeaveHours: 0 });
  });

  it('buckets an EARNED request into earnedLeaveHours', () => {
    const result = computeLeaveHoursFromRequests(
      [{ startDate: new Date('2026-08-20'), endDate: new Date('2026-08-20'), days: 1, leaveType: { code: 'EARNED', isPaid: true } }],
      periodStart,
      periodEnd
    );
    expect(result).toEqual({ sickLeaveHours: 0, ptoHours: 0, earnedLeaveHours: 8, paidHolidayLeaveHours: 0 });
  });

  it('buckets a MATERNITY ("Paid Holidays") request into paidHolidayLeaveHours', () => {
    const result = computeLeaveHoursFromRequests(
      [{ startDate: new Date('2026-08-12'), endDate: new Date('2026-08-12'), days: 1, leaveType: { code: 'MATERNITY', isPaid: true } }],
      periodStart,
      periodEnd
    );
    expect(result).toEqual({ sickLeaveHours: 0, ptoHours: 0, earnedLeaveHours: 0, paidHolidayLeaveHours: 8 });
  });

  it('keeps Sick, Casual, Earned, and Paid Holiday in separate buckets when combined', () => {
    const result = computeLeaveHoursFromRequests(
      [
        { startDate: new Date('2026-08-03'), endDate: new Date('2026-08-04'), days: 2, leaveType: { code: 'SICK', isPaid: true } },
        { startDate: new Date('2026-08-05'), endDate: new Date('2026-08-05'), days: 1, leaveType: { code: 'CASUAL', isPaid: true } },
        { startDate: new Date('2026-08-20'), endDate: new Date('2026-08-20'), days: 1, leaveType: { code: 'EARNED', isPaid: true } },
        { startDate: new Date('2026-08-12'), endDate: new Date('2026-08-12'), days: 1, leaveType: { code: 'MATERNITY', isPaid: true } },
      ],
      periodStart,
      periodEnd
    );
    expect(result).toEqual({ sickLeaveHours: 16, ptoHours: 8, earnedLeaveHours: 8, paidHolidayLeaveHours: 8 });
  });

  it('excludes unpaid leave (LOP) entirely', () => {
    const result = computeLeaveHoursFromRequests(
      [{ startDate: new Date('2026-08-05'), endDate: new Date('2026-08-06'), days: 2, leaveType: { code: 'LOP', isPaid: false } }],
      periodStart,
      periodEnd
    );
    expect(result).toEqual({ sickLeaveHours: 0, ptoHours: 0, earnedLeaveHours: 0, paidHolidayLeaveHours: 0 });
  });

  it('pro-rates a request spanning a period boundary', () => {
    // Jul 30 - Aug 3 = 5-day span, overlap with August = Aug1-3 = 3 days.
    // 5 * (3/5) = 3 days -> 24 hours.
    const result = computeLeaveHoursFromRequests(
      [{ startDate: new Date('2026-07-30'), endDate: new Date('2026-08-03'), days: 5, leaveType: { code: 'CASUAL', isPaid: true } }],
      periodStart,
      periodEnd
    );
    expect(result).toEqual({ sickLeaveHours: 0, ptoHours: 24, earnedLeaveHours: 0, paidHolidayLeaveHours: 0 });
  });

  it('returns zeros for no requests', () => {
    expect(computeLeaveHoursFromRequests([], periodStart, periodEnd)).toEqual({ sickLeaveHours: 0, ptoHours: 0, earnedLeaveHours: 0, paidHolidayLeaveHours: 0 });
  });
});

describe('computeOtherLeaveDaysFromRequests', () => {
  const periodStart = new Date('2026-09-01');
  const periodEnd = new Date('2026-09-30');

  it('Casual Leave alone: counted', () => {
    const result = computeOtherLeaveDaysFromRequests(
      [{ startDate: new Date('2026-09-03'), endDate: new Date('2026-09-04'), days: 2, leaveType: { code: 'CASUAL' } }],
      periodStart, periodEnd
    );
    expect(result).toBe(2);
  });

  it('Sick Leave alone: counted', () => {
    const result = computeOtherLeaveDaysFromRequests(
      [{ startDate: new Date('2026-09-07'), endDate: new Date('2026-09-07'), days: 1, leaveType: { code: 'SICK' } }],
      periodStart, periodEnd
    );
    expect(result).toBe(1);
  });

  it('Paid Holidays (MATERNITY) alone: counted', () => {
    const result = computeOtherLeaveDaysFromRequests(
      [{ startDate: new Date('2026-09-14'), endDate: new Date('2026-09-14'), days: 1, leaveType: { code: 'MATERNITY' } }],
      periodStart, periodEnd
    );
    expect(result).toBe(1);
  });

  it('a brand-new, never-seen-before leave type code: counted by default', () => {
    const result = computeOtherLeaveDaysFromRequests(
      [{ startDate: new Date('2026-09-20'), endDate: new Date('2026-09-20'), days: 1, leaveType: { code: 'COMP_OFF' } }],
      periodStart, periodEnd
    );
    expect(result).toBe(1);
  });

  it('Earned Leave alone: excluded (0)', () => {
    const result = computeOtherLeaveDaysFromRequests(
      [{ startDate: new Date('2026-09-10'), endDate: new Date('2026-09-11'), days: 2, leaveType: { code: 'EARNED' } }],
      periodStart, periodEnd
    );
    expect(result).toBe(0);
  });

  it('Loss of Pay alone: excluded (0) — subtracted separately via lopDays', () => {
    const result = computeOtherLeaveDaysFromRequests(
      [{ startDate: new Date('2026-09-17'), endDate: new Date('2026-09-17'), days: 1, leaveType: { code: 'LOP' } }],
      periodStart, periodEnd
    );
    expect(result).toBe(0);
  });

  it('multiple leave types together: sums only the non-excluded ones', () => {
    const result = computeOtherLeaveDaysFromRequests(
      [
        { startDate: new Date('2026-09-03'), endDate: new Date('2026-09-04'), days: 2, leaveType: { code: 'CASUAL' } },
        { startDate: new Date('2026-09-07'), endDate: new Date('2026-09-07'), days: 1, leaveType: { code: 'SICK' } },
        { startDate: new Date('2026-09-10'), endDate: new Date('2026-09-11'), days: 2, leaveType: { code: 'EARNED' } },
        { startDate: new Date('2026-09-17'), endDate: new Date('2026-09-17'), days: 1, leaveType: { code: 'LOP' } },
      ],
      periodStart, periodEnd
    );
    expect(result).toBe(3); // 2 Casual + 1 Sick; Earned and LOP excluded
  });

  it('returns 0 for no requests', () => {
    expect(computeOtherLeaveDaysFromRequests([], periodStart, periodEnd)).toBe(0);
  });
});

describe('computeTotalDaysFromHours', () => {
  it('Example 1 from the requirement: 20 regular + 2 overtime + (2 Casual + 1 Sick) other leave - 1 LOP = 24; Earned Leave (2) is ignored', () => {
    expect(computeTotalDaysFromHours(20, 2, 3, 1)).toBe(24);
  });

  it('Example 2 from the requirement: 20 regular + 0 overtime + 0 other leave - 2 LOP = 18; Earned Leave (3) is ignored', () => {
    expect(computeTotalDaysFromHours(20, 0, 0, 2)).toBe(18);
  });

  it('is unaffected when there is no LOP or other leave', () => {
    expect(computeTotalDaysFromHours(20, 2, 0, 0)).toBe(22);
  });

  it('adds other leave days (e.g. Casual/Sick/Paid Holiday)', () => {
    expect(computeTotalDaysFromHours(20, 2, 3, 0)).toBe(25);
  });

  it('deducts fractional LOP days', () => {
    expect(computeTotalDaysFromHours(20, 0, 0, 0.5)).toBe(19.5);
  });
});

describe('isWeeklyOff', () => {
  // January 2023: Jan 1 is a Sunday, so Saturdays fall on 7 (1st), 14
  // (2nd), 21 (3rd), 28 (4th) — a clean month with no 5th Saturday.
  const sunday = new Date('2023-01-01');
  const weekdayTuesday = new Date('2023-01-03');
  const saturday1st = new Date('2023-01-07');
  const saturday2nd = new Date('2023-01-14');
  const saturday3rd = new Date('2023-01-21');
  const saturday4th = new Date('2023-01-28');

  it('treats Sunday as always off, regardless of policy', () => {
    for (const policy of ['NONE', 'ALL', 'FIRST_THIRD', 'SECOND_FOURTH'] as const) {
      expect(isWeeklyOff(sunday, policy)).toBe(true);
    }
  });

  it('never treats a weekday as off', () => {
    for (const policy of ['NONE', 'ALL', 'FIRST_THIRD', 'SECOND_FOURTH'] as const) {
      expect(isWeeklyOff(weekdayTuesday, policy)).toBe(false);
    }
  });

  it('ALL treats every Saturday as off', () => {
    expect(isWeeklyOff(saturday1st, 'ALL')).toBe(true);
    expect(isWeeklyOff(saturday2nd, 'ALL')).toBe(true);
    expect(isWeeklyOff(saturday3rd, 'ALL')).toBe(true);
    expect(isWeeklyOff(saturday4th, 'ALL')).toBe(true);
  });

  it('NONE treats every Saturday as a working day', () => {
    expect(isWeeklyOff(saturday1st, 'NONE')).toBe(false);
    expect(isWeeklyOff(saturday2nd, 'NONE')).toBe(false);
    expect(isWeeklyOff(saturday3rd, 'NONE')).toBe(false);
    expect(isWeeklyOff(saturday4th, 'NONE')).toBe(false);
  });

  it('SECOND_FOURTH is off only on the 2nd and 4th Saturday', () => {
    expect(isWeeklyOff(saturday1st, 'SECOND_FOURTH')).toBe(false);
    expect(isWeeklyOff(saturday2nd, 'SECOND_FOURTH')).toBe(true);
    expect(isWeeklyOff(saturday3rd, 'SECOND_FOURTH')).toBe(false);
    expect(isWeeklyOff(saturday4th, 'SECOND_FOURTH')).toBe(true);
  });

  it('FIRST_THIRD is off only on the 1st and 3rd Saturday', () => {
    expect(isWeeklyOff(saturday1st, 'FIRST_THIRD')).toBe(true);
    expect(isWeeklyOff(saturday2nd, 'FIRST_THIRD')).toBe(false);
    expect(isWeeklyOff(saturday3rd, 'FIRST_THIRD')).toBe(true);
    expect(isWeeklyOff(saturday4th, 'FIRST_THIRD')).toBe(false);
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
