import { describe, it, expect } from 'vitest';
import { computeLeaveHoursFromRequests, computePaidHolidayHours, computePaidHolidayLeaveDaysFromRequests, computeTotalDaysFromHours, isWeeklyOff } from './timesheetEngine';
import { computeAutoLopDaysFromRequests } from './leaveEngine';

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

  it('buckets SICK_LEAVE / CASUAL_LEAVE (types created via Time-off Policy) like SICK / CASUAL', () => {
    const result = computeLeaveHoursFromRequests(
      [
        { startDate: new Date('2026-08-03'), endDate: new Date('2026-08-04'), days: 2, leaveType: { code: 'SICK_LEAVE', isPaid: true } },
        { startDate: new Date('2026-08-07'), endDate: new Date('2026-08-07'), days: 1, leaveType: { code: 'CASUAL_LEAVE', isPaid: true } },
      ],
      periodStart, periodEnd
    );
    expect(result.sickLeaveHours).toBe(16);
    expect(result.ptoHours).toBe(8);
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

describe('computePaidHolidayLeaveDaysFromRequests', () => {
  const periodStart = new Date('2026-09-01');
  const periodEnd = new Date('2026-09-30');

  it('Paid Holidays (MATERNITY): counted', () => {
    const result = computePaidHolidayLeaveDaysFromRequests(
      [{ startDate: new Date('2026-09-14'), endDate: new Date('2026-09-14'), days: 1, leaveType: { code: 'MATERNITY' } }],
      periodStart, periodEnd
    );
    expect(result).toBe(1);
  });

  it('Sick, Casual, Earned, LOP and a brand-new leave type: never counted (0)', () => {
    for (const code of ['SICK', 'CASUAL', 'EARNED', 'LOP', 'COMP_OFF']) {
      const result = computePaidHolidayLeaveDaysFromRequests(
        [{ startDate: new Date('2026-09-07'), endDate: new Date('2026-09-08'), days: 2, leaveType: { code } }],
        periodStart, periodEnd
      );
      expect(result, code).toBe(0);
    }
  });

  it('multiple leave types together: sums only Paid Holidays', () => {
    const result = computePaidHolidayLeaveDaysFromRequests(
      [
        { startDate: new Date('2026-09-03'), endDate: new Date('2026-09-04'), days: 2, leaveType: { code: 'CASUAL' } },
        { startDate: new Date('2026-09-07'), endDate: new Date('2026-09-07'), days: 1, leaveType: { code: 'SICK' } },
        { startDate: new Date('2026-09-14'), endDate: new Date('2026-09-15'), days: 2, leaveType: { code: 'MATERNITY' } },
        { startDate: new Date('2026-09-17'), endDate: new Date('2026-09-17'), days: 1, leaveType: { code: 'LOP' } },
      ],
      periodStart, periodEnd
    );
    expect(result).toBe(2);
  });

  it('pro-rates a Paid Holidays request spanning a period boundary', () => {
    const result = computePaidHolidayLeaveDaysFromRequests(
      [{ startDate: new Date('2026-09-29'), endDate: new Date('2026-10-02'), days: 4, leaveType: { code: 'MATERNITY' } }],
      periodStart, periodEnd
    );
    expect(result).toBe(2);
  });

  it('returns 0 for no requests', () => {
    expect(computePaidHolidayLeaveDaysFromRequests([], periodStart, periodEnd)).toBe(0);
  });
});

describe('computeTotalDaysFromHours — Regular + Overtime + Paid Holidays - LOP', () => {
  it('requirement example: 20 regular + 1 overtime + 1 paid holiday - 1 LOP = 21 (2 sick not counted)', () => {
    expect(computeTotalDaysFromHours(20, 1, 0, 1, 1)).toBe(21);
  });

  it('adds Paid Holidays from both the leave type and the holiday calendar', () => {
    expect(computeTotalDaysFromHours(20, 0, 1, 0, 2)).toBe(23);
  });

  it('deducts fractional LOP days', () => {
    expect(computeTotalDaysFromHours(20, 0, 0, 0.5)).toBe(19.5);
  });

  it('defaults the company holiday days to 0 when omitted', () => {
    expect(computeTotalDaysFromHours(20, 2, 0, 1)).toBe(21);
  });
});

// The 10 required cases, run through the same pipeline a Timesheet row
// uses (see buildTimesheetRow): leave requests -> display columns +
// Paid Holidays leave + LOP, company holiday calendar -> Total Days.
describe('Total Days — required cases (full row pipeline)', () => {
  const periodStart = new Date('2026-09-01');
  const periodEnd = new Date('2026-09-30');
  const employee = { dateOfJoining: null, dateOfLeaving: null };
  type Req = { startDate: Date; endDate: Date; days: number; leaveType: { code: string; isPaid: boolean } };
  const leave = (code: string, day: number, days = 1): Req => ({
    startDate: new Date(`2026-09-${String(day).padStart(2, '0')}`),
    endDate: new Date(`2026-09-${String(day + days - 1).padStart(2, '0')}`),
    days,
    leaveType: { code, isPaid: code !== 'LOP' },
  });
  const row = (regular: number, overtime: number, requests: Req[] = [], holidayDates: string[] = []) => {
    const cols = computeLeaveHoursFromRequests(requests, periodStart, periodEnd);
    const lopDays = computeAutoLopDaysFromRequests(requests.filter((r) => !r.leaveType.isPaid), periodStart, periodEnd);
    const companyHolidayDays = computePaidHolidayHours(holidayDates.map((d) => ({ date: new Date(d) })), periodStart, periodEnd, employee) / 8;
    const paidHolidayLeaveDays = computePaidHolidayLeaveDaysFromRequests(requests, periodStart, periodEnd);
    return {
      sickDays: cols.sickLeaveHours / 8,
      ptoDays: cols.ptoHours / 8,
      earnedDays: cols.earnedLeaveHours / 8,
      paidHolidayDays: cols.paidHolidayLeaveHours / 8 + companyHolidayDays,
      lopDays,
      totalDays: computeTotalDaysFromHours(regular, overtime, paidHolidayLeaveDays, lopDays, companyHolidayDays),
    };
  };

  it('1. Regular only: 20 -> 20', () => {
    expect(row(20, 0).totalDays).toBe(20);
  });
  it('2. Regular + Overtime: 20 + 2 -> 22', () => {
    expect(row(20, 2).totalDays).toBe(22);
  });
  it('3. Regular + Sick Leave: sick shown (2) but not counted -> 20', () => {
    const r = row(20, 0, [leave('SICK', 7, 2)]);
    expect(r.sickDays).toBe(2);
    expect(r.totalDays).toBe(20);
  });
  it('4. Regular + LOP: 20 - 1 -> 19', () => {
    const r = row(20, 0, [leave('LOP', 9)]);
    expect(r.lopDays).toBe(1);
    expect(r.totalDays).toBe(19);
  });
  it('5. Regular + Paid Holiday (calendar): 20 + 1 -> 21', () => {
    const r = row(20, 0, [], ['2026-09-15']);
    expect(r.paidHolidayDays).toBe(1);
    expect(r.totalDays).toBe(21);
  });
  it('6. Regular + Sick + LOP: 20 - 1 -> 19 (sick 2 shown only)', () => {
    const r = row(20, 0, [leave('SICK', 7, 2), leave('LOP', 9)]);
    expect(r.sickDays).toBe(2);
    expect(r.totalDays).toBe(19);
  });
  it('7. Regular + Sick + Paid Holiday: 20 + 1 -> 21 (sick 2 shown only)', () => {
    const r = row(20, 0, [leave('SICK', 7, 2)], ['2026-09-15']);
    expect(r.sickDays).toBe(2);
    expect(r.totalDays).toBe(21);
  });
  it('8. Regular + LOP + Paid Holiday: 20 + 1 - 1 -> 20', () => {
    expect(row(20, 0, [leave('LOP', 9)], ['2026-09-15']).totalDays).toBe(20);
  });
  it('9. Regular + Overtime + Sick + LOP + Paid Holiday (requirement example): 20 + 1 + 1 - 1 -> 21', () => {
    const r = row(20, 1, [leave('SICK', 7, 2), leave('LOP', 9)], ['2026-09-15']);
    expect(r.sickDays).toBe(2);
    expect(r.lopDays).toBe(1);
    expect(r.paidHolidayDays).toBe(1);
    expect(r.totalDays).toBe(21);
  });
  it('10. Multiple leave types: sick 2, PTO 1, earned 2, new type 1, Paid Holidays leave 1 + calendar 1, LOP 1.5 -> 20 + 2 - 1.5 = 20.5', () => {
    const r = row(20, 0, [
      leave('SICK', 3, 2), leave('CASUAL', 7), leave('EARNED', 10, 2), leave('MATERNITY', 14), leave('COMP_OFF', 16),
      { ...leave('LOP', 21, 2), days: 1.5 },
    ], ['2026-09-25']);
    expect([r.sickDays, r.ptoDays, r.earnedDays, r.paidHolidayDays, r.lopDays]).toEqual([2, 1, 2, 2, 1.5]);
    expect(r.totalDays).toBe(20.5);
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
