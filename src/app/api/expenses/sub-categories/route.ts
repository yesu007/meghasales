import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Create-only, same convention as /api/expenses/categories — no [id] route.
export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.categoryId) return NextResponse.json({ message: 'categoryId is required' }, { status: 400 });
    if (!body.name) return NextResponse.json({ message: 'name is required' }, { status: 400 });

    const category = await prisma.expenseCategory.findUnique({ where: { id: parseInt(body.categoryId) } });
    if (!category) return NextResponse.json({ message: 'Category not found' }, { status: 404 });

    const subCategory = await prisma.expenseSubCategory.create({
      data: {
        categoryId: category.id,
        name: body.name,
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'EXPENSE_SUB_CATEGORY', entityId: subCategory.id, newValue: subCategory, description: `Expense sub-category "${subCategory.name}" created under "${category.name}"`, request });

    return NextResponse.json(subCategory, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A sub-category with that name already exists under this category' }, { status: 409 });
    }
    console.error('POST /api/expenses/sub-categories error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create sub-category' }, { status: 400 });
  }
}
