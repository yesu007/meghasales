'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeftIcon, ChevronRightIcon, BriefcaseIcon, DocumentChartBarIcon,
  MagnifyingGlassIcon, PlusIcon, XMarkIcon, TrashIcon,
  ClipboardDocumentListIcon, CalendarDaysIcon, ClipboardDocumentCheckIcon, FingerPrintIcon, GlobeAltIcon, ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import LeaveRequestsPanel from '@/components/payroll/LeaveRequestsPanel';
import LeaveTypesPanel from '@/components/payroll/LeaveTypesPanel';
import TimesheetDayStrip from '@/components/payroll/TimesheetDayStrip';
import AttendanceLogPanel from '@/components/payroll/AttendanceLogPanel';
import ManualAttendancePanel from '@/components/payroll/ManualAttendancePanel';
import CommonWorkingDaysSection from '@/components/payroll/CommonWorkingDaysSection';
import { type SaturdayPolicy } from '@/lib/payroll/saturdayPolicy';
import { usePermissions } from '@/hooks/usePermissions';
import { teamLabel } from '@/lib/payroll/teamWeekOff';

interface TimesheetEmployeeRow {
  employeeId: number;
  employeeCode: string;
  name: string;
  department: string | null;
  designation: string | null;
  employmentType: string;
  status: string;
  // Standalone Active/Inactive flag for this Timesheet column specifically
  // — separate from `status` above (the employee's full HR status).
  timesheetStatus: string;
  regularHours: number;
  overtimeHours: number;
  sickLeaveHours: number;
  ptoHours: number; // Casual Leave
  paidHolidayHours: number;
  earnedLeaveHours: number;
  lopDays: number; // already in days, not hours — see computeAutoLopDays
  totalDays: number; // = Regular Days + Overtime (see computeTotalDays)
  applicableDays: number; // Regular Days breakdown: applicable − absent − LOP + overtime
  absentDays: number;
  weekOffWorkedDays: number; // week offs worked (login + logout), added to Regular
  holidayWorkedDays: number; // paid holidays worked (login + logout), added to Regular
  calculatedRegularDays: number; // before HR's edit
  regularOverridden: boolean; // regularHours is HR's edit
  loanDeduction: number; // amount actually sent to Payroll for this period — see GET /api/payroll/timesheet
  shiftName: string | null; // resolved as of the period's last day — see Shift Master
  team: string | null; // TEAM_A | TEAM_B, same "as of the period's last day" convention
}
interface TimesheetResponse {
  // Week-offs for the logged-in viewer's own team (day strip).
  viewer?: { team: string | null; teamLabel: string | null; weekOffs: { date: string; note: string | null }[] };
  period: { year: number; month: number; status: string; submittedAt: string | null };
  employees: TimesheetEmployeeRow[];
}
interface Holiday { id: number; date: string; name: string }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const AVATAR_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'];
function avatarColor(id: number): string {
  return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];
}
function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}
function ordinal(n: number): string {
  if (n % 10 === 1 && n !== 11) return `${n}st`;
  if (n % 10 === 2 && n !== 12) return `${n}nd`;
  if (n % 10 === 3 && n !== 13) return `${n}rd`;
  return `${n}th`;
}
const EMPLOYMENT_LABELS: Record<string, string> = { FULL_TIME: 'Fulltime', PART_TIME: 'Part-time', CONTRACT: 'Contractor', INTERN: 'Intern', PROBATION: 'Probation' };

async function fetchTimesheet(year: number, month: number): Promise<TimesheetResponse> {
  const res = await fetch(`/api/payroll/timesheet?year=${year}&month=${month}`);
  if (!res.ok) throw new Error('Failed to fetch timesheet');
  return res.json();
}
async function fetchHolidays(): Promise<Holiday[]> {
  const res = await fetch('/api/payroll/holidays');
  if (!res.ok) throw new Error('Failed to fetch holidays');
  return res.json();
}
async function fetchSaturdayPolicy(): Promise<SaturdayPolicy> {
  const res = await fetch('/api/payroll/statutory-settings');
  if (!res.ok) throw new Error('Failed to fetch statutory settings');
  const data = await res.json();
  return (data.weeklyOffSaturdays || 'SECOND_FOURTH') as SaturdayPolicy;
}

