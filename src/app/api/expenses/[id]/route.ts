import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_expenses');
  if (denied) return denied;
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        category: { select: { name: true } },
        recordedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!expense || expense.deletedAt) return NextResponse.json({ message: 'Expense not found' }, { status: 404 });
    return NextResponse.json(expense);
  } catch (error) {
    console.error('GET /api/expenses/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Handles both a regular field edit and "mark paid" (status -> PAID +
// paidDate) through the same PUT — unlike Invoice, there's no multi-payment
// accumulation to reconcile, so a dedicated action route would just be
// another way to set the same two columns.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return NextResponse.json({ message: 'Expense not found' }, { status: 404 });

    if (body.categoryId !== undefined) {
      const category = await prisma.expenseCategory.findUnique({ where: { id: parseInt(body.categoryId) } });
      if (!category) return NextResponse.json({ message: 'Category not found' }, { status: 404 });
    }

    const nextStatus = body.status !== undefined ? body.status : existing.status;
    const expense = await prisma.expense.update({
      where: { id },
      data: {
        ...(body.categoryId !== undefined && { categoryId: parseInt(body.categoryId) }),
        ...(body.vendor !== undefined && { vendor: body.vendor || null }),
        ...(body.expenseDate !== undefined && { expenseDate: new Date(body.expenseDate) }),
        ...(body.amount !== undefined && { amount: Number(body.amount) }),
        ...(body.currencyCode !== undefined && { currencyCode: body.currencyCode }),
        ...(body.exchangeRate !== undefined && { exchangeRate: Number(body.exchangeRate) }),
        ...(body.paymentMethod !== undefined && { paymentMethod: body.paymentMethod }),
        ...(body.referenceNumber !== undefined && { referenceNumber: body.referenceNumber || null }),
        ...(body.attachmentUrl !== undefined && { attachmentUrl: body.attachmentUrl || null }),
        ...(body.attachmentName !== undefined && { attachmentName: body.attachmentName || null }),
        ...(body.notes !== undefined && { notes: body.notes || null }),
        ...(body.status !== undefined && { status: nextStatus }),
        // Marking PAID stamps paidDate (today, unless the caller supplies
        // one); moving back to PENDING clears it so the two stay consistent.
        ...(body.status === 'PAID' && { paidDate: body.paidDate ? new Date(body.paidDate) : (existing.paidDate ?? new Date()) }),
        ...(body.status === 'PENDING' && { paidDate: null }),
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'EXPENSE', entityId: id, oldValue: existing, newValue: expense, description: `Expense ${expense.expenseNumber} updated`, request });

    return NextResponse.json(expense);
  } catch (error: any) {
    console.error('PUT /api/expenses/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update expense' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;
  try {
    const id = parseInt(params.id);
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return NextResponse.json({ message: 'Expense not found' }, { status: 404 });

    const expense = await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit({ action: 'DELETE', entityType: 'EXPENSE', entityId: id, oldValue: existing, description: `Expense ${existing.expenseNumber} deleted`, request });

    return NextResponse.json(expense);
  } catch (error) {
    console.error('DELETE /api/expenses/[id] error:', error);
    return NextResponse.json({ message: 'Failed to delete expense' }, { status: 400 });
  }
}
