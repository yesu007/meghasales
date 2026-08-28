import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_expense_budgets');
  if (denied) return denied;
  try {
    const budget = await prisma.expenseBudget.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        vertical: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
        months: { orderBy: { month: 'asc' } },
        revisions: { orderBy: { createdAt: 'desc' }, include: { revisedBy: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!budget) return NextResponse.json({ message: 'Expense budget not found' }, { status: 404 });
    return NextResponse.json(budget);
  } catch (error) {
    console.error('GET /api/expense-budgets/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Handles notes/status edits, including the DRAFT -> APPROVED transition —
// same "one PUT-shaped route covers a status flip" reasoning as Expense's
// mark-PAID. Amount changes go through /revise instead, since those need a
// tracked before/after (see ExpenseBudgetRevision) that a plain field edit
// here deliberately does not produce.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expense_budgets');
  if (denied) return denied;
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.expenseBudget.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Expense budget not found' }, { status: 404 });

    const session = await getServerSession(authOptions);
    const userId = session?.user ? parseInt((session.user as any).id, 10) : null;

    const approving = body.status === 'APPROVED' && existing.status !== 'APPROVED';

    const budget = await prisma.expenseBudget.update({
      where: { id },
      data: {
        ...(body.notes !== undefined && { notes: body.notes || null }),
        ...(body.status !== undefined && { status: body.status }),
        ...(approving && { approvedById: Number.isFinite(userId) ? userId : null, approvedAt: new Date() }),
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'EXPENSE_BUDGET', entityId: id, oldValue: existing, newValue: budget, description: approving ? 'Expense budget approved' : 'Expense budget updated', request });

    return NextResponse.json(budget);
  } catch (error: any) {
    console.error('PATCH /api/expense-budgets/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update expense budget' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expense_budgets');
  if (denied) return denied;
  try {
    const id = parseInt(params.id);

    const existing = await prisma.expenseBudget.findUnique({
      where: { id },
      include: { category: { select: { name: true } }, vertical: { select: { name: true } } },
    });
    if (!existing) return NextResponse.json({ message: 'Expense budget not found' }, { status: 404 });

    // Approved budgets are the official record other reports read from —
    // revise them instead of deleting, same reasoning as invoices blocking
    // delete once payments exist.
    if (existing.status === 'APPROVED') {
      return NextResponse.json({ message: 'Cannot delete an approved budget — revise it instead' }, { status: 400 });
    }

    await prisma.expenseBudget.delete({ where: { id } });

    await logAudit({
      action: 'DELETE',
      entityType: 'EXPENSE_BUDGET',
      entityId: id,
      oldValue: existing,
      description: `Expense budget deleted for ${existing.category.name} (${existing.vertical?.name || 'Company-wide'})`,
      request,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('DELETE /api/expense-budgets/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete expense budget' }, { status: 400 });
  }
}
