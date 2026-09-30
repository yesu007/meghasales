'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import TimesheetDayStrip from '@/components/payroll/TimesheetDayStrip';
import AddableSelect from '@/components/AddableSelect';
import MyManualAttendance from '@/components/payroll/MyManualAttendance';
import { teamLabel } from '@/lib/payroll/teamWeekOff';
import { type SaturdayPolicy } from '@/lib/payroll/saturdayPolicy';
import type { TimesheetRow } from '@/lib/payroll/timesheetRow';

interface MyLeave {
  id: number;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  leaveType: { name: string; code: string; isPaid: boolean };
}
interface MyDailyAttendance {
  date: string;
  loginTime: string | null;
  logoutTime: string | null;
  totalWorkingMinutes: number;
  workingHours: string;
  sessionCount: number;
  punchCount: number;
  status: string;
  leaveType: string | null;
  holidayName: string | null;
  weekOffNote?: string | null;
  commonWorking?: boolean;
  deviceLoginTime?: string | null;
  source: 'DEVICE' | 'MANUAL' | null;
  manualStatus: string | null;
  workLocation: string | null;
}
interface MyAttendanceResponse {
  employee: { employeeCode: string; name: string; designation: string | null; department: string | null } | null;
  period: { year: number; month: number; status?: string; submittedAt?: string | null };
  weeklyOffSaturdays?: SaturdayPolicy;
  weekOffTeam?: { value: string; label: string } | null;
  holidays?: { date: string; name: string }[];
  row: TimesheetRow | null;
  hasLoginUserId?: boolean;
  attendanceTracked?: boolean;
  pendingManualCount?: number;
  daily?: MyDailyAttendance[];
  leaves: MyLeave[];
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EMPLOYMENT_LABELS: Record<string, string> = { FULL_TIME: 'Fulltime', PART_TIME: 'Part-time', CONTRACT: 'Contractor', INTERN: 'Intern', PROBATION: 'Probation' };
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};
// Same labels/colours as Time & Attendance → Attendance Log.
const DAILY_STATUS: Record<string, { label: string; cls: string }> = {
  PRESENT: { label: 'Present', cls: 'bg-green-100 text-green-700' },
  INCOMPLETE: { label: 'Missing logout', cls: 'bg-amber-100 text-amber-700' },
  ABSENT: { label: 'Absent', cls: 'bg-red-100 text-red-700' },
  ON_LEAVE: { label: 'On Leave', cls: 'bg-blue-100 text-blue-700' },
  HOLIDAY: { label: 'Holiday', cls: 'bg-purple-100 text-purple-700' },
  WEEK_OFF: { label: 'Week Off', cls: 'bg-violet-100 text-violet-700' },
};
const fmtMinutes = (m: number) => `${Math.floor(m / 60)} hr ${m % 60} min`;
type MyTabKey = 'timesheet' | 'daily' | 'manual' | 'leave';
const MY_TABS: { key: MyTabKey; label: string }[] = [
  { key: 'timesheet', label: 'Timesheet' },
  { key: 'daily', label: 'Daily Attendance' },
  { key: 'manual', label: 'Manual Attendance' },
  { key: 'leave', label: 'Leave Details' },
];

// Same display conventions as Payroll → Time & Attendance → Timesheet:
// Sick/PTO/Paid Holiday/Earned arrive as hours (8h = 1 day, HOURS_PER_DAY
// in timesheetEngine.ts — kept local so this client page doesn't pull in
// that Prisma-dependent module), LOP arrives already in days.
const HOURS_PER_DAY = 8;
const fmtDays = (hours: number) => (hours > 0 ? `${Math.round((hours / HOURS_PER_DAY) * 100) / 100} Days` : '-');
const fmtLopDays = (days: number) => (days > 0 ? `${Math.round(days * 100) / 100} Days` : '-');
const fmtPlainDays = (days: number) => (days > 0 ? `${days} Days` : '-');
const fmtLoanDeduction = (amount: number) => (amount > 0 ? `₹${amount.toLocaleString('en-IN')}` : '-');

async function fetchMyAttendance(year: number, month: number): Promise<MyAttendanceResponse> {
  const res = await fetch(`/api/payroll/my-attendance?year=${year}&month=${month}`);
  if (!res.ok) throw new Error('Failed to fetch attendance');
  return res.json();
}

