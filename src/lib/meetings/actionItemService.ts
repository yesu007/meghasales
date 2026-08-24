import prisma from '@/lib/prisma';
import { getActionItemTransitionCapability, isValidActionItemStatusTransition, ActionItemStatus } from './constants';
import { materializeActionItemReminders } from './actionItemReminderMaterializer';

export class OptimisticLockError extends Error {}
export class InvalidStatusTransitionError extends Error {}
export class ForbiddenTransitionError extends Error {}
export class DependencyNotSatisfiedError extends Error {}

const TERMINAL_OR_CLOSING_STATUSES: ActionItemStatus[] = ['COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED'];
const DEPENDENCY_SATISFIED_STATUSES: ActionItemStatus[] = ['COMPLETED', 'VERIFIED', 'CLOSED'];

export interface ActionItemCapabilities {
  hasAssign: boolean;
  hasManageOwn: boolean;
  hasVerify: boolean;
  hasClose: boolean;
  hasReopen: boolean;
}

export interface CreateActionItemInput {
  meetingId: number;
  momId?: number | null;
  refType?: string | null;
  refId?: number | null;
  description: string;
  assignedToId?: number | null;
  assignedTeam?: string | null;
  priority?: string;
  startDate?: Date | null;
  dueDate: Date;
  dependsOnActionItemId?: number | null;
  createdById?: number | null;
}

export async function createActionItem(input: CreateActionItemInput) {
  const meeting = await prisma.meeting.findUnique({ where: { id: input.meetingId }, select: { id: true, status: true } });
  if (!meeting) throw new Error('Meeting not found');
  if (meeting.status === 'CANCELLED') throw new Error('Cannot create an action item on a cancelled meeting');

  if (input.momId != null) {
    const mom = await prisma.mom.findUnique({ where: { id: input.momId }, select: { meetingId: true } });
    if (!mom || mom.meetingId !== input.meetingId) {
      throw new Error('momId must reference the MOM belonging to this meeting');
    }
  }

  if (input.dependsOnActionItemId != null) {
    const dependency = await prisma.actionItem.findUnique({ where: { id: input.dependsOnActionItemId }, select: { meetingId: true } });
    if (!dependency || dependency.meetingId !== input.meetingId) {
      throw new Error('dependsOnActionItemId must reference an action item from the same meeting');
    }
  }

  const actionItem = await prisma.actionItem.create({
    data: {
      meetingId: input.meetingId,
      momId: input.momId ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      description: input.description,
      assignedToId: input.assignedToId ?? null,
      assignedTeam: input.assignedTeam ?? null,
      priority: input.priority ?? 'MEDIUM',
      status: input.assignedToId != null ? 'ASSIGNED' : 'DRAFT',
      startDate: input.startDate ?? null,
      dueDate: input.dueDate,
      dependsOnActionItemId: input.dependsOnActionItemId ?? null,
      createdById: input.createdById ?? null,
    },
  });

  await prisma.actionItemHistory.create({ data: { actionItemId: actionItem.id, action: 'CREATED', performedById: input.createdById ?? null } });

  await materializeActionItemReminders(actionItem.id, actionItem.dueDate, actionItem.priority);

  return actionItem;
}

// Reassignment always resets to ASSIGNED — a new owner must accept again,
// same reasoning as a reassigned AdminTicket needing fresh eyes on it.
// Disallowed once the item has reached COMPLETED or later; use
// reopenActionItem first.
export async function assignActionItem(actionItemId: number, assignedToId: number, version: number, performedById: number | null) {
  const existing = await prisma.actionItem.findUnique({ where: { id: actionItemId } });
  if (!existing) throw new Error('Action item not found');
  if (TERMINAL_OR_CLOSING_STATUSES.includes(existing.status as ActionItemStatus)) {
    throw new InvalidStatusTransitionError(`Cannot assign an action item while status is ${existing.status} — reopen it first`);
  }

  const updateResult = await prisma.actionItem.updateMany({
    where: { id: actionItemId, version },
    data: { assignedToId, status: 'ASSIGNED', version: { increment: 1 } },
  });
  if (updateResult.count === 0) {
    throw new OptimisticLockError('Action item was modified by someone else — reload and try again');
  }

  await prisma.actionItemHistory.create({
    data: { actionItemId, action: 'ASSIGNED', fieldName: 'assignedToId', oldValue: existing.assignedToId?.toString() ?? null, newValue: assignedToId.toString(), performedById },
  });

  return prisma.actionItem.findUniqueOrThrow({ where: { id: actionItemId } });
}

export interface UpdateActionItemInput {
  version: number;
  performedById?: number | null;
  description?: string;
  assignedTeam?: string | null;
  priority?: string;
  startDate?: Date | null;
  dueDate?: Date;
  dependsOnActionItemId?: number | null;
}

