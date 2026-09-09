import { NextRequest, NextResponse } from 'next/server';
import { buildProjectLedgerReport, ProjectLedgerReportType } from '@/lib/projectLedgerReports';
import { requireAnyPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// This report shows both project spend and billed income, so it accepts
// either grant: view_accounting (the invoice side) or view_projects (the
// project/budget side). Reaching the Reports hub alone is deliberately not
// enough — same reasoning as /api/reports/expenses.
const VALID_TYPES: ProjectLedgerReportType[] = ['summary', 'monthly', 'transactions'];

export async function GET(request: NextRequest) {
  const denied = await requireAnyPermission(['view_accounting', 'view_projects']);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') || 'summary') as ProjectLedgerReportType;
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ message: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const report = await buildProjectLedgerReport(type, {
      projectId: searchParams.get('projectId') || undefined,
      verticalId: searchParams.get('verticalId') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      convertTo: searchParams.get('convertTo') || undefined,
    });

    return NextResponse.json(report);
  } catch (error: any) {
    console.error('GET /api/reports/project-ledger error:', error);
    return NextResponse.json({ message: error.message || 'Internal server error' }, { status: 500 });
  }
}
