import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { findOverlappingDepartmentColleagues } from '@/lib/payroll/leaveEngine';
import { isPushConfigured, sendPushToUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// Self-service, like my-payslips — no permission check, scoped to
// whichever Employee the session resolves to. Balance is always summed
// live from APPROVED requests this calendar year rather than read from a
// stored running total (there isn't one — see LeaveType's schema
// comment), so it can never drift out of sync with the request list
// shown right next to it.
export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) return NextResponse.json({ employee: null, requests: [], balances: [] });

    const currentYear = new Date().getFullYear();
    const [requests, leaveTypes] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: { employeeId: employee.id },
        include: { leaveType: { select: { name: true, code: true, isPaid: true } } },
        orderBy: { startDate: 'desc' },
      }),
      prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    ]);

    const balances = leaveTypes.map((lt) => {
      const usedDays = requests
        .filter((r) => r.leaveTypeId === lt.id && r.status === 'APPROVED' && new Date(r.startDate).getFullYear() === currentYear)
        .reduce((s, r) => s + Number(r.days), 0);
      const quota = lt.annualQuota != null ? Number(lt.annualQuota) : null;
      return { leaveTypeId: lt.id, name: lt.name, code: lt.code, isPaid: lt.isPaid, quota, usedDays, remaining: quota != null ? quota - usedDays : null };
    });

    return NextResponse.json({ employee: { employeeCode: employee.employeeCode }, requests, balances });
  } catch (error) {
    console.error('GET /api/payroll/leave-requests/mine error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) return NextResponse.json({ message: 'You do not have a payroll profile to apply leave against' }, { status: 404 });

    const body = await request.json();
    const { leaveTypeId, startDate, endDate, days, reason } = body;
    if (!leaveTypeId || !startDate || !endDate || days == null) {
      return NextResponse.json({ message: 'leaveTypeId, startDate, endDate, and days are required' }, { status: 400 });
    }

    const leaveType = await prisma.leaveType.findUnique({ where: { id: Number(leaveTypeId) } });
    if (!leaveType || !leaveType.isActive) return NextResponse.json({ message: 'Leave type not found' }, { status: 404 });

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return NextResponse.json({ message: 'endDate must be on or after startDate' }, { status: 400 });

    // A pending or already-approved request on overlapping dates would
    // double-book the same days — block it here rather than letting an
    // approver discover the conflict later.
    const overlapping = await prisma.leaveRequest.findFirst({
      where: { employeeId: employee.id, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: end }, endDate: { gte: start } },
    });
    if (overlapping) return NextResponse.json({ message: 'You already have a pending or approved request overlapping these dates' }, { status: 409 });

    if (leaveType.annualQuota != null) {
      const currentYear = start.getFullYear();
      const used = await prisma.leaveRequest.aggregate({
        where: { employeeId: employee.id, leaveTypeId: leaveType.id, status: 'APPROVED', startDate: { gte: new Date(`${currentYear}-01-01`) } },
        _sum: { days: true },
      });
      const usedDays = Number(used._sum.days || 0);
      if (usedDays + Number(days) > Number(leaveType.annualQuota)) {
        return NextResponse.json({ message: `This would exceed your ${leaveType.name} quota (${usedDays} of ${leaveType.annualQuota} days already used this year)` }, { status: 400 });
      }
    }

    const leaveRequest = await prisma.leaveRequest.create({
      data: { employeeId: employee.id, leaveTypeId: leaveType.id, startDate: start, endDate: end, days: Number(days), reason: reason || null },
    });

    const departmentOverlapWarning = await notifyDepartmentOverlapIfAny(employee, leaveRequest.id, start, end);

    return NextResponse.json({ ...leaveRequest, departmentOverlapWarning }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/leave-requests/mine error:', error);
    return NextResponse.json({ message: error.message || 'Failed to apply for leave' }, { status: 400 });
  }
}

// Best-effort — notification/push failures must never fail the leave
// application itself, so this runs after the request row is already
// committed. Notifies the applier (so they know their leave may need
// extra coordination) and every approve_leave holder (so the person about
// to decide sees the staffing risk up front, not after the fact). Returns
// the applier-facing message so the UI can also surface it inline on
// submit, not just via the notification bell.
async function notifyDepartmentOverlapIfAny(
  employee: { id: number; userId: number | null; department: string | null; firstName: string; lastName: string },
  leaveRequestId: number,
  start: Date,
  end: Date
): Promise<string | null> {
  if (!employee.department) return null;

  const colleagues = await findOverlappingDepartmentColleagues(prisma, employee.department, employee.id, start, end);
  if (colleagues.length === 0) return null;

  const names = colleagues.map((c) => c.name).join(', ');
  const applierMessage = `${colleagues.length} other ${employee.department} employee${colleagues.length === 1 ? ' is' : 's are'} already on leave overlapping your requested dates: ${names}.`;
  const approverMessage = `${employee.firstName} ${employee.lastName}'s leave request overlaps with ${colleagues.length} other ${employee.department} employee${colleagues.length === 1 ? '' : 's'} already on leave: ${names}.`;

  const approvers = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [{ role: { name: 'ADMIN' } }, { role: { permissions: { some: { permission: { name: 'approve_leave' } } } } }],
    },
    select: { id: true },
  });

  const recipients = new Map<number, string>();
  if (employee.userId) recipients.set(employee.userId, applierMessage);
  for (const approver of approvers) {
    if (approver.id !== employee.userId) recipients.set(approver.id, approverMessage);
  }

  await prisma.notification.createMany({
    data: Array.from(recipients.entries()).map(([userId, message]) => ({
      userId,
      title: 'Multiple department leave overlap',
      message,
      type: 'LEAVE_DEPARTMENT_OVERLAP',
      channel: 'IN_APP',
      entityType: 'LEAVE_REQUEST',
      entityId: leaveRequestId,
    })),
  });

  if (isPushConfigured()) {
    for (const [userId, message] of Array.from(recipients.entries())) {
      try {
        await sendPushToUser(userId, { title: 'Multiple department leave overlap', body: message, url: '/dashboard/payroll/leave' });
      } catch (error) {
        console.error(`Push send failed for user ${userId}:`, error);
      }
    }
  }

  return applierMessage;
}
