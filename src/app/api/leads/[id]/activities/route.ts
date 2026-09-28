import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAnyPermission(['view_customers', 'view_leads']);
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const activities = await prisma.leadActivity.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: { performedBy: { select: { firstName: true, lastName: true } } },
    });
    return NextResponse.json(activities);
  } catch (error) {
    console.error('GET /api/leads/[id]/activities error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
