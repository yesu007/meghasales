import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ActionItemSlaStatus, classifyActionItemSlaStatus } from './constants';

const REPORT_ROW_CAP = 5000;

export interface ActionItemReportFilters {
  dateFrom?: Date;
  dateTo?: Date;
  userId?: number;
  department?: string;
  leadId?: number;
  implementationId?: number;
  meetingType?: string;
  priority?: string;
  status?: string;
  slaStatus?: ActionItemSlaStatus;
}

export interface ActionItemReportRow {
  id: number;
  description: string;
  meetingId: number;
  meetingTitle: string;
  meetingType: string;
  assignedToId: number | null;
  assignedToName: string | null;
  department: string | null;
  priority: string;
  status: string;
  slaStatus: ActionItemSlaStatus;
  dueDate: Date;
  completedAt: Date | null;
  refType: string | null;
  refLabel: string | null;
}

// department and slaStatus are derived (department comes from a separate
// Employee lookup, slaStatus is computed, not stored — see
// classifyActionItemSlaStatus), so both are filtered in JS after the main
// query rather than pushed into the Prisma where clause. Pre-filter rows
// are capped at REPORT_ROW_CAP — §12's own risk note says to reach for a
// materialised aggregate only if a real slowdown appears, not up front.
export async function buildActionItemReport(filters: ActionItemReportFilters): Promise<{ rows: ActionItemReportRow[]; truncated: boolean }> {
  const where: Prisma.ActionItemWhereInput = {};
  if (filters.dateFrom || filters.dateTo) {
    where.dueDate = {};
    if (filters.dateFrom) where.dueDate.gte = filters.dateFrom;
    if (filters.dateTo) where.dueDate.lte = filters.dateTo;
  }
  if (filters.userId != null) where.assignedToId = filters.userId;
  if (filters.priority) where.priority = filters.priority;
  if (filters.status) where.status = filters.status;
  if (filters.leadId != null) {
    where.refType = 'LEAD';
    where.refId = filters.leadId;
  }
  if (filters.implementationId != null) {
    where.refType = 'IMPLEMENTATION';
    where.refId = filters.implementationId;
  }
  if (filters.meetingType) where.meeting = { meetingType: filters.meetingType };

  const items = await prisma.actionItem.findMany({
    where,
    take: REPORT_ROW_CAP + 1,
    orderBy: { dueDate: 'asc' },
    include: { meeting: { select: { title: true, meetingType: true } } },
  });
  const truncated = items.length > REPORT_ROW_CAP;
  if (truncated) items.length = REPORT_ROW_CAP;

  const userIds = Array.from(new Set(items.map((i) => i.assignedToId).filter((id): id is number => id != null)));
  const employees = userIds.length
    ? await prisma.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, firstName: true, lastName: true, department: true } })
    : [];
  const employeeByUserId = new Map(employees.map((e) => [e.userId as number, e]));

  const leadIds = Array.from(new Set(items.filter((i) => i.refType === 'LEAD' && i.refId != null).map((i) => i.refId as number)));
  const implementationIds = Array.from(new Set(items.filter((i) => i.refType === 'IMPLEMENTATION' && i.refId != null).map((i) => i.refId as number)));
  const [leads, implementations] = await Promise.all([
    leadIds.length ? prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, companyName: true } }) : [],
    implementationIds.length
      ? prisma.implementation.findMany({ where: { id: { in: implementationIds } }, select: { id: true, projectName: true } })
      : [],
  ]);
  const leadName = (id: number) => leads.find((l) => l.id === id)?.companyName ?? `Lead ${id}`;
  const implementationName = (id: number) => implementations.find((p) => p.id === id)?.projectName ?? `Project ${id}`;

  let rows: ActionItemReportRow[] = items.map((item) => {
    const employee = item.assignedToId != null ? employeeByUserId.get(item.assignedToId) : undefined;
    const refLabel =
      item.refType === 'LEAD' && item.refId != null
        ? leadName(item.refId)
        : item.refType === 'IMPLEMENTATION' && item.refId != null
          ? implementationName(item.refId)
          : null;

    return {
      id: item.id,
      description: item.description,
      meetingId: item.meetingId,
      meetingTitle: item.meeting.title,
      meetingType: item.meeting.meetingType,
      assignedToId: item.assignedToId,
      assignedToName: employee ? `${employee.firstName} ${employee.lastName}` : null,
      department: employee?.department ?? null,
      priority: item.priority,
      status: item.status,
      slaStatus: classifyActionItemSlaStatus(item),
      dueDate: item.dueDate,
      completedAt: item.completedAt,
      refType: item.refType,
      refLabel,
    };
  });

  if (filters.department) rows = rows.filter((r) => r.department === filters.department);
  if (filters.slaStatus) rows = rows.filter((r) => r.slaStatus === filters.slaStatus);

  return { rows, truncated };
}
