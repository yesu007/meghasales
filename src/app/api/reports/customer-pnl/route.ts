import { NextRequest, NextResponse } from 'next/server';
import { buildCustomerLedgerReport, CustomerLedgerReportType } from '@/lib/customerPnlReports';
import { requireAnyPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const VALID_TYPES: CustomerLedgerReportType[] = ['summary', 'monthly', 'by-project'];

export async function GET(request: NextRequest) {
  const denied = await requireAnyPermission(['view_accounting', 'view_projects']);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') || 'summary') as CustomerLedgerReportType;
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ message: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const report = await buildCustomerLedgerReport(type, {
      customerId: searchParams.get('customerId') || undefined,
      verticalId: searchParams.get('verticalId') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      convertTo: searchParams.get('convertTo') || undefined,
    });

    return NextResponse.json(report);
  } catch (error: any) {
    console.error('GET /api/reports/customer-pnl error:', error);
    return NextResponse.json({ message: error.message || 'Internal server error' }, { status: 500 });
  }
}
