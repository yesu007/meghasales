import { describe, it, expect } from 'vitest';
import { computeLeaveHoursFromRequests, computePaidHolidayHours, computePaidHolidayLeaveDaysFromRequests, computePaidDays, computeRegularDays, computeTotalDays, effectiveRegularDays, isWeeklyOff } from './timesheetEngine';
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

describe('computeRegularDays / computeTotalDays — Regular = applicable − Absent − LOP; Total = Regular + Overtime', () => {
  it('requirement example: 22 applicable, 2 absent, 1 LOP → Regular 19; + 2 overtime → Total 21', () => {
    const regular = computeRegularDays({ applicableDays: 22, absentDays: 2, lopDays: 1 });
    expect(regular).toBe(19);
    expect(computeTotalDays(regular, 2)).toBe(21);
  });
  it('overtime never changes Regular, only Total', () => {
    expect(computeRegularDays({ applicableDays: 23, absentDays: 0, lopDays: 0 })).toBe(23);
    expect(computeTotalDays(23, 1)).toBe(24); // Balaji: 23 + 1
    expect(computeTotalDays(24, 2)).toBe(26); // Elakkiya: 24 + 2
  });
  it('Absent is excluded', () => {
    expect(computeRegularDays({ applicableDays: 24, absentDays: 3, lopDays: 0 })).toBe(21);
  });
  it('LOP is the only leave that deducts — fractional LOP too', () => {
    expect(computeRegularDays({ applicableDays: 24, absentDays: 0, lopDays: 0.5 })).toBe(23.5);
  });
  it('a worked week off (login + logout) adds 1 to Regular — and so to Total', () => {
    const regular = computeRegularDays({ applicableDays: 24, absentDays: 0, lopDays: 2, weekOffWorkedDays: 1 });
    expect(regular).toBe(23); // Elakkiya, Sept: 24 − 2 LOP + 1 worked Saturday
    expect(computeTotalDays(regular, 2)).toBe(25);
    expect(computeRegularDays({ applicableDays: 24, absentDays: 0, lopDays: 0 })).toBe(24); // none worked → unchanged
  });
  it('a worked paid holiday (login + logout) also adds 1 to Regular', () => {
    expect(computeRegularDays({ applicableDays: 24, absentDays: 1, lopDays: 0, holidayWorkedDays: 1 })).toBe(24);
    expect(computeRegularDays({ applicableDays: 24, absentDays: 0, lopDays: 0, weekOffWorkedDays: 1, holidayWorkedDays: 1 })).toBe(26);
  });
  it('Regular never goes below 0', () => {
    expect(computeRegularDays({ applicableDays: 2, absentDays: 2, lopDays: 1 })).toBe(0);
  });
});

describe('Regular Days — leave columns are display-only (full row pipeline)', () => {
  const periodStart = new Date('2026-09-01');
  const periodEnd = new Date('2026-09-30');
  type Req = { startDate: Date; endDate: Date; days: number; leaveType: { code: string; isPaid: boolean } };
  const leave = (code: string, day: number, days = 1): Req => ({
    startDate: new Date(`2026-09-${String(day).padStart(2, '0')}`),
    endDate: new Date(`2026-09-${String(day + days - 1).padStart(2, '0')}`),
    days,
    leaveType: { code, isPaid: code !== 'LOP' },
  });
  const row = (applicableDays: number, absentDays: number, overtimeDays: number, requests: Req[] = []) => {
    const cols = computeLeaveHoursFromRequests(requests, periodStart, periodEnd);
    const lopDays = computeAutoLopDaysFromRequests(requests.filter((r) => !r.leaveType.isPaid), periodStart, periodEnd);
    return {
      sickDays: cols.sickLeaveHours / 8,
      casualDays: cols.ptoHours / 8,
      earnedDays: cols.earnedLeaveHours / 8,
      paidHolidayLeaveDays: cols.paidHolidayLeaveHours / 8,
      lopDays,
      regularDays: computeRegularDays({ applicableDays, absentDays, lopDays }),
      totalDays: computeTotalDays(computeRegularDays({ applicableDays, absentDays, lopDays }), overtimeDays),
    };
  };

  it('22 applicable, Absent 2, LOP 1, Sick 1, Casual 1, Earned 1, Paid Holiday 1, Overtime 2 → Regular 19, Total 21', () => {
    const r = row(22, 2, 2, [leave('SICK', 7), leave('CASUAL', 8), leave('EARNED', 9), leave('MATERNITY', 10), leave('LOP', 11)]);
    expect([r.sickDays, r.casualDays, r.earnedDays, r.paidHolidayLeaveDays, r.lopDays]).toEqual([1, 1, 1, 1, 1]);
    expect(r.regularDays).toBe(19);
    expect(r.totalDays).toBe(21);
  });
  it('sick / casual / earned leave never change Regular Days', () => {
    expect(row(22, 0, 0, [leave('SICK', 7, 2), leave('CASUAL', 9), leave('EARNED', 14)]).regularDays).toBe(22);
  });
  it('only LOP deducts', () => {
    expect(row(22, 0, 0, [leave('SICK', 7), leave('LOP', 9, 2)]).regularDays).toBe(20);
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

describe('Regular Days override (HR edit)', () => {
  it('effectiveRegularDays: the override when set, else the calculated value', () => {
    expect(effectiveRegularDays(22, null)).toBe(22);
    expect(effectiveRegularDays(22, 24)).toBe(24);
    expect(effectiveRegularDays(22, 0)).toBe(0); // an explicit 0 is an override too
    expect(effectiveRegularDays(22, -3)).toBe(0);
  });
  it('computePaidDays: calendar − absent − LOP, adjusted by the edit, within 0…month', () => {
    const base = { calendarPayableDays: 29, absentDays: 2, calculatedRegular: 22, monthDays: 30 };
    expect(computePaidDays({ ...base, overrideRegular: null })).toBe(27); // no edit
    expect(computePaidDays({ ...base, overrideRegular: 24 })).toBe(29); // +2
    expect(computePaidDays({ ...base, overrideRegular: 20 })).toBe(25); // −2
    expect(computePaidDays({ ...base, overrideRegular: 40 })).toBe(30); // capped at the month
    expect(computePaidDays({ ...base, overrideRegular: 0 })).toBe(5);
    expect(computePaidDays({ calendarPayableDays: 3, absentDays: 3, calculatedRegular: 10, overrideRegular: 0, monthDays: 30 })).toBe(0); // never below 0
  });
});
