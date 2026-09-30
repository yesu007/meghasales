import { describe, expect, it } from 'vitest';
import {
  buildLoginLogoutRows, calculateDailyAttendance, deviceIdFromFileName, formatWorkingMinutes, roundWorkingMinutes,
  localToUtc, parseAttendanceLog, parseUserFile, parseUtcOffset, utcToLocal,
} from './attendanceLog';

const IST = 330;
const line = (id: string, ts: string, state = 0) => `${id.padStart(14, ' ')}\t${ts}\t1\t${state}\t1\t0`;

describe('parseAttendanceLog', () => {
  it('parses the device attlog format (right-aligned ID, CRLF, tab-separated)', () => {
    const text = [line('24', '2026-09-01 09:59:30', 0), line('24', '2026-09-01 20:25:32', 1)].join('\r\n') + '\r\n';
    const r = parseAttendanceLog(text, IST, new Date('2026-09-29T00:00:00Z'));
    expect(r.totalRecords).toBe(2);
    expect(r.invalid).toEqual([]);
    expect(r.punches[0]).toMatchObject({ accessControlId: '24', localDate: '2026-09-01', localTime: '09:59:30', punchType: 'IN', verifyMode: 1 });
    expect(r.punches[1].punchType).toBe('OUT');
    // 09:59:30 IST = 04:29:30 UTC
    expect(r.punches[0].punchAt.toISOString()).toBe('2026-09-01T04:29:30.000Z');
  });

  it('flags every kind of bad row with its line number, and skips blank lines', () => {
    const text = [
      line('1', '2026-09-01 10:00:00'),
      '',
      'garbage',
      line('1', '2026-02-30 10:00:00'),
      line('1', '2026-09-01 25:00:00'),
      line('1', '2026-09-01 10:00:00', 9),
      line('a-b', '2026-09-01 10:00:00'),
      line('1', '2027-01-01 10:00:00'),
    ].join('\n');
    const r = parseAttendanceLog(text, IST, new Date('2026-09-29T00:00:00Z'));
    expect(r.totalRecords).toBe(7);
    expect(r.punches).toHaveLength(1);
    expect(r.invalid.map((i) => i.line)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(r.invalid[3].reason).toMatch(/Unknown punch state/);
    expect(r.invalid[5].reason).toMatch(/future/);
  });
});

describe('parseUserFile', () => {
  it('reads userId/name from 72-byte records (userId is not always the uid)', () => {
    const rec = (uid: number, name: string, userId: string) => {
      const b = Buffer.alloc(72);
      b.writeUInt16LE(uid, 0);
      b.write(name, 11, 'latin1');
      b.write(userId, 48, 'latin1');
      return b;
    };
    const names = parseUserFile(Buffer.concat([rec(1, 'Rajesh', '1'), rec(40, 'Nitish', '38')]));
    expect(names.get('1')).toBe('Rajesh');
    expect(names.get('38')).toBe('Nitish');
    expect(names.has('40')).toBe(false);
  });

  it('ignores a file that is not a whole number of records', () => {
    expect(parseUserFile(Buffer.alloc(100)).size).toBe(0);
  });
});

describe('calculateDailyAttendance', () => {
  const at = (t: string) => localToUtc('2026-09-01', t, IST)!;

  it('login = first punch, logout = last punch, minutes = span to the nearest minute', () => {
    const r = calculateDailyAttendance([
      { punchAt: at('18:00:59'), punchType: 'IN' },
      { punchAt: at('10:08:41'), punchType: 'IN' },
      { punchAt: at('13:54:54'), punchType: 'OUT' },
    ]);
    expect(r.loginTime).toEqual(at('10:08:41'));
    expect(r.logoutTime).toEqual(at('18:00:59'));
    expect(r.totalWorkingMinutes).toBe(472); // 7 hr 52 min, as in the sample workbook
    // 09:56:56 → 18:46:48 is 8:49:52, which the sample workbook shows as 8 hr 50 min
    expect(calculateDailyAttendance([{ punchAt: at('09:56:56'), punchType: 'IN' }, { punchAt: at('18:46:48'), punchType: 'OUT' }]).totalWorkingMinutes).toBe(530);
    expect(r.status).toBe('PRESENT');
  });

  it('counts multiple IN→OUT sessions in a day; repeated INs and stray OUTs do not add sessions', () => {
    const r = calculateDailyAttendance([
      { punchAt: at('09:00:00'), punchType: 'IN' },
      { punchAt: at('09:01:00'), punchType: 'IN' },
      { punchAt: at('13:00:00'), punchType: 'OUT' },
      { punchAt: at('13:05:00'), punchType: 'OUT' },
      { punchAt: at('14:00:00'), punchType: 'IN' },
      { punchAt: at('18:00:00'), punchType: 'OUT' },
    ]);
    expect(r.sessionCount).toBe(2);
    expect(r.punchCount).toBe(6);
    expect(r.totalWorkingMinutes).toBe(540);
  });

  it('a single punch is INCOMPLETE with no logout and 0 minutes', () => {
    const r = calculateDailyAttendance([{ punchAt: at('10:12:20'), punchType: 'IN' }]);
    expect(r).toMatchObject({ logoutTime: null, totalWorkingMinutes: 0, sessionCount: 0, status: 'INCOMPLETE' });
  });
});

describe('buildLoginLogoutRows', () => {
  it('one row per ID per day, ordered by date then numeric ID, single punch repeats login', () => {
    const rows = buildLoginLogoutRows(
      [
        { accessControlId: '10', localDate: '2026-09-01', localTime: '11:08:08' },
        { accessControlId: '10', localDate: '2026-09-01', localTime: '11:03:55' },
        { accessControlId: '3', localDate: '2026-09-01', localTime: '10:12:20' },
        { accessControlId: '1', localDate: '2026-09-02', localTime: '10:00:00' },
      ],
      new Map([['3', 'karthigeyan'], ['10', 'Sheik']])
    );
    expect(rows).toEqual([
      { employeeId: '3', employeeName: 'karthigeyan', date: '2026-09-01', login: '10:12:20', logout: '10:12:20', hoursWorked: '0 hr 0 min' },
      { employeeId: '10', employeeName: 'Sheik', date: '2026-09-01', login: '11:03:55', logout: '11:08:08', hoursWorked: '0 hr 4 min' },
      { employeeId: '1', employeeName: '', date: '2026-09-02', login: '10:00:00', logout: '10:00:00', hoursWorked: '0 hr 0 min' },
    ]);
  });
});

describe('helpers', () => {
  it('parseUtcOffset', () => {
    expect(parseUtcOffset(undefined)).toBe(330);
    expect(parseUtcOffset('+05:30')).toBe(330);
    expect(parseUtcOffset('-04:00')).toBe(-240);
    expect(parseUtcOffset('0')).toBe(0);
  });
  it('utcToLocal round-trips localToUtc', () => {
    expect(utcToLocal(localToUtc('2026-09-01', '23:59:59', IST)!, IST)).toEqual({ date: '2026-09-01', time: '23:59:59' });
  });
  it('deviceIdFromFileName', () => {
    expect(deviceIdFromFileName('JJA1235300291_attlog.dat')).toBe('JJA1235300291');
  });
  it('roundWorkingMinutes: nearest minute, exact half rounds up', () => {
    expect(roundWorkingMinutes(8 * 3600 + 49 * 60 + 52)).toBe(530); // 8:49:52 → 8 hr 50 min
    expect(roundWorkingMinutes(7 * 3600 + 52 * 60 + 18)).toBe(472); // 7:52:18 → 7 hr 52 min
    expect(roundWorkingMinutes(16 * 60 + 30)).toBe(17);
    expect(roundWorkingMinutes(29)).toBe(0);
  });
  it('formatWorkingMinutes', () => {
    expect(formatWorkingMinutes(622)).toBe('10 hr 22 min');
  });
});