export default function MyAttendancePage() {
  const now = dayjs();
  const [year, setYear] = useState(now.year());
  const [month, setMonth] = useState(now.month() + 1);
  // Opens on the Timesheet tab (employee + day strip, Timesheet summary);
  // the other tabs swap the Timesheet for their own section.
  const [tab, setTab] = useState<MyTabKey>('timesheet');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['my-attendance', year, month],
    queryFn: () => fetchMyAttendance(year, month),
    placeholderData: (prev) => prev,
    // Week-offs can change at any time (Common Working Saturdays) — always
    // refetch when the tab regains focus instead of trusting cached data.
    staleTime: 0,
    // A manual attendance request is awaiting approval → check every 20s so
    // the approver's decision (Present, or stays Absent) shows up on every
    // tab without a reload.
    // …and the same while a leave request in this month is pending.
    refetchInterval: (q) => ((q.state.data?.pendingManualCount ?? 0) > 0 || (q.state.data?.leaves || []).some((l) => l.status === 'PENDING') ? 20_000 : false),
  });

  const goPrevMonth = () => { const d = dayjs(`${year}-${month}-01`).subtract(1, 'month'); setYear(d.year()); setMonth(d.month() + 1); };
  const goNextMonth = () => { const d = dayjs(`${year}-${month}-01`).add(1, 'month'); setYear(d.year()); setMonth(d.month() + 1); };
  const yearOptions = Array.from({ length: 7 }, (_, i) => now.year() - 5 + i);
  if (!yearOptions.includes(year)) yearOptions.push(year);

  if (isLoading) return <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>;

  if (!data?.employee || !data.row) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Attendance</h1>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 text-center py-16 text-slate-400">No payroll profile yet — your attendance will appear here once you&apos;re onboarded.</div>
      </div>
    );
  }

  const { employee, row, leaves } = data;
  const daily = data.daily || [];
  const presentDays = daily.filter((d) => d.punchCount > 0).length;
  const absentDays = daily.filter((d) => d.status === 'ABSENT').length;
  const leaveDays = daily.filter((d) => d.status === 'ON_LEAVE').length;
  const holidayDays = daily.filter((d) => d.status === 'HOLIDAY').length;
  const weekOffDays = daily.filter((d) => d.status === 'WEEK_OFF').length;
  const totalMinutes = daily.reduce((s, d) => s + d.totalWorkingMinutes, 0);
  const isSubmitted = data.period.status === 'SUBMITTED';
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const saturdayPolicy = data.weeklyOffSaturdays || 'SECOND_FOURTH';
  const daysInMonth = dayjs(`${year}-${month}-01`).daysInMonth();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          {/* Tabs on the same row as the H1, centred against that single
              line — same header layout as the Leads page. */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Attendance</h1>
            <div className="overflow-x-auto">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                {MY_TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    aria-pressed={tab === t.key}
                    className={`px-3 py-1.5 min-h-[40px] rounded-md text-sm font-medium whitespace-nowrap transition-colors ${tab === t.key ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goPrevMonth} className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" aria-label="Previous month"><ChevronLeftIcon className="h-4 w-4" /></button>
          {/* Same searchable dropdown as the rest of the app (e.g. Bills). */}
          <div className="w-40" aria-label="Month">
            <AddableSelect value={String(month)} onChange={(v) => v && setMonth(Number(v))} options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))} placeholder="Month" clearable={false} />
          </div>
          <div className="w-28" aria-label="Year">
            <AddableSelect value={String(year)} onChange={(v) => v && setYear(Number(v))} options={yearOptions.sort((a, b) => a - b).map((y) => ({ value: String(y), label: String(y) }))} placeholder="Year" clearable={false} />
          </div>
          <button onClick={goNextMonth} className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" aria-label="Next month"><ChevronRightIcon className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-slate-500">Employee Name</p>
            <p className="font-semibold text-slate-800">{employee.name}</p>
            {employee.designation && <p className="text-xs text-slate-400">{employee.designation}</p>}
          </div>
          <div>
            <p className="text-xs text-slate-500">Employee ID</p>
            <p className="font-semibold text-slate-800 flex items-baseline gap-2 flex-wrap">
              {employee.employeeCode}
              {data.weekOffTeam && <span className="text-xs font-normal text-slate-400">{data.weekOffTeam.label} · alternate Saturdays</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Month</p>
            <p className="font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
              {monthLabel}
              {isSubmitted && <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Sent to payroll</span>}
            </p>
          </div>
        </div>
        {/* Coloured from this employee's own login/logout — green only for a
            Present day. Without a Login User ID there's no device data, so
            the plain calendar view is kept instead of marking every day. */}
        <TimesheetDayStrip year={year} month={month} saturdayPolicy={saturdayPolicy} holidays={data.holidays} attendance={data.attendanceTracked ? daily : undefined} />
      </div>

      {/* Timesheet tab (the default) — the other tabs show their own section
          here instead, right under the day strip. */}
      {tab === 'timesheet' && (
        <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <div className="px-4 sm:px-5 py-3 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">Timesheet</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Period</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Shift</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Team</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Regular</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Overtime</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Sick Leave</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Casual Leave</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Loss of Pay</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Paid Holiday</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Earned Leave</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Loan Deduction</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Total Days</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white">
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">1 – {daysInMonth} {monthLabel}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{EMPLOYMENT_LABELS[row.employmentType] || row.employmentType}</p>
                    <p className="text-xs text-slate-400">Salaried</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.shiftName ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{teamLabel(row.team) ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-700" title={row.regularOverridden ? `Set by HR (calculated: ${row.calculatedRegularDays})` : `Regular Days = ${row.applicableDays} applicable day(s) − ${row.absentDays} absent − ${Math.round(row.lopDays * 100) / 100} LOP${row.weekOffWorkedDays ? ` + ${row.weekOffWorkedDays} worked week off` : ''}${row.holidayWorkedDays ? ` + ${row.holidayWorkedDays} worked holiday` : ''} · Total Days = Regular + ${row.overtimeHours} overtime`}>{fmtPlainDays(row.regularHours)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmtPlainDays(row.overtimeHours)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtDays(row.sickLeaveHours)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtDays(row.ptoHours)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtLopDays(row.lopDays)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtDays(row.paidHolidayHours)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtDays(row.earnedLeaveHours)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtLoanDeduction(row.loanDeduction)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">{row.totalDays} Days</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'daily' && (
        <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-800">Daily Attendance</h2>
            {daily.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded bg-green-50 text-green-700">Present {presentDays}</span>
                <span className="px-2 py-1 rounded bg-red-50 text-red-700">Absent {absentDays}</span>
                <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">On Leave {leaveDays}</span>
                <span className="px-2 py-1 rounded bg-purple-50 text-purple-700">Holiday {holidayDays}</span>
                <span className="px-2 py-1 rounded bg-violet-50 text-violet-700">Week Off {weekOffDays}</span>
                <span className="px-2 py-1 rounded bg-slate-100 text-slate-700">Total {fmtMinutes(totalMinutes)}</span>
              </div>
            )}
          </div>
          {daily.length === 0 ? (
            <p className="text-center py-12 text-slate-400">
              {data.attendanceTracked ? `No attendance recorded for ${monthLabel}` : 'Your Login User ID isn’t set up yet — ask HR to add it to your employee profile, or use the Manual Attendance tab if you work away from the office.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Login Time</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Logout Time</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Working Hours</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Sessions</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {daily.map((d) => {
                    const st = DAILY_STATUS[d.status] || { label: d.status, cls: 'bg-slate-100 text-slate-600' };
                    return (
                      <tr key={d.date} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{dayjs(d.date).format('DD MMM YYYY, ddd')}</td>
                        <td className="px-4 py-3 text-slate-700 tabular-nums">{d.loginTime ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-700 tabular-nums">{d.logoutTime ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">{d.punchCount === 0 ? '—' : d.workingHours}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{d.punchCount === 0 ? '—' : d.sessionCount}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.cls}`}>{st.label}</span>
                          {d.source === 'MANUAL' && <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 text-sky-700" title={d.workLocation || undefined}>Manual</span>}
                          {(d.leaveType || d.holidayName) && <p className="text-xs text-slate-400 mt-0.5">{d.leaveType || (d.status === 'PRESENT' && d.logoutTime ? `Worked on holiday · ${d.holidayName}` : d.holidayName)}</p>}
                        {d.weekOffNote && <p className="text-xs text-slate-400 mt-0.5">{d.status === 'WEEK_OFF' ? d.weekOffNote : `Worked on week off · ${d.weekOffNote}`}</p>}
                        {d.commonWorking && <p className="text-xs text-slate-400 mt-0.5">Common working Saturday</p>}
                        {d.deviceLoginTime && <p className="text-xs text-slate-400 mt-0.5">Missing logout corrected · device login {d.deviceLoginTime}</p>}
                          {d.manualStatus && <p className="text-xs text-slate-400 mt-0.5">{d.manualStatus === 'PENDING' ? 'Manual attendance awaiting approval' : 'Manual attendance rejected'}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {tab === 'manual' && (
        <MyManualAttendance year={year} month={month} monthLabel={monthLabel} />
      )}
      {tab === 'leave' && (
        <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <div className="px-4 sm:px-5 py-3 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">Leave Details</h2>
          </div>
          {leaves.length === 0 ? (
            <p className="text-center py-12 text-slate-400">No leave in {monthLabel}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Leave Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Dates</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Days</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaves.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{r.leaveType.name}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {dayjs(r.startDate).isSame(r.endDate, 'day')
                          ? dayjs(r.startDate).format('DD MMM YYYY')
                          : `${dayjs(r.startDate).format('DD MMM')} – ${dayjs(r.endDate).format('DD MMM YYYY')}`}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{r.days}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-slate-100 text-slate-500'}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-4 sm:px-5 py-3 border-t border-slate-100 text-xs text-slate-400">Only approved leave counts towards the timesheet above. Loss of Pay is the only leave deducted from Regular / Total Days; Sick, Casual, Earned leave and Paid Holidays are shown for information and don&apos;t change it.</p>
        </div>
      )}
    </div>
  );
}
