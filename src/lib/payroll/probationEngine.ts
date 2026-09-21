import dayjs from 'dayjs';

// Pure date math for the Probation Period employee type — deliberately
// no Prisma import (same split as saturdayPolicy.ts) so this can be
// reused from both server routes and, if ever needed, a client bundle.

// dayjs().add(n, 'month') is calendar-month-correct (handles month-end
// overflow, e.g. 31-Jan + 1 month = 28/29-Feb, not a naive +30 days), which
// is what "Date of Joining + Probation Duration" means here.
export function computeProbationEndDate(dateOfJoining: Date, durationMonths: number): Date {
  return dayjs(dateOfJoining).add(durationMonths, 'month').toDate();
}

// Employment type codes are a free-text pseudo-enum throughout this
// schema (see Employee.employmentType's own comment) — this is simply the
// one this feature cares about, kept as a named constant so it isn't
// retyped as a string literal at every call site.
export const PROBATION_EMPLOYMENT_TYPE = 'PROBATION';

export function isProbationEmploymentType(employmentType: string | null | undefined): boolean {
  return employmentType === PROBATION_EMPLOYMENT_TYPE;
}
