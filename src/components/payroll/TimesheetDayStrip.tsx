'use client';

import dayjs from 'dayjs';
import { isWeeklyOff, type SaturdayPolicy } from '@/lib/payroll/saturdayPolicy';

// Day strip — a visual marker of the period, not an entry grid (hours are
// entered as monthly totals). Sunday plus whichever Saturdays the company's
// weekly-off policy claims (Settings > Statutory Settings) are muted; today
// is ringed; a Paid Holiday from the Holiday Calendar (Time & Attendance →
// Settings) is grey, whatever day of the week it falls on. Shared by
// Payroll → Time & Attendance → Timesheet and My Space → Attendance so both
// render the period identically.
//
// With `attendance` (one employee's daily rows — My Space → Attendance) the
// strip shows what actually happened instead: green only for a Present day
// (both a Login and a Logout recorded), whatever kind of day it was, so a
// worked Holiday/Week off is green too; without that data a Holiday stays
// grey and a Week off stays muted, never green. See ATTENDANCE_STYLES.
export interface DayStripAttendance {
  date: string; // YYYY-MM-DD
  status: string; // PRESENT | INCOMPLETE | ABSENT | ON_LEAVE | HOLIDAY
  loginTime: string | null;
  logoutTime: string | null;
  leaveType?: string | null;
  holidayName?: string | null;
  weekOffNote?: string | null; // WEEK_OFF rows, or a worked week-off — the employee's own (team) schedule
  commonWorking?: boolean;
}

const GREEN = 'bg-gradient-to-b from-emerald-400 to-emerald-500 text-white shadow-sm shadow-emerald-100 hover:shadow-md';
const ATTENDANCE_STYLES = {
  present: { cls: GREEN, dot: 'bg-gradient-to-b from-emerald-400 to-emerald-500', label: 'Present' },
  incomplete: { cls: 'bg-amber-100 text-amber-700 hover:bg-amber-200', dot: 'bg-amber-300', label: 'Missing logout' },
  absent: { cls: 'bg-red-500 text-white shadow-sm shadow-red-100 hover:bg-red-600', dot: 'bg-red-500', label: 'Absent' },
  leave: { cls: 'bg-blue-100 text-blue-700 hover:bg-blue-200', dot: 'bg-blue-300', label: 'On Leave' },
  holiday: { cls: 'bg-slate-300 text-slate-600', dot: 'bg-slate-300', label: 'Paid Holiday' },
  weekOff: { cls: 'bg-violet-50 text-violet-400 hover:bg-violet-100', dot: 'bg-violet-200', label: 'Weekly off' },
  noData: { cls: 'bg-white text-slate-400 border border-slate-200', dot: 'bg-white border border-slate-300', label: 'No data yet' },
} as const;

