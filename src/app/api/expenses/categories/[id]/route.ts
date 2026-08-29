import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// PUT/DELETE for a single category — added alongside the Expense Categories
// table's View/Edit/Delete actions (src/app/dashboard/expenses/page.tsx).
// The collection route (../route.ts) stays create/list-only, unchanged.

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();
    if (!body.name) return NextResponse.json({ message: 'name is required' }, { status: 400 });

    const existing = await prisma.expenseCategory.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Category not found' }, { status: 404 });

    const category = await prisma.expenseCategory.update({
      where: { id },
      data: { name: body.name, description: body.description ?? null },
    });

    await logAudit({ action: 'UPDATE', entityType: 'EXPENSE_CATEGORY', entityId: id, oldValue: existing, newValue: category, description: `Expense category "${category.name}" updated`, request });

    return NextResponse.json(category);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A category with that name already exists' }, { status: 409 });
    }
    console.error('PUT /api/expenses/categories/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update category' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.expenseCategory.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Category not found' }, { status: 404 });

    // Refuse rather than cascade — an expense/budget left pointing at a
    // deleted category (or a sub-category orphaned from its parent) would
    // be a broken reference, not a clean deletion.
    const [expenseCount, budgetCount, subCategoryCount] = await Promise.all([
      prisma.expense.count({ where: { categoryId: id } }),
      prisma.expenseBudget.count({ where: { categoryId: id } }),
      prisma.expenseSubCategory.count({ where: { categoryId: id } }),
    ]);
    if (expenseCount > 0 || budgetCount > 0 || subCategoryCount > 0) {
      const parts: string[] = [];
      if (subCategoryCount > 0) parts.push(`${subCategoryCount} sub-categor${subCategoryCount === 1 ? 'y' : 'ies'}`);
      if (expenseCount > 0) parts.push(`${expenseCount} expense${expenseCount === 1 ? '' : 's'}`);
      if (budgetCount > 0) parts.push(`${budgetCount} budget${budgetCount === 1 ? '' : 's'}`);
      return NextResponse.json({ message: `Cannot delete — still in use (${parts.join(', ')})` }, { status: 409 });
    }

    await prisma.expenseCategory.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'EXPENSE_CATEGORY', entityId: id, oldValue: existing, description: `Expense category "${existing.name}" deleted`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('DELETE /api/expenses/categories/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete category' }, { status: 400 });
  }
}
