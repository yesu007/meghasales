import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Dashboard → Lead Lookup "Status & Interaction History". Same query and
// response as GET /api/leads/[id]/activities, gated by view_dashboard.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_dashboard');
  if (denied) return denied;

  const leadId = Number(params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) return NextResponse.json({ message: 'Invalid lead id' }, { status: 400 });

  try {
    const activities = await prisma.leadActivity.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: { performedBy: { select: { firstName: true, lastName: true } } },
    });
    return NextResponse.json(activities);
  } catch (error) {
    console.error('GET /api/dashboard/leads/[id]/activities error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
