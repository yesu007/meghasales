import prisma from '@/lib/prisma';
import { isValidMeetingStatusTransition, MeetingStatus } from './constants';

export class OptimisticLockError extends Error {}
export class InvalidStatusTransitionError extends Error {}

export interface CreateMeetingInput {
  title: string;
  meetingType: string;
  purpose?: string | null;
  scheduledAt: Date;
  durationMinutes?: number | null;
  location?: string | null;
  meetingLink?: string | null;
  organizerId?: number | null;
  priority?: string;
  refType?: string | null;
  refId?: number | null;
  createdById?: number | null;
}

export async function createMeeting(input: CreateMeetingInput) {
  const meeting = await prisma.meeting.create({
    data: {
      title: input.title,
      meetingType: input.meetingType,
      purpose: input.purpose ?? null,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes ?? null,
      location: input.location ?? null,
      meetingLink: input.meetingLink ?? null,
      organizerId: input.organizerId ?? null,
      priority: input.priority ?? 'MEDIUM',
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      createdById: input.createdById ?? null,
    },
  });

  await prisma.meetingActivity.create({
    data: { meetingId: meeting.id, action: 'CREATED', performedById: input.createdById ?? null },
  });

  // The organizer is a participant too — recorded so the participants list
  // (and future RSVP/attendance tracking) reflects them without the caller
  // having to add themselves as a second step.
  if (input.organizerId != null) {
    await prisma.meetingParticipant.create({
      data: { meetingId: meeting.id, participantType: 'INTERNAL', userId: input.organizerId, role: 'ORGANIZER', rsvpStatus: 'ACCEPTED' },
    });
  }

  return meeting;
}

export interface UpdateMeetingInput {
  version: number;
  performedById?: number | null;
  title?: string;
  purpose?: string | null;
  location?: string | null;
  meetingLink?: string | null;
  durationMinutes?: number | null;
  priority?: string;
  organizerId?: number | null;
}

// Optimistic locking via the `version` column — same reasoning as
// AdminTicket's updateTicket: two people editing the same meeting at once
// is a real scenario, and silently letting the second write clobber the
// first is worse than asking them to reload.
export async function updateMeeting(meetingId: number, input: UpdateMeetingInput) {
  const existing = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!existing) throw new Error('Meeting not found');

  const data: Record<string, unknown> = { version: { increment: 1 } };
  const activities: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];

  const trackField = (field: keyof UpdateMeetingInput, column: string) => {
    if (input[field] === undefined) return;
    const oldValue = (existing as any)[column];
    const newValue = input[field];
    if (oldValue === newValue) return;
    data[column] = newValue;
    activities.push({ field: column, oldValue: oldValue != null ? String(oldValue) : null, newValue: newValue != null ? String(newValue) : null });
  };

  trackField('title', 'title');
  trackField('purpose', 'purpose');
  trackField('location', 'location');
  trackField('meetingLink', 'meetingLink');
  trackField('durationMinutes', 'durationMinutes');
  trackField('priority', 'priority');
  trackField('organizerId', 'organizerId');

  const updateResult = await prisma.meeting.updateMany({ where: { id: meetingId, version: input.version }, data });
  if (updateResult.count === 0) {
    throw new OptimisticLockError('Meeting was modified by someone else — reload and try again');
  }

  for (const activity of activities) {
    await prisma.meetingActivity.create({
      data: { meetingId, action: 'UPDATED', fieldName: activity.field, oldValue: activity.oldValue, newValue: activity.newValue, performedById: input.performedById ?? null },
    });
  }

  return prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
}

// Reschedule is deliberately its own operation rather than a generic field
// update — it's the one edit participants actually need re-notifying about
// (§11 of the design doc), so it gets its own activity action distinct from
// UPDATED even though today both just write one row.
export async function rescheduleMeeting(meetingId: number, newScheduledAt: Date, version: number, performedById: number | null, reason?: string | null) {
  const existing = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!existing) throw new Error('Meeting not found');
  if (existing.status === 'CANCELLED') {
    throw new InvalidStatusTransitionError('Cannot reschedule a cancelled meeting');
  }

  const updateResult = await prisma.meeting.updateMany({
    where: { id: meetingId, version },
    data: { scheduledAt: newScheduledAt, version: { increment: 1 } },
  });
  if (updateResult.count === 0) {
    throw new OptimisticLockError('Meeting was modified by someone else — reload and try again');
  }

  await prisma.meetingActivity.create({
    data: {
      meetingId,
      action: 'RESCHEDULED',
      fieldName: 'scheduledAt',
      oldValue: existing.scheduledAt.toISOString(),
      newValue: newScheduledAt.toISOString(),
      performedById,
      remarks: reason ?? null,
    },
  });

  return prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
}

export async function changeMeetingStatus(meetingId: number, toStatus: MeetingStatus, version: number, performedById: number | null, remarks?: string | null) {
  const existing = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!existing) throw new Error('Meeting not found');

  const fromStatus = existing.status as MeetingStatus;
  if (!isValidMeetingStatusTransition(fromStatus, toStatus)) {
    throw new InvalidStatusTransitionError(`Cannot move meeting from ${fromStatus} to ${toStatus}`);
  }

  const updateResult = await prisma.meeting.updateMany({
    where: { id: meetingId, version },
    data: { status: toStatus, version: { increment: 1 } },
  });
  if (updateResult.count === 0) {
    throw new OptimisticLockError('Meeting was modified by someone else — reload and try again');
  }

  await prisma.meetingActivity.create({
    data: { meetingId, action: 'STATUS_CHANGED', fieldName: 'status', oldValue: fromStatus, newValue: toStatus, performedById, remarks: remarks ?? null },
  });

  return prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
}

export interface AddParticipantInput {
  participantType: 'INTERNAL' | 'EXTERNAL';
  userId?: number | null;
  externalName?: string | null;
  externalEmail?: string | null;
  role?: string;
}

export async function addParticipants(meetingId: number, participants: AddParticipantInput[], performedById: number | null) {
  const created = await prisma.$transaction(
    participants.map((p) =>
      prisma.meetingParticipant.create({
        data: {
          meetingId,
          participantType: p.participantType,
          userId: p.participantType === 'INTERNAL' ? p.userId ?? null : null,
          externalName: p.participantType === 'EXTERNAL' ? p.externalName ?? null : null,
          externalEmail: p.participantType === 'EXTERNAL' ? p.externalEmail ?? null : null,
          role: p.role ?? 'ATTENDEE',
        },
      })
    )
  );

  await prisma.meetingActivity.create({
    data: { meetingId, action: 'PARTICIPANTS_ADDED', performedById, remarks: `${created.length} participant(s) added` },
  });

  return created;
}

export interface AddAgendaItemInput {
  title: string;
  description?: string | null;
  timeAllocatedMinutes?: number | null;
  ownerId?: number | null;
  sortOrder?: number;
}

export async function addAgendaItem(meetingId: number, input: AddAgendaItemInput, performedById: number | null) {
  const item = await prisma.meetingAgendaItem.create({
    data: {
      meetingId,
      title: input.title,
      description: input.description ?? null,
      timeAllocatedMinutes: input.timeAllocatedMinutes ?? null,
      ownerId: input.ownerId ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  await prisma.meetingActivity.create({
    data: { meetingId, action: 'AGENDA_ITEM_ADDED', performedById, remarks: item.title },
  });

  return item;
}
