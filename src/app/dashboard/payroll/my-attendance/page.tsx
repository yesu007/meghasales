'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import TimesheetDayStrip from '@/components/payroll/TimesheetDayStrip';
import { isWeeklyOff, type SaturdayPolicy } from '@/lib/payroll/saturdayPolicy';
import type { TimesheetRow } from '@/lib/payroll/timesheetRow';

interface MyLeave {
  id: number;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  leaveType: { name: string; code: string; isPaid: boolean };
}
interface MyAttendanceResponse {
  employee: { employeeCode: string; name: string; designation: string | null; department: string | null } | null;
  period: { year: number; month: number; status?: string; submittedAt?: string | null };
  weeklyOffSaturdays?: SaturdayPolicy;
  holidays?: { date: string; name: string }[];
  row: TimesheetRow | null;
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
const selectCls = 'px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

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

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['my-attendance', year, month],
    queryFn: () => fetchMyAttendance(year, month),
    placeholderData: (prev) => prev,
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
  const isSubmitted = data.period.status === 'SUBMITTED';
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const saturdayPolicy = data.weeklyOffSaturdays || 'SECOND_FOURTH';
  // Regular mirrors the day strip's green "Working day" count — every day of
  // the month that isn't a weekly off under the company's Saturday policy.
  const daysInMonth = dayjs(`${year}-${month}-01`).daysInMonth();
  const workingDays = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .filter((d) => !isWeeklyOff(dayjs(`${year}-${month}-${d}`).toDate(), saturdayPolicy)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Attendance</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Your timesheet and leave for the selected month</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goPrevMonth} className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" aria-label="Previous month"><ChevronLeftIcon className="h-4 w-4" /></button>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls} aria-label="Month">
            {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls} aria-label="Year">
            {yearOptions.sort((a, b) => a - b).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
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
            <p className="font-semibold text-slate-800">{employee.employeeCode}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Month</p>
            <p className="font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
              {monthLabel}
              {isSubmitted && <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Sent to payroll</span>}
            </p>
          </div>
        </div>
        <TimesheetDayStrip year={year} month={month} saturdayPolicy={saturdayPolicy} holidays={data.holidays} />
      </div>

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
                <th className="px-4 py-3 text-right font-semibold text-white">Regular</th>
                <th className="px-4 py-3 text-right font-semibold text-white">Overtime</th>
                <th className="px-4 py-3 text-right font-semibold text-white">Sick Leave</th>
                <th className="px-4 py-3 text-right font-semibold text-white">PTO (Casual Leave)</th>
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
                <td className="px-4 py-3 text-right text-slate-700">{fmtPlainDays(workingDays)}</td>
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
        <p className="px-4 sm:px-5 py-3 border-t border-slate-100 text-xs text-slate-400">Only approved leave counts towards the timesheet above. Paid Holidays are added to Total Days and Loss of Pay is deducted from it; all other leave (Sick, PTO, Earned) is shown for information and doesn&apos;t change Total Days.</p>
      </div>
    </div>
  );
}
