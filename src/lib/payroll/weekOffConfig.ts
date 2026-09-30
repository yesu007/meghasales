import { Prisma, PrismaClient } from '@prisma/client';
import { describeCommonWorkingDays, isWeekOffTeam, type WeekOffConfig, type WeekOffTeam } from './teamWeekOff';
import type { SaturdayPolicy } from './saturdayPolicy';

type Client = Prisma.TransactionClient | PrismaClient;

const toDay = (d: Date) => d.toISOString().slice(0, 10);

// Everything resolveDayType needs, from the DB: the company Saturday
// policy, the team rotation start, and every Common Working Saturday date.
export async function loadWeekOffConfig(client: Client): Promise<WeekOffConfig> {
  const [profile, common] = await Promise.all([
    client.companyProfile.findFirst({ select: { weeklyOffSaturdays: true, teamWeekOffStartDate: true } }),
    client.commonWorkingDay.findMany({ select: { id: true, date: true }, orderBy: { date: 'asc' } }),
  ]);
  return {
    saturdayPolicy: (profile?.weeklyOffSaturdays || 'SECOND_FOURTH') as SaturdayPolicy,
    teamStartDate: profile?.teamWeekOffStartDate ? toDay(profile.teamWeekOffStartDate) : null,
    commonWorkingDays: common.map((c) => ({ id: c.id, date: toDay(c.date) })),
  };
}

// Returns (employeeId, day) → the employee's week-off team on that day:
// the team on the shift assignment effective that day (Shift Master →
// Employee Shift and Team Assignment — dated, so past periods keep the team
// they had), else the employee's own Employee.weekOffTeam, else null.
// Assignments are loaded once for the whole range, not per day.
export async function loadTeamResolver(client: Client, employees: { id: number; weekOffTeam: string | null }[], from: string, to: string) {
  const ids = employees.map((e) => e.id);
  const assignments = ids.length
    ? await client.employeeShiftAssignment.findMany({
        where: {
          employeeId: { in: ids },
          effectiveFrom: { lte: new Date(`${to}T23:59:59.999Z`) },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(`${from}T00:00:00.000Z`) } }],
        },
        select: { employeeId: true, effectiveFrom: true, effectiveTo: true, weekOffTeam: true },
        orderBy: { effectiveFrom: 'desc' },
      })
    : [];
  const own = new Map(employees.map((e) => [e.id, isWeekOffTeam(e.weekOffTeam) ? e.weekOffTeam : null]));
  return (employeeId: number, day: string): WeekOffTeam | null => {
    // Most recent effectiveFrom whose window contains `day` — same rule as resolveShiftForEmployeeOnDate.
    const a = assignments.find((x) => x.employeeId === employeeId && toDay(x.effectiveFrom) <= day && (!x.effectiveTo || toDay(x.effectiveTo) >= day));
    if (a && isWeekOffTeam(a.weekOffTeam)) return a.weekOffTeam;
    return own.get(employeeId) ?? null;
  };
}

// Re-derives and stores whose turn each Common Working Saturday paused and
// where it carried to (describeCommonWorkingDays) — called after any add or
// delete, since one Saturday changes the rotation for every later one.
export async function refreshCommonWorkingDays(client: Client): Promise<void> {
  const config = await loadWeekOffConfig(client);
  for (const c of describeCommonWorkingDays(config)) {
    if (c.id == null) continue;
    await client.commonWorkingDay.update({ where: { id: c.id }, data: { team: c.team, carryForwardDate: new Date(`${c.carryForwardDate}T00:00:00.000Z`) } });
  }
}
