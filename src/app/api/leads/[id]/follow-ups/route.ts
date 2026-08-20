import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { validateFollowUpInput } from '@/lib/leadFollowUp';
import { suggestStatusAfterFollowUp } from '@/lib/leadStatus';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_leads');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);

    // Follow-up history merges two sources: explicit LeadFollowUp entries
    // (logged via this tab's "Add Follow-up" form) AND Events that carry
    // their own follow-up plan (the Events tab's "Next Action"/"Follow-up
    // Date" fields, e.g. `eventType: 'FOLLOW_UP'` or any event where the
    // user set a next-step). Without this merge, a follow-up plan set while
    // logging an event never appeared here — a real gap, not a duplicate
    // of the Events tab, since this view is specifically about follow-up
    // planning/history across BOTH ways a follow-up gets recorded.
    const [followUps, events] = await Promise.all([
      prisma.leadFollowUp.findMany({
        where: { leadId },
        include: { loggedBy: { select: { firstName: true, lastName: true } } },
      }),
      prisma.event.findMany({
        where: { leadId, OR: [{ followUpDate: { not: null } }, { nextAction: { not: null } }] },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    const merged = [
      ...followUps.map((f) => ({
        id: f.id,
        source: 'FOLLOWUP' as const,
        interactionDate: f.followUpDate,
        method: f.method,
        title: null,
        notes: f.notes,
        outcome: f.outcome,
        nextAction: f.nextAction,
        nextFollowUpDate: f.nextFollowUpDate,
        loggedBy: f.loggedBy,
        createdAt: f.createdAt,
      })),
      ...events.map((e) => ({
        id: e.id,
        source: 'EVENT' as const,
        interactionDate: e.eventDateTime,
        method: e.eventType,
        title: e.title,
        notes: e.description,
        outcome: null,
        nextAction: e.nextAction,
        nextFollowUpDate: e.followUpDate,
        loggedBy: e.createdBy,
        createdAt: e.createdAt,
      })),
    ].sort((a, b) => new Date(b.interactionDate).getTime() - new Date(a.interactionDate).getTime());

    return NextResponse.json(merged);
  } catch (error) {
    console.error('GET /api/leads/[id]/follow-ups error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_leads');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const body = await request.json();

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ message: 'Lead not found' }, { status: 404 });

    const validationError = validateFollowUpInput(body);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const session = await getServerSession(authOptions);
    const loggedById = session?.user ? parseInt(session.user.id, 10) : null;

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
