import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildLoginLogoutWorkbook, normalizeExcelDate, normalizeExcelTime, parseLoginLogoutWorkbook } from './attendanceExcel';

const IST = 330;
const NOW = new Date('2026-09-29T00:00:00Z');

async function workbook(rows: unknown[][], header = ['Employee ID', 'Employee Name', 'Date', 'Login', 'Logout', 'Hours Worked']): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Login Logout');
  ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('normalizeExcelDate / normalizeExcelTime', () => {
  it('accepts text, real Excel dates/times and day-first dates', () => {
    expect(normalizeExcelDate('2026-09-01')).toBe('2026-09-01');
    expect(normalizeExcelDate('01/09/2026')).toBe('2026-09-01');
    expect(normalizeExcelDate(new Date(Date.UTC(2026, 8, 1)))).toBe('2026-09-01');
    expect(normalizeExcelDate(46266)).toBe('2026-09-01'); // Excel serial
    expect(normalizeExcelDate('2026-02-30')).toBeNull();
    expect(normalizeExcelTime('10:08:41')).toBe('10:08:41');
    expect(normalizeExcelTime('9:05')).toBe('09:05:00');
    expect(normalizeExcelTime('6:05 PM')).toBe('18:05:00');
    expect(normalizeExcelTime(new Date(Date.UTC(1899, 11, 30, 18, 0, 59)))).toBe('18:00:59');
    expect(normalizeExcelTime(0.5)).toBe('12:00:00');
    expect(normalizeExcelTime('25:00')).toBeNull();
  });
});

describe('parseLoginLogoutWorkbook', () => {
  it('reads the Login/Logout workbook into an IN + OUT punch per row', async () => {
    const buf = await workbook([
      ['1', 'Rajesh', '2026-09-01', '10:08:41', '18:00:59', '7 hr 52 min'],
      ['3', 'karthigeyan', '2026-09-01', '10:12:20', '10:12:20', '0 hr 0 min'],
    ]);
    const r = await parseLoginLogoutWorkbook(buf, IST, NOW);
    expect(r.totalRecords).toBe(2);
    expect(r.invalid).toEqual([]);
    expect(r.punches.map((p) => [p.line, p.accessControlId, p.localTime, p.punchType])).toEqual([
      [2, '1', '10:08:41', 'IN'],
      [2, '1', '18:00:59', 'OUT'],
      [3, '3', '10:12:20', 'IN'], // login == logout → a single punch
    ]);
    expect(r.punches[0].punchAt.toISOString()).toBe('2026-09-01T04:38:41.000Z');
    expect(r.names.get('3')).toBe('karthigeyan');
  });

  it('round-trips the workbook this app generates', async () => {
    const buf = await buildLoginLogoutWorkbook([{ employeeId: '24', employeeName: 'Elakkiya', date: '2026-09-02', login: '09:54:37', logout: '19:57:07', hoursWorked: '10 hr 3 min' }]);
    const r = await parseLoginLogoutWorkbook(buf, IST, NOW);
    expect(r.punches.map((p) => p.localTime)).toEqual(['09:54:37', '19:57:07']);
  });

  it('accepts real Excel date/time cells and numeric IDs', async () => {
    const buf = await workbook([[24, 'Elakkiya', new Date(Date.UTC(2026, 8, 2)), new Date(Date.UTC(1899, 11, 30, 9, 54, 37)), new Date(Date.UTC(1899, 11, 30, 19, 57, 7))]]);
    const r = await parseLoginLogoutWorkbook(buf, IST, NOW);
    expect(r.invalid).toEqual([]);
    expect(r.punches.map((p) => [p.accessControlId, p.localDate, p.localTime])).toEqual([['24', '2026-09-02', '09:54:37'], ['24', '2026-09-02', '19:57:07']]);
  });

  it('flags bad rows by sheet row number and skips blank rows', async () => {
    const buf = await workbook([
      ['1', 'A', '2026-09-01', '10:00:00', '09:00:00'],
      [],
      ['', 'B', '2026-09-01', '10:00:00', '18:00:00'],
      ['2', 'C', 'yesterday', '10:00:00', '18:00:00'],
      ['3', 'D', '2026-09-01', 'late', '18:00:00'],
      ['4', 'E', '2026-09-01', '10:00:00', ''],
    ]);
    const r = await parseLoginLogoutWorkbook(buf, IST, NOW);
    expect(r.totalRecords).toBe(5);
    expect(r.invalid.map((i) => [i.line, i.reason.split(' ')[0]])).toEqual([[2, 'Logout'], [4, 'Invalid'], [5, 'Invalid'], [6, 'Invalid']]);
    expect(r.punches).toHaveLength(1); // row 7: login only
  });

  it('rejects a workbook without the expected columns', async () => {
    const buf = await workbook([['x']], ['Foo', 'Bar']);
    await expect(parseLoginLogoutWorkbook(buf, IST, NOW)).rejects.toThrow(/header row/);
  });
});
