import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '10');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortDir = searchParams.get('sortDir') || 'desc';

    const where: Prisma.ImplementationWhereInput = {};
    const AND: Prisma.ImplementationWhereInput[] = [];

    if (search) {
      const searchTerm = search.trim().toLowerCase();
      AND.push({
        OR: [
          { projectName: { contains: searchTerm, mode: 'insensitive' } },
          { lead: { companyName: { contains: searchTerm, mode: 'insensitive' } } },
          { lead: { contactPerson: { contains: searchTerm, mode: 'insensitive' } } },
          { currentStage: { contains: searchTerm, mode: 'insensitive' } },
          { notes: { contains: searchTerm, mode: 'insensitive' } },
        ],
      });
    }

    if (status) AND.push({ status: status.toUpperCase() });

    if (AND.length > 0) where.AND = AND;

    const validSortFields = ['createdAt', 'startDate', 'targetEndDate', 'status', 'projectName'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

    const [implementations, totalElements] = await Promise.all([
      prisma.implementation.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip: page * size,
        take: size,
        include: {
          lead: { select: { companyName: true, contactPerson: true } },
          projectManager: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.implementation.count({ where }),
    ]);

    const content = implementations.map((impl) => ({
      id: impl.id,
      leadId: impl.leadId,
      projectName: impl.projectName,
      companyName: impl.lead.companyName,
      contactPerson: impl.lead.contactPerson,
      projectManagerId: impl.projectManagerId,
      projectManagerName: impl.projectManager ? `${impl.projectManager.firstName} ${impl.projectManager.lastName}` : null,
      status: impl.status,
      startDate: impl.startDate,
      targetEndDate: impl.targetEndDate,
      actualEndDate: impl.actualEndDate,
      currentStage: impl.currentStage,
      notes: impl.notes,
      createdAt: impl.createdAt,
    }));

    return NextResponse.json({
      content,
      page,
      size,
      totalElements,
      totalPages: Math.ceil(totalElements / size),
      last: (page + 1) * size >= totalElements,
    });
  } catch (error: any) {
    console.error('GET /api/implementations error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.leadId) {
      return NextResponse.json({ message: 'leadId is required' }, { status: 400 });
    }

    const impl = await prisma.implementation.create({
      data: {
        leadId: parseInt(body.leadId),
        projectName: body.projectName || null,
        projectManagerId: body.projectManagerId ? parseInt(body.projectManagerId) : null,
        status: 'PLANNING',
        startDate: body.startDate ? new Date(body.startDate) : null,
        targetEndDate: body.targetEndDate ? new Date(body.targetEndDate) : null,
        currentStage: body.currentStage || null,
        notes: body.notes || null,
      },
      include: {
        lead: { select: { companyName: true } },
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'IMPLEMENTATION', entityId: impl.id, newValue: impl, description: `Implementation created for ${impl.lead.companyName}`, request });

    return NextResponse.json(impl, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/implementations error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create implementation' }, { status: 400 });
  }
}
