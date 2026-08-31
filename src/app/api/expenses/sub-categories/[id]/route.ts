import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// PUT/DELETE for a single sub-category — added alongside the Expense Sub
// Categories table's View/Edit/Delete actions
// (src/app/dashboard/expenses/page.tsx). The collection route
// (../route.ts) stays create-only, unchanged. categoryId is intentionally
// not accepted here — a sub-category's parent category never changes via
// edit, only its name, so the Category/Sub-Category relationship can't be
// altered through this route.

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();
    if (!body.name) return NextResponse.json({ message: 'name is required' }, { status: 400 });

    const existing = await prisma.expenseSubCategory.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Sub-category not found' }, { status: 404 });

    const subCategory = await prisma.expenseSubCategory.update({
      where: { id },
      data: { name: body.name },
    });

    await logAudit({ action: 'UPDATE', entityType: 'EXPENSE_SUB_CATEGORY', entityId: id, oldValue: existing, newValue: subCategory, description: `Expense sub-category "${subCategory.name}" updated`, request });

    return NextResponse.json(subCategory);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A sub-category with that name already exists under this category' }, { status: 409 });
    }
    console.error('PUT /api/expenses/sub-categories/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update sub-category' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.expenseSubCategory.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Sub-category not found' }, { status: 404 });

    const expenseCount = await prisma.expense.count({ where: { subCategoryId: id } });
    if (expenseCount > 0) {
      return NextResponse.json({ message: `Cannot delete — still in use (${expenseCount} expense${expenseCount === 1 ? '' : 's'})` }, { status: 409 });
    }

    // Only this sub-category is removed — its parent category is untouched.
    await prisma.expenseSubCategory.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'EXPENSE_SUB_CATEGORY', entityId: id, oldValue: existing, description: `Expense sub-category "${existing.name}" deleted`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('DELETE /api/expenses/sub-categories/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete sub-category' }, { status: 400 });
  }
}
