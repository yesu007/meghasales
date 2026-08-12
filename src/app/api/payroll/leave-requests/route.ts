import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { findOverlappingDepartmentColleagues } from '@/lib/payroll/leaveEngine';

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
        employee: { select: { id: true, employeeCode: true, department: true, firstName: true, lastName: true } },
        leaveType: { select: { name: true, code: true, isPaid: true } },
      },
      orderBy: { appliedAt: 'desc' },
    });

    // Flags every still-actionable row (PENDING, or APPROVED — an approver
    // reviewing an already-approved request still benefits from knowing)
    // where department colleagues overlap, so the risk is visible right on
    // the queue itself rather than only in a notification that could go
    // unread. Skipped for terminal rows (REJECTED/CANCELLED) since nothing
    // can be done about those anymore.
    const requestsWithOverlap = await Promise.all(
      requests.map(async (r) => {
        if (!r.employee.department || !['PENDING', 'APPROVED'].includes(r.status)) {
          return { ...r, departmentOverlap: [] as { employeeId: number; name: string; status: string }[] };
        }
        const colleagues = await findOverlappingDepartmentColleagues(prisma, r.employee.department, r.employee.id, r.startDate, r.endDate);
        return { ...r, departmentOverlap: colleagues };
      })
    );

    return NextResponse.json(requestsWithOverlap);
  } catch (error) {
    console.error('GET /api/payroll/leave-requests error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
