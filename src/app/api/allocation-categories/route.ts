import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Same code-from-name derivation as /api/verticals — the admin only types a
// name, the machine-readable code other rows key off is generated here.
async function uniqueCodeFromName(name: string): Promise<string> {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'CATEGORY';
  let code = base;
  let suffix = 2;
  while (await prisma.allocationCategory.findUnique({ where: { code } })) {
    code = `${base}_${suffix}`;
    suffix += 1;
  }
  return code;
}

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get('includeInactive') === 'true';

  const categories = await prisma.allocationCategory.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ message: 'Name is required' }, { status: 400 });
    }
    const name = String(body.name).trim();
    const code = await uniqueCodeFromName(name);
    const maxSort = await prisma.allocationCategory.aggregate({ _max: { sortOrder: true } });

    const category = await prisma.allocationCategory.create({
      data: { name, code, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A category with this name already exists' }, { status: 409 });
    }
    console.error('POST /api/allocation-categories error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
