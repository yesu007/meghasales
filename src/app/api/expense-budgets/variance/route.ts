import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/rbac';
import { computeMonthlyVariance, totalVariance } from '@/lib/expenseBudgetVariance';

export const dynamic = 'force-dynamic';

// Budget vs Actual, aggregated across every matching budget (BRD §6.1, §9.1
// "Budget, Actual, Variance Amount and Variance % by month, category and
// vertical"). Optional filters narrow which budgets — and therefore which
// categories/date range of actual Expense rows — feed the comparison.
export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_expense_budgets');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const verticalId = searchParams.get('verticalId') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const financialYearStart = searchParams.get('financialYearStart') || '';

    const where: Prisma.ExpenseBudgetWhereInput = {};
    const AND: Prisma.ExpenseBudgetWhereInput[] = [];
    if (verticalId) AND.push({ verticalId: parseInt(verticalId) });
    if (categoryId) AND.push({ categoryId: parseInt(categoryId) });
    if (financialYearStart) AND.push({ financialYearStart: new Date(financialYearStart) });
    if (AND.length > 0) where.AND = AND;

    const budgets = await prisma.expenseBudget.findMany({
      where,
      include: { months: true, category: { select: { id: true, name: true } }, vertical: { select: { id: true, name: true } } },
    });

    if (budgets.length === 0) {
      return NextResponse.json({ months: [], total: totalVariance([]), budgetCount: 0 });
    }

    const categoryIds = Array.from(new Set(budgets.map((b) => b.categoryId)));
    const yearStarts = budgets.map((b) => b.financialYearStart.getTime());
    const yearEnds = budgets.map((b) => b.financialYearEnd.getTime());
    const rangeStart = new Date(Math.min(...yearStarts));
    const rangeEnd = new Date(Math.max(...yearEnds));

    // Actuals scoped to the same categories and the widest financial-year
    // window any matching budget covers — a category-level budget can't be
    // meaningfully compared against expenses recorded under a different
    // category or outside its own year.
    const expenses = await prisma.expense.findMany({
      where: {
        deletedAt: null,
        categoryId: { in: categoryIds },
        expenseDate: { gte: rangeStart, lte: rangeEnd },
      },
      select: { expenseDate: true, amount: true },
    });

    const budgetMonths = budgets.flatMap((b) => b.months.map((m) => ({ month: m.month, amount: Number(m.amount) })));
    const actuals = expenses.map((e) => ({ date: e.expenseDate, amount: Number(e.amount) }));

    const months = computeMonthlyVariance(budgetMonths, actuals);

    return NextResponse.json({
      months,
      total: totalVariance(months),
      budgetCount: budgets.length,
      budgets: budgets.map((b) => ({ id: b.id, categoryName: b.category.name, verticalName: b.vertical?.name || 'Company-wide', totalAmount: b.totalAmount })),
    });
  } catch (error) {
    console.error('GET /api/expense-budgets/variance error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
