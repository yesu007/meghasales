import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// GET returns only active stages by default (what the Customer/
// Implementation Stage pickers expect); the admin screen passes
// includeInactive=true to also see (and be able to reactivate) deactivated
// ones.
export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_stages');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const stages = await prisma.stage.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const content = stages.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      isActive: s.isActive,
      sortOrder: s.sortOrder,
    }));

    return NextResponse.json(content);
  } catch (error) {
    console.error('GET /api/stages error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_stages');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ message: 'Stage name is required' }, { status: 400 });
    }

    // Code always mirrors name — no separate Code input anywhere in the
    // admin form (Create or Edit); see PATCH /api/stages/[id] for the
    // matching edit-time behavior.
    const name = String(body.name).trim();

    const stage = await prisma.stage.create({
      data: {
        name,
        code: name,
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'STAGE', entityId: stage.id, newValue: stage, description: `Stage "${stage.name}" created`, request });

    return NextResponse.json(stage, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A stage with that name already exists' }, { status: 409 });
    }
    console.error('POST /api/stages error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create stage' }, { status: 400 });
  }
}
