// Access Control (ZKTeco-style) attendance log handling — pure functions
// only (no Prisma, no I/O), so parsing/validation/daily calculation can be
// unit-tested against the real device file format and reused by both the
// import pipeline (attendanceImport.ts) and the Excel export.
//
// Device files, as found in the sample drop:
//   <SERIAL>_attlog.dat — CRLF text, one punch per line, tab-separated:
//       <userId right-aligned with spaces>\t<YYYY-MM-DD HH:mm:ss>\t<verify>\t<state>\t<workcode>\t<reserved>
//     e.g. "            24\t2026-09-01 09:59:30\t1\t0\t1\t0"
//     state: 0 check-in, 1 check-out, 2 break-out, 3 break-in, 4 OT-in, 5 OT-out.
//     Timestamps are device-local wall-clock time (no zone).
//   user.dat — binary, fixed 72-byte records: uid u16le @0, privilege @2,
//     password @3 (8), name @11 (24, NUL-padded), card @35, group @39,
//     timezones @40, userId @48 (9, NUL-padded ASCII — the same ID the
//     attlog uses, which is NOT always equal to uid).

export const PUNCH_TYPES: Record<number, string> = {
  0: 'IN',
  1: 'OUT',
  2: 'BREAK_OUT',
  3: 'BREAK_IN',
  4: 'OT_IN',
  5: 'OT_OUT',
};
const IN_TYPES = new Set(['IN', 'BREAK_IN', 'OT_IN']);
const OUT_TYPES = new Set(['OUT', 'BREAK_OUT', 'OT_OUT']);

export interface ParsedPunch {
  line: number;
  accessControlId: string;
  localDate: string; // YYYY-MM-DD, device-local
  localTime: string; // HH:mm:ss, device-local
  punchAt: Date; // UTC instant
  punchType: string;
  verifyMode: number | null; // null for punches read from an uploaded Login/Logout workbook
}

export interface InvalidRow {
  line: number;
  reason: string;
  raw: string;
}

export interface ParseResult {
  punches: ParsedPunch[];
  invalid: InvalidRow[];
  totalRecords: number; // non-blank lines
}

// "+05:30" / "-04:00" / "330" (minutes) → minutes east of UTC. Defaults to
// IST, where the device is installed.
export function parseUtcOffset(value: string | undefined | null): number {
  const v = (value || '').trim();
  if (!v) return 330;
  const m = v.match(/^([+-])?(\d{1,2}):?(\d{2})$/);
  if (m) {
    const mins = parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    return m[1] === '-' ? -mins : mins;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 330;
}

export function deviceUtcOffsetMinutes(): number {
  return parseUtcOffset(process.env.ATTENDANCE_DEVICE_UTC_OFFSET);
}

const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const ACCESS_ID_RE = /^[A-Za-z0-9]{1,24}$/;

// Device-local wall-clock → UTC instant. Returns null for impossible dates
// (2026-02-30, 25:00:00, ...) rather than letting Date roll them over.
export function localToUtc(date: string, time: string, offsetMinutes: number): Date | null {
  const m = `${date} ${time}`.match(DATE_TIME_RE);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => parseInt(x, 10));
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || check.getUTCHours() !== h || check.getUTCMinutes() !== mi || check.getUTCSeconds() !== s) return null;
  return new Date(ms - offsetMinutes * 60_000);
}

const pad = (n: number) => String(n).padStart(2, '0');

// UTC instant → device-local { date, time } strings.
export function utcToLocal(at: Date, offsetMinutes: number): { date: string; time: string } {
  const d = new Date(at.getTime() + offsetMinutes * 60_000);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
  };
}

// UTC range covering device-local calendar days [fromDate, toDate].
export function localDayRangeUtc(fromDate: string, toDate: string, offsetMinutes: number): { start: Date; end: Date } {
  const start = localToUtc(fromDate, '00:00:00', offsetMinutes)!;
  const end = new Date(localToUtc(toDate, '00:00:00', offsetMinutes)!.getTime() + 86_400_000 - 1);
  return { start, end };
}

