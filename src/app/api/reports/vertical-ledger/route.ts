import { NextRequest, NextResponse } from 'next/server';
import { buildVerticalLedgerReport, VerticalLedgerReportType } from '@/lib/verticalLedgerReports';
import { requireAnyPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Shows project spend and billed income rolled up per vertical, so it accepts
// either grant — view_accounting (the invoice side) or view_projects (the
// project side). Reaching the Reports hub alone is deliberately not enough,
// same reasoning as the other report routes.
const VALID_TYPES: VerticalLedgerReportType[] = ['summary', 'monthly', 'by-project'];

export async function GET(request: NextRequest) {
  const denied = await requireAnyPermission(['view_accounting', 'view_projects']);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') || 'summary') as VerticalLedgerReportType;
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ message: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const report = await buildVerticalLedgerReport(type, {
      verticalId: searchParams.get('verticalId') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      includeInactive: searchParams.get('includeInactive') === 'true',
    });

    return NextResponse.json(report);
  } catch (error: any) {
    console.error('GET /api/reports/vertical-ledger error:', error);
    return NextResponse.json({ message: error.message || 'Internal server error' }, { status: 500 });
  }
}
