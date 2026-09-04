import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

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

    // Code always mirrors name — no separate Code input anywhere in the
    // admin form (Create or Edit); see PATCH /api/lead-sources/[id] for
    // the matching edit-time behavior.
    const name = String(body.name).trim();

    const source = await prisma.leadSource.create({
      data: {
        name,
        code: name,
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
