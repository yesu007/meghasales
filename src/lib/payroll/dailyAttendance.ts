import prisma from '@/lib/prisma';
import { deviceUtcOffsetMinutes, formatWorkingMinutes, utcToLocal } from './attendanceLog';
import { timeToMinutes } from './manualAttendance';
import { resolveDayType } from './teamWeekOff';
import { loadTeamResolver, loadWeekOffConfig } from './weekOffConfig';

export interface DailyAttendanceRow {
  id: number; // DailyAttendanceSummary.id, or negative for a derived day
  employeeId: number;
  employeeCode: string;
  name: string;
  accessControlId: string | null;
  date: string; // YYYY-MM-DD
  loginTime: string | null; // HH:mm:ss — device-local, or as entered for a manual day
  logoutTime: string | null;
  totalWorkingMinutes: number;
  workingHours: string;
  sessionCount: number;
  punchCount: number;
  status: string; // PRESENT | INCOMPLETE | ABSENT | ON_LEAVE | HOLIDAY | WEEK_OFF
  source?: 'DEVICE' | 'MANUAL'; // set on PRESENT/INCOMPLETE rows
  leaveType?: string;
  holidayName?: string; // set on HOLIDAY rows, and on a worked day that is a paid holiday
  // On an ABSENT day: a manual attendance request that exists but doesn't
  // count (PENDING = awaiting approval, REJECTED = declined).
  manualStatus?: string;
  workLocation?: string | null; // manual days only
  // A Missing-logout device day corrected by approved manual attendance:
  // the device's own login, kept for audit (the punch data is never changed).
  deviceLoginTime?: string | null;
  // Set on WEEK_OFF rows and on a worked day that was a week off — e.g.
  // "Team A week off", "Carried forward from 03 Oct 2026", "Sunday".
  weekOffNote?: string;
  commonWorking?: boolean; // a Common Working Saturday (a scheduled team week-off everyone works)
  team?: string | null; // TEAM_A | TEAM_B the day was judged for, if any
}

