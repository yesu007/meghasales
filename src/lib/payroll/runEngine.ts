import dayjs from 'dayjs';
import { Prisma } from '@prisma/client';

export interface GeneratedLineItem {
  componentId: number;
  label: string;
  type: string;
  amount: number;
}

interface StructureComponentInput {
  component: { id: number; name: string; code: string; type: string; calculationType: string };
  value: Prisma.Decimal | number | string;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function daysInMonth(year: number, month: number): number {
  return dayjs(`${year}-${String(month).padStart(2, '0')}-01`).daysInMonth();
}

// Structure-component amounts are treated as already-monthly rupee figures
// (FLAT) or a percentage of the structure's own BASIC component
// (PERCENT_OF_BASIC) — NOT derived from the assignment's ctcAnnual. The
// annual CTC recorded on a SalaryStructureAssignment is the negotiated
// reference figure; the structure's own component values are what actually
// drive the payslip math. Reconciling the two (does 12x monthly gross
// equal the stated CTC?) is left to whoever builds the structure — this
// phase doesn't enforce or auto-derive one from the other.
export function resolveStructureLineItems(components: StructureComponentInput[]): GeneratedLineItem[] {
  const basic = components.find((c) => c.component.code === 'BASIC');
  const basicValue = basic ? Number(basic.value) : 0;

  return components.map((c) => {
    const raw = Number(c.value);
    const amount = c.component.calculationType === 'PERCENT_OF_BASIC' ? round2((basicValue * raw) / 100) : round2(raw);
    return { componentId: c.component.id, label: c.component.name, type: c.component.type, amount };
  });
}

// Payable days = calendar days in the month, minus LOP, minus any days
// before a mid-month joining date, minus any days after a mid-month exit
// date. Clamped to [0, totalDays]. Time-of-day on the join/leave dates is
// ignored — this treats a join or exit as effective for the whole of that
// calendar day.
export function computePayableDays(params: {
  year: number;
  month: number;
  totalDays: number;
  lopDays: number;
  dateOfJoining: Date | string | null;
  dateOfLeaving: Date | string | null;
}): number {
  const { year, month, totalDays, lopDays, dateOfJoining, dateOfLeaving } = params;
  const periodStart = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  const periodEnd = periodStart.endOf('month');

  let payable = totalDays;

  if (dateOfJoining) {
    const joined = dayjs(dateOfJoining);
    if (joined.isAfter(periodStart)) {
      const cappedJoin = joined.isAfter(periodEnd) ? periodEnd.add(1, 'day') : joined;
      payable -= cappedJoin.diff(periodStart, 'day');
    }
  }

  if (dateOfLeaving) {
    const left = dayjs(dateOfLeaving);
    if (left.isBefore(periodEnd)) {
      const cappedLeave = left.isBefore(periodStart) ? periodStart.subtract(1, 'day') : left;
      payable -= periodEnd.diff(cappedLeave, 'day');
    }
  }

  payable -= lopDays;
  return Math.max(0, Math.min(totalDays, payable));
}
