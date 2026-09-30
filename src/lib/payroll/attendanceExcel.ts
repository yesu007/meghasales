import ExcelJS from 'exceljs';
import { localToUtc, type InvalidRow, type LoginLogoutRow, type ParseResult } from './attendanceLog';

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Same layout as the Login/Logout workbook HR already uses: a single
// "Login Logout" sheet, one plain-text row per ID per day.
export async function buildLoginLogoutWorkbook(rows: LoginLogoutRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Login Logout');
  ws.columns = [
    { header: 'Employee ID', key: 'employeeId', width: 12.83 },
    { header: 'Employee Name', key: 'employeeName', width: 14.83 },
    { header: 'Date', key: 'date', width: 12.83 },
    { header: 'Login', key: 'login', width: 10.83 },
    { header: 'Logout', key: 'logout', width: 10.83 },
    { header: 'Hours Worked', key: 'hoursWorked', width: 14.83 },
  ];
  ws.addRows(rows);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Header text (lower-cased, spaces collapsed) → column role. "Employee ID"
// in this sheet is the Login User ID from the device, not the CRM code.
const HEADER_ROLES: Record<string, 'id' | 'name' | 'date' | 'login' | 'logout'> = {
  'employee id': 'id', 'login user id': 'id', 'user id': 'id',
  'employee name': 'name', name: 'name',
  date: 'date',
  login: 'login', 'login time': 'login',
  logout: 'logout', 'logout time': 'logout',
};
const ID_RE = /^[A-Za-z0-9]{1,24}$/;
const pad = (n: number) => String(n).padStart(2, '0');

// exceljs hands back strings, numbers, Dates, or rich-text/formula objects.
function cellValue(v: ExcelJS.CellValue): string | number | Date | null {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) return v;
  if (typeof v === 'boolean') return String(v);
  const o = v as any;
  if (Array.isArray(o.richText)) return o.richText.map((t: { text: string }) => t.text).join('');
  if ('result' in o) return cellValue(o.result);
  if ('text' in o) return String(o.text);
  return null;
}

