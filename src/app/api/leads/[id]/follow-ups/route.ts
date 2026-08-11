import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { validateFollowUpInput } from '@/lib/leadFollowUp';
import { suggestStatusAfterFollowUp } from '@/lib/leadStatus';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const leadId = parseInt(params.id);

    const followUps = await prisma.leadFollowUp.findMany({
      where: { leadId },
      orderBy: { followUpDate: 'desc' },
      include: {
        loggedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return NextResponse.json(followUps);
  } catch (error) {
    console.error('GET /api/leads/[id]/follow-ups error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const leadId = parseInt(params.id);
    const body = await request.json();

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ message: 'Lead not found' }, { status: 404 });

    const validationError = validateFollowUpInput(body);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const session = await getServerSession(authOptions);
    const loggedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const followUpDate = new Date(body.followUpDate);
    const nextFollowUpDate = body.nextFollowUpDate ? new Date(body.nextFollowUpDate) : null;

    // Only auto-advance the lead's status forward (e.g. New -> Contacted, or
    // -> Follow-up Scheduled when a next date is set) — never override a
    // status the user already pushed further along (Qualified/Converted/Lost).
    const suggestedStatus = suggestStatusAfterFollowUp(lead.status, !!nextFollowUpDate);

    const [followUp] = await prisma.$transaction([
      prisma.leadFollowUp.create({
        data: {
          leadId,
          followUpDate,
          method: body.method,
          notes: body.notes || null,
          outcome: body.outcome || null,
          nextAction: body.nextAction || null,
          nextFollowUpDate,
          loggedById: Number.isFinite(loggedById) ? loggedById : null,
        },
      }),
      prisma.lead.update({
        where: { id: leadId },
        data: {
          lastFollowUpDate: followUpDate,
          nextFollowUpDate,
          followUpCount: { increment: 1 },
          ...(suggestedStatus && { status: suggestedStatus }),
        },
      }),
      prisma.leadActivity.create({
        data: {
          leadId,
          activityType: 'FOLLOWUP_LOGGED',
          description: `Follow-up logged for ${lead.companyName} (${body.method})${suggestedStatus ? ` — status moved to ${suggestedStatus.replace(/_/g, ' ').toLowerCase()}` : ''}`,
          performedById: Number.isFinite(loggedById) ? loggedById : null,
        },
      }),
    ]);

    await logAudit({ action: 'CREATE', entityType: 'LEAD_FOLLOW_UP', entityId: followUp.id, newValue: followUp, description: `Follow-up logged for lead: ${lead.companyName}`, request });

    return NextResponse.json({ ...followUp, statusUpdatedTo: suggestedStatus }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/leads/[id]/follow-ups error:', error);
    return NextResponse.json({ message: error.message || 'Failed to log follow-up' }, { status: 400 });
  }
}
