import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { buildDailyAttendanceRows } from '@/lib/payroll/dailyAttendance';

export const dynamic = 'force-dynamic';

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Daily attendance (login/logout/working hours, plus derived Absent / On
// Leave days — see buildDailyAttendanceRows) for Payroll → Time &
// Attendance → Attendance Log. Filters: ?month=YYYY-MM (default: current
// month), ?date=YYYY-MM-DD (overrides month), ?employeeId=.
export async function GET(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_timesheet');
  if (denied) return denied;

  try {
    const sp = new URL(request.url).searchParams;
    const date = sp.get('date') || '';
    const now = new Date();
    const month = sp.get('month') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (date && !DATE_RE.test(date)) return NextResponse.json({ message: 'date must be YYYY-MM-DD' }, { status: 400 });
    if (!date && !MONTH_RE.test(month)) return NextResponse.json({ message: 'month must be YYYY-MM' }, { status: 400 });
    const employeeId = sp.get('employeeId') ? parseInt(sp.get('employeeId')!, 10) : null;
    if (sp.get('employeeId') && !Number.isFinite(employeeId)) return NextResponse.json({ message: 'Invalid employeeId' }, { status: 400 });

    let from: string, to: string;
    if (date) {
      from = to = date;
    } else {
      const [y, m] = month.split('-').map(Number);
      from = `${month}-01`;
      to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    }

    const [rows, employees] = await Promise.all([
      buildDailyAttendanceRows({ from, to, employeeId }),
      prisma.employee.findMany({
        select: { id: true, employeeCode: true, firstName: true, lastName: true, accessControlId: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);

    return NextResponse.json({
      rows,
      employees: employees.map((e) => ({ id: e.id, employeeCode: e.employeeCode, name: `${e.firstName} ${e.lastName}`.replace(/\s+/g, ' ').trim(), accessControlId: e.accessControlId })),
    });
  } catch (error) {
    console.error('GET /api/payroll/attendance error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
