import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { buildActionItemReport } from '@/lib/meetings/reportsService';
import { ACTION_ITEM_PRIORITIES, ACTION_ITEM_SLA_STATUSES, ACTION_ITEM_STATUSES, MEETING_TYPES, ActionItemSlaStatus } from '@/lib/meetings/constants';

export const dynamic = 'force-dynamic';

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Scoped to Action Items — the entity every other Phase 5 filter (date
// range, user, department, customer/project, meeting type, priority,
// status, SLA status) maps onto directly per §12. Meeting- and MOM-level
// reporting reuse the existing /api/todo and /api/mom list endpoints rather
// than duplicating filters here.
export async function GET(request: NextRequest) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_meeting_reports');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const userIdParam = searchParams.get('userId');
    const department = searchParams.get('department');
    const leadIdParam = searchParams.get('leadId');
    const implementationIdParam = searchParams.get('implementationId');
    const meetingType = searchParams.get('meetingType');
    const priority = searchParams.get('priority');
    const status = searchParams.get('status');
    const slaStatus = searchParams.get('slaStatus');
    const format = searchParams.get('format');

    if (meetingType && !(MEETING_TYPES as readonly string[]).includes(meetingType)) {
      return NextResponse.json({ message: `meetingType must be one of ${MEETING_TYPES.join(', ')}` }, { status: 400 });
    }
    if (priority && !(ACTION_ITEM_PRIORITIES as readonly string[]).includes(priority)) {
      return NextResponse.json({ message: `priority must be one of ${ACTION_ITEM_PRIORITIES.join(', ')}` }, { status: 400 });
    }
    if (status && !(ACTION_ITEM_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ message: `status must be one of ${ACTION_ITEM_STATUSES.join(', ')}` }, { status: 400 });
    }
    if (slaStatus && !(ACTION_ITEM_SLA_STATUSES as readonly string[]).includes(slaStatus)) {
      return NextResponse.json({ message: `slaStatus must be one of ${ACTION_ITEM_SLA_STATUSES.join(', ')}` }, { status: 400 });
    }

    const { rows, truncated } = await buildActionItemReport({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`) : undefined,
      userId: userIdParam ? parseInt(userIdParam, 10) : undefined,
      department: department || undefined,
      leadId: leadIdParam ? parseInt(leadIdParam, 10) : undefined,
      implementationId: implementationIdParam ? parseInt(implementationIdParam, 10) : undefined,
      meetingType: meetingType || undefined,
      priority: priority || undefined,
      status: status || undefined,
      slaStatus: (slaStatus as ActionItemSlaStatus) || undefined,
    });

    if (format === 'csv') {
      const header = [
        'ID',
        'Description',
        'Meeting',
        'Meeting Type',
        'Assigned To',
        'Department',
        'Priority',
        'Status',
        'SLA Status',
        'Due Date',
        'Completed At',
        'Reference',
      ];
      const csvRows = rows.map((r) => [
        r.id,
        r.description,
        r.meetingTitle,
        r.meetingType,
        r.assignedToName ?? '',
        r.department ?? '',
        r.priority,
        r.status,
        r.slaStatus,
        r.dueDate.toISOString().slice(0, 10),
        r.completedAt ? r.completedAt.toISOString().slice(0, 10) : '',
        r.refLabel ?? '',
      ]);
      const csv = [header, ...csvRows].map((row) => row.map(csvEscape).join(',')).join('\n');
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="meeting-action-items-report-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({ rows, truncated });
  } catch (error) {
    console.error('GET /api/meetings/reports error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
