import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { defaultMonthlySpread } from '@/lib/expenseBudgetVariance';

export const dynamic = 'force-dynamic';

// A revision changes the budget's total (and monthly spread) while keeping
// a permanent before/after record — BRD §6 "Revision / Approval" trail.
// The budget row itself is updated in place (reports always read the
// current amount); ExpenseBudgetRevision is the append-only history of how
// it got there.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expense_budgets');
  if (denied) return denied;

  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.expenseBudget.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Expense budget not found' }, { status: 404 });

    // An approved budget is a signed-off commitment — changing it still goes
    // through this same endpoint (there's no separate "edit" path), but only
    // with a reason on record, so the revision history explains why an
    // approved figure moved instead of just silently overwriting it.
    if (existing.status === 'APPROVED' && !String(body.reason || '').trim()) {
      return NextResponse.json({ message: 'A reason is required to revise an approved budget' }, { status: 400 });
    }

    if (body.newAmount === undefined || body.newAmount === null || body.newAmount === '') {
      return NextResponse.json({ message: 'newAmount is required' }, { status: 400 });
    }
    const newAmount = Number(body.newAmount);
    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      return NextResponse.json({ message: 'newAmount must be a positive number' }, { status: 400 });
    }

    const months: { month: string; amount: number }[] =
      Array.isArray(body.months) && body.months.length > 0
        ? body.months
        : defaultMonthlySpread(newAmount, existing.financialYearStart, existing.financialYearEnd);

    const monthsSum = Math.round(months.reduce((sum, m) => sum + Number(m.amount), 0) * 100) / 100;
    if (Math.abs(monthsSum - Math.round(newAmount * 100) / 100) > 0.01) {
      return NextResponse.json(
        { message: `Monthly spread (${monthsSum}) must add up to the revised total (${newAmount})` },
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);
    const revisedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const [budget] = await prisma.$transaction([
      prisma.expenseBudget.update({
        where: { id },
        data: { totalAmount: newAmount, months: { deleteMany: {}, create: months.map((m) => ({ month: new Date(`${m.month}-01`), amount: Number(m.amount) })) } },
        include: { months: { orderBy: { month: 'asc' } } },
      }),
      prisma.expenseBudgetRevision.create({
        data: {
          budgetId: id,
          previousAmount: existing.totalAmount,
          newAmount,
          reason: body.reason || null,
          revisedById: Number.isFinite(revisedById) ? revisedById : null,
        },
      }),
    ]);

    await logAudit({
      action: 'UPDATE',
      entityType: 'EXPENSE_BUDGET',
      entityId: id,
      oldValue: { totalAmount: existing.totalAmount },
      newValue: { totalAmount: newAmount },
      description: `Expense budget revised: ${existing.totalAmount} → ${newAmount}${body.reason ? ` (${body.reason})` : ''}`,
      request,
    });

    return NextResponse.json(budget);
  } catch (error: any) {
    console.error('POST /api/expense-budgets/[id]/revise error:', error);
    return NextResponse.json({ message: error.message || 'Failed to revise expense budget' }, { status: 400 });
  }
}
