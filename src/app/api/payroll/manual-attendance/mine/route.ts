import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { ensureEmployeeForUser } from '@/lib/payroll/selfEmployee';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { deviceUtcOffsetMinutes, utcToLocal } from '@/lib/payroll/attendanceLog';
import { ACTIVE_MANUAL_STATUSES, validateManualAttendance } from '@/lib/payroll/manualAttendance';
import { notifyManualAttendanceApprovers } from '@/lib/payroll/manualAttendanceNotify';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

const serialize = (r: { attendanceDate: Date } & Record<string, unknown>) => ({ ...r, attendanceDate: r.attendanceDate.toISOString().slice(0, 10) });

// My Space → Attendance → Manual Attendance — self-service like
// leave-requests/mine: no permission check, always scoped to the session's
// own Employee (no employeeId parameter). Optional ?year=&month= narrows
// the list to one month.
export async function GET(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  try {
    const userId = currentUserId(await getServerSession(authOptions));
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const employee = await ensureEmployeeForUser(userId);
    if (!employee) return NextResponse.json({ requests: [] });

    const sp = new URL(request.url).searchParams;
    const year = parseInt(sp.get('year') || '', 10);
    const month = parseInt(sp.get('month') || '', 10);
    const range = year && month >= 1 && month <= 12 ? { gte: new Date(Date.UTC(year, month - 1, 1)), lte: new Date(Date.UTC(year, month, 0)) } : undefined;

    const requests = await prisma.manualAttendanceRequest.findMany({
      where: { employeeId: employee.id, ...(range ? { attendanceDate: range } : {}) },
      orderBy: [{ attendanceDate: 'desc' }, { appliedAt: 'desc' }],
    });
    return NextResponse.json({ requests: requests.map(serialize) });
  } catch (error) {
    console.error('GET /api/payroll/manual-attendance/mine error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Apply for one day. Refused for a future date, a day that already has
// device login AND logout, or a day that already has a PENDING/APPROVED
// request. A Missing-logout day (login punch only) can be applied for — an
// approved request corrects it to Present.
export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  try {
    const userId = currentUserId(await getServerSession(authOptions));
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const employee = await ensureEmployeeForUser(userId);
    if (!employee) return NextResponse.json({ message: 'No payroll profile yet — ask HR to onboard you first' }, { status: 400 });

    // Staff abroad can be up to a day ahead of the company's clock, so
    // "today" allows the company's tomorrow too.
    const tomorrow = utcToLocal(new Date(Date.now() + 86_400_000), deviceUtcOffsetMinutes()).date;
    const parsed = validateManualAttendance(await request.json(), tomorrow);
    if ('error' in parsed) return NextResponse.json({ message: parsed.error }, { status: 400 });
    const v = parsed.value;
    const attendanceDate = new Date(`${v.attendanceDate}T00:00:00.000Z`);

    const [device, active] = await Promise.all([
      prisma.dailyAttendanceSummary.findUnique({ where: { employeeId_attendanceDate: { employeeId: employee.id, attendanceDate } } }),
      prisma.manualAttendanceRequest.findFirst({ where: { employeeId: employee.id, attendanceDate, status: { in: ACTIVE_MANUAL_STATUSES } } }),
    ]);
    if (device && device.status !== 'INCOMPLETE') return NextResponse.json({ message: 'Your attendance for this day is already recorded by the Access Control device (login and logout)' }, { status: 409 });
    if (active) return NextResponse.json({ message: `You already have a ${active.status.toLowerCase()} manual attendance request for this day` }, { status: 409 });

    const created = await prisma.manualAttendanceRequest.create({
      data: { employeeId: employee.id, attendanceDate, loginTime: v.loginTime, logoutTime: v.logoutTime, workLocation: v.workLocation, reason: v.reason },
    });
    await logAudit({
      action: 'CREATE',
      entityType: 'MANUAL_ATTENDANCE_REQUEST',
      entityId: created.id,
      newValue: { attendanceDate: v.attendanceDate, loginTime: v.loginTime, logoutTime: v.logoutTime, workLocation: v.workLocation },
      description: `Manual attendance applied by ${employee.employeeCode} for ${v.attendanceDate} (${v.loginTime}–${v.logoutTime})`,
      request,
    });
    await notifyManualAttendanceApprovers(created.id, `${employee.firstName} ${employee.lastName}`.trim(), v.attendanceDate, userId);
    return NextResponse.json(serialize(created), { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/manual-attendance/mine error:', error);
    return NextResponse.json({ message: error.message || 'Failed to apply for manual attendance' }, { status: 400 });
  }
}
