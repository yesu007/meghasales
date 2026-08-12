import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// Users with no Employee row yet — feeds the "onboard to payroll" picker on
// the New Employee drawer. Kept as its own small endpoint rather than a
// filter on the general /api/users route so payroll doesn't have to touch
// that route's existing pagination/sort/RBAC shape for a one-off need.
export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, employee: null },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error('GET /api/payroll/employees/eligible-users error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
