import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Dashboard → Lead Lookup summary card. Gated by view_dashboard; returns
// only the fields that card displays, not the full lead record GET
// /api/leads/[id] serves to the Leads module.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_dashboard');
  if (denied) return denied;

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ message: 'Invalid lead id' }, { status: 400 });

  try {
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: {
        id: true,
        companyName: true,
        contactPerson: true,
        email: true,
        mobile: true,
        status: true,
        leadSource: true,
        createdAt: true,
        lastFollowUpDate: true,
        nextFollowUpDate: true,
        assignedBa: { select: { firstName: true, lastName: true } },
      },
    });
    if (!lead) return NextResponse.json({ message: 'Lead not found' }, { status: 404 });
    return NextResponse.json(lead);
  } catch (error) {
    console.error('GET /api/dashboard/leads/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
