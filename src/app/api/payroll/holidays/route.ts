import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// No permission check on GET beyond the feature flag — same reasoning as
// leave-types: it's a shared company calendar, not anyone's personal data,
// and the timesheet's Paid Holiday column needs it for every viewer.
export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const holidays = await prisma.paidHoliday.findMany({ where: { isActive: true }, orderBy: { date: 'asc' } });
    return NextResponse.json(holidays);
  } catch (error) {
    console.error('GET /api/payroll/holidays error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.date || !body.name) {
      return NextResponse.json({ message: 'date and name are required' }, { status: 400 });
    }

    const holiday = await prisma.paidHoliday.create({
      data: { date: new Date(body.date), name: body.name },
    });

    await logAudit({ action: 'CREATE', entityType: 'PAID_HOLIDAY', entityId: holiday.id, newValue: holiday, description: `Holiday "${holiday.name}" added`, request });

    return NextResponse.json(holiday, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A holiday is already recorded for that date' }, { status: 409 });
    }
    console.error('POST /api/payroll/holidays error:', error);
    return NextResponse.json({ message: error.message || 'Failed to add holiday' }, { status: 400 });
  }
}
