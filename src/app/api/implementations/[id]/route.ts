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

    // A picked Project must actually belong to this implementation's lead
    // (leadId can't change from here — see the form's own disabled Lead
    // field) — same check as POST.
    if (body.projectId) {
      const project = await prisma.project.findFirst({ where: { id: parseInt(body.projectId), OR: [{ customerId: existing.leadId }, { leadId: existing.leadId }] } });
      if (!project) return NextResponse.json({ message: 'Selected project does not belong to this lead' }, { status: 400 });
    }

    const impl = await prisma.implementation.update({
      where: { id },
      data: {
        ...(body.projectName !== undefined && { projectName: body.projectName }),
        ...(body.projectId !== undefined && { projectId: body.projectId ? parseInt(body.projectId) : null }),
        ...(body.status && { status: body.status }),
        ...(body.projectManagerId !== undefined && { projectManagerId: body.projectManagerId ? parseInt(body.projectManagerId) : null }),
        ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
        ...(body.targetEndDate !== undefined && { targetEndDate: body.targetEndDate ? new Date(body.targetEndDate) : null }),
        ...(body.actualEndDate !== undefined && { actualEndDate: body.actualEndDate ? new Date(body.actualEndDate) : null }),
        ...(body.currentStage !== undefined && { currentStage: body.currentStage }),
        ...(body.notes !== undefined && { notes: body.notes }),
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