function dateFromParts(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// → "YYYY-MM-DD". Accepts the sample's text dates, real Excel dates, and
// DD-MM-YYYY / DD/MM/YYYY (day first, as typed in India).
export function normalizeExcelDate(raw: string | number | Date | null): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return dateFromParts(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  if (typeof raw === 'number') {
    const dt = new Date(Math.round((raw - 25569) * 86_400_000));
    return dateFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return dateFromParts(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return dateFromParts(+m[3], +m[2], +m[1]);
  return null;
}

// → "HH:mm:ss". Accepts "10:08:41", "10:08", "6:05 PM", real Excel times
// (Date on 1899-12-30, or a day fraction).
export function normalizeExcelTime(raw: string | number | Date | null): string | null {
  if (raw == null || raw === '') return null;
  let secs: number;
  if (raw instanceof Date) secs = raw.getUTCHours() * 3600 + raw.getUTCMinutes() * 60 + raw.getUTCSeconds();
  else if (typeof raw === 'number') {
    if (raw < 0 || raw >= 1) return null;
    secs = Math.round(raw * 86_400);
  } else {
    const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
    if (!m) return null;
    let h = +m[1];
    const mi = +m[2], s = m[3] ? +m[3] : 0;
    if (m[4]) {
      if (h < 1 || h > 12) return null;
      h = (h % 12) + (m[4].toUpperCase() === 'PM' ? 12 : 0);
    }
    if (h > 23 || mi > 59 || s > 59) return null;
    secs = h * 3600 + mi * 60 + s;
  }
  if (secs >= 86_400) return null;
  return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
}

// Manual upload format — the Login/Logout workbook (Employee ID, Employee
// Name, Date, Login, Logout, Hours Worked). Each row becomes an IN punch at
// Login and an OUT punch at Logout (just one punch when they're equal or
// Logout is blank), so it flows through the same pipeline as a device log.
// Hours Worked is ignored and recalculated. `line` is the sheet row number.
export async function parseLoginLogoutWorkbook(content: Buffer, offsetMinutes: number, now: Date = new Date()): Promise<ParseResult & { names: Map<string, string> }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(content as any);
  } catch {
    throw new Error('File is not a readable .xlsx workbook');
  }

  // First sheet with a recognisable header row in its first 10 rows.
  let ws: ExcelJS.Worksheet | undefined;
  let headerRow = 0;
  const cols: Partial<Record<'id' | 'name' | 'date' | 'login' | 'logout', number>> = {};
  for (const sheet of wb.worksheets) {
    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
      const found: typeof cols = {};
      sheet.getRow(r).eachCell((cell, col) => {
        const role = HEADER_ROLES[String(cellValue(cell.value) ?? '').trim().toLowerCase().replace(/\s+/g, ' ')];
        if (role && found[role] == null) found[role] = col;
      });
      if (found.id && found.date && found.login) { ws = sheet; headerRow = r; Object.assign(cols, found); break; }
    }
    if (ws) break;
  }
  if (!ws) throw new Error('Could not find the header row — the sheet needs "Employee ID", "Date" and "Login" columns (Logout and Employee Name are optional)');

  const punches: ParseResult['punches'] = [];
  const invalid: InvalidRow[] = [];
  const names = new Map<string, string>();
  const latestAllowed = now.getTime() + 86_400_000;
  let totalRecords = 0;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (role: keyof typeof cols) => (cols[role] ? cellValue(row.getCell(cols[role]!).value) : null);
    const rawId = get('id'), rawDate = get('date'), rawLogin = get('login'), rawLogout = get('logout'), rawName = get('name');
    if ([rawId, rawDate, rawLogin, rawLogout].every((v) => v == null || String(v).trim() === '')) continue;
    totalRecords++;
    const rawText = [rawId, rawName, rawDate, rawLogin, rawLogout].map((v) => (v instanceof Date ? v.toISOString() : v ?? '')).join(' | ');
    const fail = (reason: string) => invalid.push({ line: r, reason, raw: rawText.slice(0, 120) });

    const accessControlId = String(rawId ?? '').trim().replace(/\.0+$/, '');
    if (!ID_RE.test(accessControlId)) { fail(`Invalid Employee ID "${accessControlId}"`); continue; }
    const localDate = normalizeExcelDate(rawDate);
    if (!localDate) { fail(`Invalid date "${rawDate instanceof Date ? rawDate.toISOString() : rawDate ?? ''}"`); continue; }
    const login = normalizeExcelTime(rawLogin);
    if (!login) { fail(`Invalid login time "${rawLogin instanceof Date ? rawLogin.toISOString() : rawLogin ?? ''}"`); continue; }
    const hasLogout = rawLogout != null && String(rawLogout).trim() !== '';
    const logout = hasLogout ? normalizeExcelTime(rawLogout) : null;
    if (hasLogout && !logout) { fail(`Invalid logout time "${rawLogout instanceof Date ? rawLogout.toISOString() : rawLogout}"`); continue; }
    if (logout && logout < login) { fail(`Logout ${logout} is before login ${login}`); continue; }
    if (parseInt(localDate.slice(0, 4), 10) < 2000) { fail(`Date out of range "${localDate}"`); continue; }

    const loginAt = localToUtc(localDate, login, offsetMinutes)!;
    const logoutAt = logout ? localToUtc(localDate, logout, offsetMinutes)! : null;
    if ((logoutAt ?? loginAt).getTime() > latestAllowed) { fail(`Date is in the future "${localDate}"`); continue; }

    if (rawName != null && String(rawName).trim()) names.set(accessControlId, String(rawName).trim());
    punches.push({ line: r, accessControlId, localDate, localTime: login, punchAt: loginAt, punchType: 'IN', verifyMode: null });
    if (logout && logoutAt && logout !== login) {
      punches.push({ line: r, accessControlId, localDate, localTime: logout, punchAt: logoutAt, punchType: 'OUT', verifyMode: null });
    }
  }

  return { punches, invalid, totalRecords, names };
}
