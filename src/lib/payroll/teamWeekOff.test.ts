import { describe, expect, it } from 'vitest';
import { describeCommonWorkingDays, resolveDayType, scheduledTeamOff, teamTurnOnSaturday, validateCommonWorkingDay, type WeekOffConfig } from './teamWeekOff';

const base: WeekOffConfig = { saturdayPolicy: 'SECOND_FOURTH', teamStartDate: '2026-10-03', commonWorkingDays: [] };
const off = (day: string, team: 'TEAM_A' | 'TEAM_B' | null, cfg = base) => resolveDayType(day, team, cfg).weekOff;
const withCommon = (...dates: string[]): WeekOffConfig => ({ ...base, commonWorkingDays: dates.map((date, i) => ({ id: i + 1, date })) });
// "A" / "B" / "-" (both work) for each Saturday in the list
const saturdays = (cfg: WeekOffConfig, days: string[]) =>
  days.map((d) => (off(d, 'TEAM_A', cfg) && off(d, 'TEAM_B', cfg) ? 'AB' : off(d, 'TEAM_A', cfg) ? 'A' : off(d, 'TEAM_B', cfg) ? 'B' : '-')).join(' ');
const OCT = ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31'];
const nextWeek = (d: string) => new Date(Date.parse(d) + 7 * 86_400_000).toISOString().slice(0, 10);

describe('scheduledTeamOff — plain alternation', () => {
  it('Team A on the start Saturday, then alternates', () => {
    expect(OCT.map((d) => scheduledTeamOff(d, '2026-10-03'))).toEqual(['TEAM_A', 'TEAM_B', 'TEAM_A', 'TEAM_B', 'TEAM_A']);
  });
  it('keeps alternating across month and year changes', () => {
    expect(scheduledTeamOff('2026-11-07', '2026-10-03')).toBe('TEAM_B');
    expect(scheduledTeamOff('2026-12-26', '2026-10-03')).toBe('TEAM_A'); // 12 weeks
    expect(scheduledTeamOff('2027-01-02', '2026-10-03')).toBe('TEAM_B'); // 13 weeks — year change
  });
});

describe('resolveDayType — no Common Working Saturdays', () => {
  it('3 Oct: Team A off, Team B works; 10 Oct: the opposite', () => {
    expect(resolveDayType('2026-10-03', 'TEAM_A', base)).toMatchObject({ weekOff: true, reason: 'TEAM_SATURDAY', note: 'Team A week off' });
    expect(off('2026-10-03', 'TEAM_B')).toBe(false);
    expect(off('2026-10-10', 'TEAM_A')).toBe(false);
    expect(off('2026-10-10', 'TEAM_B')).toBe(true);
    expect(saturdays(base, OCT)).toBe('A B A B A');
  });
  it('Sundays are off for everyone; weekdays are working for everyone', () => {
    for (const t of ['TEAM_A', 'TEAM_B', null] as const) {
      expect(off('2026-10-04', t)).toBe(true);
      expect(off('2026-10-07', t)).toBe(false);
    }
  });
  it('no team → the company Saturday policy, unchanged (2nd/4th Saturday)', () => {
    expect(off('2026-10-03', null)).toBe(false);
    expect(resolveDayType('2026-10-10', null, base)).toMatchObject({ weekOff: true, reason: 'COMPANY_SATURDAY' });
    expect(off('2026-10-17', null)).toBe(false);
    expect(off('2026-10-24', null)).toBe(true);
  });
  it('before the rotation start date, team members keep the company policy (past attendance unchanged)', () => {
    expect(off('2026-09-26', 'TEAM_B')).toBe(true);
    expect(off('2026-09-19', 'TEAM_A')).toBe(false);
    expect(off('2026-09-12', 'TEAM_A')).toBe(true);
  });
  it('rotation not configured → teams fall back to the company policy', () => {
    const cfg = { ...base, teamStartDate: null };
    expect(off('2026-10-03', 'TEAM_A', cfg)).toBe(false);
    expect(off('2026-10-10', 'TEAM_A', cfg)).toBe(true);
  });
});

