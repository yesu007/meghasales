import dayjs from 'dayjs';
import { Prisma } from '@prisma/client';

export interface GeneratedLineItem {
  componentId: number;
  label: string;
  type: string;
  amount: number;
}

interface StructureComponentInput {
  component: { id: number; name: string; code: string; type: string; calculationType: string; statutoryType?: string | null };
  value: Prisma.Decimal | number | string;
}

export interface PtSlabInput {
  minGross: number;
  maxGross: number | null;
  monthlyAmount: number;
}

export interface StatutoryConfig {
  pfWageCeiling: number | null; // null = no ceiling, PF applies to full Basic
  esiGrossThreshold: number | null; // null = never gate ESI on gross
  ptSlabs: PtSlabInput[];
}

const NO_STATUTORY_CONFIG: StatutoryConfig = { pfWageCeiling: null, esiGrossThreshold: null, ptSlabs: [] };

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function daysInMonth(year: number, month: number): number {
  return dayjs(`${year}-${String(month).padStart(2, '0')}-01`).daysInMonth();
}

function resolveFlatOrPercent(raw: number, calculationType: string, basicValue: number): number {
  return calculationType === 'PERCENT_OF_BASIC' ? round2((basicValue * raw) / 100) : round2(raw);
}

// Looks up the monthly PT amount for a given gross — the slab whose
// [minGross, maxGross] range contains it, or 0 if gross falls below every
// slab's minimum (or no slabs are configured at all).
export function resolvePtAmount(gross: number, slabs: PtSlabInput[]): number {
  const slab = slabs.find((s) => gross >= s.minGross && (s.maxGross == null || gross <= s.maxGross));
  return slab ? slab.monthlyAmount : 0;
}

// Structure-component amounts are treated as already-monthly rupee figures
// (FLAT) or a percentage of the structure's own BASIC component
// (PERCENT_OF_BASIC) — NOT derived from the assignment's ctcAnnual. The
// annual CTC recorded on a SalaryStructureAssignment is the negotiated
// reference figure; the structure's own component values are what actually
// drive the payslip math. Reconciling the two (does 12x monthly gross
// equal the stated CTC?) is left to whoever builds the structure — this
// phase doesn't enforce or auto-derive one from the other.
//
// Earnings resolve first so gross is known before any statutoryType
// deduction needs it (PT slab lookup, ESI threshold check) — a two-pass
// resolution, not a single map like before Phase 4. statutoryType layers
// on top of calculationType rather than replacing it: PF still reads
// calculationType/value (just against a possibly-capped Basic), PT and ESI
// ignore this row's stored value/percent entirely once gated/looked-up.
// All figures here are full-month (unscaled) — generateRunPayslips/
// recalculatePayslip apply the payableDays/totalDays ratio afterward, so
// slab/threshold decisions are made against the employee's normal
// contracted monthly gross, not a pro-rated actual-paid amount.
export function resolveStructureLineItems(components: StructureComponentInput[], statutory: StatutoryConfig = NO_STATUTORY_CONFIG): GeneratedLineItem[] {
  const basic = components.find((c) => c.component.code === 'BASIC');
  const basicValue = basic ? Number(basic.value) : 0;

  const earnings = components.filter((c) => c.component.type === 'EARNING');
  const deductions = components.filter((c) => c.component.type === 'DEDUCTION');

  const earningItems: GeneratedLineItem[] = earnings.map((c) => ({
    componentId: c.component.id,
    label: c.component.name,
    type: c.component.type,
    amount: resolveFlatOrPercent(Number(c.value), c.component.calculationType, basicValue),
  }));
  const grossEarnings = round2(earningItems.reduce((s, i) => s + i.amount, 0));

  const deductionItems: GeneratedLineItem[] = deductions.map((c) => {
    const base = { componentId: c.component.id, label: c.component.name, type: c.component.type };

    if (c.component.statutoryType === 'PT') {
      return { ...base, amount: resolvePtAmount(grossEarnings, statutory.ptSlabs) };
    }
    if (c.component.statutoryType === 'ESI') {
      if (statutory.esiGrossThreshold != null && grossEarnings > statutory.esiGrossThreshold) {
        return { ...base, amount: 0 };
      }
      return { ...base, amount: resolveFlatOrPercent(Number(c.value), c.component.calculationType, basicValue) };
    }
    if (c.component.statutoryType === 'PF' && c.component.calculationType === 'PERCENT_OF_BASIC') {
      const cappedBasic = statutory.pfWageCeiling != null ? Math.min(basicValue, statutory.pfWageCeiling) : basicValue;
      return { ...base, amount: resolveFlatOrPercent(Number(c.value), 'PERCENT_OF_BASIC', cappedBasic) };
    }
    return { ...base, amount: resolveFlatOrPercent(Number(c.value), c.component.calculationType, basicValue) };
  });

  return [...earningItems, ...deductionItems];
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