type TabKey = 'timesheet' | 'attendance' | 'manual' | 'requests' | 'policy';
const TABS: { key: TabKey; label: string; icon: typeof ClipboardDocumentListIcon }[] = [
  { key: 'timesheet', label: 'Timesheet', icon: ClipboardDocumentListIcon },
  { key: 'attendance', label: 'Attendance Log', icon: FingerPrintIcon },
  { key: 'manual', label: 'Manual Attendance', icon: GlobeAltIcon },
  { key: 'requests', label: 'Time-off request', icon: CalendarDaysIcon },
  { key: 'policy', label: 'Time-off policy', icon: ClipboardDocumentCheckIcon },
];

export default function TimeAndAttendancePage() {
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const canEditHours = has('edit_timesheet');
  // Timesheet Status lives on the Employee record — PATCH /api/payroll/employees/[id].
  const canEditTimesheetStatus = has('edit_employees');
  const canCreateHoliday = has('create_timesheet');
  const canDeleteHoliday = has('delete_timesheet');
  // Send To Payroll and Reopen both POST /api/payroll/timesheet/submit.
  const canSubmitPeriod = has('run_payroll');
  const now = dayjs();
  const [year, setYear] = useState(now.year());
  const [month, setMonth] = useState(now.month() + 1);
  const [tab, setTab] = useState<TabKey>('timesheet');
  // ?tab=<key> deep link — e.g. the "Manual attendance to approve"
  // notification opens straight on the Manual Attendance tab.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested && TABS.some((t) => t.key === requested)) setTab(requested as TabKey);
  }, []);
  const [search, setSearch] = useState('');
  // Holiday Calendar / Common Working Saturday dialogs (was one Settings dialog).
  const [panel, setPanel] = useState<'holidays' | 'common' | null>(null);
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '' });
  // Local edit buffer keyed by employeeId — typing shouldn't trigger a save
  // per keystroke; commitDraft() (on blur) is what actually PATCHes.
  const [drafts, setDrafts] = useState<Record<number, { overtimeHours: string }>>({});
  // Regular Days edits in progress, same blur-to-save idea.
  const [regularDrafts, setRegularDrafts] = useState<Record<number, string>>({});

  // staleTime 0: Regular Days depends on week-offs, which can change at any time — refetch on focus.
  const { data, isLoading } = useQuery({ queryKey: ['timesheet', year, month], queryFn: () => fetchTimesheet(year, month), staleTime: 0 });
  // Always loaded (not only while Settings is open) — the day strip greys out
  // these Paid Holiday dates; add/remove below invalidates this same key.
  const { data: holidays = [] } = useQuery({ queryKey: ['holidays'], queryFn: fetchHolidays });
  const { data: saturdayPolicy = 'SECOND_FOURTH' } = useQuery({ queryKey: ['saturday-policy'], queryFn: fetchSaturdayPolicy });

  const period = data?.period;
  const isSubmitted = period?.status === 'SUBMITTED';

  const saveHours = useMutation({
    mutationFn: async ({ employeeId, ...fields }: { employeeId: number; overtimeHours?: number; regularDaysOverride?: number | null }) => {
      const res = await fetch('/api/payroll/timesheet', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, year, month, ...fields }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save timesheet entry'); }
      return res.json();
    },
    onSuccess: (_r, vars) => {
      // Drop the Regular draft so the cell shows the saved (or recalculated) value.
      if (vars.regularDaysOverride !== undefined) setRegularDrafts((d) => { const n = { ...d }; delete n[vars.employeeId]; return n; });
      queryClient.invalidateQueries({ queryKey: ['timesheet', year, month] });
      queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Lives on the Employee record (not per-period, unlike Regular/Overtime
  // above) — same PATCH /api/payroll/employees/[id] the Employee profile's
  // own Status field already uses, just this one column instead.
  const saveTimesheetStatus = useMutation({
    mutationFn: async ({ employeeId, timesheetStatus }: { employeeId: number; timesheetStatus: string }) => {
      const res = await fetch(`/api/payroll/employees/${employeeId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timesheetStatus }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update status'); }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timesheet', year, month] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const submitPeriod = useMutation({
    mutationFn: async (status: 'SUBMITTED' | 'OPEN') => {
      const res = await fetch('/api/payroll/timesheet/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, status }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update period'); }
      return res.json();
    },
    onSuccess: (_r, status) => { queryClient.invalidateQueries({ queryKey: ['timesheet', year, month] }); toast.success(status === 'SUBMITTED' ? 'Timesheet sent to payroll' : 'Timesheet reopened'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const addHoliday = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payroll/holidays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(holidayForm) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to add holiday'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['holidays'] }); queryClient.invalidateQueries({ queryKey: ['timesheet'] }); toast.success('Holiday added'); setHolidayForm({ date: '', name: '' }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const removeHoliday = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/payroll/holidays/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to remove holiday'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['holidays'] }); queryClient.invalidateQueries({ queryKey: ['timesheet'] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const goPrevMonth = () => { const d = dayjs(`${year}-${month}-01`).subtract(1, 'month'); setYear(d.year()); setMonth(d.month() + 1); };
  const goNextMonth = () => { const d = dayjs(`${year}-${month}-01`).add(1, 'month'); setYear(d.year()); setMonth(d.month() + 1); };

  const daysInThisMonth = dayjs(`${year}-${month}-01`).daysInMonth();

  const employees = data?.employees || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q) || (e.department || '').toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search]);

  // Sick Leave/PTO/Paid Holiday are still tracked internally as hours (see
  // timesheetEngine.ts) — matches HOURS_PER_DAY there, kept as a local
  // constant instead of importing it so this client page doesn't pull in
  // that Prisma-dependent module (same reasoning as isWeeklyOff's own
  // split into saturdayPolicy.ts). Displayed in Days here for consistency
  // with Regular/Overtime/Total Days, which are already day-based.
  const HOURS_PER_DAY = 8;
  const fmtDays = (hours: number) => (hours > 0 ? `${Math.round((hours / HOURS_PER_DAY) * 100) / 100} Days` : '-');
  // lopDays comes pre-computed in days (see computeAutoLopDays), not hours —
  // no /HOURS_PER_DAY conversion needed here, unlike fmtDays above.
  const fmtLopDays = (days: number) => (days > 0 ? `${Math.round(days * 100) / 100} Days` : '-');
  const fmtLoanDeduction = (amount: number) => (amount > 0 ? `₹${amount.toLocaleString('en-IN')}` : '-');

  // Overtime drafts (blur-to-save). Regular Days is calculated (applicable −
  // Absent − LOP, see computeRegularDays) and editable below; Total Days =
  // Regular + Overtime.
  const getDraft = (row: TimesheetEmployeeRow) => drafts[row.employeeId] ?? { overtimeHours: row.overtimeHours ? String(row.overtimeHours) : '' };
  const setDraft = (employeeId: number, patch: Partial<{ overtimeHours: string }>) =>
    setDrafts((d) => ({ ...d, [employeeId]: { ...(d[employeeId] ?? { overtimeHours: '' }), ...patch } }));
  const commitDraft = (row: TimesheetEmployeeRow) => {
    const overtimeHours = Number(getDraft(row).overtimeHours) || 0;
    if (overtimeHours === row.overtimeHours) return;
    saveHours.mutate({ employeeId: row.employeeId, overtimeHours });
  };
  // Regular Days: calculated by default; HR's edit overrides it. Typing the
  // calculated value or clearing the box goes back to the calculated value.
  const commitRegular = (row: TimesheetEmployeeRow) => {
    const raw = regularDrafts[row.employeeId];
    if (raw === undefined) return;
    const clear = raw.trim() === '' || Number(raw) === row.calculatedRegularDays;
    if (clear) {
      if (row.regularOverridden) saveHours.mutate({ employeeId: row.employeeId, regularDaysOverride: null });
      else setRegularDrafts((d) => { const n = { ...d }; delete n[row.employeeId]; return n; });
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) { toast.error('Regular days must be a non-negative number'); return; }
    if (row.regularOverridden && value === row.regularHours) return;
    saveHours.mutate({ employeeId: row.employeeId, regularDaysOverride: value });
  };
  const regularBreakdown = (row: TimesheetEmployeeRow) =>
    `Regular Days = ${row.applicableDays} applicable day(s) − ${row.absentDays} absent − ${Math.round(row.lopDays * 100) / 100} LOP${row.weekOffWorkedDays ? ` + ${row.weekOffWorkedDays} worked week off` : ''}${row.holidayWorkedDays ? ` + ${row.holidayWorkedDays} worked holiday` : ''} · Total Days = Regular + ${row.overtimeHours} overtime`;

  // No email/notification system exists yet to actually page approvers, so
  // "Remind" honestly means "jump to what needs approving" rather than
  // pretending to have sent something.
  const remindApprovers = () => { setTab('requests'); toast('Showing pending time-off requests for approvers to action', { icon: '🔔' }); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Time &amp; Attendance</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Track hours, approve time off, and hand the period to payroll</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-4 flex gap-1 border-b border-slate-200 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.key ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'timesheet' && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-800">Timesheet</h2>
                <div className="flex items-center gap-1 text-sm text-slate-600">
                  <button onClick={goPrevMonth} className="p-1 rounded hover:bg-slate-100" aria-label="Previous month"><ChevronLeftIcon className="h-4 w-4" /></button>
                  <span className="font-medium">Time period: 1st – {ordinal(daysInThisMonth)} {MONTH_NAMES[month - 1]} {year}</span>
                  <button onClick={goNextMonth} className="p-1 rounded hover:bg-slate-100" aria-label="Next month"><ChevronRightIcon className="h-4 w-4" /></button>
                </div>
                {isSubmitted && <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Sent to payroll</span>}
              </div>
              <div className="flex items-center gap-2">
                <Link href="/dashboard/payroll/reports" className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <DocumentChartBarIcon className="h-4 w-4" /> Create Report
                </Link>
                <button onClick={() => setPanel('holidays')} className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <CalendarDaysIcon className="h-4 w-4" /> Holiday Calendar
                </button>
                <button onClick={() => setPanel('common')} className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <BriefcaseIcon className="h-4 w-4" /> Common Working Saturday
                </button>
              </div>
            </div>

            {/* Week-offs for the logged-in admin's own team (or the company policy with no team). */}
            <TimesheetDayStrip
              year={year} month={month} saturdayPolicy={saturdayPolicy} holidays={holidays}
              weekOffs={data?.viewer?.weekOffs}
              weekOffLabel={data?.viewer?.teamLabel ? `Weekly off (${data.viewer.teamLabel} — your team)` : undefined}
            />

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <MagnifyingGlassIcon className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee" className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={remindApprovers} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Remind Approvers</button>
                {!canSubmitPeriod ? null : isSubmitted ? (
                  <button onClick={() => submitPeriod.mutate('OPEN')} disabled={submitPeriod.isPending} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-50">Reopen</button>
                ) : (
                  <button onClick={() => submitPeriod.mutate('SUBMITTED')} disabled={submitPeriod.isPending} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">Send To Payroll</button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {isLoading ? (
              <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-center py-16 text-slate-400">No employees found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-white">Name</th>
                      <th className="px-4 py-3 text-left font-semibold text-white">Type</th>
                      <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
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
                    {filtered.map((row, idx) => {
                      const draft = getDraft(row);
                      return (
                        <tr key={row.employeeId} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0" style={{ backgroundColor: avatarColor(row.employeeId) }}>
                                {initials(row.name)}
                              </span>
                              <div>
                                <p className="font-medium text-slate-800">{row.name}</p>
                                <p className="text-xs text-slate-400">{row.designation || row.employeeCode}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p>{EMPLOYMENT_LABELS[row.employmentType] || row.employmentType}</p>
                            <p className="text-xs text-slate-400">Salaried</p>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={row.timesheetStatus}
                              disabled={!canEditTimesheetStatus || isSubmitted || saveTimesheetStatus.isPending}
                              onChange={(e) => saveTimesheetStatus.mutate({ employeeId: row.employeeId, timesheetStatus: e.target.value })}
                              className={`px-2 py-1 rounded text-xs font-medium border-0 ${row.timesheetStatus === 'INACTIVE' ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'}`}
                            >
                              <option value="ACTIVE">Active</option>
                              <option value="INACTIVE">Inactive</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.shiftName ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{teamLabel(row.team) ?? '—'}</td>
                          <td className="px-4 py-3 text-right" title={`${regularBreakdown(row)}${row.regularOverridden ? ` — edited to ${row.regularHours}` : ''}`}>
                            <div className="flex items-center justify-end gap-1">
                              {row.regularOverridden && canEditHours && !isSubmitted && (
                                <button onClick={() => saveHours.mutate({ employeeId: row.employeeId, regularDaysOverride: null })} className="p-1 rounded text-slate-400 hover:text-amber-700 hover:bg-amber-50" title={`Use the calculated value (${row.calculatedRegularDays})`} aria-label="Use calculated Regular Days">
                                  <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <input
                                type="number" min={0} step={0.5} disabled={!canEditHours || isSubmitted}
                                value={regularDrafts[row.employeeId] ?? String(row.regularHours)}
                                onChange={(e) => setRegularDrafts((d) => ({ ...d, [row.employeeId]: e.target.value }))}
                                onBlur={() => commitRegular(row)}
                                className={`w-20 text-right px-2 py-1 border rounded disabled:bg-transparent disabled:text-slate-500 ${row.regularOverridden ? 'border-amber-300 bg-amber-50/60 text-amber-800' : 'border-transparent hover:border-slate-300 focus:border-amber-500 text-slate-700'}`}
                              />
                            </div>
                            {row.regularOverridden && <p className="text-[11px] text-amber-600 mt-0.5 whitespace-nowrap">edited · calc {row.calculatedRegularDays}</p>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number" min={0} step={0.5} disabled={!canEditHours || isSubmitted}
                              value={draft.overtimeHours}
                              onChange={(e) => setDraft(row.employeeId, { overtimeHours: e.target.value })}
                              onBlur={() => commitDraft(row)}
                              className="w-20 text-right px-2 py-1 border border-transparent hover:border-slate-300 focus:border-amber-500 rounded text-slate-700 disabled:bg-transparent disabled:text-slate-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">{fmtDays(row.sickLeaveHours)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{fmtDays(row.ptoHours)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{fmtLopDays(row.lopDays)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{fmtDays(row.paidHolidayHours)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{fmtDays(row.earnedLeaveHours)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{fmtLoanDeduction(row.loanDeduction)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">{row.totalDays} Days</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'attendance' && <AttendanceLogPanel />}
      {tab === 'manual' && <ManualAttendancePanel />}
      {tab === 'requests' && <LeaveRequestsPanel />}
      {tab === 'policy' && <LeaveTypesPanel />}

      {panel && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setPanel(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                  {panel === 'holidays' ? <CalendarDaysIcon className="h-5 w-5 text-amber-600" /> : <BriefcaseIcon className="h-5 w-5 text-amber-600" />}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-slate-800">{panel === 'holidays' ? 'Holiday Calendar' : 'Common Working Saturday'}</h3>
                </div>
              </div>
              <button onClick={() => setPanel(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><XMarkIcon className="h-5 w-5" /></button>
            </div>
            {panel === 'common' ? (
              <div className="p-6">
                <CommonWorkingDaysSection canCreate={canCreateHoliday} canDelete={canDeleteHoliday} standalone />
              </div>
            ) : (
            <div className="p-6 space-y-5">
              <p className="text-sm text-slate-500 bg-amber-50/60 border border-amber-100 rounded-xl px-4 py-3">8 hours are credited per holiday that falls inside an employee&apos;s pay period and employment window.</p>
              {canCreateHoliday && (
              <form onSubmit={(e) => { e.preventDefault(); if (!holidayForm.date || !holidayForm.name) { toast.error('Date and name are required'); return; } addHoliday.mutate(); }} className="flex flex-col sm:flex-row gap-3">
                <input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm((f) => ({ ...f, date: e.target.value }))} className="sm:w-48 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
                <input placeholder="Holiday name" value={holidayForm.name} onChange={(e) => setHolidayForm((f) => ({ ...f, name: e.target.value }))} className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
                <button type="submit" disabled={addHoliday.isPending} className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 disabled:opacity-50 shadow-sm shadow-amber-200"><PlusIcon className="h-4 w-4" /> Add</button>
              </form>
              )}
              <div className="space-y-1.5">
                {holidays.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                    <CalendarDaysIcon className="h-10 w-10 text-slate-200" />
                    <p className="text-sm text-slate-400">No holidays added yet</p>
                  </div>
                ) : (
                  holidays.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-transparent hover:border-slate-100 hover:bg-slate-50 transition-colors group">
                      <div className="flex items-center gap-3">
                        <span className="h-10 w-10 rounded-lg bg-emerald-50 flex flex-col items-center justify-center flex-shrink-0 leading-none">
                          <span className="text-[10px] font-medium text-emerald-500 uppercase">{dayjs(h.date).format('MMM')}</span>
                          <span className="text-sm font-bold text-emerald-700">{dayjs(h.date).format('DD')}</span>
                        </span>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{h.name}</p>
                          <p className="text-xs text-slate-400">{dayjs(h.date).format('dddd, DD MMM YYYY')}</p>
                        </div>
                      </div>
                      {canDeleteHoliday && (
                        <button onClick={() => removeHoliday.mutate(h.id)} className="p-2 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="h-4 w-4" /></button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
