import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Aggregated, cross-event view of every document uploaded on a lead's
// events — lets users find/download a document without having to know
// (or remember) which specific event it was attached to. Discussion
// attachments (EventDocument.eventId null) are intentionally excluded
// here since they're scoped to a single discussion thread, not the lead
// broadly; they remain visible inline within DiscussionTimeline.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_lead_events');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const documents = await prisma.eventDocument.findMany({
      where: { event: { leadId } },
      orderBy: { createdAt: 'desc' },
      include: {
        event: { select: { id: true, title: true } },
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        uploadedBy: { select: { firstName: true, lastName: true } },
        _count: { select: { versions: true } },
      },
    });
    return NextResponse.json(documents);
  } catch (error) {
    console.error('GET /api/leads/[id]/documents error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
