import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// Deliberately NOT gated by a module permission — unlike every other
// payroll route, this one is scoped to "your own data" by construction
// (employeeId resolved from the logged-in session, never from the client),
// so any authenticated user can call it regardless of role. Only DRAFT/
// CANCELLED runs are excluded — those numbers aren't final yet, or never
// happened, so an employee shouldn't see a payslip that might still change
// or a cancelled one at all.
export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const employee = await prisma.employee.findUnique({ where: { userId }, include: { user: { select: { firstName: true, lastName: true } } } });
    if (!employee) return NextResponse.json({ employee: null, payslips: [] });

    const payslips = await prisma.payslip.findMany({
      where: { employeeId: employee.id, run: { status: { in: ['APPROVED', 'PROCESSED', 'PAID'] } } },
      include: {
        run: { select: { payPeriodYear: true, payPeriodMonth: true, status: true } },
        lineItems: { orderBy: { id: 'asc' } },
      },
      orderBy: [{ run: { payPeriodYear: 'desc' } }, { run: { payPeriodMonth: 'desc' } }],
    });

    return NextResponse.json({
      employee: {
        employeeCode: employee.employeeCode,
        department: employee.department,
        designation: employee.designation,
        name: `${employee.user.firstName} ${employee.user.lastName}`,
      },
      payslips,
    });
  } catch (error) {
    console.error('GET /api/payroll/my-payslips error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
