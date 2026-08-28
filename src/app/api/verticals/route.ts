import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Create-only, like ExpenseCategory — this master just grows; nothing
// retires a vertical once created, it's deactivated (isActive) instead.
export async function GET() {
  const denied = await requirePermission('view_verticals');
  if (denied) return denied;

  try {
    const verticals = await prisma.vertical.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json(verticals);
  } catch (error) {
    console.error('GET /api/verticals error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_verticals');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.name) return NextResponse.json({ message: 'name is required' }, { status: 400 });
    if (!body.code) return NextResponse.json({ message: 'code is required' }, { status: 400 });

    const vertical = await prisma.vertical.create({
      data: {
        name: body.name,
        code: body.code.toUpperCase().replace(/\s+/g, '_'),
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'VERTICAL', entityId: vertical.id, newValue: vertical, description: `Vertical "${vertical.name}" created`, request });

    return NextResponse.json(vertical, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A vertical with that name or code already exists' }, { status: 409 });
    }
    console.error('POST /api/verticals error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create vertical' }, { status: 400 });
  }
}
