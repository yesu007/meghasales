import dayjs from 'dayjs';
import prisma from '@/lib/prisma';
import { ACTION_ITEM_OPEN_STATUSES, ACTION_ITEM_RESOLVED_STATUSES, ACTION_ITEM_STATUSES, classifyActionItemSlaStatus } from './constants';

const SLA_APPROACHING_LIMIT = 10;
const BREACH_TREND_WEEKS = 8;
const COMPLETION_WINDOW_DAYS = 90;

export interface IndividualDashboard {
  meetingsToday: Array<{ id: number; title: string; scheduledAt: Date; meetingType: string }>;
  pendingMoms: Array<{ id: number; meetingId: number; meetingTitle: string; status: string }>;
  actionItemsByStatus: Record<string, number>;
  dueTodayCount: number;
  overdueCount: number;
  slaApproaching: Array<{ id: number; description: string; dueDate: Date; priority: string; meetingTitle: string }>;
}

// "My meetings today" includes both organizer and participant — same OR
// used nowhere else yet in this module, since every other meeting query so
// far has been either "mine to manage" (organizerId) or "everything"
// (manage_meetings), not "everything I'm involved in."
export async function getIndividualDashboard(userId: number, now: Date = new Date()): Promise<IndividualDashboard> {
  const todayStart = dayjs(now).startOf('day').toDate();
  const todayEnd = dayjs(now).endOf('day').toDate();

  const [meetingsToday, pendingMomsRaw, statusGroups, dueTodayCount, overdueCount, slaApproachingRaw] = await Promise.all([
    prisma.meeting.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { gte: todayStart, lte: todayEnd },
        OR: [{ organizerId: userId }, { participants: { some: { userId } } }],
      },
      orderBy: { scheduledAt: 'asc' },
      select: { id: true, title: true, scheduledAt: true, meetingType: true },
    }),
    prisma.mom.findMany({
      where: { status: { in: ['DRAFT', 'REJECTED'] }, meeting: { organizerId: userId } },
      select: { id: true, status: true, meeting: { select: { id: true, title: true } } },
    }),
    prisma.actionItem.groupBy({ by: ['status'], where: { assignedToId: userId }, _count: true }),
    prisma.actionItem.count({
      where: {
        assignedToId: userId,
        status: { notIn: ACTION_ITEM_RESOLVED_STATUSES },
        dueDate: { gte: todayStart, lte: todayEnd },
      },
    }),
    prisma.actionItem.count({
      where: { assignedToId: userId, status: { notIn: ACTION_ITEM_RESOLVED_STATUSES }, dueDate: { lt: todayStart } },
    }),
    prisma.actionItem.findMany({
      where: { assignedToId: userId, status: { notIn: ACTION_ITEM_RESOLVED_STATUSES }, dueDate: { gte: todayStart } },
      orderBy: { dueDate: 'asc' },
      take: SLA_APPROACHING_LIMIT,
      select: { id: true, description: true, dueDate: true, priority: true, meeting: { select: { title: true } } },
    }),
  ]);

  const actionItemsByStatus: Record<string, number> = {};
  for (const s of ACTION_ITEM_STATUSES) actionItemsByStatus[s] = 0;
  for (const g of statusGroups) actionItemsByStatus[g.status] = g._count;

  return {
    meetingsToday,
    pendingMoms: pendingMomsRaw.map((m) => ({ id: m.id, meetingId: m.meeting.id, meetingTitle: m.meeting.title, status: m.status })),
    actionItemsByStatus,
    dueTodayCount,
    overdueCount,
    slaApproaching: slaApproachingRaw.map((a) => ({
      id: a.id,
      description: a.description,
      dueDate: a.dueDate,
      priority: a.priority,
      meetingTitle: a.meeting.title,
    })),
  };
}

