import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// PUT/DELETE for a single Category/Sub Category link row — unlike
// ExpenseSubCategory's own PUT, this one *does* allow changing which
// Category/Sub Category the row points to, since a link is just a pairing
// the user chose to track, not an ownership relationship.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();
    if (!body.categoryId) return NextResponse.json({ message: 'categoryId is required' }, { status: 400 });
    if (!body.subCategoryId) return NextResponse.json({ message: 'subCategoryId is required' }, { status: 400 });

    const categoryId = parseInt(body.categoryId);
    const subCategoryId = parseInt(body.subCategoryId);

    const existing = await prisma.expenseCategorySubCategoryLink.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Link not found' }, { status: 404 });

    const [category, subCategory] = await Promise.all([
      prisma.expenseCategory.findUnique({ where: { id: categoryId } }),
      prisma.expenseSubCategory.findUnique({ where: { id: subCategoryId } }),
    ]);
    if (!category) return NextResponse.json({ message: 'Category not found' }, { status: 404 });
    if (!subCategory) return NextResponse.json({ message: 'Sub-category not found' }, { status: 404 });
    if (subCategory.categoryId !== categoryId) {
      return NextResponse.json({ message: 'Sub-category does not belong to the selected Category' }, { status: 400 });
    }

    const link = await prisma.expenseCategorySubCategoryLink.update({
      where: { id },
      data: { categoryId, subCategoryId },
      include: { category: true, subCategory: true },
    });

    await logAudit({
      action: 'UPDATE', entityType: 'EXPENSE_CATEGORY_SUB_CATEGORY_LINK', entityId: id, oldValue: existing, newValue: link,
      description: `Category/Sub Category link updated to "${category.name}" → "${subCategory.name}"`, request,
    });

    return NextResponse.json(link);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'This Category and Sub Category combination already exists' }, { status: 409 });
    }
    console.error('PUT /api/expenses/category-links/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update link' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.expenseCategorySubCategoryLink.findUnique({
      where: { id },
      include: { category: true, subCategory: true },
    });
    if (!existing) return NextResponse.json({ message: 'Link not found' }, { status: 404 });

    // Removing a link never touches the Category or Sub Category it points to.
    await prisma.expenseCategorySubCategoryLink.delete({ where: { id } });
    await logAudit({
      action: 'DELETE', entityType: 'EXPENSE_CATEGORY_SUB_CATEGORY_LINK', entityId: id, oldValue: existing,
      description: `Category/Sub Category link "${existing.category.name}" → "${existing.subCategory.name}" deleted`, request,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('DELETE /api/expenses/category-links/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete link' }, { status: 400 });
  }
}
