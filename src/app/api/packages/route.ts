import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Derives a stable, unique CODE from the name — same convention as
// src/app/api/verticals/route.ts's uniqueCodeFromName.
async function uniqueCodeFromName(name: string): Promise<string> {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'PACKAGE';

  let code = base;
  let suffix = 2;
  while (await prisma.package.findUnique({ where: { code } })) {
    code = `${base}_${suffix}`;
    suffix += 1;
  }
  return code;
}

// GET returns only active packages by default (what the Demo form's picker
// expects); the admin screen passes includeInactive=true to also see (and
// be able to reactivate) deactivated ones.
export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_packages');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const packages = await prisma.package.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const content = packages.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
    }));

    return NextResponse.json(content);
  } catch (error) {
    console.error('GET /api/packages error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_packages');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ message: 'Package name is required' }, { status: 400 });
    }

    const name = String(body.name).trim();
    const code = await uniqueCodeFromName(name);

    const pkg = await prisma.package.create({
      data: {
        name,
        code,
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'PACKAGE', entityId: pkg.id, newValue: pkg, description: `Package "${pkg.name}" created`, request });

    return NextResponse.json(pkg, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A package with that name already exists' }, { status: 409 });
    }
    console.error('POST /api/packages error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create package' }, { status: 400 });
  }
}
