import { describe, expect, it } from 'vitest';
import { MANUAL_VALID_TRANSITIONS, timeToMinutes, validateManualAttendance } from './manualAttendance';

const TODAY = '2026-09-30';
const ok = { attendanceDate: '2026-09-29', loginTime: '09:30', logoutTime: '18:15', reason: 'Client site in Dubai', workLocation: ' Dubai, UAE ' };

describe('validateManualAttendance', () => {
  it('accepts a valid past day and trims fields', () => {
    const r = validateManualAttendance(ok, TODAY);
    expect(r).toEqual({ value: { attendanceDate: '2026-09-29', loginTime: '09:30', logoutTime: '18:15', reason: 'Client site in Dubai', workLocation: 'Dubai, UAE' } });
  });
  it('accepts HH:mm:ss from a time input and keeps HH:mm', () => {
    const r = validateManualAttendance({ ...ok, loginTime: '09:30:00' }, TODAY);
    expect('value' in r && r.value.loginTime).toBe('09:30');
  });
  it('empty work location becomes null', () => {
    const r = validateManualAttendance({ ...ok, workLocation: '' }, TODAY);
    expect('value' in r && r.value.workLocation).toBeNull();
  });
  it.each([
    [{ attendanceDate: '2026-02-30' }, /valid date/],
    [{ attendanceDate: '2026-10-01' }, /today or an earlier/],
    [{ loginTime: '25:00' }, /Login time/],
    [{ logoutTime: '' }, /Logout time/],
    [{ logoutTime: '09:30' }, /after login/],
    [{ logoutTime: '08:00' }, /after login/],
    [{ reason: '   ' }, /Reason is required/],
    [{ reason: 'x'.repeat(501) }, /too long/],
  ])('rejects %o', (patch, message) => {
    const r = validateManualAttendance({ ...ok, ...patch }, TODAY);
    expect('error' in r && r.error).toMatch(message);
  });
});

describe('workflow', () => {
  it('only PENDING can be decided; REJECTED/CANCELLED are terminal', () => {
    expect(MANUAL_VALID_TRANSITIONS.PENDING).toEqual(['APPROVED', 'REJECTED', 'CANCELLED']);
    expect(MANUAL_VALID_TRANSITIONS.APPROVED).toEqual(['CANCELLED']);
    expect(MANUAL_VALID_TRANSITIONS.REJECTED).toEqual([]);
    expect(MANUAL_VALID_TRANSITIONS.CANCELLED).toEqual([]);
  });
  it('timeToMinutes', () => {
    expect(timeToMinutes('18:15') - timeToMinutes('09:30')).toBe(525);
  });
});
