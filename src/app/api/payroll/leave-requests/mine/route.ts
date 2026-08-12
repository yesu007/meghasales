import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

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

    return NextResponse.json(leaveRequest, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/leave-requests/mine error:', error);
    return NextResponse.json({ message: error.message || 'Failed to apply for leave' }, { status: 400 });
  }
}
