import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { STATUS_COLOR_PRESETS } from '@/lib/leadStatus';

export const dynamic = 'force-dynamic';

// No POST/DELETE — the 6 rows are fixed pipeline stages, seeded once. Only
// label/color/sortOrder are editable; `code` is never accepted here.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_lead_status_options');
  if (denied) return denied;
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.leadStatusOption.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Status option not found' }, { status: 404 });

    if (body.label !== undefined && !String(body.label).trim()) {
      return NextResponse.json({ message: 'Label cannot be empty' }, { status: 400 });
    }
    if (body.color !== undefined && !STATUS_COLOR_PRESETS.some((c) => c.value === body.color)) {
      return NextResponse.json({ message: 'Invalid color' }, { status: 400 });
    }

    const option = await prisma.leadStatusOption.update({
      where: { id },
      data: {
        ...(body.label !== undefined && { label: String(body.label).trim() }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.sortOrder !== undefined && { sortOrder: Number(body.sortOrder) }),
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'LEAD_STATUS_OPTION', entityId: id, oldValue: existing, newValue: option, description: `Lead status "${existing.code}" updated`, request });

    return NextResponse.json(option);
  } catch (error: any) {
    console.error('PATCH /api/lead-status-options/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update status option' }, { status: 400 });
  }
}
