import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_projects');
  if (denied) return denied;
  try {
    const project = await prisma.project.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        customer: { select: { id: true, companyName: true } },
        lead: { select: { id: true, companyName: true, contactPerson: true } },
        vertical: { select: { id: true, name: true } },
        head: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    return NextResponse.json(project);
  } catch (error) {
    console.error('GET /api/projects/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_projects');
  if (denied) return denied;
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

    if (body.projectName !== undefined && !String(body.projectName).trim()) {
      return NextResponse.json({ message: 'Project name cannot be empty' }, { status: 400 });
    }

    // Customer and Lead are mutually exclusive — merge the incoming partial
    // update onto the existing row to check the resulting state, not just
    // what's in this request body.
    const nextCustomerId = body.customerId !== undefined ? (body.customerId || null) : existing.customerId;
    const nextLeadId = body.leadId !== undefined ? (body.leadId || null) : existing.leadId;
    if (nextCustomerId && nextLeadId) {
      return NextResponse.json({ message: 'Select either a Customer or a Lead, not both' }, { status: 400 });
    }
    if (!nextCustomerId && !nextLeadId) {
      return NextResponse.json({ message: 'Select a Customer or a Lead' }, { status: 400 });
    }

    if (body.customerId) {
      const customer = await prisma.lead.findUnique({ where: { id: parseInt(body.customerId) }, select: { id: true } });
      if (!customer) return NextResponse.json({ message: 'Selected customer not found' }, { status: 404 });
    }

    // Head is derived from the Vertical's own Head assignment, never taken
    // from the client — see POST's identical rationale. Only recomputed
    // when verticalId itself is part of this update; other partial updates
    // (status toggle, budget edit, etc.) leave the existing headId alone.
    let resolvedHeadId: number | null | undefined;
    if (body.verticalId !== undefined) {
      const vertical = await prisma.vertical.findUnique({ where: { id: parseInt(body.verticalId) }, select: { id: true, headId: true } });
      if (!vertical) return NextResponse.json({ message: 'Selected vertical not found' }, { status: 404 });
      resolvedHeadId = vertical.headId;
    }

    if (body.leadId !== undefined && body.leadId !== null && body.leadId !== '') {
      const lead = await prisma.lead.findUnique({ where: { id: parseInt(body.leadId) }, select: { id: true } });
      if (!lead) return NextResponse.json({ message: 'Selected lead not found' }, { status: 404 });
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(body.projectName !== undefined && { projectName: String(body.projectName).trim() }),
        ...(body.customerId !== undefined && { customerId: body.customerId ? parseInt(body.customerId) : null }),
        ...(body.leadId !== undefined && { leadId: body.leadId ? parseInt(body.leadId) : null }),
        ...(body.verticalId !== undefined && { verticalId: parseInt(body.verticalId), headId: resolvedHeadId }),
        ...(body.budget !== undefined && { budget: body.budget === null || body.budget === '' ? null : Number(body.budget) }),
        ...(body.budgetCurrencyCode !== undefined && { budgetCurrencyCode: body.budgetCurrencyCode || 'INR' }),
        ...(body.isActive !== undefined && { isActive: !!body.isActive }),
      },
      include: {
        customer: { select: { companyName: true } },
        lead: { select: { companyName: true, contactPerson: true } },
        vertical: { select: { name: true } },
        head: { select: { firstName: true, lastName: true } },
      },
    });

    const ownerName = project.customer?.companyName || project.lead?.companyName || 'unknown';
    await logAudit({ action: 'UPDATE', entityType: 'PROJECT', entityId: id, oldValue: existing, newValue: project, description: `Project "${project.projectName}" for "${ownerName}" updated`, request });

    return NextResponse.json(project);
  } catch (error: any) {
    console.error('PATCH /api/projects/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update project' }, { status: 400 });
  }
}

// Soft-delete (isActive = false), same convention as Vertical — fully
// reversible from the same screen (Edit -> Reactivate).
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_projects');
  if (denied) return denied;
  try {
    const id = parseInt(params.id);
    const existing = await prisma.project.findUnique({
      where: { id },
      include: { customer: { select: { companyName: true } }, lead: { select: { companyName: true } } },
    });
    if (!existing) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

    const project = await prisma.project.update({ where: { id }, data: { isActive: false } });
    const ownerName = existing.customer?.companyName || existing.lead?.companyName || 'unknown';
    await logAudit({ action: 'DELETE', entityType: 'PROJECT', entityId: id, oldValue: existing, description: `Project "${existing.projectName}" for "${ownerName}" deleted`, request });

    return NextResponse.json(project);
  } catch (error) {
    console.error('DELETE /api/projects/[id] error:', error);
    return NextResponse.json({ message: 'Failed to delete project' }, { status: 400 });
  }
}
