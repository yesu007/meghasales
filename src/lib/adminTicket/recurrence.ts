import dayjs, { Dayjs } from 'dayjs';
import { Frequency } from './constants';

export interface RecurrenceRule {
  frequency: Frequency;
  intervalValue: number;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null; // 0 (Sun) - 6 (Sat)
  monthOfYear?: number | null; // 1-12, used by YEARLY
}

// Pure — no DB, no Date.now(). Callers pass `from` explicitly (usually the
// recurrence's own nextRunDate) so this stays deterministic and testable.
export function computeNextRunDate(rule: RecurrenceRule, from: Date): Date {
  const base = dayjs(from);

  switch (rule.frequency) {
    case 'DAILY':
      return base.add(rule.intervalValue, 'day').toDate();

    case 'WEEKLY': {
      let next = base.add(rule.intervalValue, 'week');
      if (rule.dayOfWeek != null) next = next.day(rule.dayOfWeek);
      return next.toDate();
    }

    case 'MONTHLY':
    case 'QUARTERLY': {
      const monthsToAdd = rule.frequency === 'QUARTERLY' ? rule.intervalValue * 3 : rule.intervalValue;
      const next = base.add(monthsToAdd, 'month');
      return clampToDayOfMonth(next, rule.dayOfMonth ?? base.date());
    }

    case 'YEARLY': {
      let next = base.add(rule.intervalValue, 'year');
      if (rule.monthOfYear != null) next = next.month(rule.monthOfYear - 1);
      return clampToDayOfMonth(next, rule.dayOfMonth ?? base.date());
    }

    case 'CUSTOM_CRON':
      throw new Error('CUSTOM_CRON recurrence is not yet supported — use DAILY/WEEKLY/MONTHLY/QUARTERLY/YEARLY');

    default:
      throw new Error(`Unknown recurrence frequency: ${rule.frequency}`);
  }
}

// A month with fewer days than the target (e.g. "the 31st" landing in
// February) clamps to that month's last day rather than overflowing into
// the next month.
function clampToDayOfMonth(d: Dayjs, dayOfMonth: number): Date {
  const daysInMonth = d.daysInMonth();
  const clamped = Math.min(dayOfMonth, daysInMonth);
  return d.date(clamped).toDate();
}
