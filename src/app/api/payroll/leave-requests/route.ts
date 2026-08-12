import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// The approval queue — every employee's requests, not just the caller's
// own (that's leave-requests/mine). view_payroll is enough to see it;
// approve_leave (checked in [id]/route.ts) is what's needed to act on one.
export async function GET(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';

    const requests = await prisma.leaveRequest.findMany({
      where: status ? { status } : {},
      include: {
        employee: { select: { employeeCode: true, department: true, user: { select: { firstName: true, lastName: true } } } },
        leaveType: { select: { name: true, code: true, isPaid: true } },
      },
      orderBy: { appliedAt: 'desc' },
    });

    return NextResponse.json(requests);
  } catch (error) {
    console.error('GET /api/payroll/leave-requests error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