export function parseAttendanceLog(text: string, offsetMinutes: number, now: Date = new Date()): ParseResult {
  const punches: ParsedPunch[] = [];
  const invalid: InvalidRow[] = [];
  let totalRecords = 0;
  // A punch more than a day in the future means a mis-set device clock.
  const latestAllowed = now.getTime() + 86_400_000;
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const line = idx + 1;
    if (!rawLine.trim()) return;
    totalRecords++;
    const fail = (reason: string) => invalid.push({ line, reason, raw: rawLine.slice(0, 120) });

    const fields = rawLine.split('\t');
    if (fields.length < 4) return fail(`Expected at least 4 tab-separated fields, found ${fields.length}`);

    const accessControlId = fields[0].trim();
    if (!ACCESS_ID_RE.test(accessControlId)) return fail(`Invalid user ID "${accessControlId}"`);

    const dateTime = fields[1].trim();
    const dt = dateTime.match(DATE_TIME_RE);
    if (!dt) return fail(`Invalid timestamp "${dateTime}"`);
    const [localDate, localTime] = dateTime.split(' ');
    const punchAt = localToUtc(localDate, localTime, offsetMinutes);
    if (!punchAt) return fail(`Invalid timestamp "${dateTime}"`);
    if (parseInt(dt[1], 10) < 2000) return fail(`Timestamp year out of range "${dateTime}"`);
    if (punchAt.getTime() > latestAllowed) return fail(`Timestamp is in the future "${dateTime}"`);

    const verifyRaw = fields[2].trim();
    const verifyMode = /^\d+$/.test(verifyRaw) ? parseInt(verifyRaw, 10) : NaN;
    if (!Number.isFinite(verifyMode)) return fail(`Invalid verify mode "${verifyRaw}"`);

    const stateRaw = fields[3].trim();
    const punchType = /^\d+$/.test(stateRaw) ? PUNCH_TYPES[parseInt(stateRaw, 10)] : undefined;
    if (!punchType) return fail(`Unknown punch state "${stateRaw}"`);

    punches.push({ line, accessControlId, localDate, localTime, punchAt, punchType, verifyMode });
  });

  return { punches, invalid, totalRecords };
}

const USER_RECORD_SIZE = 72;

function readCString(buf: Buffer, start: number, length: number): string {
  const slice = buf.subarray(start, start + length);
  const nul = slice.indexOf(0);
  return (nul === -1 ? slice : slice.subarray(0, nul)).toString('latin1').trim();
}

// user.dat → Map<accessControlId, device name>. Only used to label rows in
// the generated workbook (the device's own name for each ID) and the
// unmatched-ID list — never to map a punch to an Employee.
export function parseUserFile(buf: Buffer): Map<string, string> {
  const names = new Map<string, string>();
  if (!buf || buf.length === 0 || buf.length % USER_RECORD_SIZE !== 0) return names;
  for (let off = 0; off < buf.length; off += USER_RECORD_SIZE) {
    const userId = readCString(buf, off + 48, 9);
    const name = readCString(buf, off + 11, 24);
    if (userId && ACCESS_ID_RE.test(userId)) names.set(userId, name);
  }
  return names;
}

// "JJA1235300291_attlog.dat" → "JJA1235300291" (the device serial number).
export function deviceIdFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() || fileName;
  const m = base.match(/^([A-Za-z0-9-]+)_attlog/i);
  return m ? m[1] : (process.env.ATTENDANCE_DEVICE_ID || 'ACCESS_CONTROL');
}

// Duplicate key for a punch: the same Login User ID at the same second is
// the same punch whichever file (device log or uploaded workbook) or device
// it arrived from — single-site deployment, one ID space.
export const punchKey = (accessControlId: string, punchAt: Date) => `${accessControlId}|${punchAt.getTime()}`;

export interface PunchForDay {
  punchAt: Date;
  punchType: string;
}

