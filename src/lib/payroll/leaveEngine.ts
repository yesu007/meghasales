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
