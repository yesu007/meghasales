import dayjs, { Dayjs } from 'dayjs';

// Same FY convention the Expense Budgets page already uses (01-Aug-YYYY to
// 31-Jul-(YYYY+1), see its own thisFinancialYearStart()) — extracted here,
// rather than imported from that client component, so server-side code
// (e.g. the Verticals actual-expenses aggregation) can compute the same
// "current financial year" without duplicating the rule by hand or
// reaching into a 'use client' page.
//
// Built from a "YYYY-MM-DD" string, NOT `new Date(year, 7, 1)` — the
// existing Expense Budgets flow always round-trips financialYearStart as a
// date-only string (form field -> fyStart.format('YYYY-MM-DD') -> POST body
// -> `new Date(body.financialYearStart)` in /api/expense-budgets), and a
// date-only ISO string always parses as UTC midnight. `new Date(y, m, d)`
// instead parses as *local* midnight, which on a server not running in UTC
// is a different instant — an exact-match Prisma query on
// financialYearStart against real ExpenseBudget rows would then silently
// match nothing.
export function thisFinancialYearStart(): Dayjs {
  const now = dayjs();
  const startYear = now.month() >= 7 ? now.year() : now.year() - 1;
  return dayjs(new Date(`${startYear}-08-01`));
}

export function financialYearEnd(start: Dayjs): Dayjs {
  return start.add(1, 'year').subtract(1, 'day');
}
