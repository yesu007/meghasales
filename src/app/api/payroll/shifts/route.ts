import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { ATTENDANCE_REQUIREMENTS } from '@/lib/payroll/shiftEngine';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const shifts = await prisma.shift.findMany({
      include: { _count: { select: { assignments: true } } },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(shifts);
  } catch (error) {
    console.error('GET /api/payroll/shifts error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

function validateShiftBody(body: any): string | null {
  if (!body.name) return 'name is required';
  if (!body.startTime || !body.endTime) return 'startTime and endTime are required';
  if (body.attendanceRequirement && !ATTENDANCE_REQUIREMENTS.includes(body.attendanceRequirement)) {
    return `attendanceRequirement must be one of ${ATTENDANCE_REQUIREMENTS.join(', ')}`;
  }
  return null;
}

export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const body = await request.json();
    const validationError = validateShiftBody(body);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const shift = await prisma.shift.create({
      data: {
        name: body.name,
        startTime: body.startTime,
        endTime: body.endTime,
        bufferMinutes: Number(body.bufferMinutes ?? 0),
        earlyLogoutBufferMinutes: Number(body.earlyLogoutBufferMinutes ?? 0),
        attendanceRequirement: body.attendanceRequirement || 'LOGIN_AND_LOGOUT',
        lateRuleMinutes: body.lateRuleMinutes != null ? Number(body.lateRuleMinutes) : null,
        halfDayRuleMinutes: body.halfDayRuleMinutes != null ? Number(body.halfDayRuleMinutes) : null,
        lopRuleMinutes: body.lopRuleMinutes != null ? Number(body.lopRuleMinutes) : null,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'SHIFT', entityId: shift.id, newValue: shift, description: `Shift "${shift.name}" created`, request });

    return NextResponse.json(shift, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A shift with that name already exists' }, { status: 409 });
    }
    console.error('POST /api/payroll/shifts error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create shift' }, { status: 400 });
  }
}
