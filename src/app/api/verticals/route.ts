import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Derives a stable, unique CODE from the vertical name — the admin form
// only asks for a name (matching what was actually requested: Vertical
// Name, Head, Budget), so the machine-readable code other modules can key
// off is generated here rather than typed by hand.
async function uniqueCodeFromName(name: string): Promise<string> {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'VERTICAL';

  let code = base;
  let suffix = 2;
  while (await prisma.vertical.findUnique({ where: { code } })) {
    code = `${base}_${suffix}`;
    suffix += 1;
  }
  return code;
}

// GET returns only active verticals by default (the shape every existing
// picker — the Expense Budget form, etc. — already expects); the admin
// screen passes includeInactive=true to also see (and be able to
// reactivate) deactivated ones.
export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_verticals');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const verticals = await prisma.vertical.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { head: { select: { id: true, firstName: true, lastName: true } } },
    });

    const content = verticals.map((v) => ({
      id: v.id,
      name: v.name,
      code: v.code,
      headId: v.headId,
      headName: v.head ? `${v.head.firstName} ${v.head.lastName}` : null,
      budget: v.budget,
      budgetCurrencyCode: v.budgetCurrencyCode,
      isActive: v.isActive,
      sortOrder: v.sortOrder,
    }));

    return NextResponse.json(content);
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
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ message: 'Vertical name is required' }, { status: 400 });
    }

    if (body.headId) {
      const head = await prisma.user.findUnique({ where: { id: parseInt(body.headId) } });
      if (!head) return NextResponse.json({ message: 'Selected head not found' }, { status: 404 });
    }

    const name = String(body.name).trim();
    const code = await uniqueCodeFromName(name);

    const vertical = await prisma.vertical.create({
      data: {
        name,
        code,
        headId: body.headId ? parseInt(body.headId) : null,
        budget: body.budget !== undefined && body.budget !== null && body.budget !== '' ? Number(body.budget) : null,
        budgetCurrencyCode: body.budgetCurrencyCode || 'INR',
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
      },
      include: { head: { select: { firstName: true, lastName: true } } },
    });

    await logAudit({ action: 'CREATE', entityType: 'VERTICAL', entityId: vertical.id, newValue: vertical, description: `Vertical "${vertical.name}" created`, request });

    return NextResponse.json(vertical, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A vertical with that name already exists' }, { status: 409 });
    }
    console.error('POST /api/verticals error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create vertical' }, { status: 400 });
  }
}
