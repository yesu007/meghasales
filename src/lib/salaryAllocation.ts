// Pure calculation helpers for the Salary Allocation matrix — split out of
// the API route (same rationale as exchangeRate.ts's resolveExchangeRate)
// so the two figures every row and the footer depend on are computed in
// exactly one place, unit-testable without a database.

export type AllocationCheck = 'OK' | 'SHARED' | 'MISMATCH';

const ROUNDING_TOLERANCE = 0.01;

// Stored as two nullable inputs (maxSalary, incrementProvision), never as
// its own column — this is always their sum, treating either being unset
// as 0, so the two can never drift apart.
export function salaryAfterIncrement(maxSalary: number | null, incrementProvision: number | null): number {
  return (maxSalary ?? 0) + (incrementProvision ?? 0);
}

// A resource's percentage split doesn't have to sum to 100 — 0% is a
// deliberate "this cost is shared/overhead, not allocated to one line"
// state (e.g. Office Maid), not a data-entry gap. Anything else away from
// 100 genuinely needs attention.
export function allocationCheck(totalPct: number): AllocationCheck {
  if (Math.abs(totalPct - 100) < ROUNDING_TOLERANCE) return 'OK';
  if (Math.abs(totalPct) < ROUNDING_TOLERANCE) return 'SHARED';
  return 'MISMATCH';
}

export interface WeightageInput {
  salaryAfterIncrement: number;
  splits: { categoryId: number; percentage: number }[];
}
export interface WeightageCategory {
  id: number;
  name: string;
  code: string;
}
export interface CategoryWeightage {
  categoryId: number;
  name: string;
  code: string;
  allocatedAmount: number;
  weightagePct: number;
}

// "Salary Weightage for Shared Cost Allocation" — of the salary cost that
// IS allocated somewhere (a resource's unallocated/"Shared" remainder
// contributes nothing here, by construction: 0% of a row's salary times
// anything is 0), what fraction lands in each category. This is the ratio
// a shared/overhead cost elsewhere would be split by — not a report of
// spend, a planning weight.
export function computeCategoryWeightage(
  resources: WeightageInput[],
  categories: WeightageCategory[]
): CategoryWeightage[] {
  const allocatedByCategory = new Map<number, number>();
  for (const r of resources) {
    for (const s of r.splits) {
      const amount = r.salaryAfterIncrement * (s.percentage / 100);
      allocatedByCategory.set(s.categoryId, (allocatedByCategory.get(s.categoryId) || 0) + amount);
    }
  }
  const grandTotal = Array.from(allocatedByCategory.values()).reduce((a, b) => a + b, 0);

  return categories.map((c) => {
    const allocatedAmount = allocatedByCategory.get(c.id) || 0;
    return {
      categoryId: c.id,
      name: c.name,
      code: c.code,
      allocatedAmount,
      weightagePct: grandTotal > 0 ? (allocatedAmount / grandTotal) * 100 : 0,
    };
  });
}