describe('Common Working Saturday pauses the rotation', () => {
  it('3 Oct common: both work; Team A (whose turn it was) gets 10 Oct; Team B works 10 Oct and the rotation shifts one week', () => {
    const cfg = withCommon('2026-10-03');
    expect(resolveDayType('2026-10-03', 'TEAM_A', cfg)).toMatchObject({ weekOff: false, commonWorking: true });
    expect(resolveDayType('2026-10-03', 'TEAM_B', cfg)).toMatchObject({ weekOff: false, commonWorking: true });
    expect(resolveDayType('2026-10-10', 'TEAM_A', cfg)).toMatchObject({ weekOff: true, reason: 'CARRY_FORWARD', note: 'Carried forward from 03 Oct 2026' });
    expect(off('2026-10-10', 'TEAM_B', cfg)).toBe(false); // Team B does NOT get the carry-forward — it works
    expect(saturdays(cfg, OCT)).toBe('- A B A B');
  });
  it('exactly one team is off on every non-common Saturday — never both, never neither', () => {
    const cfg = withCommon('2026-10-03', '2026-10-24', '2026-11-14');
    for (let d = '2026-10-03'; d <= '2027-03-27'; d = nextWeek(d)) {
      const a = off(d, 'TEAM_A', cfg), b = off(d, 'TEAM_B', cfg);
      if (cfg.commonWorkingDays.some((c) => c.date === d)) expect([a, b]).toEqual([false, false]);
      else expect(a !== b).toBe(true);
    }
  });
  it("a common Saturday on Team B's turn gives Team B the next Saturday", () => {
    const cfg = withCommon('2026-10-10');
    expect(saturdays(cfg, OCT)).toBe('A - B A B');
    expect(resolveDayType('2026-10-17', 'TEAM_B', cfg).reason).toBe('CARRY_FORWARD');
  });
  it('two common Saturdays in a row: the paused team still gets the next Saturday — nothing duplicated or lost', () => {
    const cfg = withCommon('2026-10-03', '2026-10-10');
    expect(saturdays(cfg, OCT)).toBe('- - A B A');
    expect(resolveDayType('2026-10-17', 'TEAM_A', cfg).note).toBe('Carried forward from 03 Oct 2026');
  });
  it('after the carried-forward Saturday, the normal alternation continues (shifted)', () => {
    const cfg = withCommon('2026-10-03');
    expect(resolveDayType('2026-10-17', 'TEAM_B', cfg)).toMatchObject({ weekOff: true, reason: 'TEAM_SATURDAY' });
    expect(resolveDayType('2026-10-24', 'TEAM_A', cfg)).toMatchObject({ weekOff: true, reason: 'TEAM_SATURDAY' });
  });
  it('turns stay fair: each team gets the same number of Saturdays off over time (±1)', () => {
    const cfg = withCommon('2026-10-03', '2026-10-24', '2026-11-14', '2026-12-05');
    let a = 0, b = 0;
    for (let d = '2026-10-03'; d <= '2027-03-27'; d = nextWeek(d)) {
      if (off(d, 'TEAM_A', cfg)) a++;
      if (off(d, 'TEAM_B', cfg)) b++;
    }
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });
  it('carry-forward is never global: weekdays and employees without a team are unaffected', () => {
    const cfg = withCommon('2026-10-03');
    expect(off('2026-10-07', 'TEAM_A', cfg)).toBe(false);
    expect(off('2026-10-10', null, cfg)).toBe(true); // company 2nd Saturday, as before
    expect(off('2026-10-17', null, cfg)).toBe(false);
  });
});

describe('describeCommonWorkingDays / teamTurnOnSaturday — tracked per team', () => {
  it('records whose turn each common Saturday paused and where it carries to', () => {
    expect(describeCommonWorkingDays(withCommon('2026-10-03'))).toEqual([{ id: 1, date: '2026-10-03', team: 'TEAM_A', carryForwardDate: '2026-10-10' }]);
    expect(describeCommonWorkingDays(withCommon('2026-10-03', '2026-10-10'))).toEqual([
      { id: 1, date: '2026-10-03', team: 'TEAM_A', carryForwardDate: '2026-10-17' },
      { id: 2, date: '2026-10-10', team: 'TEAM_A', carryForwardDate: '2026-10-17' }, // still Team A's turn — paused again
    ]);
  });
  it('teamTurnOnSaturday counts only non-common Saturdays', () => {
    const cfg = withCommon('2026-10-03');
    expect(OCT.map((d) => teamTurnOnSaturday(d, cfg))).toEqual(['TEAM_A', 'TEAM_A', 'TEAM_B', 'TEAM_A', 'TEAM_B']);
    expect(teamTurnOnSaturday('2026-09-26', cfg)).toBeNull(); // before the rotation starts
  });
});

describe('validateCommonWorkingDay', () => {
  it('accepts a Saturday in the rotation and reports whose turn it pauses', () => {
    expect(validateCommonWorkingDay('2026-10-03', base)).toEqual({ team: 'TEAM_A', carryForwardDate: '2026-10-10' });
    expect(validateCommonWorkingDay('2026-10-10', withCommon('2026-10-03'))).toEqual({ team: 'TEAM_A', carryForwardDate: '2026-10-17' });
  });
  it('rejects bad input', () => {
    const err = (d: string, cfg = base) => { const r = validateCommonWorkingDay(d, cfg); return 'error' in r ? r.error : ''; };
    expect(err('2026-10-05')).toMatch(/must be a Saturday/);
    expect(err('2026-09-26')).toMatch(/before the Team A \/ Team B rotation starts/);
    expect(err('2026-10-03', withCommon('2026-10-03'))).toMatch(/already a Common Working Day/);
    expect(err('2026-10-10', { ...base, teamStartDate: null })).toMatch(/Statutory Settings/);
  });
});
