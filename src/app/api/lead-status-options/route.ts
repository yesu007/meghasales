import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Read-only list of the 6 fixed pipeline stages — see the LeadStatusOption
// model comment in schema.prisma for why there's no POST/DELETE here:
// the set of codes is fixed, only label/color/sortOrder are editable
// (via PATCH /api/lead-status-options/[id]).
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
