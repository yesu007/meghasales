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

    if (body.headId !== undefined && body.headId !== null && body.headId !== '') {
      const head = await prisma.user.findUnique({ where: { id: parseInt(body.headId) } });
      if (!head) return NextResponse.json({ message: 'Selected head not found' }, { status: 404 });
    }

    const vertical = await prisma.vertical.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name).trim() }),
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
      return NextResponse.json({ message: 'A vertical with that name already exists' }, { status: 409 });
    }
    console.error('PATCH /api/verticals/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update vertical' }, { status: 400 });
  }
}

// Real delete — but only when nothing points at this vertical. Today that
// means ExpenseBudget (the only FK that exists yet); once Lead/
// Implementation/Employee get their own verticalId (see the module note
// above Vertical), the same guard extends to them the same way. Blocking
// with a clear count beats a silent ON DELETE SET NULL, which would leave
// an existing budget quietly pointing at nothing.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_verticals');
  if (denied) return denied;
  try {
    const id = parseInt(params.id);
    const existing = await prisma.vertical.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Vertical not found' }, { status: 404 });

    const budgetCount = await prisma.expenseBudget.count({ where: { verticalId: id } });
    if (budgetCount > 0) {
      return NextResponse.json(
        { message: `"${existing.name}" is assigned to ${budgetCount} expense budget${budgetCount === 1 ? '' : 's'} and can't be deleted. Reassign or remove ${budgetCount === 1 ? 'it' : 'them'} first.` },
        { status: 409 }
      );
    }

    await prisma.vertical.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'VERTICAL', entityId: id, oldValue: existing, description: `Vertical "${existing.name}" deleted`, request });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/verticals/[id] error:', error);
    return NextResponse.json({ message: 'Failed to delete vertical' }, { status: 400 });
  }
}
