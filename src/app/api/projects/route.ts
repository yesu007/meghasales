import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// GET returns only active projects by default, same convention as
// /api/verticals; the admin screen passes includeInactive=true to also see
// (and be able to reactivate) deactivated ones.
//
// leadId scopes the result to projects related to one Lead/Customer — used
// by the Demo/Quotation/Implementation Project dropdowns, whose selected
// Lead/Customer/Company is always a `leads` row (Customer IS a Lead with
// status=CONFIRMED). A Project can be related to that row two independent
// ways (see the Project model's own comments): as its required Customer
// (customerId) or its optional originating Lead (leadId) — matched with OR
// since either relation counts as "belongs to this Lead/Customer".
export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_projects');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const leadIdParam = searchParams.get('leadId');
    // Opt-in, same convention as /api/leads's own includeImplementation —
    // used by the Customer main table's Project accordion, which needs each
    // Project's own Status/Stage (that live on its Implementation, not on
    // Project itself — see the Project model's own comment) without making
    // every other caller of this endpoint (Demo/Quotation/Implementation
    // Project dropdowns) pay for the extra join.
    const includeImplementation = searchParams.get('includeImplementation') === 'true';

    const where: Prisma.ProjectWhereInput = includeInactive ? {} : { isActive: true };
    if (leadIdParam) {
      const leadId = parseInt(leadIdParam);
      if (Number.isNaN(leadId)) return NextResponse.json({ message: 'Invalid leadId' }, { status: 400 });
      where.OR = [{ customerId: leadId }, { leadId }];
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, companyName: true } },
        lead: { select: { id: true, companyName: true, contactPerson: true } },
        vertical: { select: { id: true, name: true } },
        head: { select: { id: true, firstName: true, lastName: true } },
        // Leads/Customers that picked this Project from their own "Project"
        // field (src/components/leads/LeadFormDrawer.tsx) — surfaced here so
        // that same picker can show "<Project Name> — N Projects" without
        // the frontend having to (mis)calculate it itself.
        _count: { select: { linkedLeads: true } },
        ...(includeImplementation && {
          // Most-recently-created Implementation for this Project, same
          // "latest wins" convention as /api/leads's own includeImplementation.
          implementations: {
            orderBy: { createdAt: 'desc' as const },
            take: 1,
            select: { id: true, status: true, currentStage: true },
          },
        }),
      },
    });

    const content = projects.map((p) => ({
      id: p.id,
      projectName: p.projectName,
      customerId: p.customerId,
      customerName: p.customer?.companyName ?? null,
      leadId: p.leadId,
      leadName: p.lead ? `${p.lead.companyName} — ${p.lead.contactPerson}` : null,
      verticalId: p.verticalId,
      verticalName: p.vertical.name,
      headId: p.headId,
      headName: p.head ? `${p.head.firstName} ${p.head.lastName}` : null,
      budget: p.budget,
      budgetCurrencyCode: p.budgetCurrencyCode,
      isActive: p.isActive,
      linkedLeadsCount: p._count.linkedLeads,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      // Only present when includeImplementation=true was passed (see above)
      // — this Project's most-recently-created Implementation, or null if it
      // has none yet.
      ...(includeImplementation && {
        implementation: (p as any).implementations?.[0]
          ? {
              id: (p as any).implementations[0].id,
              status: (p as any).implementations[0].status,
              currentStage: (p as any).implementations[0].currentStage,
            }
          : null,
      }),
    }));

    return NextResponse.json(content);
  } catch (error) {
    console.error('GET /api/projects error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_projects');
  if (denied) return denied;

  try {
    const body = await request.json();

    if (!body.projectName || !String(body.projectName).trim()) {
      return NextResponse.json({ message: 'Project name is required' }, { status: 400 });
    }
    // Customer and Lead are mutually exclusive — a Project belongs to
    // exactly one of them, never both, never neither.
    if (body.customerId && body.leadId) {
      return NextResponse.json({ message: 'Select either a Customer or a Lead, not both' }, { status: 400 });
    }
    if (!body.customerId && !body.leadId) {
      return NextResponse.json({ message: 'Select a Customer or a Lead' }, { status: 400 });
    }
    if (!body.verticalId) {
      return NextResponse.json({ message: 'Vertical is required' }, { status: 400 });
    }
    if (body.budget === undefined || body.budget === null || body.budget === '') {
      return NextResponse.json({ message: 'Budget is required' }, { status: 400 });
    }

    if (body.customerId) {
      const customer = await prisma.lead.findUnique({ where: { id: parseInt(body.customerId) }, select: { id: true } });
      if (!customer) return NextResponse.json({ message: 'Selected customer not found' }, { status: 404 });
    }

    // Head is derived from the selected Vertical's own Head assignment
    // (Vertical.headId), never taken from the client — a Project's Head
    // isn't an independent choice, it's whoever the Vertical Master already
    // has as its responsible head.
    const vertical = await prisma.vertical.findUnique({ where: { id: parseInt(body.verticalId) }, select: { id: true, headId: true } });
    if (!vertical) return NextResponse.json({ message: 'Selected vertical not found' }, { status: 404 });
    if (!vertical.headId) return NextResponse.json({ message: 'Selected vertical has no Head assigned' }, { status: 400 });

    if (body.leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: parseInt(body.leadId) }, select: { id: true } });
      if (!lead) return NextResponse.json({ message: 'Selected lead not found' }, { status: 404 });
    }

    const project = await prisma.project.create({
      data: {
        projectName: String(body.projectName).trim(),
        customerId: body.customerId ? parseInt(body.customerId) : null,
        leadId: body.leadId ? parseInt(body.leadId) : null,
        verticalId: vertical.id,
        headId: vertical.headId,
        budget: Number(body.budget),
        budgetCurrencyCode: body.budgetCurrencyCode || 'INR',
      },
      include: {
        customer: { select: { companyName: true } },
        lead: { select: { companyName: true, contactPerson: true } },
        vertical: { select: { name: true } },
        head: { select: { firstName: true, lastName: true } },
      },
    });

    const ownerName = project.customer?.companyName || project.lead?.companyName || 'unknown';
    await logAudit({ action: 'CREATE', entityType: 'PROJECT', entityId: project.id, newValue: project, description: `Project "${project.projectName}" created for "${ownerName}"`, request });

    return NextResponse.json(project, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/projects error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create project' }, { status: 400 });
  }
}
