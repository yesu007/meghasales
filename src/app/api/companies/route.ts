import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_companies');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';

    const companies = await prisma.company.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      include: {
        legalEntities: { select: { id: true, countryId: true }, where: { isActive: true } },
        _count: { select: { leads: true } },
      },
    });
    return NextResponse.json(companies);
  } catch (error) {
    console.error('GET /api/companies error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_companies');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ message: 'Company name is required' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const createdById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const company = await prisma.company.create({
      data: {
        name: String(body.name).trim(),
        notes: body.notes || null,
        createdById: Number.isFinite(createdById) ? createdById : null,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'COMPANY', entityId: company.id, newValue: company, description: `Company "${company.name}" created`, request });

    return NextResponse.json(company, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A company with this name already exists' }, { status: 409 });
    }
    console.error('POST /api/companies error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create company' }, { status: 400 });
  }
}
