import dayjs from 'dayjs';
import { Prisma, PrismaClient } from '@prisma/client';
import { round2 } from './runEngine';

type Client = Prisma.TransactionClient | PrismaClient;

interface LeaveRequestForLop {
  startDate: Date;
  endDate: Date;
  days: Prisma.Decimal | number | string;
}

// Clips each request's date range to the pay period and takes the
// overlap's share of its total days — a request spanning a month
// boundary contributes only the portion that actually falls in this
// period. Assumes days are spread evenly across the request's date span,
// which is exact for a request entirely inside one period and a
// reasonable approximation for one that isn't.
export function computeAutoLopDaysFromRequests(requests: LeaveRequestForLop[], periodStart: Date, periodEnd: Date): number {
  let lopDays = 0;
  const start = dayjs(periodStart);
  const end = dayjs(periodEnd);

  for (const r of requests) {
    const reqStart = dayjs(r.startDate);
    const reqEnd = dayjs(r.endDate);
    const overlapStart = reqStart.isAfter(start) ? reqStart : start;
    const overlapEnd = reqEnd.isBefore(end) ? reqEnd : end;
    if (overlapEnd.isBefore(overlapStart)) continue; // no actual overlap

    const totalSpanDays = reqEnd.diff(reqStart, 'day') + 1;
    const overlapDays = overlapEnd.diff(overlapStart, 'day') + 1;
    if (totalSpanDays <= 0) continue;

    lopDays += Number(r.days) * (overlapDays / totalSpanDays);
  }

  return round2(lopDays);
}

// Only APPROVED requests against an unpaid (isPaid: false) leave type
// count as LOP — a paid leave type (Casual/Sick/Earned) means the
// employee is absent but still gets paid for those days, so it must NOT
// reduce payableDays the way an actual LOP day does.
export async function computeAutoLopDays(tx: Client, employeeId: number, periodStart: Date, periodEnd: Date): Promise<number> {
  const requests = await tx.leaveRequest.findMany({
    where: {
      employeeId,
      status: 'APPROVED',
      leaveType: { isPaid: false },
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
    },
  });
  return computeAutoLopDaysFromRequests(requests, periodStart, periodEnd);
}

export interface DepartmentOverlapColleague {
  employeeId: number;
  name: string;
  status: string;
}

// Flags when a leave request shares its dates with one or more OTHER
// employees in the same department who are already PENDING/APPROVED for
// that window — e.g. two of three testers out the same week. department
// is matched exactly (it's free-text on Employee, not an enum) and a
// null/blank department never matches anything, since there's no group to
// cross-check against. Used both at apply-time (to notify the applier and
// every approve_leave holder) and on the approval queue (to flag it for
// whoever is about to decide).
export async function findOverlappingDepartmentColleagues(
  tx: Client,
  department: string,
  employeeId: number,
  startDate: Date,
  endDate: Date
): Promise<DepartmentOverlapColleague[]> {
  const rows = await tx.leaveRequest.findMany({
    where: {
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      employee: { id: { not: employeeId }, department },
    },
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
  });

  const seen = new Map<number, DepartmentOverlapColleague>();
  for (const r of rows) {
    if (!seen.has(r.employee.id)) {
      seen.set(r.employee.id, { employeeId: r.employee.id, name: `${r.employee.firstName} ${r.employee.lastName}`, status: r.status });
    }
  }
  return Array.from(seen.values());
}