export async function updateActionItem(actionItemId: number, input: UpdateActionItemInput) {
  const existing = await prisma.actionItem.findUnique({ where: { id: actionItemId } });
  if (!existing) throw new Error('Action item not found');

  if (input.dependsOnActionItemId !== undefined && input.dependsOnActionItemId != null) {
    if (input.dependsOnActionItemId === actionItemId) {
      throw new Error('An action item cannot depend on itself');
    }
    const dependency = await prisma.actionItem.findUnique({ where: { id: input.dependsOnActionItemId }, select: { meetingId: true, dependsOnActionItemId: true } });
    if (!dependency || dependency.meetingId !== existing.meetingId) {
      throw new Error('dependsOnActionItemId must reference an action item from the same meeting');
    }
    if (dependency.dependsOnActionItemId === actionItemId) {
      throw new Error('This would create a two-item dependency cycle');
    }
  }

  const data: Record<string, unknown> = { version: { increment: 1 } };
  const activities: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];

  const trackField = (field: keyof UpdateActionItemInput, column: string) => {
    if (input[field] === undefined) return;
    const oldValue = (existing as any)[column];
    const newValue = (input as any)[field];
    const changed = oldValue instanceof Date || newValue instanceof Date ? (oldValue?.getTime?.() ?? null) !== (newValue?.getTime?.() ?? null) : oldValue !== newValue;
    if (!changed) return;
    data[column] = newValue;
    activities.push({
      field: column,
      oldValue: oldValue instanceof Date ? oldValue.toISOString() : oldValue != null ? String(oldValue) : null,
      newValue: newValue instanceof Date ? newValue.toISOString() : newValue != null ? String(newValue) : null,
    });
  };

  trackField('description', 'description');
  trackField('assignedTeam', 'assignedTeam');
  trackField('priority', 'priority');
  trackField('startDate', 'startDate');
  trackField('dueDate', 'dueDate');
  trackField('dependsOnActionItemId', 'dependsOnActionItemId');

  const slaInputsChanged = 'dueDate' in data || 'priority' in data;

  const updateResult = await prisma.actionItem.updateMany({ where: { id: actionItemId, version: input.version }, data });
  if (updateResult.count === 0) {
    throw new OptimisticLockError('Action item was modified by someone else — reload and try again');
  }

  for (const activity of activities) {
    await prisma.actionItemHistory.create({
      data: { actionItemId, action: 'UPDATED', fieldName: activity.field, oldValue: activity.oldValue, newValue: activity.newValue, performedById: input.performedById ?? null },
    });
  }

  const updated = await prisma.actionItem.findUniqueOrThrow({ where: { id: actionItemId } });
  if (slaInputsChanged) {
    await materializeActionItemReminders(actionItemId, updated.dueDate, updated.priority);
  }

  return updated;
}

