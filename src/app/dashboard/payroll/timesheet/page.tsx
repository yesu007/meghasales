'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeftIcon, ChevronRightIcon, Cog6ToothIcon, DocumentChartBarIcon,
  MagnifyingGlassIcon, PlusIcon, XMarkIcon, TrashIcon,
  ClipboardDocumentListIcon, CalendarDaysIcon, ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import LeaveRequestsPanel from '@/components/payroll/LeaveRequestsPanel';
import LeaveTypesPanel from '@/components/payroll/LeaveTypesPanel';

interface TimesheetEmployeeRow {
  employeeId: number;
  employeeCode: string;
  name: string;
  department: string | null;
  designation: string | null;
  employmentType: string;
  status: string;
  regularHours: number;
  overtimeHours: number;
  sickLeaveHours: number;
  ptoHours: number;
  paidHolidayHours: number;
  totalHours: number;
}
interface TimesheetResponse {
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
const EMPLOYMENT_LABELS: Record<string, string> = { FULL_TIME: 'Fulltime', PART_TIME: 'Part-time', CONTRACT: 'Contractor', INTERN: 'Intern' };

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

type TabKey = 'timesheet' | 'requests' | 'policy';
const TABS: { key: TabKey; label: string; icon: typeof ClipboardDocumentListIcon }[] = [
  { key: 'timesheet', label: 'Timesheet', icon: ClipboardDocumentListIcon },
  { key: 'requests', label: 'Time-off request', icon: CalendarDaysIcon },
  { key: 'policy', label: 'Time-off policy', icon: ClipboardDocumentCheckIcon },
];

export default function TimeAndAttendancePage() {
  const queryClient = useQueryClient();
  const now = dayjs();
  const [year, setYear] = useState(now.year());
  const [month, setMonth] = useState(now.month() + 1);
  const [tab, setTab] = useState<TabKey>('timesheet');
  const [search, setSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '' });
  // Local edit buffer keyed by employeeId — typing shouldn't trigger a save
  // per keystroke; commitDraft() (on blur) is what actually PATCHes.
  const [drafts, setDrafts] = useState<Record<number, { regularHours: string; overtimeHours: string }>>({});

  const { data, isLoading } = useQuery({ queryKey: ['timesheet', year, month], queryFn: () => fetchTimesheet(year, month) });
  const { data: holidays = [] } = useQuery({ queryKey: ['holidays'], queryFn: fetchHolidays, enabled: settingsOpen });

  const period = data?.period;
  const isSubmitted = period?.status === 'SUBMITTED';

  const saveHours = useMutation({
    mutationFn: async ({ employeeId, regularHours, overtimeHours }: { employeeId: number; regularHours: number; overtimeHours: number }) => {
      const res = await fetch('/api/payroll/timesheet', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, year, month, regularHours, overtimeHours }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save hours'); }
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
  const todayInPeriod = now.year() === year && now.month() + 1 === month ? now.date() : null;

  const employees = data?.employees || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q) || (e.department || '').toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search]);

  const fmtHours = (n: number) => (n > 0 ? `${n} Hours` : '-');

  const getDraft = (row: TimesheetEmployeeRow) => drafts[row.employeeId] ?? { regularHours: row.regularHours ? String(row.regularHours) : '', overtimeHours: row.overtimeHours ? String(row.overtimeHours) : '' };
  const setDraft = (employeeId: number, patch: Partial<{ regularHours: string; overtimeHours: string }>) =>
    setDrafts((d) => ({ ...d, [employeeId]: { ...(d[employeeId] ?? { regularHours: '', overtimeHours: '' }), ...patch } }));
  const commitDraft = (row: TimesheetEmployeeRow) => {
    const draft = getDraft(row);
    const regularHours = Number(draft.regularHours) || 0;
    const overtimeHours = Number(draft.overtimeHours) || 0;
    if (regularHours === row.regularHours && overtimeHours === row.overtimeHours) return;
    saveHours.mutate({ employeeId: row.employeeId, regularHours, overtimeHours });
  };

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
                <button onClick={() => setSettingsOpen(true)} className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <Cog6ToothIcon className="h-4 w-4" /> Settings
                </button>
              </div>
            </div>

