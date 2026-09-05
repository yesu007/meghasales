import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_implementations');
  if (denied) return denied;

  try {
    const impl = await prisma.implementation.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        lead: { select: { companyName: true, contactPerson: true, mobile: true, email: true } },
        projectManager: { select: { firstName: true, lastName: true } },
        project: { select: { projectName: true } },
      },
    });
    if (!impl) return NextResponse.json({ message: 'Implementation not found' }, { status: 404 });
    return NextResponse.json(impl);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_implementations');
  if (denied) return denied;

  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.implementation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Implementation not found' }, { status: 404 });

    // An implementation is for a Project or a Product, never both — only
    // trips when this request's own body carries both as truthy (the form's
    // own disabled fields keep it from ever happening once created anyway).
    if (body.projectId && body.productId) {
      return NextResponse.json({ message: 'Select either a Project or a Product, not both' }, { status: 400 });
    }
    // A picked Project must actually belong to this implementation's lead
    // (leadId can't change from here — see the form's own disabled Lead
    // field) — same check as POST.
    if (body.projectId) {
      const project = await prisma.project.findFirst({ where: { id: parseInt(body.projectId), OR: [{ customerId: existing.leadId }, { leadId: existing.leadId }] } });
      if (!project) return NextResponse.json({ message: 'Selected project does not belong to this lead' }, { status: 400 });
    }
    // Same check for a picked Product (CustomerProductsPanel).
    if (body.productId) {
      const product = await prisma.product.findFirst({ where: { id: parseInt(body.productId), OR: [{ customerId: existing.leadId }, { leadId: existing.leadId }] } });
      if (!product) return NextResponse.json({ message: 'Selected product does not belong to this lead' }, { status: 400 });
    }

    // Business Vertical has no reachable edit control on the form anymore
    // (Source Type/Lead/Project/Product all lock once created, and Vertical
    // is now just a read-only value derived from Project — see the form's
    // own effect), but this route still accepts an explicit verticalId
    // update generically, same "pick a Vertical, derive Head server-side
    // from it" rule as POST. This is distinct from the Head *staying* fixed
    // when the Vertical Master's own Head assignment is later reassigned
    // (see headId's own schema comment) — here the Vertical itself is what's
    // changing, so re-deriving Head for the newly picked Vertical is the
    // correct behavior, not a violation of that rule.
    let verticalUpdate: { verticalId?: number | null; headId?: number | null } = {};
    if (body.verticalId !== undefined) {
      if (body.verticalId) {
        const vertical = await prisma.vertical.findUnique({ where: { id: parseInt(body.verticalId) }, select: { id: true, headId: true } });
        if (!vertical) return NextResponse.json({ message: 'Selected vertical not found' }, { status: 404 });
        verticalUpdate = { verticalId: vertical.id, headId: vertical.headId };
      } else {
        verticalUpdate = { verticalId: null, headId: null };
      }
    }

    const impl = await prisma.implementation.update({
      where: { id },
      data: {
        ...(body.projectName !== undefined && { projectName: body.projectName }),
        ...(body.projectId !== undefined && { projectId: body.projectId ? parseInt(body.projectId) : null }),
        ...(body.productId !== undefined && { productId: body.productId ? parseInt(body.productId) : null }),
        ...(body.status && { status: body.status }),
        ...(body.projectManagerId !== undefined && { projectManagerId: body.projectManagerId ? parseInt(body.projectManagerId) : null }),
        ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
        ...(body.targetEndDate !== undefined && { targetEndDate: body.targetEndDate ? new Date(body.targetEndDate) : null }),
        ...(body.actualEndDate !== undefined && { actualEndDate: body.actualEndDate ? new Date(body.actualEndDate) : null }),
        ...(body.currentStage !== undefined && { currentStage: body.currentStage }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...verticalUpdate,
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'IMPLEMENTATION', entityId: id, oldValue: existing, newValue: impl, description: `Implementation updated: ${impl.projectName || `#${impl.id}`}`, request });

    return NextResponse.json(impl);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_implementations');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.implementation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Implementation not found' }, { status: 404 });

    await prisma.implementation.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'IMPLEMENTATION', entityId: id, oldValue: existing, description: `Implementation deleted: ${existing.projectName || `#${existing.id}`}`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete implementation' }, { status: 400 });
  }
}
