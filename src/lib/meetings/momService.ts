import prisma from '@/lib/prisma';
import { isMomContentEditable, isValidMomStatusTransition, MomStatus } from './constants';
import { resolveMeetingRecipientUserIds } from './meetingService';
import { notifyManyViaTemplate } from './notificationTemplates';

function appUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL || '';
  return `${base}${path}`;
}

export class OptimisticLockError extends Error {}
export class InvalidStatusTransitionError extends Error {}
export class MomAlreadyExistsError extends Error {}
export class MomNotEditableError extends Error {}

export interface CreateMomInput {
  summary?: string | null;
  risksIssues?: string | null;
}

export async function createMom(meetingId: number, input: CreateMomInput, createdById: number | null) {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true, status: true, mom: { select: { id: true } } } });
  if (!meeting) throw new Error('Meeting not found');
  if (meeting.status === 'CANCELLED') throw new Error('Cannot create a MOM for a cancelled meeting');
  if (meeting.mom) throw new MomAlreadyExistsError('This meeting already has a MOM');

  const mom = await prisma.mom.create({
    data: { meetingId, summary: input.summary ?? null, risksIssues: input.risksIssues ?? null, createdById: createdById ?? null },
  });

  await prisma.meetingActivity.create({ data: { meetingId, action: 'MOM_CREATED', performedById: createdById ?? null } });

  return mom;
}

export interface UpdateMomContentInput {
  version: number;
  performedById?: number | null;
  summary?: string | null;
  risksIssues?: string | null;
}

// Snapshots the pre-edit content into mom_versions before applying the
// change, so the history shows what it looked like before each edit — the
// optimistic lock (Mom.version) is a separate counter from the content
// history's versionNumber. Everything below runs inside one interactive
// transaction so a failed lock check rolls back the snapshot too — a plain
// $transaction([...]) array would still commit the snapshot even when the
// guarded updateMany matched zero rows, recording a version for an edit
// that never actually applied.
export async function updateMomContent(momId: number, input: UpdateMomContentInput) {
  const existing = await prisma.mom.findUnique({ where: { id: momId }, include: { decisions: { orderBy: { sortOrder: 'asc' } } } });
  if (!existing) throw new Error('MOM not found');
  if (!isMomContentEditable(existing.status as MomStatus)) {
    throw new MomNotEditableError(`Cannot edit MOM content while status is ${existing.status}`);
  }

  const data: Record<string, unknown> = { version: { increment: 1 } };
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.risksIssues !== undefined) data.risksIssues = input.risksIssues;

  const updated = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.mom.updateMany({ where: { id: momId, version: input.version }, data });
    if (updateResult.count === 0) {
      throw new OptimisticLockError('MOM was modified by someone else — reload and try again');
    }

    const latestVersion = await tx.momVersion.findFirst({ where: { momId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
    await tx.momVersion.create({
      data: {
        momId,
        versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
        contentSnapshot: { summary: existing.summary, risksIssues: existing.risksIssues, decisions: existing.decisions.map((d) => d.decisionText) },
        editedById: input.performedById ?? null,
      },
    });

    return tx.mom.findUniqueOrThrow({ where: { id: momId } });
  });

  await prisma.meetingActivity.create({ data: { meetingId: existing.meetingId, action: 'MOM_UPDATED', performedById: input.performedById ?? null } });

  return updated;
}

export async function addMomDecision(momId: number, decisionText: string, sortOrder: number | undefined, performedById: number | null) {
  const mom = await prisma.mom.findUnique({ where: { id: momId }, select: { id: true, meetingId: true, status: true } });
  if (!mom) throw new Error('MOM not found');
  if (!isMomContentEditable(mom.status as MomStatus)) {
    throw new MomNotEditableError(`Cannot add a decision while MOM status is ${mom.status}`);
  }

  const decision = await prisma.momDecision.create({
    data: { momId, decisionText, decidedById: performedById, sortOrder: sortOrder ?? 0 },
  });

  await prisma.meetingActivity.create({ data: { meetingId: mom.meetingId, action: 'MOM_DECISION_ADDED', remarks: decisionText, performedById } });

  return decision;
}

async function transitionMomStatus(momId: number, toStatus: MomStatus, version: number, performedById: number | null, extraData: Record<string, unknown>, activityAction: string, remarks?: string | null) {
  const existing = await prisma.mom.findUnique({ where: { id: momId } });
  if (!existing) throw new Error('MOM not found');

  const fromStatus = existing.status as MomStatus;
  if (!isValidMomStatusTransition(fromStatus, toStatus)) {
    throw new InvalidStatusTransitionError(`Cannot move MOM from ${fromStatus} to ${toStatus}`);
  }

  const updateResult = await prisma.mom.updateMany({
    where: { id: momId, version },
    data: { status: toStatus, version: { increment: 1 }, ...extraData },
  });
  if (updateResult.count === 0) {
    throw new OptimisticLockError('MOM was modified by someone else — reload and try again');
  }

  await prisma.meetingActivity.create({ data: { meetingId: existing.meetingId, action: activityAction, remarks: remarks ?? null, performedById } });

  return prisma.mom.findUniqueOrThrow({ where: { id: momId } });
}

export async function submitMom(momId: number, version: number, performedById: number | null) {
  return transitionMomStatus(momId, 'SUBMITTED', version, performedById, {}, 'MOM_SUBMITTED');
}

export async function approveMom(momId: number, version: number, performedById: number | null, remarks?: string | null) {
  return transitionMomStatus(momId, 'APPROVED', version, performedById, { approvedById: performedById, approvedAt: new Date() }, 'MOM_APPROVED', remarks);
}

export async function rejectMom(momId: number, version: number, performedById: number | null, remarks?: string | null) {
  return transitionMomStatus(momId, 'REJECTED', version, performedById, { approvedById: null, approvedAt: null }, 'MOM_REJECTED', remarks);
}

export async function publishMom(momId: number, version: number, performedById: number | null) {
  const mom = await transitionMomStatus(momId, 'PUBLISHED', version, performedById, { publishedAt: new Date() }, 'MOM_PUBLISHED');

  // Best-effort — a notification failure must never fail the publish
  // action itself, same reasoning as every other best-effort dispatch in
  // this codebase (e.g. the on-demand deadline-reminder calls).
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id: mom.meetingId }, select: { title: true } });
    const recipientUserIds = await resolveMeetingRecipientUserIds(mom.meetingId);
    if (meeting && recipientUserIds.length > 0) {
      await notifyManyViaTemplate({
        eventType: 'MOM_PUBLISHED',
        channels: ['IN_APP', 'EMAIL'],
        entityType: 'MOM',
        entityId: mom.id,
        recipientUserIds,
        vars: { meetingTitle: meeting.title, actionUrl: appUrl(`/dashboard/meetings/${mom.meetingId}`) },
      });
    }
  } catch (error) {
    console.error(`MOM_PUBLISHED notification fan-out failed for mom ${mom.id}:`, error);
  }

  return mom;
}
