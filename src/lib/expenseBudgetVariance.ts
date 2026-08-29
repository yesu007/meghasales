// Pure, dependency-free (no `@/lib/prisma` import) so it's importable from
// Vitest without a path-alias setup — same reasoning as reportGrouping.ts.

export interface BudgetMonthInput {
  month: string | Date;
  amount: number;
}

export interface ActualAmountInput {
  date: string | Date;
  amount: number;
}

export interface MonthVariance {
  month: string; // 'YYYY-MM'
  budgeted: number;
  actual: number;
  varianceAmount: number; // actual − budgeted; positive = over budget
  variancePercent: number | null; // null when budgeted is 0 (nothing to divide by)
}

function monthKey(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Budget vs Actual, month by month (BRD §6.1, §9.1). Every month either
// side ever mentions shows up in the result — a month with actual spend but
// no budget line (over-spend nobody planned for) is exactly the kind of row
// this report exists to surface, not to hide.
export function computeMonthlyVariance(
  budgetMonths: BudgetMonthInput[],
  actuals: ActualAmountInput[]
): MonthVariance[] {
  const budgeted = new Map<string, number>();
  for (const m of budgetMonths) {
    const key = monthKey(m.month);
    budgeted.set(key, (budgeted.get(key) || 0) + m.amount);
  }

  const actual = new Map<string, number>();
  for (const a of actuals) {
    const key = monthKey(a.date);
    actual.set(key, (actual.get(key) || 0) + a.amount);
  }

  const allMonths = new Set(Array.from(budgeted.keys()).concat(Array.from(actual.keys())));

  return Array.from(allMonths)
    .sort()
    .map((month) => {
      const b = budgeted.get(month) || 0;
      const a = actual.get(month) || 0;
      const varianceAmount = a - b;
      return {
        month,
        budgeted: b,
        actual: a,
        varianceAmount,
        variancePercent: b === 0 ? null : (varianceAmount / b) * 100,
      };
    });
}

export function totalVariance(rows: MonthVariance[]): Omit<MonthVariance, 'month'> {
  const budgeted = rows.reduce((sum, r) => sum + r.budgeted, 0);
  const actual = rows.reduce((sum, r) => sum + r.actual, 0);
  const varianceAmount = actual - budgeted;
  return { budgeted, actual, varianceAmount, variancePercent: budgeted === 0 ? null : (varianceAmount / budgeted) * 100 };
}

// Even split of a total across every calendar month the financial year
// touches, remainder folded into the last month so the months always sum
// back to exactly `totalAmount` (never off by a rounding cent). Used to
// pre-fill the monthly spread editor — the user can still hand-edit any
// month afterward.
export function defaultMonthlySpread(
  totalAmount: number,
  financialYearStart: string | Date,
  financialYearEnd: string | Date
): { month: string; amount: number }[] {
  const start = typeof financialYearStart === 'string' ? new Date(financialYearStart) : financialYearStart;
  const end = typeof financialYearEnd === 'string' ? new Date(financialYearEnd) : financialYearEnd;

  const months: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= last) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  if (months.length === 0) return [];

  const perMonth = Math.floor((totalAmount / months.length) * 100) / 100;
  const spread = months.map((month) => ({ month, amount: perMonth }));
  const allocated = perMonth * (months.length - 1);
  spread[spread.length - 1].amount = Math.round((totalAmount - allocated) * 100) / 100;
  return spread;
}
