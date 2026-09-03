// Pure calculation helpers for the Salary Allocation matrix (Employee vs.
// Vertical, same grain as the Expense Budgets matrix) — split out of the
// API route so the figures every row and the footer depend on are computed
// in exactly one place, unit-testable without a database.

export type AllocationCheck = 'OK' | 'SHARED' | 'MISMATCH';

const ROUNDING_TOLERANCE = 0.01;

// An employee's percentage split doesn't have to sum to 100 — 0% is a
// deliberate "this cost is shared/overhead, not allocated to one vertical"
// state, not a data-entry gap. Anything else away from 100 genuinely needs
// attention.
export function allocationCheck(totalPct: number): AllocationCheck {
  if (Math.abs(totalPct - 100) < ROUNDING_TOLERANCE) return 'OK';
  if (Math.abs(totalPct) < ROUNDING_TOLERANCE) return 'SHARED';
  return 'MISMATCH';
}

export interface WeightageInput {
  monthlySalary: number;
  splits: { verticalKey: string; percentage: number }[];
}
export interface VerticalWeightage {
  verticalKey: string;
  allocatedAmount: number;
  weightagePct: number;
}

// Of the salary cost that IS allocated somewhere (an employee's
// unallocated/"Shared" remainder contributes nothing here, by
// construction: 0% of a salary times anything is 0), what fraction lands
// in each vertical — the same role Expense Budgets' "Monthly Budget"
// column total plays, just derived from percentages instead of entered
// directly.
export function computeVerticalWeightage(
  employees: WeightageInput[],
  verticalKeys: string[]
): VerticalWeightage[] {
  const allocatedByVertical = new Map<string, number>();
  for (const e of employees) {
    for (const s of e.splits) {
      const amount = e.monthlySalary * (s.percentage / 100);
      allocatedByVertical.set(s.verticalKey, (allocatedByVertical.get(s.verticalKey) || 0) + amount);
    }
  }
  const grandTotal = Array.from(allocatedByVertical.values()).reduce((a, b) => a + b, 0);

  return verticalKeys.map((key) => {
    const allocatedAmount = allocatedByVertical.get(key) || 0;
    return { verticalKey: key, allocatedAmount, weightagePct: grandTotal > 0 ? (allocatedAmount / grandTotal) * 100 : 0 };
  });
}
