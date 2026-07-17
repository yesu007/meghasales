import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { validateDiscussionInput } from '@/lib/eventValidation';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { discussionId: string } }) {
  const denied = await requirePermission('manage_lead_events');
  if (denied) return denied;

  try {
    const id = parseInt(params.discussionId);
    const existing = await prisma.eventDiscussion.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Discussion not found' }, { status: 404 });

    const body = await request.json();
    if (body.notes !== undefined) {
      const validationError = validateDiscussionInput(body);
      if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });
    }

    const discussion = await prisma.eventDiscussion.update({
      where: { id },
      data: {
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.decisionsTaken !== undefined && { decisionsTaken: body.decisionsTaken }),
        ...(body.actionItems !== undefined && { actionItems: body.actionItems }),
        ...(body.assignedToId !== undefined && { assignedToId: body.assignedToId ? parseInt(body.assignedToId) : null }),
        ...(body.targetDate !== undefined && { targetDate: body.targetDate ? new Date(body.targetDate) : null }),
        ...(body.completionStatus && { completionStatus: body.completionStatus }),
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'EVENT_DISCUSSION', entityId: id, oldValue: existing, newValue: discussion, description: 'Discussion updated', request });

    return NextResponse.json(discussion);
  } catch (error: any) {
    console.error('PUT .../discussions/[discussionId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update discussion' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { discussionId: string } }) {
  const denied = await requirePermission('manage_lead_events');
  if (denied) return denied;

  try {
    const id = parseInt(params.discussionId);
    const existing = await prisma.eventDiscussion.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Discussion not found' }, { status: 404 });

    await prisma.eventDiscussion.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'EVENT_DISCUSSION', entityId: id, oldValue: existing, description: 'Discussion deleted', request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE .../discussions/[discussionId] error:', error);
    return NextResponse.json({ message: 'Failed to delete discussion' }, { status: 400 });
  }
}
