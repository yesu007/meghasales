import { z } from 'zod';
import prisma from '@/lib/prisma';
import { createAssistantTool } from '../registry';
import { computeMonthlyVariance, totalVariance } from '@/lib/expenseBudgetVariance';

export const readExpenseBudgetVariance = createAssistantTool({
  description: 'Get Budget vs Actual expense variance, optionally filtered by vertical or financial year start date (YYYY-MM-DD).',
  permission: 'view_expense_budgets',
  inputSchema: z.object({
    verticalId: z.number().int().optional(),
    financialYearStart: z.string().optional(),
  }),
  handler: async ({ verticalId, financialYearStart }) => {
    const budgets = await prisma.expenseBudget.findMany({
      where: {
        ...(verticalId && { verticalId }),
        ...(financialYearStart && { financialYearStart: new Date(financialYearStart) }),
      },
      include: { months: true, category: { select: { id: true } } },
    });

    if (budgets.length === 0) return { budgetCount: 0, total: totalVariance([]) };

    const categoryIds = Array.from(new Set(budgets.map((b) => b.categoryId)));
    const rangeStart = new Date(Math.min(...budgets.map((b) => b.financialYearStart.getTime())));
    const rangeEnd = new Date(Math.max(...budgets.map((b) => b.financialYearEnd.getTime())));

    const expenses = await prisma.expense.findMany({
      where: { deletedAt: null, categoryId: { in: categoryIds }, expenseDate: { gte: rangeStart, lte: rangeEnd } },
      select: { expenseDate: true, amount: true },
    });

    const months = computeMonthlyVariance(
      budgets.flatMap((b) => b.months.map((m) => ({ month: m.month, amount: Number(m.amount) }))),
      expenses.map((e) => ({ date: e.expenseDate, amount: Number(e.amount) }))
    );

    return { budgetCount: budgets.length, total: totalVariance(months), monthsOverBudget: months.filter((m) => m.varianceAmount > 0).length };
  },
});