            {/* Day strip — a visual marker of the period, not an entry grid (hours are entered as monthly totals below). Weekends muted, today ringed. */}
            <div className="space-y-2">
              <div className="flex gap-1.5 overflow-x-auto pb-1 px-0.5">
                {Array.from({ length: daysInThisMonth }, (_, i) => i + 1).map((d) => {
                  const isWeekend = [0, 6].includes(dayjs(`${year}-${month}-${d}`).day());
                  const isToday = todayInPeriod === d;
                  return (
                    <div
                      key={d}
                      className={`flex-1 min-w-[30px] text-center text-[11px] font-semibold py-2 rounded-xl transition-all duration-150 ${
                        isToday
                          ? 'bg-white text-slate-800 ring-2 ring-amber-400 ring-offset-1 shadow-sm scale-105'
                          : isWeekend
                          ? 'bg-rose-50 text-rose-300 hover:bg-rose-100'
                          : 'bg-gradient-to-b from-emerald-400 to-emerald-500 text-white shadow-sm shadow-emerald-100 hover:shadow-md hover:-translate-y-0.5'
                      }`}
                    >
                      {d}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 text-[11px] text-slate-400 px-0.5">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-500" /> Working day</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-100" /> Weekend</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white ring-2 ring-amber-400" /> Today</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <MagnifyingGlassIcon className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee" className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={remindApprovers} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Remind Approvers</button>
                {isSubmitted ? (
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
                      <th className="px-4 py-3 text-right font-semibold text-white">Regular</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">Overtime</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">Sick Leave</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">PTO</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">Paid Holiday</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">Total hour</th>
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
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number" min={0} step={0.5} disabled={isSubmitted}
                              value={draft.regularHours}
                              onChange={(e) => setDraft(row.employeeId, { regularHours: e.target.value })}
                              onBlur={() => commitDraft(row)}
                              className="w-20 text-right px-2 py-1 border border-transparent hover:border-slate-300 focus:border-amber-500 rounded text-slate-700 disabled:bg-transparent disabled:text-slate-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number" min={0} step={0.5} disabled={isSubmitted}
                              value={draft.overtimeHours}
                              onChange={(e) => setDraft(row.employeeId, { overtimeHours: e.target.value })}
                              onBlur={() => commitDraft(row)}
                              className="w-20 text-right px-2 py-1 border border-transparent hover:border-slate-300 focus:border-amber-500 rounded text-slate-700 disabled:bg-transparent disabled:text-slate-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">{fmtHours(row.sickLeaveHours)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{fmtHours(row.ptoHours)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{fmtHours(row.paidHolidayHours)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">{row.totalHours} Hours</td>
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

      {tab === 'requests' && <LeaveRequestsPanel />}
      {tab === 'policy' && <LeaveTypesPanel />}

      {settingsOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSettingsOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-800">Holiday Calendar</h3>
              <button onClick={() => setSettingsOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded"><XMarkIcon className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">Company holidays feed the Paid Holiday column above — 8 hours credited per holiday that falls in an employee&apos;s period and employment window.</p>
              <form onSubmit={(e) => { e.preventDefault(); if (!holidayForm.date || !holidayForm.name) { toast.error('Date and name are required'); return; } addHoliday.mutate(); }} className="flex flex-col sm:flex-row gap-2">
                <input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm((f) => ({ ...f, date: e.target.value }))} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                <input placeholder="Holiday name" value={holidayForm.name} onChange={(e) => setHolidayForm((f) => ({ ...f, name: e.target.value }))} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                <button type="submit" disabled={addHoliday.isPending} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"><PlusIcon className="h-4 w-4" /> Add</button>
              </form>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {holidays.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No holidays added yet</p>}
                {holidays.map((h) => (
                  <div key={h.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm text-slate-800">{h.name}</p>
                      <p className="text-xs text-slate-400">{dayjs(h.date).format('DD MMM YYYY')}</p>
                    </div>
                    <button onClick={() => removeHoliday.mutate(h.id)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"><TrashIcon className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
