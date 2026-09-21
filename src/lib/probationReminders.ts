import dayjs from 'dayjs';
import prisma from '@/lib/prisma';
import { sendPushToUser } from '@/lib/push';

// Probation Period notification schedule — three fixed calendar-day
// offsets from each PROBATION employee's current probationEndDate (the
// saved value, whether auto-calculated or manually adjusted — see
// Employee.probationEndDate's own schema comment). Dates only (day
// boundaries), not hour-precision like the deadline-reminder cron, since
// "N days before" here is meant literally on the calendar, not "within
// the next N*24 hours."
const SIX_DAYS_BEFORE = 'SIX_DAYS_BEFORE';
const ONE_DAY_BEFORE = 'ONE_DAY_BEFORE';
const END_DATE = 'END_DATE';
type Stage = typeof SIX_DAYS_BEFORE | typeof ONE_DAY_BEFORE | typeof END_DATE;

const STAGE_BY_DAYS_REMAINING: Record<number, Stage> = { 6: SIX_DAYS_BEFORE, 1: ONE_DAY_BEFORE, 0: END_DATE };

interface Candidate {
  employeeId: number;
  employeeName: string;
  employeeUserId: number | null;
  // "Admin mapped to that Employee" — this codebase has no dedicated
  // Employee→Admin mapping (see the ADMIN-role broadcast pattern used
  // elsewhere, e.g. leave-requests/mine/route.ts, which is global rather
  // than per-employee); Employee.managerId is the only actual per-employee
  // mapping that exists, so that's what's reused here rather than
  // inventing a new mechanism.
  adminUserId: number | null;
  probationEndDate: Date;
  stage: Stage;
}

export interface ProbationDispatchResult {
  notified: number;
  employeesProcessed: number;
}

export async function dispatchProbationReminders(now: Date = new Date()): Promise<ProbationDispatchResult> {
  const candidates = await collectCandidates(now);
  if (candidates.length === 0) return { notified: 0, employeesProcessed: 0 };

  // Dedup key includes probationEndDate (not just employeeId+stage) — see
  // ProbationReminderLog's own schema comment: a changed/extended End Date
  // is a different key, so it's automatically eligible again with no
  // separate "reset the schedule" step.
  const alreadySent = await prisma.probationReminderLog.findMany({
    where: { OR: candidates.map((c) => ({ employeeId: c.employeeId, stage: c.stage, probationEndDate: c.probationEndDate })) },
    select: { employeeId: true, stage: true, probationEndDate: true },
  });
  const sentKey = (employeeId: number, stage: string, probationEndDate: Date) => `${employeeId}:${stage}:${probationEndDate.getTime()}`;
  const alreadySentSet = new Set(alreadySent.map((r) => sentKey(r.employeeId, r.stage, r.probationEndDate)));

  let notified = 0;
  let employeesProcessed = 0;

  for (const candidate of candidates) {
    if (alreadySentSet.has(sentKey(candidate.employeeId, candidate.stage, candidate.probationEndDate))) continue;

    const recipients = Array.from(new Set([candidate.employeeUserId, candidate.adminUserId].filter((id): id is number => id != null)));
    try {
      if (recipients.length > 0) {
        const title = notificationTitle(candidate.stage);
        const message = `${candidate.employeeName}'s probation period ends ${dayjs(candidate.probationEndDate).format('DD MMM YYYY')}.`;
        await prisma.notification.createMany({
          data: recipients.map((userId) => ({
            userId,
            title,
            message,
            type: 'PROBATION_REMINDER',
            channel: 'IN_APP',
            entityType: 'EMPLOYEE',
            entityId: candidate.employeeId,
          })),
        });
        notified += recipients.length;

        // Best-effort browser push, same "opt-in per user, silently no-ops
        // if unconfigured or the recipient never subscribed" fan-out the
        // admin-ticket and leave-overlap notifications already use — never
        // allowed to fail the notification/log write above.
        await Promise.all(
          recipients.map((userId) =>
            sendPushToUser(userId, { title, body: message, url: '/dashboard/notifications' }).catch((error) =>
              console.error(`Probation push failed for user ${userId}:`, error)
            )
          )
        );
      }
      // Logged even with zero recipients (no linked login for either the
      // employee or their manager) — per the requirement's own "if no
      // Admin is mapped, don't break the probation process": that day's
      // stage has still been processed, so a same-day rerun of this cron
      // won't retry it pointlessly, and tomorrow it no longer matches this
      // stage's day offset anyway.
      await prisma.probationReminderLog.create({
        data: { employeeId: candidate.employeeId, stage: candidate.stage, probationEndDate: candidate.probationEndDate },
      });
      employeesProcessed += 1;
    } catch (error) {
      if (!isDuplicateLogError(error)) console.error(`Probation reminder failed for employee ${candidate.employeeId} (${candidate.stage}):`, error);
    }
  }

  return { notified, employeesProcessed };
}

function isDuplicateLogError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as any).code === 'P2002';
}

function notificationTitle(stage: Stage): string {
  switch (stage) {
    case SIX_DAYS_BEFORE:
      return 'Probation ending in 6 days';
    case ONE_DAY_BEFORE:
      return 'Probation ending tomorrow';
    case END_DATE:
      return 'Probation ends today';
  }
}

async function collectCandidates(now: Date): Promise<Candidate[]> {
  const employees = await prisma.employee.findMany({
    where: { employmentType: 'PROBATION', probationEndDate: { not: null }, status: { not: 'EXITED' } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      userId: true,
      probationEndDate: true,
      manager: { select: { userId: true } },
    },
  });

  const today = dayjs(now).startOf('day');
  const candidates: Candidate[] = [];
  for (const e of employees) {
    if (!e.probationEndDate) continue;
    const daysRemaining = dayjs(e.probationEndDate).startOf('day').diff(today, 'day');
    const stage = STAGE_BY_DAYS_REMAINING[daysRemaining];
    if (!stage) continue;

    candidates.push({
      employeeId: e.id,
      employeeName: `${e.firstName} ${e.lastName}`,
      employeeUserId: e.userId,
      adminUserId: e.manager?.userId ?? null,
      probationEndDate: e.probationEndDate,
      stage,
    });
  }
  return candidates;
}
