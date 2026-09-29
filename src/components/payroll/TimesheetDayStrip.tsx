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
export default function TimesheetDayStrip({ year, month, saturdayPolicy, holidays = [] }: {
  year: number;
  month: number;
  saturdayPolicy: SaturdayPolicy;
  // Active Holiday Calendar entries (any period — only this month's are used).
  holidays?: { date: string | Date; name: string }[];
}) {
  const now = dayjs();
  const daysInThisMonth = dayjs(`${year}-${month}-01`).daysInMonth();
  const todayInPeriod = now.year() === year && now.month() + 1 === month ? now.date() : null;
  // Holiday dates are stored as plain dates (UTC midnight), so match on the
  // UTC calendar date to avoid any timezone shift.
  const holidayNameByDate = new Map(holidays.map((h) => [new Date(h.date).toISOString().slice(0, 10), h.name]));
  const pad = (n: number) => String(n).padStart(2, '0');

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
          const isWeekend = isWeeklyOff(dayjs(`${year}-${month}-${d}`).toDate(), saturdayPolicy);
          const isToday = todayInPeriod === d;
          const holidayName = holidayNameByDate.get(`${year}-${pad(month)}-${pad(d)}`);
          return (
            <div
              key={d}
              title={holidayName ? `Paid Holiday: ${holidayName}` : undefined}
              className={`flex-1 min-w-[30px] text-center text-[11px] font-semibold py-2 rounded-xl transition-shadow duration-150 ${
                holidayName
                  ? `bg-slate-300 text-slate-600${isToday ? ' ring-2 ring-amber-400 ring-offset-1 shadow-sm' : ''}`
                  : isToday
                  ? 'bg-white text-slate-800 ring-2 ring-amber-400 ring-offset-1 shadow-sm'
                  : isWeekend
                  ? 'bg-rose-50 text-rose-300 hover:bg-rose-100'
                  : 'bg-gradient-to-b from-emerald-400 to-emerald-500 text-white shadow-sm shadow-emerald-100 hover:shadow-md'
              }`}
            >
              {d}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 text-[11px] text-slate-400 px-0.5">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-500" /> Working day</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-100" /> Weekly off</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" /> Paid Holiday</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white ring-2 ring-amber-400" /> Today</span>
      </div>
    </div>
  );
}
