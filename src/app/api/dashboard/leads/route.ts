import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Dashboard → Lead Lookup search. Gated by view_dashboard (not view_leads)
// so the lookup works for every role that can open the Dashboard. Returns
// only the picker fields, in the same { content } shape GET /api/leads
// uses, with the same default exclusion of leadSource QUOTATION placeholders.
export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_dashboard');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const size = Math.min(Math.max(parseInt(searchParams.get('size') || '8', 10) || 8, 1), 20);

    const leads = await prisma.lead.findMany({
      where: {
        leadSource: { not: 'QUOTATION' },
        ...(search
          ? {
              OR: [
                { companyName: { contains: search, mode: 'insensitive' } },
                { contactPerson: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { mobile: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { companyName: 'asc' },
      take: size,
      select: { id: true, companyName: true, contactPerson: true, status: true },
    });

    return NextResponse.json({ content: leads });
  } catch (error) {
    console.error('GET /api/dashboard/leads error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
