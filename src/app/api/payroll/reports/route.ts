import { NextRequest, NextResponse } from 'next/server';
import { buildReport, PayrollReportType } from '@/lib/payrollReports';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

const VALID_TYPES: PayrollReportType[] = ['salary-register', 'department-cost', 'ytd-earnings'];

export async function GET(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as PayrollReportType;
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ message: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const report = await buildReport(type, {
      runId: searchParams.get('runId') || undefined,
      year: searchParams.get('year') || undefined,
      month: searchParams.get('month') || undefined,
    });

    return NextResponse.json(report);
  } catch (error: any) {
    console.error('GET /api/payroll/reports error:', error);
    return NextResponse.json({ message: error.message || 'Internal server error' }, { status: 500 });
  }
}
