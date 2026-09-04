import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { requirePermission, getOwnershipFilter } from '@/lib/rbac';
import { DEFAULT_TIMEZONE } from '@/lib/timezones';
import { isNextDateOverdue } from '@/lib/leadFollowUp';

export const dynamic = 'force-dynamic';

// Demo's own terminal statuses (no further follow-up expected), same role
// as isTerminalLeadStatus plays for Lead.nextFollowUpDate's overdue check.
const TERMINAL_DEMO_STATUSES = ['COMPLETED', 'CANCELLED'];

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_demos');
  if (denied) return denied;

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

    const packageId = searchParams.get('packageId') || '';

    if (status) AND.push({ status: status.toUpperCase() });
    if (demoType) AND.push({ demoType: demoType.toUpperCase() });
    if (packageId) AND.push({ packageId: parseInt(packageId) });

    // Ownership data-scope boundary — a Demo Team member sees only demos
    // assigned to them (plus unassigned ones); BUSINESS_ANALYST/SALES keep
    // full visibility since assignedToId isn't their field — see
    // getOwnershipFilter's own comment.
    const ownershipFilter = await getOwnershipFilter('assignedToId', ['DEMO_TEAM']);
    if (ownershipFilter) AND.push(ownershipFilter);

    if (AND.length > 0) where.AND = AND;

    // Validate sort field
    const validSortFields = ['scheduledDate', 'actualDate', 'status', 'demoType', 'createdAt', 'nextFollowUpDate'];
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
          package: { select: { name: true } },
          project: { select: { projectName: true } },
          vertical: { select: { name: true } },
          head: { select: { firstName: true, lastName: true } },
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
      packageId: demo.packageId,
      packageName: demo.package?.name || null,
      projectId: demo.projectId,
      projectName: demo.project?.projectName || null,
      // Business Vertical + its snapshot Head — see schema.prisma's
      // Demo.verticalId/headId comment.
      verticalId: demo.verticalId,
      verticalName: demo.vertical?.name || null,
      headId: demo.headId,
      headName: demo.head ? `${demo.head.firstName} ${demo.head.lastName}` : null,
      scheduledDate: demo.scheduledDate,
      timezone: demo.timezone,
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
      nextFollowUpDate: demo.nextFollowUpDate,
      isOverdue: isNextDateOverdue(demo.nextFollowUpDate, TERMINAL_DEMO_STATUSES.includes(demo.status)),
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
  const denied = await requirePermission('manage_demos');
  if (denied) return denied;

  try {
    const body = await request.json();

    if (!body.leadId || !body.demoType) {
      return NextResponse.json({ message: 'leadId and demoType are required' }, { status: 400 });
    }
    if (!body.verticalId) {
      return NextResponse.json({ message: 'Business Vertical is required' }, { status: 400 });
    }

    const leadId = parseInt(body.leadId);

    // A picked Project must actually belong to the selected Lead/Customer —
    // never trust the id verbatim from the client (same rationale as
    // /api/projects's own leadId filter: customerId OR leadId match).
    if (body.projectId) {
      const project = await prisma.project.findFirst({ where: { id: parseInt(body.projectId), OR: [{ customerId: leadId }, { leadId }] } });
      if (!project) return NextResponse.json({ message: 'Selected project does not belong to this lead' }, { status: 400 });
    }

    // Head is derived from the selected Vertical's own Head assignment
    // (Vertical.headId), never taken from the client — same rationale as
    // /api/projects's own Head derivation. Unlike Project, a Vertical with
    // no Head assigned is not rejected here — it's just saved as null and
    // shown as "Unassigned" in the UI, per this form's own requirement.
    const vertical = await prisma.vertical.findUnique({ where: { id: parseInt(body.verticalId) }, select: { id: true, headId: true } });
    if (!vertical) return NextResponse.json({ message: 'Selected vertical not found' }, { status: 404 });

    const demo = await prisma.demo.create({
      data: {
        leadId,
        demoType: body.demoType,
        packageId: body.packageId ? parseInt(body.packageId) : null,
        projectId: body.projectId ? parseInt(body.projectId) : null,
        assignedToId: body.assignedToId ? parseInt(body.assignedToId) : null,
        scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : null,
        timezone: body.timezone || DEFAULT_TIMEZONE,
        attendees: body.attendees || null,
        modulesDemonstrated: body.modulesDemonstrated || null,
        status: 'SCHEDULED',
        verticalId: vertical.id,
        headId: vertical.headId,
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