const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`.replace(/\s+/g, ' ').trim();
const minDay = (...d: string[]) => d.sort()[0];
const maxDay = (...d: string[]) => d.sort()[d.length - 1];

// Daily attendance rows for [from, to] (inclusive YYYY-MM-DD dates), for one
// employee or everyone — shared by Payroll → Time & Attendance → Attendance
// Log (GET /api/payroll/attendance) and My Space → Attendance (GET
// /api/payroll/my-attendance), so both always show the same figures.
//
// Tracked employees are those with an Access Control ID (device) and/or at
// least one manual attendance request (e.g. working from another country).
// For each of their days, first match wins:
//   1. Device punches (DailyAttendanceSummary, from the Access Control
//      import — see attendanceImport.ts) → PRESENT / INCOMPLETE (Missing
//      logout). A Missing-logout day with an APPROVED manual attendance
//      request becomes PRESENT with the approved times (device login kept).
//   2. An APPROVED manual attendance request → PRESENT (source MANUAL).
//   3. A company paid holiday (Holiday Calendar) → HOLIDAY with its name,
//      across the whole range — holidays are known in advance.
//   4. A week off → WEEK_OFF, across the whole range: Sunday; for a Team A
//      / Team B employee, their team's alternate Saturday or a carried-
//      forward week-off (a Common Working Saturday is a working day); for
//      an employee with no team, the company Saturday policy. See
//      teamWeekOff.ts — the team is the employee's own, else their shift's.
//   5. An APPROVED leave request → ON_LEAVE (with its type).
//   6. Otherwise ABSENT — flagged with manualStatus when a manual request
//      exists but is still PENDING or was REJECTED.
// Steps 5–6 only apply to days the employee's data actually covers, so a
// gap before tracking started or a not-yet-synced day isn't an absence:
// for device data, first → last imported punch; for manual attendance,
// first → last request date; never past today, and always within the
// employee's joining/leaving dates.
export async function buildDailyAttendanceRows({ from, to, employeeId }: { from: string; to: string; employeeId?: number | null }): Promise<DailyAttendanceRow[]> {
  const gte = new Date(`${from}T00:00:00.000Z`);
  const lte = new Date(`${to}T00:00:00.000Z`);
  const empFilter = employeeId ? { employeeId } : {};

  const [summaries, employees, holidays, weekOffConfig, coverage, manualInRange, manualSpan] = await Promise.all([
    prisma.dailyAttendanceSummary.findMany({
      where: { attendanceDate: { gte, lte }, ...empFilter },
      include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, accessControlId: true } } },
      orderBy: [{ attendanceDate: 'desc' }, { employee: { firstName: 'asc' } }],
    }),
    prisma.employee.findMany({
      where: employeeId ? { id: employeeId } : undefined,
      select: { id: true, employeeCode: true, firstName: true, lastName: true, accessControlId: true, dateOfJoining: true, dateOfLeaving: true, weekOffTeam: true },
    }),
    prisma.paidHoliday.findMany({ where: { isActive: true, date: { gte, lte } }, select: { date: true, name: true } }),
    loadWeekOffConfig(prisma),
    prisma.attendancePunch.aggregate({ _min: { punchAt: true }, _max: { punchAt: true } }),
    prisma.manualAttendanceRequest.findMany({
      where: { attendanceDate: { gte, lte }, status: { in: ['PENDING', 'APPROVED', 'REJECTED'] }, ...empFilter },
      orderBy: { appliedAt: 'desc' },
    }),
    // Each employee's first/last manual request date (any status but
    // CANCELLED) — the window their manual attendance covers.
    prisma.manualAttendanceRequest.groupBy({
      by: ['employeeId'],
      where: { status: { not: 'CANCELLED' }, ...empFilter },
      _min: { attendanceDate: true },
      _max: { attendanceDate: true },
    }),
  ]);

  const offset = deviceUtcOffsetMinutes();
  const toDay = (d: Date) => d.toISOString().slice(0, 10);
  const today = utcToLocal(new Date(), offset).date;
  const holidayByDate = new Map(holidays.map((h) => [toDay(h.date), h.name]));
  const fmtTime = (d: Date | null) => (d ? utcToLocal(d, offset).time : null);
  const teamOf = await loadTeamResolver(prisma, employees, from, to);
  const dayType = (employeeId: number, day: string) => resolveDayType(day, teamOf(employeeId, day), weekOffConfig);
  const weekOffFields = (employeeId: number, day: string) => {
    const t = dayType(employeeId, day);
    return {
      ...(t.weekOff && t.note ? { weekOffNote: t.note } : {}),
      ...(t.commonWorking ? { commonWorking: true } : {}),
      team: teamOf(employeeId, day),
    };
  };
  const inEmployment = (e: { dateOfJoining: Date | null; dateOfLeaving: Date | null }, day: string) =>
    !(e.dateOfJoining && day < toDay(e.dateOfJoining)) && !(e.dateOfLeaving && day > toDay(e.dateOfLeaving));
  const spanByEmployee = new Map(manualSpan.map((m) => [m.employeeId, { first: toDay(m._min.attendanceDate!), last: toDay(m._max.attendanceDate!) }]));

  // Approved request per employee/day wins; otherwise the latest PENDING/REJECTED one is kept as the note.
  const manualByKey = new Map<string, (typeof manualInRange)[number]>();
  for (const r of manualInRange) {
    const key = `${r.employeeId}|${toDay(r.attendanceDate)}`;
    const cur = manualByKey.get(key);
    if (!cur || (r.status === 'APPROVED' && cur.status !== 'APPROVED')) manualByKey.set(key, r);
  }

  const rows: DailyAttendanceRow[] = summaries.map((s) => {
    const day = toDay(s.attendanceDate);
    const manual = manualByKey.get(`${s.employeeId}|${day}`);
    const deviceRow: DailyAttendanceRow = {
    id: s.id,
    employeeId: s.employeeId,
    employeeCode: s.employee.employeeCode,
    name: fullName(s.employee),
    accessControlId: s.employee.accessControlId,
    date: toDay(s.attendanceDate),
    loginTime: fmtTime(s.loginTime),
    logoutTime: fmtTime(s.logoutTime),
    totalWorkingMinutes: s.totalWorkingMinutes,
    workingHours: formatWorkingMinutes(s.totalWorkingMinutes),
    sessionCount: s.sessionCount,
    punchCount: s.punchCount,
    status: s.status,
    source: 'DEVICE',
    ...(holidayByDate.has(toDay(s.attendanceDate)) ? { holidayName: holidayByDate.get(toDay(s.attendanceDate)) } : {}),
    ...weekOffFields(s.employeeId, toDay(s.attendanceDate)),
    };
    // Missing logout (login punch only): an APPROVED manual attendance for
    // that date corrects it to Present with the approved times; PENDING or
    // REJECTED leaves it Missing logout, flagged. Device data is untouched.
    if (s.status === 'INCOMPLETE' && manual) {
      if (manual.status === 'APPROVED') {
        const minutes = timeToMinutes(manual.logoutTime) - timeToMinutes(manual.loginTime);
        return {
          ...deviceRow,
          loginTime: `${manual.loginTime}:00`, logoutTime: `${manual.logoutTime}:00`,
          totalWorkingMinutes: minutes, workingHours: formatWorkingMinutes(minutes), sessionCount: 1,
          status: 'PRESENT', source: 'MANUAL', workLocation: manual.workLocation, deviceLoginTime: deviceRow.loginTime,
        };
      }
      return { ...deviceRow, manualStatus: manual.status };
    }
    return deviceRow;
  });
  const done = new Set(rows.map((r) => `${r.employeeId}|${r.date}`));
  let synthetic = 0;
  const base = (e: (typeof employees)[number], day: string) => ({
    id: -(++synthetic), // synthetic — not a stored summary
    employeeId: e.id, employeeCode: e.employeeCode, name: fullName(e), accessControlId: e.accessControlId, date: day,
  });
  const empty = { loginTime: null, logoutTime: null, totalWorkingMinutes: 0, workingHours: formatWorkingMinutes(0), sessionCount: 0, punchCount: 0 };
  const deviceWindow = coverage._min.punchAt && coverage._max.punchAt
    ? { first: utcToLocal(coverage._min.punchAt, offset).date, last: utcToLocal(coverage._max.punchAt, offset).date }
    : null;

  const leaves = await prisma.leaveRequest.findMany({
    where: { status: 'APPROVED', startDate: { lte: new Date(`${to}T23:59:59.999Z`) }, endDate: { gte: new Date(`${from}T00:00:00.000Z`) }, ...empFilter },
    select: { employeeId: true, startDate: true, endDate: true, leaveType: { select: { name: true } } },
  });
  const leaveOn = (empId: number, day: string) =>
    leaves.find((l) => l.employeeId === empId && utcToLocal(l.startDate, offset).date <= day && day <= utcToLocal(l.endDate, offset).date);

  const days: string[] = [];
  for (let d = new Date(gte); toDay(d) <= to; d = new Date(d.getTime() + 86_400_000)) days.push(toDay(d));

  for (const e of employees) {
    const manualSpanForEmp = spanByEmployee.get(e.id);
    if (!e.accessControlId && !manualSpanForEmp) continue; // not attendance-tracked
    // Days Absent/On Leave may be counted for: union of the device and
    // manual windows that apply to this employee, capped at today.
    const windows = [e.accessControlId ? deviceWindow : null, manualSpanForEmp ?? null].filter((w): w is { first: string; last: string } => !!w);
    const coverFrom = windows.length ? minDay(...windows.map((w) => w.first)) : null;
    const coverTo = windows.length ? minDay(maxDay(...windows.map((w) => w.last)), today) : null;

    for (const day of days) {
      const key = `${e.id}|${day}`;
      if (done.has(key) || !inEmployment(e, day)) continue;
      const manual = manualByKey.get(key);
      if (manual?.status === 'APPROVED') {
        const minutes = timeToMinutes(manual.logoutTime) - timeToMinutes(manual.loginTime);
        rows.push({
          ...base(e, day), loginTime: `${manual.loginTime}:00`, logoutTime: `${manual.logoutTime}:00`,
          totalWorkingMinutes: minutes, workingHours: formatWorkingMinutes(minutes), sessionCount: 1, punchCount: 2,
          status: 'PRESENT', source: 'MANUAL', workLocation: manual.workLocation,
          ...(holidayByDate.has(day) ? { holidayName: holidayByDate.get(day) } : {}),
          ...weekOffFields(e.id, day),
        });
        continue;
      }
      if (holidayByDate.has(day)) { rows.push({ ...base(e, day), ...empty, status: 'HOLIDAY', holidayName: holidayByDate.get(day), team: teamOf(e.id, day) }); continue; }
      const t = dayType(e.id, day);
      if (t.weekOff) { rows.push({ ...base(e, day), ...empty, status: 'WEEK_OFF', weekOffNote: t.note ?? 'Week off', team: teamOf(e.id, day) }); continue; }
      if (!coverFrom || !coverTo || day < coverFrom || day > coverTo) continue;
      const leave = leaveOn(e.id, day);
      rows.push({
        ...base(e, day), ...empty, status: leave ? 'ON_LEAVE' : 'ABSENT', team: teamOf(e.id, day),
        ...(t.commonWorking ? { commonWorking: true } : {}),
        ...(leave ? { leaveType: leave.leaveType.name } : {}),
        ...(!leave && manual ? { manualStatus: manual.status } : {}),
      });
    }
  }

  return rows.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : b.date.localeCompare(a.date)));
}
