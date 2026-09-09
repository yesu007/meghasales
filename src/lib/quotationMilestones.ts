// Pure, dependency-free (no `@/lib/prisma` import) so it's importable from
// both the client (Quotation Calculator form) and the server without a
// path-alias/DB dependency — same reasoning as quotationResourceCosting.ts.
//
// A milestone PLAN is just { percentage, gapDays } pairs, edited on the
// quotation like any other pricing input (stored in pricingSnapshot). It
// only becomes dated, trackable QuotationPaymentMilestone rows once the
// quotation is approved (see materializeMilestonePlan below) — gapDays is
// "days after the previous milestone's date" (milestone 1 is always
// immediate: its own gapDays is ignored and treated as 0).

export interface MilestonePlanInput {
  percentage: number;
  gapDays: number;
}

export interface MilestoneSchedule extends MilestonePlanInput {
  sequence: number;
  scheduledDate: Date;
  amount: number;
}

// Sums to exactly 100 within a cent's tolerance — percentages are entered as
// e.g. 33.33 + 33.33 + 33.34, which floating point can leave a hair off 100.
const TOLERANCE = 0.01;

export function validateMilestonePlan(plan: MilestonePlanInput[]): string | null {
  if (plan.length === 0) return null; // no plan configured is valid — falls back to one lump-sum invoice
  for (let idx = 0; idx < plan.length; idx++) {
    const m = plan[idx];
    if (!Number.isFinite(m.percentage) || m.percentage <= 0) return `Milestone ${idx + 1}: percentage must be greater than 0`;
    if (idx > 0 && (!Number.isFinite(m.gapDays) || m.gapDays < 0)) return `Milestone ${idx + 1}: invoice gap (days) must be 0 or more`;
  }
  const total = Math.round(plan.reduce((sum, m) => sum + m.percentage, 0) * 100) / 100;
  if (Math.abs(total - 100) > TOLERANCE) return `Milestone percentages must add up to 100% (currently ${total}%)`;
  return null;
}

// Turns the plan into dated rows + per-milestone amounts, anchored at
// `approvalDate` (milestone 1's scheduledDate === approvalDate; each
// subsequent one is `gapDays` after the PRECEDING milestone's date, matching
// "Milestone 2: 15 days after Milestone 1" rather than after approval).
// The last milestone absorbs any rounding remainder so the amounts always
// sum to exactly totalAmount, regardless of how the percentages round.
export function materializeMilestonePlan(plan: MilestonePlanInput[], totalAmount: number, approvalDate: Date): MilestoneSchedule[] {
  let cursor = new Date(approvalDate);
  let allocated = 0;
  const rounded = (n: number) => Math.round(n * 100) / 100;

  return plan.map((m, idx) => {
    if (idx > 0) cursor = new Date(cursor.getTime() + m.gapDays * 24 * 60 * 60 * 1000);
    const isLast = idx === plan.length - 1;
    const amount = isLast ? rounded(totalAmount - allocated) : rounded(totalAmount * (m.percentage / 100));
    allocated = rounded(allocated + amount);
    return { sequence: idx + 1, percentage: m.percentage, gapDays: idx === 0 ? 0 : m.gapDays, scheduledDate: new Date(cursor), amount };
  });
}