export interface DailyResult {
  loginTime: Date | null;
  logoutTime: Date | null;
  totalWorkingMinutes: number;
  sessionCount: number;
  punchCount: number;
  status: 'PRESENT' | 'INCOMPLETE';
}

// One employee's punches for one local day → the daily summary.
//   Login  = first punch of the day, Logout = last punch of the day,
//   Working minutes = Logout − Login, to the nearest minute —
//   exactly how the Login/Logout workbook HR works from computes it.
//   Sessions = IN→OUT pairs by the device's punch state (a repeated IN
//   keeps the earlier one open; an OUT with nothing open is ignored), so
//   several logins/logouts in one day are counted rather than collapsed.
//   A single punch has no logout: INCOMPLETE, 0 minutes.
export function calculateDailyAttendance(punches: PunchForDay[]): DailyResult {
  const sorted = [...punches].sort((a, b) => a.punchAt.getTime() - b.punchAt.getTime());
  if (sorted.length === 0) return { loginTime: null, logoutTime: null, totalWorkingMinutes: 0, sessionCount: 0, punchCount: 0, status: 'INCOMPLETE' };

  const first = sorted[0].punchAt;
  const last = sorted[sorted.length - 1].punchAt;
  let sessionCount = 0;
  let open = false;
  for (const p of sorted) {
    if (IN_TYPES.has(p.punchType)) open = true;
    else if (OUT_TYPES.has(p.punchType) && open) {
      sessionCount++;
      open = false;
    }
  }
  const single = sorted.length === 1;
  return {
    loginTime: first,
    logoutTime: single ? null : last,
    totalWorkingMinutes: single ? 0 : roundWorkingMinutes((last.getTime() - first.getTime()) / 1000),
    sessionCount,
    punchCount: sorted.length,
    status: single ? 'INCOMPLETE' : 'PRESENT',
  };
}

// Seconds → whole minutes, to the nearest minute (an exact half rounds up)
// — how the Login/Logout workbook HR uses shows Hours Worked.
export function roundWorkingMinutes(seconds: number): number {
  return Math.max(0, Math.round(Math.round(seconds) / 60));
}

export function formatWorkingMinutes(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  return `${Math.floor(m / 60)} hr ${m % 60} min`;
}

export interface LoginLogoutRow {
  employeeId: string; // the Access Control ID, as in the device
  employeeName: string;
  date: string;
  login: string;
  logout: string;
  hoursWorked: string;
}

// Normalized punches → the Login/Logout sheet rows: one per ID per local
// day, ordered by date then numeric ID (the sample workbook's order).
// Logout repeats Login for a single-punch day, as in that workbook.
export function buildLoginLogoutRows(punches: Pick<ParsedPunch, 'accessControlId' | 'localDate' | 'localTime'>[], names: Map<string, string>): LoginLogoutRow[] {
  const byKey = new Map<string, { id: string; date: string; first: string; last: string }>();
  for (const p of punches) {
    const key = `${p.accessControlId}|${p.localDate}`;
    const cur = byKey.get(key);
    if (!cur) byKey.set(key, { id: p.accessControlId, date: p.localDate, first: p.localTime, last: p.localTime });
    else {
      if (p.localTime < cur.first) cur.first = p.localTime;
      if (p.localTime > cur.last) cur.last = p.localTime;
    }
  }
  const toSec = (t: string) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + s; };
  const idOrder = (a: string, b: string) => {
    const na = Number(a), nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  };
  return Array.from(byKey.values())
    .sort((a, b) => (a.date === b.date ? idOrder(a.id, b.id) : a.date.localeCompare(b.date)))
    .map((r) => ({
      employeeId: r.id,
      employeeName: names.get(r.id) || '',
      date: r.date,
      login: r.first,
      logout: r.last,
      hoursWorked: formatWorkingMinutes(roundWorkingMinutes(toSec(r.last) - toSec(r.first))),
    }));
}
