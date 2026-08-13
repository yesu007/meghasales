import dayjs from 'dayjs';

// Split out from timesheetEngine.ts (which imports @prisma/client) so the
// Time & Attendance page — a client component rendering the day strip —
// can import this pure date logic directly without pulling Prisma into
// the browser bundle.

export type SaturdayPolicy = 'NONE' | 'ALL' | 'FIRST_THIRD' | 'SECOND_FOURTH';

// Which occurrence of its weekday this date is within its own month (1st,
// 2nd, 3rd, ...) — e.g. the third Saturday of August. Used only for
// Saturdays below, but written generically since "nth <weekday> of the
// month" is the actual rule, not anything Saturday-specific.
function weekdayOccurrenceInMonth(date: dayjs.Dayjs): number {
  return Math.floor((date.date() - 1) / 7) + 1;
}

// Sunday is always off. Saturday's treatment is a company policy — most
// Indian companies give every OTHER Saturday off (alternate Saturdays)
// rather than every Saturday, most commonly the 2nd and 4th; some instead
// use the 1st and 3rd. ALL/NONE cover the "every Saturday off" and
// "no Saturdays off" ends of that spectrum. A rare 5th Saturday is only
// off under ALL — neither alternating policy claims it.
export function isWeeklyOff(date: Date, policy: SaturdayPolicy): boolean {
  const d = dayjs(date);
  const dow = d.day(); // 0 = Sunday, 6 = Saturday
  if (dow === 0) return true;
  if (dow !== 6) return false;

  if (policy === 'ALL') return true;
  if (policy === 'NONE') return false;
  const occurrence = weekdayOccurrenceInMonth(d);
  return policy === 'FIRST_THIRD' ? occurrence === 1 || occurrence === 3 : occurrence === 2 || occurrence === 4;
}