export async function changeActionItemStatus(
  actionItemId: number,
  toStatus: ActionItemStatus,
  version: number,
  actingUserId: number | null,
  capabilities: ActionItemCapabilities,
  remarks?: string | null
) {
  const existing = await prisma.actionItem.findUnique({ where: { id: actionItemId } });
  if (!existing) throw new Error('Action item not found');

  const fromStatus = existing.status as ActionItemStatus;
  if (!isValidActionItemStatusTransition(fromStatus, toStatus)) {
    throw new InvalidStatusTransitionError(`Cannot move action item from ${fromStatus} to ${toStatus}`);
  }

  const capability = getActionItemTransitionCapability(fromStatus, toStatus);
  const isOwner = actingUserId != null && existing.assignedToId === actingUserId;
  const allowed =
    capability === 'ASSIGN' || capability === 'CANCEL'
      ? capabilities.hasAssign
      : capability === 'VERIFY'
        ? capabilities.hasVerify
        : capability === 'CLOSE'
          ? capabilities.hasClose
          : capability === 'OWNER'
            ? (capabilities.hasManageOwn && isOwner) || capabilities.hasAssign
            : false;

  if (!allowed) {
    throw new ForbiddenTransitionError(`You don't have permission to move this action item to ${toStatus}`);
  }

  if (toStatus === 'COMPLETED' && existing.dependsOnActionItemId != null) {
    const dependency = await prisma.actionItem.findUnique({ where: { id: existing.dependsOnActionItemId }, select: { status: true, description: true } });
    if (dependency && !DEPENDENCY_SATISFIED_STATUSES.includes(dependency.status as ActionItemStatus)) {
      throw new DependencyNotSatisfiedError(`Cannot complete — blocked by dependency "${dependency.description}" which is still ${dependency.status}`);
    }
  }

  const data: Record<string, unknown> = { status: toStatus, version: { increment: 1 } };
  if (toStatus === 'COMPLETED') {
    data.completedAt = new Date();
    data.completedById = actingUserId;
    data.percentComplete = 100;
  } else if (toStatus === 'VERIFIED') {
    data.verifiedById = actingUserId;
    data.verifiedAt = new Date();
  } else if (toStatus === 'CLOSED' || toStatus === 'CANCELLED') {
    if (remarks) data.closureRemarks = remarks;
  } else {
    // Moving to any other status (DRAFT/ASSIGNED/ACCEPTED/IN_PROGRESS/
    // PENDING/BLOCKED) means it's back in play, not done or verified —
    // covers the verifier-rejection edge (COMPLETED -> IN_PROGRESS) and
    // every other "jump straight back from COMPLETED/VERIFIED" edge the
    // open transition graph now allows, so a stale completedAt/verifiedAt
    // never lingers on an item that's active again.
    data.completedAt = null;
    data.completedById = null;
    data.verifiedById = null;
    data.verifiedAt = null;
  }

  const updateResult = await prisma.actionItem.updateMany({ where: { id: actionItemId, version }, data });
  if (updateResult.count === 0) {
    throw new OptimisticLockError('Action item was modified by someone else — reload and try again');
  }

  await prisma.actionItemHistory.create({
    data: { actionItemId, action: 'STATUS_CHANGED', fieldName: 'status', oldValue: fromStatus, newValue: toStatus, performedById: actingUserId, remarks: remarks ?? null },
  });

  // A closed or cancelled item has nothing left to be followed up on, or
  // to be reminded/escalated about.
  if (toStatus === 'CLOSED' || toStatus === 'CANCELLED') {
    await prisma.actionItemFollowUp.updateMany({ where: { actionItemId, status: 'PENDING' }, data: { status: 'COMPLETED', completedAt: new Date() } });
    await prisma.actionItemReminder.updateMany({ where: { actionItemId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  }

  return prisma.actionItem.findUniqueOrThrow({ where: { id: actionItemId } });
}

export async function reopenActionItem(actionItemId: number, version: number, performedById: number | null, remarks?: string | null) {
  const existing = await prisma.actionItem.findUnique({ where: { id: actionItemId } });
  if (!existing) throw new Error('Action item not found');

  const fromStatus = existing.status as ActionItemStatus;
  if (fromStatus !== 'CLOSED' && fromStatus !== 'CANCELLED') {
    throw new InvalidStatusTransitionError(`Cannot reopen an action item while status is ${fromStatus}`);
  }

  const toStatus: ActionItemStatus = fromStatus === 'CLOSED' ? 'IN_PROGRESS' : existing.assignedToId != null ? 'ASSIGNED' : 'DRAFT';

  const updateResult = await prisma.actionItem.updateMany({
    where: { id: actionItemId, version },
    data: { status: toStatus, version: { increment: 1 }, completedAt: null, completedById: null, verifiedById: null, verifiedAt: null, closureRemarks: null },
  });
  if (updateResult.count === 0) {
    throw new OptimisticLockError('Action item was modified by someone else — reload and try again');
  }

  await prisma.actionItemHistory.create({
    data: { actionItemId, action: 'REOPENED', fieldName: 'status', oldValue: fromStatus, newValue: toStatus, performedById, remarks: remarks ?? null },
  });

  return prisma.actionItem.findUniqueOrThrow({ where: { id: actionItemId } });
}

export async function addActionItemComment(actionItemId: number, body: string, authorId: number | null) {
  return prisma.actionItemComment.create({ data: { actionItemId, body, authorId } });
}

export interface AddFollowUpInput {
  followUpDate: Date;
  frequency?: string;
  nextFollowUpDate?: Date | null;
  ownerId?: number | null;
  remarks?: string | null;
}

export async function addActionItemFollowUp(actionItemId: number, input: AddFollowUpInput, performedById: number | null) {
  const followUp = await prisma.actionItemFollowUp.create({
    data: {
      actionItemId,
      followUpDate: input.followUpDate,
      frequency: input.frequency ?? 'ONE_TIME',
      nextFollowUpDate: input.nextFollowUpDate ?? null,
      ownerId: input.ownerId ?? performedById,
      remarks: input.remarks ?? null,
    },
  });

  await prisma.actionItemHistory.create({ data: { actionItemId, action: 'FOLLOWUP_ADDED', performedById, remarks: input.remarks ?? null } });

  return followUp;
}

export async function completeActionItemFollowUp(followUpId: number, performedById: number | null) {
  const followUp = await prisma.actionItemFollowUp.findUnique({ where: { id: followUpId } });
  if (!followUp) throw new Error('Follow-up not found');

  const updated = await prisma.actionItemFollowUp.update({
    where: { id: followUpId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  await prisma.actionItemHistory.create({ data: { actionItemId: followUp.actionItemId, action: 'FOLLOWUP_COMPLETED', performedById } });

  return updated;
}
