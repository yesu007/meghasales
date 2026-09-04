import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_verticals');
  if (denied) return denied;
  try {
    const vertical = await prisma.vertical.findUnique({
      where: { id: parseInt(params.id) },
      include: { head: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!vertical) return NextResponse.json({ message: 'Vertical not found' }, { status: 404 });
    return NextResponse.json(vertical);
  } catch (error) {
    console.error('GET /api/verticals/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_verticals');
  if (denied) return denied;
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.vertical.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Vertical not found' }, { status: 404 });

    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json({ message: 'Vertical name cannot be empty' }, { status: 400 });
    }

    // No separate Code field/input anywhere — code always mirrors name
    // (see the Vertical form's own comment), so any edit that changes the
    // name keeps code in sync automatically instead of letting the two
    // drift apart. Same as POST's own name->code derivation below.
    const trimmedName = body.name !== undefined ? String(body.name).trim() : undefined;

    if (body.headId !== undefined && body.headId !== null && body.headId !== '') {
      const head = await prisma.user.findUnique({ where: { id: parseInt(body.headId) } });
      if (!head) return NextResponse.json({ message: 'Selected head not found' }, { status: 404 });
    }

    const vertical = await prisma.vertical.update({
      where: { id },
      data: {
        ...(trimmedName !== undefined && { name: trimmedName, code: trimmedName }),
        ...(body.headId !== undefined && { headId: body.headId ? parseInt(body.headId) : null }),
        ...(body.budget !== undefined && { budget: body.budget === null || body.budget === '' ? null : Number(body.budget) }),
        ...(body.budgetCurrencyCode !== undefined && { budgetCurrencyCode: body.budgetCurrencyCode || 'INR' }),
        ...(body.sortOrder !== undefined && { sortOrder: Number(body.sortOrder) }),
        ...(body.isActive !== undefined && { isActive: !!body.isActive }),
      },
      include: { head: { select: { firstName: true, lastName: true } } },
    });

    await logAudit({ action: 'UPDATE', entityType: 'VERTICAL', entityId: id, oldValue: existing, newValue: vertical, description: `Vertical "${vertical.name}" updated`, request });

    return NextResponse.json(vertical);
  } catch (error: any) {
    if (error.code === 'P2002') {
      // code always mirrors name (see above), so a conflict on either
      // constraint is the same underlying clash from the user's POV.
      return NextResponse.json({ message: 'A vertical with that name already exists' }, { status: 409 });
    }
    console.error('PATCH /api/verticals/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update vertical' }, { status: 400 });
  }
}

// Soft-delete (isActive = false), same convention as ExpenseCategory/
// Expense elsewhere in this app — a vertical can already be referenced by
// an ExpenseBudget (verticalId is ON DELETE SET NULL, not CASCADE, but a
// hard delete would still silently blank out that budget's vertical).
// Deactivating instead keeps every existing reference intact and readable,
// and is fully reversible from the same screen (Edit -> Reactivate).
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_verticals');
  if (denied) return denied;
  try {
    const id = parseInt(params.id);
    const existing = await prisma.vertical.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Vertical not found' }, { status: 404 });

    const vertical = await prisma.vertical.update({ where: { id }, data: { isActive: false } });
    await logAudit({ action: 'DELETE', entityType: 'VERTICAL', entityId: id, oldValue: existing, description: `Vertical "${existing.name}" deleted`, request });

    return NextResponse.json(vertical);
  } catch (error) {
    console.error('DELETE /api/verticals/[id] error:', error);
    return NextResponse.json({ message: 'Failed to delete vertical' }, { status: 400 });
  }
}
