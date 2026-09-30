'use client';

// "Attendance Log" tab of Time & Attendance — daily login/logout/working
// hours, read from GET /api/payroll/attendance. Everything shown here was
// already parsed and calculated by the backend Access Control import (see
// lib/payroll/attendanceImport.ts); this component never reads a device
// file itself.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { XMarkIcon } from '@heroicons/react/24/outline';
import AttendanceImportsPanel from '@/components/payroll/AttendanceImportsPanel';
import AddableSelect from '@/components/AddableSelect';
import { teamLabel } from '@/lib/payroll/teamWeekOff';

interface AttendanceRow {
  id: number;
  employeeId: number;
  employeeCode: string;
  name: string;
  accessControlId: string | null;
  date: string;
  loginTime: string | null;
  logoutTime: string | null;
  totalWorkingMinutes: number;
  workingHours: string;
  sessionCount: number;
  punchCount: number;
  status: string;
  leaveType?: string;
  holidayName?: string;
  weekOffNote?: string;
  commonWorking?: boolean;
  team?: string | null;
  deviceLoginTime?: string | null;
  source?: 'DEVICE' | 'MANUAL';
  manualStatus?: string;
  workLocation?: string | null;
}
interface EmployeeOption { id: number; employeeCode: string; name: string; accessControlId: string | null }
interface AttendanceResponse { rows: AttendanceRow[]; employees: EmployeeOption[] }

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  PRESENT: { label: 'Present', cls: 'bg-green-100 text-green-700' },
  INCOMPLETE: { label: 'Missing logout', cls: 'bg-amber-100 text-amber-700' },
  ABSENT: { label: 'Absent', cls: 'bg-red-100 text-red-700' },
  ON_LEAVE: { label: 'On Leave', cls: 'bg-blue-100 text-blue-700' },
  HOLIDAY: { label: 'Holiday', cls: 'bg-purple-100 text-purple-700' },
  WEEK_OFF: { label: 'Week Off', cls: 'bg-violet-100 text-violet-700' },
};

async function fetchAttendance(month: string, date: string, employeeId: string): Promise<AttendanceResponse> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  else params.set('month', month);
  if (employeeId) params.set('employeeId', employeeId);
  const res = await fetch(`/api/payroll/attendance?${params}`);
  if (!res.ok) throw new Error('Failed to fetch attendance');
  return res.json();
}

const inputCls = 'px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

export default function AttendanceLogPanel() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [date, setDate] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  // staleTime 0: week-offs can change at any time (Common Working Saturdays) — refetch on focus.
  const { data, isLoading } = useQuery({ queryKey: ['attendance', month, date, employeeId], queryFn: () => fetchAttendance(month, date, employeeId), staleTime: 0 });
  const rows = data?.rows || [];
  const employees = data?.employees || [];

  return (
    <div className="space-y-4">
      {/* Imports first — upload the device log / Excel, then review the log below. */}
      <AttendanceImportsPanel />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Attendance Log</h2>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Employee
            {/* Searchable, same dropdown as the rest of the app; clearing it = All employees. */}
            <div className="w-72">
              <AddableSelect
                value={employeeId}
                onChange={(v) => setEmployeeId(v)}
                options={employees.map((e) => ({ value: String(e.id), label: `${e.name} (${e.employeeCode})${e.accessControlId ? '' : ' — no Login User ID'}` }))}
                placeholder="All employees"
              />
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Month
            <input type="month" value={month} onChange={(e) => { if (e.target.value) { setMonth(e.target.value); setDate(''); } }} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Date
            <div className="flex items-center gap-1">
              <input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (e.target.value) setMonth(e.target.value.slice(0, 7)); }} className={inputCls} />
              {date && (
                <button onClick={() => setDate('')} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100" aria-label="Clear date"><XMarkIcon className="h-4 w-4" /></button>
              )}
            </div>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No attendance recorded for this {date ? 'date' : 'month'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Employee</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Team</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Login Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Logout Time</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Working Hours</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Sessions</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const st = STATUS_STYLES[r.status] || { label: r.status, cls: 'bg-slate-100 text-slate-600' };
                  return (
                    <tr key={r.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{r.name}</p>
                        <p className="text-xs text-slate-400">{r.employeeCode}{r.accessControlId ? ` · Login ID ${r.accessControlId}` : ''}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{teamLabel(r.team) ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{dayjs(r.date).format('DD MMM YYYY, ddd')}</td>
                      <td className="px-4 py-3 text-slate-700 tabular-nums">{r.loginTime ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-700 tabular-nums">{r.logoutTime ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">{r.punchCount === 0 ? '—' : r.workingHours}</td>
                      <td className="px-4 py-3 text-right text-slate-600" title={`${r.punchCount} punch(es)`}>{r.punchCount === 0 ? '—' : r.sessionCount}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.cls}`}>{st.label}</span>
                        {r.source === 'MANUAL' && <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 text-sky-700" title={r.workLocation ? `Manual attendance · ${r.workLocation}` : 'Manual attendance'}>Manual</span>}
                        {(r.leaveType || r.holidayName) && <p className="text-xs text-slate-400 mt-0.5">{r.leaveType || (r.status === 'PRESENT' && r.logoutTime ? `Worked on holiday · ${r.holidayName}` : r.holidayName)}</p>}
                        {r.weekOffNote && <p className="text-xs text-slate-400 mt-0.5">{r.status === 'WEEK_OFF' ? r.weekOffNote : `Worked on week off · ${r.weekOffNote}`}</p>}
                        {r.commonWorking && <p className="text-xs text-slate-400 mt-0.5">Common working Saturday</p>}
                        {r.deviceLoginTime && <p className="text-xs text-slate-400 mt-0.5">Missing logout corrected · device login {r.deviceLoginTime}</p>}
                        {r.manualStatus && <p className="text-xs text-slate-400 mt-0.5">{r.manualStatus === 'PENDING' ? 'Manual attendance awaiting approval' : 'Manual attendance rejected'}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
