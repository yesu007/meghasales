// Team-based alternate Saturday week-offs — pure date logic (no Prisma), so
// the API routes, the attendance rows and the client pages all decide
// "is this a week off for this employee?" the same way.
//
// Two teams alternate Saturdays: starting from the configured Saturday
// (Statutory Settings → Team A's first week-off Saturday) Team A is off,
// the next Saturday Team B is off, and so on — for any month or year,
// nothing is date-specific. Days before that start date keep the company
// Saturday policy, so switching the rotation on never rewrites past
// attendance.
//
// A Common Working Saturday (Time & Attendance → Settings) pauses the
// rotation: both teams work it, and the alternation carries on from where
// it stopped — the team whose turn it was gets the next Saturday instead
// (its carried-forward week off), and every later Saturday shifts by one.
// Exactly one team is off on every other Saturday; nobody loses or gains
// a turn. Only the Common Working Saturday dates are stored — whose turn
// each one paused and where it carries to are derived from them, so they
// can never drift, duplicate or go missing.
//
// Employees with no team keep the company-wide Saturday policy
// (saturdayPolicy.ts), exactly as before.

import { isWeeklyOff, type SaturdayPolicy } from './saturdayPolicy';

export const WEEK_OFF_TEAMS = [
  { value: 'TEAM_A', label: 'Team A' },
  { value: 'TEAM_B', label: 'Team B' },
] as const;
export type WeekOffTeam = (typeof WEEK_OFF_TEAMS)[number]['value'];
export const isWeekOffTeam = (v: unknown): v is WeekOffTeam => v === 'TEAM_A' || v === 'TEAM_B';
export const teamLabel = (t: string | null | undefined) => WEEK_OFF_TEAMS.find((x) => x.value === t)?.label ?? null;
export const otherTeam = (t: WeekOffTeam): WeekOffTeam => (t === 'TEAM_A' ? 'TEAM_B' : 'TEAM_A');

export interface CommonWorkingDayConfig {
  id?: number; // DB id, when loaded from the database
  date: string; // YYYY-MM-DD, a Saturday — the only field the schedule is derived from
}

export interface WeekOffConfig {
  saturdayPolicy: SaturdayPolicy; // company rule, for employees with no team
  teamStartDate: string | null; // YYYY-MM-DD Saturday on which Team A is off; null = team rotation not configured
  commonWorkingDays: CommonWorkingDayConfig[];
}

export type WeekOffReason = 'SUNDAY' | 'COMPANY_SATURDAY' | 'TEAM_SATURDAY' | 'CARRY_FORWARD';

