import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { STATUS_COLOR_PRESETS } from '@/lib/leadStatus';

export const dynamic = 'force-dynamic';

// The 6 seeded pipeline stages (NEW, CONTACTED, ...) are fixed — see the
// LeadStatusOption model comment in schema.prisma — but POST below does
// allow adding further, supplementary statuses on top of them (e.g. a
// custom "Negotiation" stage). A custom status is purely a display-only
// addition to the picklist src/hooks/useLeadStatusOptions.ts feeds the Lead
// status selects from: since src/lib/leadStatus.ts's STATUS_RANK/
// isTerminalLeadStatus and the CONFIRMED-gated routes (Customers, Lead
// events/documents unlock, Un-convert) only ever match the 6 fixed codes by
// exact value, a custom status simply behaves as an ordinary, non-terminal,
// non-converting mid-pipeline status — it never collides with or displaces
// that logic.
export async function GET() {
  const denied = await requirePermission('view_lead_status_options');
  if (denied) return denied;

  try {
    const options = await prisma.leadStatusOption.findMany({
      orderBy: [{ sortOrder: 'asc' }],
    });

    return NextResponse.json(options.map((o) => ({
      id: o.id,
      code: o.code,
      label: o.label,
      color: o.color,
      sortOrder: o.sortOrder,
    })));
  } catch (error) {
    console.error('GET /api/lead-status-options error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Creates a supplementary status. `code` is never accepted from the client
// (same convention as PATCH /api/lead-status-options/[id] not accepting it
// either) — it's derived from the label so the fixed 6 codes stay the only
// ones anyone can type by hand, and new rows default to sorting after the
// existing list rather than disturbing it.
export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_lead_status_options');
  if (denied) return denied;

  try {
    const body = await request.json();
    const label = String(body.label ?? '').trim();
    if (!label) return NextResponse.json({ message: 'Label is required' }, { status: 400 });
    if (!STATUS_COLOR_PRESETS.some((c) => c.value === body.color)) {
      return NextResponse.json({ message: 'Invalid color' }, { status: 400 });
    }

    const baseCode = label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'STATUS';
    let code = baseCode;
    let suffix = 1;
    while (await prisma.leadStatusOption.findUnique({ where: { code } })) {
      code = `${baseCode}_${++suffix}`;
    }

    const { _max } = await prisma.leadStatusOption.aggregate({ _max: { sortOrder: true } });
    const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : (_max.sortOrder ?? 0) + 1;

    const option = await prisma.leadStatusOption.create({
      data: { code, label, color: body.color, sortOrder },
    });

    await logAudit({ action: 'CREATE', entityType: 'LEAD_STATUS_OPTION', entityId: option.id, newValue: option, description: `Lead status "${option.label}" created`, request });

    return NextResponse.json(option, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A status with that code already exists' }, { status: 409 });
    }
    console.error('POST /api/lead-status-options error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create status' }, { status: 400 });
  }
}
