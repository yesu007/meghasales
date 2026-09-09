import { NextRequest, NextResponse } from 'next/server';
import { buildReport, PayrollReportType } from '@/lib/payrollReports';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

const VALID_TYPES: PayrollReportType[] = ['salary-register', 'department-cost', 'ytd-earnings', 'pf-contribution', 'esi-contribution', 'pt-summary'];

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('export_payroll');
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

    const header = report.columns.map((c) => c.label);
    const rows = report.rows.map((row) => report.columns.map((c) => row[c.key]));
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${type}-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('GET /api/payroll/reports/export error:', error);
    return NextResponse.json({ message: error.message || 'Internal server error' }, { status: 500 });
  }
}
