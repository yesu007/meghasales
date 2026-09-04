// Pure, dependency-free (no `@/lib/prisma` import) so it's importable from
// Vitest without a path-alias setup — same reasoning as expenseBudgetVariance.ts.
//
// Resource-based costing for the Quotation Calculator: role x qty x
// duration-in-days x day-rate line items, rolled up through admin/overhead,
// outsourcing/travel, markup and a flat tax %, exactly mirroring the
// approved mockup's recalc() logic. Kept separate from the existing
// catalog/module-driven Quotation flow's tax engine (taxCalculation.ts),
// which is country/GST-aware — this mode intentionally stays a simple flat
// tax % input, matching the mockup.

export interface ResourceLine {
  role: string;
  qty: number;
  durationDays: number;
  dayRate: number;
  // Purely descriptive — which employee (if any) this line is staffed by,
  // e.g. "Kousika SS (EMP-000027)". Never read by the costing math below;
  // `role` alone (a client-facing job title) is what feeds quotation/
  // invoice line items. Optional so a non-employee (contractor, new hire)
  // line simply omits it.
  employeeRef?: string | null;
}

export type CostMode = 'PCT' | 'FIXED';

export interface ResourceCostingInput {
  resources: ResourceLine[];
  adminMode: CostMode;
  adminValue: number;
  outsourcingCost: number;
  travelCost: number;
  markupMode: CostMode;
  markupValue: number;
  discountMode?: CostMode;
  discountValue?: number;
  taxPercentage: number;
  overrideAmount?: number;
}

export interface ResourceCostingResult {
  resourceCostTotal: number;
  adminCost: number;
  baseCost: number;
  markupAmount: number;
  subtotal: number;
  discountAmount: number;
  preTax: number;
  taxAmount: number;
  calculatedTotalAmount: number;
  totalAmount: number;
  totalAmountOverridden: boolean;
  marginPercent: number;
}

// Standardized as annual ÷ 12 ÷ 30 (i.e. a flat 30-day month), used only to
// turn an employee's annual CTC into a per-day billing-rate estimate for the
// Resources autocomplete below — e.g. ₹12,00,000/yr → ₹1,00,000/mo →
// ₹3,333.33/day. Deliberately distinct from Payroll's own day-rate
// convention (src/lib/payroll/runEngine.ts's daysInMonth), which prorates by
// the actual calendar days in one specific month for payslip generation —
// a different purpose (net pay for a month) than this one (a general
// costing/billing-rate basis for a quotation).
export const ANNUAL_BILLING_DAYS = 360;

export function dayRateFromAnnualCtc(ctcAnnual: number): number {
  return Math.round((ctcAnnual / ANNUAL_BILLING_DAYS) * 100) / 100;
}

export function computeResourceCosting(input: ResourceCostingInput): ResourceCostingResult {
  const resourceCostTotal = input.resources.reduce((sum, r) => sum + r.qty * r.durationDays * r.dayRate, 0);

  const adminCost = input.adminMode === 'PCT' ? resourceCostTotal * (input.adminValue / 100) : input.adminValue;

  const baseCost = resourceCostTotal + input.outsourcingCost + input.travelCost + adminCost;

  const markupAmount = input.markupMode === 'PCT' ? baseCost * (input.markupValue / 100) : input.markupValue;

  // subtotal is the pre-discount sale price (cost + markup) — same quantity
  // catalog-mode quotations call "subtotal". Discount comes off that, same
  // order of operations as catalog mode (see quotation-config/calculate):
  // subtotal -> discount -> taxable amount -> tax -> total.
  const subtotal = baseCost + markupAmount;
  const discountMode: CostMode = input.discountMode === 'FIXED' ? 'FIXED' : 'PCT';
  const discountValue = input.discountValue || 0;
  const discountAmount = discountMode === 'PCT' ? subtotal * (discountValue / 100) : discountValue;

  const preTax = subtotal - discountAmount;
  const taxAmount = preTax * (input.taxPercentage / 100);
  const calculatedTotalAmount = preTax + taxAmount;

  const overrideAmount = input.overrideAmount || 0;
  const totalAmount = overrideAmount > 0 ? overrideAmount : calculatedTotalAmount;
  const totalAmountOverridden = overrideAmount > 0;

  const marginPercent = totalAmount > 0 ? ((totalAmount - baseCost) / totalAmount) * 100 : 0;

  return {
    resourceCostTotal,
    adminCost,
    baseCost,
    markupAmount,
    subtotal,
    discountAmount,
    preTax,
    taxAmount,
    calculatedTotalAmount,
    totalAmount,
    totalAmountOverridden,
    marginPercent,
  };
}
