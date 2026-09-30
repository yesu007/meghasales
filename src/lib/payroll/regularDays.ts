import { Prisma, PrismaClient } from '@prisma/client';
import { buildDailyAttendanceRows, type DailyAttendanceRow } from './dailyAttendance';
import { resolveDayType } from './teamWeekOff';
import { loadTeamResolver, loadWeekOffConfig } from './weekOffConfig';

type Client = Prisma.TransactionClient | PrismaClient;

export interface AttendanceDayCounts {
  applicableDays: number; // days in the month, within employment, that aren't the employee's week off
  absentDays: number; // ABSENT days from attendance (never overlaps approved leave — those are ON_LEAVE)
  weekOffWorkedDays: number; // week offs with a login AND logout (Present · worked on week off)
  holidayWorkedDays: number; // paid holidays with a login AND logout, not on a week off (Present · worked on holiday)
  team: string | null; // alternate-Saturday team (TEAM_A | TEAM_B) as of the month's last day
}

interface EmployeeWindow {
  id: number;
  weekOffTeam: string | null;
  dateOfJoining: Date | null;
  dateOfLeaving: Date | null;
}

const toDay = (d: Date) => d.toISOString().slice(0, 10);

// Did the employee work a day they were entitled to have off? A Present row
// (login AND logout — device, or an approved manual correction) on their
// week off, or else on a paid holiday (a holiday that is also a week off
// counts once, as the week off). The one rule behind both the extra Regular
// Days and the Earned Leave credit (see computeEarnedLeaveDays).
export function workedDayKind(r: DailyAttendanceRow): 'WEEK_OFF' | 'HOLIDAY' | null {
  if (r.status !== 'PRESENT' || !r.loginTime || !r.logoutTime) return null;
  if (r.weekOffNote) return 'WEEK_OFF';
  if (r.holidayName) return 'HOLIDAY';
  return null;
}

// Earned Leave credited in `year` up to today: 1 day per week off or paid
// holiday the employee worked (workedDayKind). Earned Leave is earned by
// working, not a fixed quota.
export async function computeEarnedLeaveDays(employeeId: number, year: number, today: Date = new Date()): Promise<number> {
  const from = `${year}-01-01`;
  const end = `${year}-12-31`;
  const todayStr = toDay(today);
  const to = end < todayStr ? end : todayStr;
  if (to < from) return 0;
  const rows = await buildDailyAttendanceRows({ from, to, employeeId });
  return rows.filter((r) => workedDayKind(r) !== null).length;
}

// The attendance half of computeRegularDays (timesheetEngine.ts), for one
// month and any number of employees in one pass: applicable days by the
// same team-aware week-off rule as the attendance rows (teamWeekOff.ts),
// and Absent days straight from buildDailyAttendanceRows — no second copy
// of either rule. Employees whose attendance isn't tracked (no Login User
// ID, no manual attendance) simply have 0 Absent days.
export async function loadAttendanceDayCounts(client: Client, employees: EmployeeWindow[], year: number, month: number): Promise<Map<number, AttendanceDayCounts>> {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const from = `${monthStr}-01`;
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const lastDay = Number(to.slice(8, 10));
  const single = employees.length === 1 ? employees[0].id : null;

  const [config, teamOf, rows] = await Promise.all([
    loadWeekOffConfig(client),
    loadTeamResolver(client, employees, from, to),
    buildDailyAttendanceRows({ from, to, employeeId: single }),
  ]);

  const absentByEmployee = new Map<number, number>();
  const weekOffWorkedByEmployee = new Map<number, number>();
  const holidayWorkedByEmployee = new Map<number, number>();
  for (const r of rows) {
    if (r.status === 'ABSENT') absentByEmployee.set(r.employeeId, (absentByEmployee.get(r.employeeId) || 0) + 1);
    const worked = workedDayKind(r);
    if (worked === 'WEEK_OFF') weekOffWorkedByEmployee.set(r.employeeId, (weekOffWorkedByEmployee.get(r.employeeId) || 0) + 1);
    else if (worked === 'HOLIDAY') holidayWorkedByEmployee.set(r.employeeId, (holidayWorkedByEmployee.get(r.employeeId) || 0) + 1);
  }

  const out = new Map<number, AttendanceDayCounts>();
  for (const e of employees) {
    const joined = e.dateOfJoining ? toDay(e.dateOfJoining) : null;
    const left = e.dateOfLeaving ? toDay(e.dateOfLeaving) : null;
    let applicableDays = 0;
    for (let d = 1; d <= lastDay; d++) {
      const day = `${monthStr}-${String(d).padStart(2, '0')}`;
      if ((joined && day < joined) || (left && day > left)) continue;
      if (!resolveDayType(day, teamOf(e.id, day), config).weekOff) applicableDays++;
    }
    out.set(e.id, { applicableDays, absentDays: absentByEmployee.get(e.id) || 0, weekOffWorkedDays: weekOffWorkedByEmployee.get(e.id) || 0, holidayWorkedDays: holidayWorkedByEmployee.get(e.id) || 0, team: teamOf(e.id, to) });
  }
  return out;
}
