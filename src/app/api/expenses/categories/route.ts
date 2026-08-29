import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// List + create. Update/delete for a single category live in
// ./[id]/route.ts (added for the Expense Categories table's Edit/Delete
// actions).
export async function GET() {
  const denied = await requirePermission('view_expenses');
  if (denied) return denied;

  try {
    const categories = await prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        subCategories: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error('GET /api/expenses/categories error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ message: 'name is required' }, { status: 400 });
    }

    const category = await prisma.expenseCategory.create({
      data: {
        name: body.name,
        description: body.description || null,
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'EXPENSE_CATEGORY', entityId: category.id, newValue: category, description: `Expense category "${category.name}" created`, request });

    return NextResponse.json(category, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A category with that name already exists' }, { status: 409 });
    }
    console.error('POST /api/expenses/categories error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create category' }, { status: 400 });
  }
}