export interface DayType {
  weekOff: boolean;
  reason: WeekOffReason | null;
  commonWorking: boolean; // a scheduled team Saturday everyone works
  note: string | null; // human-readable, e.g. "Team A week off", "Carried forward from 03 Oct 2026"
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayMs = 86_400_000;
const toUtc = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
export const addDays = (day: string, n: number) => new Date(toUtc(day) + n * dayMs).toISOString().slice(0, 10);
export const weekday = (day: string) => new Date(toUtc(day)).getUTCDay(); // 0 = Sunday, 6 = Saturday
export const isSaturday = (day: string) => DATE_RE.test(day) && weekday(day) === 6;
const fmt = (day: string) => new Date(toUtc(day)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Which team has `saturday` off by the plain rotation, ignoring Common
// Working Saturdays. Whole weeks from the start Saturday: even → Team A,
// odd → Team B.
export function scheduledTeamOff(saturday: string, teamStartDate: string): WeekOffTeam {
  const weeks = Math.round((toUtc(saturday) - toUtc(teamStartDate)) / (7 * dayMs));
  return ((weeks % 2) + 2) % 2 === 0 ? 'TEAM_A' : 'TEAM_B';
}

const isCommon = (day: string, config: WeekOffConfig) => config.commonWorkingDays.some((c) => c.date === day);

// Whose turn `saturday` is once Common Working Saturdays are taken into
// account — each one on or after the start and before this Saturday pauses
// the rotation by a week. For a Common Working Saturday itself this is the
// team whose turn it paused. Null before the rotation starts.
export function teamTurnOnSaturday(saturday: string, config: WeekOffConfig): WeekOffTeam | null {
  if (!config.teamStartDate || saturday < config.teamStartDate) return null;
  const paused = config.commonWorkingDays.filter((c) => c.date >= config.teamStartDate! && c.date < saturday).length;
  const base = scheduledTeamOff(saturday, config.teamStartDate);
  return paused % 2 === 0 ? base : otherTeam(base);
}

// For each Common Working Saturday: whose turn it paused, and the Saturday
// that team gets instead (the next Saturday that isn't common too).
export function describeCommonWorkingDays(config: WeekOffConfig): { id?: number; date: string; team: WeekOffTeam; carryForwardDate: string }[] {
  return [...config.commonWorkingDays]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((c) => config.teamStartDate && c.date >= config.teamStartDate)
    .map((c) => {
      let carry = addDays(c.date, 7);
      while (isCommon(carry, config)) carry = addDays(carry, 7);
      return { id: c.id, date: c.date, team: teamTurnOnSaturday(c.date, config)!, carryForwardDate: carry };
    });
}

// Is `day` a week off for an employee of `team` (null = no team)?
export function resolveDayType(day: string, team: WeekOffTeam | null, config: WeekOffConfig): DayType {
  const wd = weekday(day);
  if (wd === 0) return { weekOff: true, reason: 'SUNDAY', commonWorking: false, note: 'Sunday' };

  if (team && config.teamStartDate && day >= config.teamStartDate) {
    if (wd !== 6) return { weekOff: false, reason: null, commonWorking: false, note: null };
    // A Common Working Saturday is a working day for both teams.
    if (isCommon(day, config)) return { weekOff: false, reason: null, commonWorking: true, note: 'Common working Saturday' };
    if (teamTurnOnSaturday(day, config) !== team) return { weekOff: false, reason: null, commonWorking: false, note: null };
    // Right after a run of Common Working Saturdays, this is the paused
    // team's carried-forward week off.
    let prev = addDays(day, -7);
    let firstPaused: string | null = null;
    while (prev >= config.teamStartDate && isCommon(prev, config)) { firstPaused = prev; prev = addDays(prev, -7); }
    if (firstPaused) return { weekOff: true, reason: 'CARRY_FORWARD', commonWorking: false, note: `Carried forward from ${fmt(firstPaused)}` };
    return { weekOff: true, reason: 'TEAM_SATURDAY', commonWorking: false, note: `${teamLabel(team)} week off` };
  }

  const [y, m, d] = day.split('-').map(Number);
  if (isWeeklyOff(new Date(y, m - 1, d), config.saturdayPolicy)) return { weekOff: true, reason: 'COMPANY_SATURDAY', commonWorking: false, note: 'Weekly off' };
  return { weekOff: false, reason: null, commonWorking: false, note: null };
}

// Validates a new Common Working Saturday. Returns an error message, or
// whose turn it pauses and the Saturday that team gets instead.
export function validateCommonWorkingDay(date: string, config: WeekOffConfig): { error: string } | { team: WeekOffTeam; carryForwardDate: string } {
  if (!config.teamStartDate) return { error: 'Set "Team A\'s first week-off Saturday" in Statutory Settings first' };
  if (!isSaturday(date)) return { error: 'A Common Working Day must be a Saturday' };
  if (date < config.teamStartDate) return { error: 'That Saturday is before the Team A / Team B rotation starts' };
  if (isCommon(date, config)) return { error: 'This Saturday is already a Common Working Day' };
  const withNew: WeekOffConfig = { ...config, commonWorkingDays: [...config.commonWorkingDays, { date }] };
  const row = describeCommonWorkingDays(withNew).find((c) => c.date === date)!;
  return { team: row.team, carryForwardDate: row.carryForwardDate };
}