export interface TeamDashboard {
  department: string;
  meetingLoadThisWeek: number;
  openActionsByOwner: Array<{ userId: number; name: string; openCount: number; overdueCount: number }>;
  slaBreachTrend: Array<{ weekStart: string; breached: number }>;
  completionRatePercent: number;
  workloadHeatmap: Array<{ userId: number; name: string; day: string; openCount: number }>;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Team = every Employee sharing the caller's own Employee.department string
// — the design doc's own fallback (§07 assumptions) since no Team/
// Department master or manager/reports-to relationship exists in this
// schema yet. Returns null when the caller has no department set (nothing
// to scope a team view to).
export async function getTeamDashboard(department: string, now: Date = new Date()): Promise<TeamDashboard | null> {
  const employees = await prisma.employee.findMany({
    where: { department, userId: { not: null } },
    select: { userId: true, firstName: true, lastName: true },
  });
  const userIds = employees.map((e) => e.userId as number);
  if (!userIds.length) return null;

  const nameByUserId = new Map(employees.map((e) => [e.userId as number, `${e.firstName} ${e.lastName}`]));
  const weekStart = dayjs(now).startOf('week').toDate();
  const weekEnd = dayjs(now).endOf('week').toDate();
  const trendStart = dayjs(now).subtract(BREACH_TREND_WEEKS, 'week').startOf('week').toDate();
  const completionWindowStart = dayjs(now).subtract(COMPLETION_WINDOW_DAYS, 'day').toDate();

  const [meetingLoadThisWeek, openItems, trendWindowItems, resolvedRecentItems] = await Promise.all([
    prisma.meeting.count({ where: { organizerId: { in: userIds }, scheduledAt: { gte: weekStart, lte: weekEnd } } }),
    prisma.actionItem.findMany({
      where: { assignedToId: { in: userIds }, status: { in: ACTION_ITEM_OPEN_STATUSES } },
      select: { assignedToId: true, dueDate: true },
    }),
    prisma.actionItem.findMany({
      where: { assignedToId: { in: userIds }, dueDate: { gte: trendStart, lte: now } },
      select: { status: true, dueDate: true, completedAt: true },
    }),
    prisma.actionItem.findMany({
      where: { assignedToId: { in: userIds }, status: { in: ACTION_ITEM_RESOLVED_STATUSES }, updatedAt: { gte: completionWindowStart } },
      select: { status: true, dueDate: true, completedAt: true },
    }),
  ]);

  const openByOwner = new Map<number, { openCount: number; overdueCount: number }>();
  const heatmapByOwnerDay = new Map<string, number>();
  for (const item of openItems) {
    if (item.assignedToId == null) continue;
    const bucket = openByOwner.get(item.assignedToId) ?? { openCount: 0, overdueCount: 0 };
    bucket.openCount += 1;
    if (item.dueDate.getTime() < now.getTime()) bucket.overdueCount += 1;
    openByOwner.set(item.assignedToId, bucket);

    const dayKey = `${item.assignedToId}:${WEEKDAY_NAMES[item.dueDate.getUTCDay()]}`;
    heatmapByOwnerDay.set(dayKey, (heatmapByOwnerDay.get(dayKey) ?? 0) + 1);
  }

  const openActionsByOwner = userIds
    .map((id) => ({ userId: id, name: nameByUserId.get(id) ?? `User ${id}`, ...(openByOwner.get(id) ?? { openCount: 0, overdueCount: 0 }) }))
    .sort((a, b) => b.overdueCount - a.overdueCount);

  const workloadHeatmap: TeamDashboard['workloadHeatmap'] = [];
  for (const id of userIds) {
    for (const day of WEEKDAY_NAMES) {
      const openCount = heatmapByOwnerDay.get(`${id}:${day}`) ?? 0;
      if (openCount > 0) workloadHeatmap.push({ userId: id, name: nameByUserId.get(id) ?? `User ${id}`, day, openCount });
    }
  }

  const breachByWeek = new Map<string, number>();
  for (let w = 0; w < BREACH_TREND_WEEKS; w++) {
    breachByWeek.set(dayjs(trendStart).add(w, 'week').format('YYYY-MM-DD'), 0);
  }
  for (const item of trendWindowItems) {
    const slaStatus = classifyActionItemSlaStatus(item, now);
    if (slaStatus !== 'OVERDUE' && slaStatus !== 'BREACHED') continue;
    const weekKey = dayjs(item.dueDate).startOf('week').format('YYYY-MM-DD');
    if (breachByWeek.has(weekKey)) breachByWeek.set(weekKey, (breachByWeek.get(weekKey) ?? 0) + 1);
  }
  const slaBreachTrend = Array.from(breachByWeek.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStartKey, breached]) => ({ weekStart: weekStartKey, breached }));

  let onTime = 0;
  let total = 0;
  for (const item of resolvedRecentItems) {
    const slaStatus = classifyActionItemSlaStatus(item, now);
    if (slaStatus === 'NOT_APPLICABLE') continue;
    total += 1;
    if (slaStatus === 'ON_TIME') onTime += 1;
  }
  const completionRatePercent = total > 0 ? Math.round((onTime / total) * 100) : 0;

  return { department, meetingLoadThisWeek, openActionsByOwner, slaBreachTrend, completionRatePercent, workloadHeatmap };
}

export interface ManagementDashboard {
  totals: { meetings: number; openActions: number; slaCompliancePercent: number };
  departmentBreakdown: Array<{ department: string; openCount: number }>;
  customerBreakdown: Array<{ id: number; name: string; openCount: number }>;
  projectBreakdown: Array<{ id: number; name: string; openCount: number }>;
  meetingEffectivenessTrend: Array<{ weekStart: string; ratio: number }>;
}

