import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// List + create for the "+ Add" Category/Sub Category link rows on the
// Expenses page — a standalone (Category, Sub Category) pairing, separate
// from (and independent of) the ownership relationship already expressed by
// ExpenseSubCategory.categoryId. Update/delete for a single link live in
// ./[id]/route.ts.
export async function GET() {
  const denied = await requirePermission('view_expenses');
  if (denied) return denied;

  try {
    const links = await prisma.expenseCategorySubCategoryLink.findMany({
      orderBy: { id: 'asc' },
      include: { category: true, subCategory: true },
    });
    return NextResponse.json(links);
  } catch (error) {
    console.error('GET /api/expenses/category-links error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.categoryId) return NextResponse.json({ message: 'categoryId is required' }, { status: 400 });
    if (!body.subCategoryId) return NextResponse.json({ message: 'subCategoryId is required' }, { status: 400 });

    const categoryId = parseInt(body.categoryId);
    const subCategoryId = parseInt(body.subCategoryId);

    const [category, subCategory] = await Promise.all([
      prisma.expenseCategory.findUnique({ where: { id: categoryId } }),
      prisma.expenseSubCategory.findUnique({ where: { id: subCategoryId } }),
    ]);
    if (!category) return NextResponse.json({ message: 'Category not found' }, { status: 404 });
    if (!subCategory) return NextResponse.json({ message: 'Sub-category not found' }, { status: 404 });
    if (subCategory.categoryId !== categoryId) {
      return NextResponse.json({ message: 'Sub-category does not belong to the selected Category' }, { status: 400 });
    }

    const link = await prisma.expenseCategorySubCategoryLink.create({
      data: { categoryId, subCategoryId },
      include: { category: true, subCategory: true },
    });

    await logAudit({
      action: 'CREATE', entityType: 'EXPENSE_CATEGORY_SUB_CATEGORY_LINK', entityId: link.id, newValue: link,
      description: `Category/Sub Category link "${category.name}" → "${subCategory.name}" created`, request,
    });

    return NextResponse.json(link, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'This Category and Sub Category combination already exists' }, { status: 409 });
    }
    console.error('POST /api/expenses/category-links error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create link' }, { status: 400 });
  }
}
