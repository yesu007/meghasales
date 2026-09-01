import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_implementations');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '10');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const currentStage = searchParams.get('currentStage') || '';
    const projectManagerId = searchParams.get('projectManagerId') || '';
    const businessVertical = searchParams.get('businessVertical') || '';
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
    if (currentStage) AND.push({ currentStage });
    if (projectManagerId) AND.push({ projectManagerId: parseInt(projectManagerId) });
    // Same relation-filter approach as /api/leads's own businessVertical
    // filter — businessVerticals is a JSON-encoded name on Lead, matched
    // via `contains` through the existing lead relation, not a new field.
    if (businessVertical) AND.push({ lead: { businessVerticals: { contains: businessVertical, mode: 'insensitive' } } });

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
          // businessVerticals is Lead's own field (see the schema note on
          // Vertical/ExpenseBudget) — no Vertical relation on Implementation
          // itself; this just surfaces the Lead's existing value alongside
          // the fields already selected here.
          lead: { select: { companyName: true, contactPerson: true, businessVerticals: true } },
          projectManager: { select: { firstName: true, lastName: true } },
          project: { select: { projectName: true } },
        },
      }),
      prisma.implementation.count({ where }),
    ]);

    const content = implementations.map((impl) => ({
      id: impl.id,
      leadId: impl.leadId,
      sourceType: impl.sourceType,
      projectName: impl.projectName,
      projectId: impl.projectId,
      linkedProjectName: impl.project?.projectName || null,
      companyName: impl.lead.companyName,
      contactPerson: impl.lead.contactPerson,
      businessVerticals: impl.lead.businessVerticals,
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
  const denied = await requirePermission('manage_implementations');
  if (denied) return denied;

  try {
    const body = await request.json();

    if (!body.leadId) {
      return NextResponse.json({ message: 'leadId is required' }, { status: 400 });
    }
    if (!body.sourceType || !['LEAD', 'CUSTOMER'].includes(body.sourceType)) {
      return NextResponse.json({ message: 'Source Type is required' }, { status: 400 });
    }

    const leadId = parseInt(body.leadId);

    // A picked Project must actually belong to the selected Lead/Customer —
    // same check as /api/demos.
    if (body.projectId) {
      const project = await prisma.project.findFirst({ where: { id: parseInt(body.projectId), OR: [{ customerId: leadId }, { leadId }] } });
      if (!project) return NextResponse.json({ message: 'Selected project does not belong to this lead' }, { status: 400 });
    }

    const impl = await prisma.implementation.create({
      data: {
        leadId,
        sourceType: body.sourceType,
        projectName: body.projectName || null,
        projectId: body.projectId ? parseInt(body.projectId) : null,
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