const EFFECTIVENESS_TREND_WEEKS = 12;

export async function getManagementDashboard(now: Date = new Date()): Promise<ManagementDashboard> {
  const completionWindowStart = dayjs(now).subtract(COMPLETION_WINDOW_DAYS, 'day').toDate();
  const trendStart = dayjs(now).subtract(EFFECTIVENESS_TREND_WEEKS, 'week').startOf('week').toDate();

  const [meetingsTotal, openItems, resolvedRecentItems, trendItems] = await Promise.all([
    prisma.meeting.count(),
    prisma.actionItem.findMany({
      where: { status: { in: ACTION_ITEM_OPEN_STATUSES } },
      select: { assignedToId: true, refType: true, refId: true },
    }),
    prisma.actionItem.findMany({
      where: { status: { in: ACTION_ITEM_RESOLVED_STATUSES }, updatedAt: { gte: completionWindowStart } },
      select: { status: true, dueDate: true, completedAt: true },
    }),
    prisma.actionItem.findMany({
      where: { createdAt: { gte: trendStart, lte: now } },
      select: { createdAt: true, status: true },
    }),
  ]);

  const assignedUserIds = Array.from(new Set(openItems.map((i) => i.assignedToId).filter((id): id is number => id != null)));
  const employees = assignedUserIds.length
    ? await prisma.employee.findMany({ where: { userId: { in: assignedUserIds } }, select: { userId: true, department: true } })
    : [];
  const departmentByUserId = new Map(employees.map((e) => [e.userId as number, e.department ?? 'Unassigned']));

  const departmentCounts = new Map<string, number>();
  const customerCounts = new Map<number, number>();
  const projectCounts = new Map<number, number>();
  for (const item of openItems) {
    const dept = item.assignedToId != null ? departmentByUserId.get(item.assignedToId) ?? 'Unassigned' : 'Unassigned';
    departmentCounts.set(dept, (departmentCounts.get(dept) ?? 0) + 1);
    if (item.refType === 'LEAD' && item.refId != null) customerCounts.set(item.refId, (customerCounts.get(item.refId) ?? 0) + 1);
    if (item.refType === 'IMPLEMENTATION' && item.refId != null) projectCounts.set(item.refId, (projectCounts.get(item.refId) ?? 0) + 1);
  }

  const [leads, implementations] = await Promise.all([
    customerCounts.size ? prisma.lead.findMany({ where: { id: { in: Array.from(customerCounts.keys()) } }, select: { id: true, companyName: true } }) : [],
    projectCounts.size
      ? prisma.implementation.findMany({ where: { id: { in: Array.from(projectCounts.keys()) } }, select: { id: true, projectName: true } })
      : [],
  ]);

  let onTime = 0;
  let totalResolved = 0;
  for (const item of resolvedRecentItems) {
    const slaStatus = classifyActionItemSlaStatus(item, now);
    if (slaStatus === 'NOT_APPLICABLE') continue;
    totalResolved += 1;
    if (slaStatus === 'ON_TIME') onTime += 1;
  }

  const weekBuckets = new Map<string, { created: number; closed: number }>();
  for (let w = 0; w < EFFECTIVENESS_TREND_WEEKS; w++) {
    weekBuckets.set(dayjs(trendStart).add(w, 'week').format('YYYY-MM-DD'), { created: 0, closed: 0 });
  }
  for (const item of trendItems) {
    const weekKey = dayjs(item.createdAt).startOf('week').format('YYYY-MM-DD');
    const bucket = weekBuckets.get(weekKey);
    if (!bucket) continue;
    bucket.created += 1;
    if (item.status === 'CLOSED') bucket.closed += 1;
  }

  return {
    totals: {
      meetings: meetingsTotal,
      openActions: openItems.length,
      slaCompliancePercent: totalResolved > 0 ? Math.round((onTime / totalResolved) * 100) : 0,
    },
    departmentBreakdown: Array.from(departmentCounts.entries()).map(([department, openCount]) => ({ department, openCount })),
    customerBreakdown: Array.from(customerCounts.entries()).map(([id, openCount]) => ({
      id,
      name: leads.find((l) => l.id === id)?.companyName ?? `Lead ${id}`,
      openCount,
    })),
    projectBreakdown: Array.from(projectCounts.entries()).map(([id, openCount]) => ({
      id,
      name: implementations.find((p) => p.id === id)?.projectName ?? `Project ${id}`,
      openCount,
    })),
    meetingEffectivenessTrend: Array.from(weekBuckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([weekStart, { created, closed }]) => ({ weekStart, ratio: created > 0 ? Math.round((closed / created) * 100) / 100 : 0 })),
  };
}
