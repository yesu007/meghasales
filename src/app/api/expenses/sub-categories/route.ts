import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Create-only here. Update/delete for a single sub-category live in
// ./[id]/route.ts (added for the Expense Sub Categories table's Edit/Delete
// actions).
// Bill tax settings (see ExpenseSubCategory.gstType/tdsApplicable/tdsPercent
// in prisma/schema.prisma). Only fields present in the body are returned, so
// a name-only edit leaves them untouched.
function parseTaxSettings(body: any): { gstType?: string; tdsApplicable?: boolean; tdsPercent?: number } | string {
  const out: { gstType?: string; tdsApplicable?: boolean; tdsPercent?: number } = {};
  if (body.gstType !== undefined) {
    if (!['INPUT', 'OUTPUT'].includes(body.gstType)) return 'GST type must be INPUT or OUTPUT';
    out.gstType = body.gstType;
  }
  if (body.tdsApplicable !== undefined) out.tdsApplicable = !!body.tdsApplicable;
  if (body.tdsPercent !== undefined && body.tdsPercent !== '') {
    const pct = Number(body.tdsPercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return 'TDS % must be between 0 and 100';
    out.tdsPercent = pct;
  }
  if (out.tdsApplicable === false) out.tdsPercent = 0;
  return out;
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.categoryId) return NextResponse.json({ message: 'categoryId is required' }, { status: 400 });
    if (!body.name) return NextResponse.json({ message: 'name is required' }, { status: 400 });
    const tax = parseTaxSettings(body);
    if (typeof tax === 'string') return NextResponse.json({ message: tax }, { status: 400 });

    const category = await prisma.expenseCategory.findUnique({ where: { id: parseInt(body.categoryId) } });
    if (!category) return NextResponse.json({ message: 'Category not found' }, { status: 404 });

    const subCategory = await prisma.expenseSubCategory.create({
      data: {
        categoryId: category.id,
        name: body.name,
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
        ...tax,
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
