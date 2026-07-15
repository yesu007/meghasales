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
    const demoType = searchParams.get('demoType') || '';
    const sortBy = searchParams.get('sortBy') || 'scheduledDate';
    const sortDir = searchParams.get('sortDir') || 'desc';

    // Build where clause
    const where: Prisma.DemoWhereInput = {};
    const AND: Prisma.DemoWhereInput[] = [];

    if (search) {
      const searchTerm = search.trim().toLowerCase();
      AND.push({
        OR: [
          { lead: { companyName: { contains: searchTerm, mode: 'insensitive' } } },
          { lead: { contactPerson: { contains: searchTerm, mode: 'insensitive' } } },
          { attendees: { contains: searchTerm, mode: 'insensitive' } },
          { modulesDemonstrated: { contains: searchTerm, mode: 'insensitive' } },
          { feedback: { contains: searchTerm, mode: 'insensitive' } },
        ],
      });
    }

    if (status) AND.push({ status: status.toUpperCase() });
    if (demoType) AND.push({ demoType: demoType.toUpperCase() });

    if (AND.length > 0) where.AND = AND;

    // Validate sort field
    const validSortFields = ['scheduledDate', 'actualDate', 'status', 'demoType', 'createdAt'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'scheduledDate';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

    const [demos, totalElements] = await Promise.all([
      prisma.demo.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip: page * size,
        take: size,
        include: {
          lead: { select: { companyName: true, contactPerson: true, mobile: true } },
          assignedTo: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.demo.count({ where }),
    ]);

    const content = demos.map((demo) => ({
      id: demo.id,
      leadId: demo.leadId,
      companyName: demo.lead.companyName,
      contactPerson: demo.lead.contactPerson,
      mobile: demo.lead.mobile,
      demoType: demo.demoType,
      scheduledDate: demo.scheduledDate,
      actualDate: demo.actualDate,
      status: demo.status,
      assignedToId: demo.assignedToId,
      assignedToName: demo.assignedTo ? `${demo.assignedTo.firstName} ${demo.assignedTo.lastName}` : null,
      attendees: demo.attendees,
      modulesDemonstrated: demo.modulesDemonstrated,
      customerInterestLevel: demo.customerInterestLevel,
      feedback: demo.feedback,
      nextAction: demo.nextAction,
      approvalStatus: demo.approvalStatus,
      createdAt: demo.createdAt,
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
    console.error('GET /api/demos error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.leadId || !body.demoType) {
      return NextResponse.json({ message: 'leadId and demoType are required' }, { status: 400 });
    }

    const demo = await prisma.demo.create({
      data: {
        leadId: parseInt(body.leadId),
        demoType: body.demoType,
        assignedToId: body.assignedToId ? parseInt(body.assignedToId) : null,
        scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : null,
        attendees: body.attendees || null,
        modulesDemonstrated: body.modulesDemonstrated || null,
        status: 'SCHEDULED',
      },
      include: {
        lead: { select: { companyName: true } },
      },
    });

    // Log activity on the lead
    await prisma.leadActivity.create({
      data: {
        leadId: demo.leadId,
        activityType: 'DEMO_SCHEDULED',
        description: `${body.demoType} demo scheduled for ${demo.lead.companyName}`,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'DEMO', entityId: demo.id, newValue: demo, description: `${body.demoType} demo scheduled for ${demo.lead.companyName}`, request });

    return NextResponse.json(demo, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/demos error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create demo' }, { status: 400 });
  }
}
