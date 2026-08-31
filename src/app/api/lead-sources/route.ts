import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Derives a stable, unique CODE from the name — same convention as
// src/app/api/verticals/route.ts / src/app/api/packages/route.ts.
async function uniqueCodeFromName(name: string): Promise<string> {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'SOURCE';

  let code = base;
  let suffix = 2;
  while (await prisma.leadSource.findUnique({ where: { code } })) {
    code = `${base}_${suffix}`;
    suffix += 1;
  }
  return code;
}

// GET returns only active sources by default (what the Lead/Customer form
// pickers expect); the admin screen passes includeInactive=true to also see
// (and be able to reactivate) deactivated ones.
export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_lead_sources');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const sources = await prisma.leadSource.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const content = sources.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      isActive: s.isActive,
      sortOrder: s.sortOrder,
    }));

    return NextResponse.json(content);
  } catch (error) {
    console.error('GET /api/lead-sources error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_lead_sources');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ message: 'Source name is required' }, { status: 400 });
    }

    const name = String(body.name).trim();
    const code = await uniqueCodeFromName(name);

    const source = await prisma.leadSource.create({
      data: {
        name,
        code,
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'LEAD_SOURCE', entityId: source.id, newValue: source, description: `Lead source "${source.name}" created`, request });

    return NextResponse.json(source, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A source with that name already exists' }, { status: 409 });
    }
    console.error('POST /api/lead-sources error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create source' }, { status: 400 });
  }
}
