import prisma from '@/lib/prisma';
import { nextAdminTicketNumber } from './ticketNumber';
import { materializeReminders } from './reminderMaterializer';
import { isValidStatusTransition, TicketStatus } from './constants';

export class OptimisticLockError extends Error {}
export class InvalidStatusTransitionError extends Error {}

export interface CreateTicketInput {
  categoryId: number;
  title: string;
  description?: string | null;
  priority?: string;
  assignedToId?: number | null;
  createdById?: number | null;
  dueDate?: Date | null;
  refType?: string | null;
  refId?: number | null;
}

export async function createTicket(input: CreateTicketInput) {
  const ticketNo = await nextAdminTicketNumber(prisma);
  const ticket = await prisma.adminTicket.create({
    data: {
      ticketNo,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? 'MEDIUM',
      assignedToId: input.assignedToId ?? null,
      createdById: input.createdById ?? null,
      dueDate: input.dueDate ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
    },
  });

  await prisma.adminTicketActivity.create({
    data: { ticketId: ticket.id, action: 'CREATED', performedById: input.createdById ?? null },
  });

  const category = await prisma.adminTicketCategory.findUnique({
    where: { id: ticket.categoryId },
    select: { escalationRoleId: true },
  });
  await materializeReminders(ticket.id, ticket.dueDate, category?.escalationRoleId ?? null);

  return ticket;
}

export interface UpdateTicketInput {
  version: number;
  performedById?: number | null;
  title?: string;
  description?: string | null;
  priority?: string;
  assignedToId?: number | null;
  dueDate?: Date | null;
}

// Optimistic locking via the `version` column — updateMany's affected-row
// count tells us whether someone else's update won the race, instead of
// silently overwriting it (two admins completing/editing the same ticket
// at once is a real scenario for a shared office task list).
export async function updateTicket(ticketId: number, input: UpdateTicketInput) {
  const existing = await prisma.adminTicket.findUnique({ where: { id: ticketId } });
  if (!existing) throw new Error('Ticket not found');

  const data: Record<string, unknown> = { version: { increment: 1 } };
  const activities: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];

  if (input.title !== undefined && input.title !== existing.title) {
    data.title = input.title;
    activities.push({ field: 'title', oldValue: existing.title, newValue: input.title });
  }
  if (input.description !== undefined && input.description !== existing.description) {
    data.description = input.description;
    activities.push({ field: 'description', oldValue: existing.description, newValue: input.description });
  }
  if (input.priority !== undefined && input.priority !== existing.priority) {
    data.priority = input.priority;
    activities.push({ field: 'priority', oldValue: existing.priority, newValue: input.priority });
  }
  if (input.assignedToId !== undefined && input.assignedToId !== existing.assignedToId) {
    data.assignedToId = input.assignedToId;
    activities.push({
      field: 'assignedToId',
      oldValue: existing.assignedToId?.toString() ?? null,
      newValue: input.assignedToId?.toString() ?? null,
    });
  }

  let dueDateChanged = false;
  if (input.dueDate !== undefined && (input.dueDate?.getTime() ?? null) !== (existing.dueDate?.getTime() ?? null)) {
    data.dueDate = input.dueDate;
    dueDateChanged = true;
    activities.push({
      field: 'dueDate',
      oldValue: existing.dueDate?.toISOString() ?? null,
      newValue: input.dueDate?.toISOString() ?? null,
    });
  }

  const updateResult = await prisma.adminTicket.updateMany({
    where: { id: ticketId, version: input.version },
    data,
  });
  if (updateResult.count === 0) {
    throw new OptimisticLockError('Ticket was modified by someone else — reload and try again');
  }

  for (const activity of activities) {
    await prisma.adminTicketActivity.create({
      data: {
        ticketId,
        action: 'UPDATED',
        fieldName: activity.field,
        oldValue: activity.oldValue,
        newValue: activity.newValue,
        performedById: input.performedById ?? null,
      },
    });
  }

  const updated = await prisma.adminTicket.findUniqueOrThrow({ where: { id: ticketId } });
  if (dueDateChanged) {
    const category = await prisma.adminTicketCategory.findUnique({
      where: { id: updated.categoryId },
      select: { escalationRoleId: true },
    });
    await materializeReminders(ticketId, updated.dueDate, category?.escalationRoleId ?? null);
  }

  return updated;
}

export async function changeTicketStatus(
  ticketId: number,
  toStatus: TicketStatus,
  version: number,
  performedById: number | null,
  options?: { requireAttachmentOnComplete?: boolean }
) {
  const existing = await prisma.adminTicket.findUnique({
    where: { id: ticketId },
    include: { attachments: { take: 1 } },
  });
  if (!existing) throw new Error('Ticket not found');

  const fromStatus = existing.status as TicketStatus;
  if (!isValidStatusTransition(fromStatus, toStatus)) {
    throw new InvalidStatusTransitionError(`Cannot move ticket from ${fromStatus} to ${toStatus}`);
  }
  if (toStatus === 'COMPLETED' && options?.requireAttachmentOnComplete && existing.attachments.length === 0) {
    throw new InvalidStatusTransitionError('Completing this ticket requires at least one attachment as proof');
  }

  const data: Record<string, unknown> = { status: toStatus, version: { increment: 1 } };
  if (toStatus === 'COMPLETED') {
    data.completedAt = new Date();
    data.completedById = performedById;
  }

  const updateResult = await prisma.adminTicket.updateMany({ where: { id: ticketId, version }, data });
  if (updateResult.count === 0) {
    throw new OptimisticLockError('Ticket was modified by someone else — reload and try again');
  }

  await prisma.adminTicketActivity.create({
    data: { ticketId, action: 'STATUS_CHANGED', fieldName: 'status', oldValue: fromStatus, newValue: toStatus, performedById },
  });

  // A completed or cancelled ticket has nothing left to be reminded about —
  // cancel whatever's still pending rather than leaving it to fire after
  // the fact.
  if (toStatus === 'COMPLETED' || toStatus === 'CANCELLED') {
    await prisma.adminTicketReminder.updateMany({ where: { ticketId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  }

  return prisma.adminTicket.findUniqueOrThrow({ where: { id: ticketId } });
}
