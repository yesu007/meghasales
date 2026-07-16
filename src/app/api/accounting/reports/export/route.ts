import { NextRequest, NextResponse } from 'next/server';
import { buildReport, ReportType } from '@/lib/accountingReports';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const VALID_TYPES: ReportType[] = ['outstanding', 'aging', 'collection', 'payment-history', 'overdue', 'monthly-collection'];

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_accounting');
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as ReportType;
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ message: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const report = await buildReport(type, {
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      leadId: searchParams.get('leadId') || undefined,
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
    console.error('GET /api/accounting/reports/export error:', error);
    return NextResponse.json({ message: error.message || 'Internal server error' }, { status: 500 });
  }
}