export default function TimesheetDayStrip({ year, month, saturdayPolicy, holidays = [], attendance, weekOffs, weekOffLabel }: {
  year: number;
  month: number;
  saturdayPolicy: SaturdayPolicy;
  // Active Holiday Calendar entries (any period — only this month's are used).
  holidays?: { date: string | Date; name: string }[];
  attendance?: DayStripAttendance[];
  // Week-off dates to show instead of the company Saturday policy — e.g. the
  // viewer's own team schedule (Payroll → Time & Attendance). YYYY-MM-DD.
  weekOffs?: { date: string; note: string | null }[];
  weekOffLabel?: string; // legend text for those, e.g. "Weekly off (Team A)"
}) {
  const now = dayjs();
  const daysInThisMonth = dayjs(`${year}-${month}-01`).daysInMonth();
  const todayInPeriod = now.year() === year && now.month() + 1 === month ? now.date() : null;
  // Holiday dates are stored as plain dates (UTC midnight), so match on the
  // UTC calendar date to avoid any timezone shift.
  const holidayNameByDate = new Map(holidays.map((h) => [new Date(h.date).toISOString().slice(0, 10), h.name]));
  const pad = (n: number) => String(n).padStart(2, '0');
  // Weekday under each date number (Mon, Tue…) so Saturdays / Sundays are obvious at a glance.
  const weekdayOf = (d: number) => dayjs(`${year}-${pad(month)}-${pad(d)}`).format('ddd');
  const dayLabel = (d: number) => (
    <>
      <span className="block leading-tight">{d}</span>
      <span className="block text-[9px] font-medium leading-tight opacity-80">{weekdayOf(d)}</span>
    </>
  );
  const attendanceByDate = attendance ? new Map(attendance.map((a) => [a.date, a])) : null;
  const weekOffByDate = weekOffs ? new Map(weekOffs.map((w) => [w.date, w.note])) : null;

  // Per-employee colouring — only when `attendance` is passed.
  // The week-off comes from the employee's own rows (their team's
  // alternate Saturdays / carry-forwards), not the company-wide policy.
  const attendanceStyle = (date: string, holidayName: string | undefined): { key: keyof typeof ATTENDANCE_STYLES; title: string } => {
    const a = attendanceByDate!.get(date);
    const isWeekend = a?.status === 'WEEK_OFF' || !!a?.weekOffNote;
    const dayKind = holidayName ? `Paid Holiday: ${holidayName}` : isWeekend ? (a?.weekOffNote || 'Weekly off') : a?.commonWorking ? 'Common working Saturday' : null;
    const times = a?.loginTime ? `Login ${a.loginTime}${a.logoutTime ? ` · Logout ${a.logoutTime}` : ' · no logout'}` : '';
    const withKind = (text: string) => [text, dayKind].filter(Boolean).join(' — ');
    if (a && a.loginTime && a.logoutTime) return { key: 'present', title: withKind(`Present · ${times}`) };
    if (a && a.loginTime) return { key: 'incomplete', title: withKind(`Missing logout · ${times}`) };
    if (holidayName || a?.status === 'HOLIDAY') return { key: 'holiday', title: `Paid Holiday: ${holidayName || a?.holidayName || ''}` };
    if (isWeekend) return { key: 'weekOff', title: a?.weekOffNote || 'Weekly off' };
    if (a?.status === 'ON_LEAVE') return { key: 'leave', title: `On Leave${a.leaveType ? ` · ${a.leaveType}` : ''}` };
    if (a?.status === 'ABSENT') return { key: 'absent', title: 'Absent' };
    return { key: 'noData', title: 'No attendance data yet' };
  };

  return (
    <div className="space-y-2">
      {/* py-2 (not just pb-1) reserves room inside the scroll box for the
          "today" ring-offset — overflow-x-auto forces overflow-y to clip too
          (a CSS quirk: one axis non-visible coerces the other), so anything
          that would render outside the row's own padding gets cut off. No
          scale on today's pill for the same reason — growing past the box
          is what clipped it in the first place; the ring+shadow is enough. */}
      <div className="flex gap-1.5 overflow-x-auto py-2 px-0.5">
        {Array.from({ length: daysInThisMonth }, (_, i) => i + 1).map((d) => {
          const isWeekend = weekOffByDate
            ? weekOffByDate.has(`${year}-${pad(month)}-${pad(d)}`)
            : isWeeklyOff(dayjs(`${year}-${month}-${d}`).toDate(), saturdayPolicy);
          const isToday = todayInPeriod === d;
          const holidayName = holidayNameByDate.get(`${year}-${pad(month)}-${pad(d)}`);
          if (attendanceByDate) {
            const { key, title } = attendanceStyle(`${year}-${pad(month)}-${pad(d)}`, holidayName);
            return (
              <div
                key={d}
                title={title}
                className={`flex-1 min-w-[34px] text-center text-[11px] font-semibold py-1.5 rounded-xl transition-shadow duration-150 ${ATTENDANCE_STYLES[key].cls}${isToday ? ' ring-2 ring-amber-400 ring-offset-1 shadow-sm' : ''}`}
              >
                {dayLabel(d)}
              </div>
            );
          }
          return (
            <div
              key={d}
              title={holidayName ? `Paid Holiday: ${holidayName}` : isWeekend ? (weekOffByDate?.get(`${year}-${pad(month)}-${pad(d)}`) || 'Weekly off') : undefined}
              className={`flex-1 min-w-[34px] text-center text-[11px] font-semibold py-1.5 rounded-xl transition-shadow duration-150 ${
                holidayName
                  ? `bg-slate-300 text-slate-600${isToday ? ' ring-2 ring-amber-400 ring-offset-1 shadow-sm' : ''}`
                  : isToday
                  ? 'bg-white text-slate-800 ring-2 ring-amber-400 ring-offset-1 shadow-sm'
                  : isWeekend
                  ? 'bg-rose-50 text-rose-300 hover:bg-rose-100'
                  : 'bg-gradient-to-b from-emerald-400 to-emerald-500 text-white shadow-sm shadow-emerald-100 hover:shadow-md'
              }`}
            >
              {dayLabel(d)}
            </div>
          );
        })}
      </div>
      {attendanceByDate ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 px-0.5">
          {Object.values(ATTENDANCE_STYLES).map((st) => (
            <span key={st.label} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${st.dot}`} /> {st.label}</span>
          ))}
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white ring-2 ring-amber-400" /> Today</span>
        </div>
      ) : (
      <div className="flex items-center gap-4 text-[11px] text-slate-400 px-0.5">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-500" /> Working day</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-100" /> {weekOffLabel || 'Weekly off'}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" /> Paid Holiday</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white ring-2 ring-amber-400" /> Today</span>
      </div>
      )}
    </div>
  );
}
