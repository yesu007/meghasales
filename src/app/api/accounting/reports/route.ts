import { NextRequest, NextResponse } from 'next/server';
import { buildReport, ReportType } from '@/lib/accountingReports';

export const dynamic = 'force-dynamic';

const VALID_TYPES: ReportType[] = ['outstanding', 'aging', 'collection', 'payment-history', 'overdue', 'monthly-collection'];

export async function GET(request: NextRequest) {
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

    return NextResponse.json(report);
  } catch (error: any) {
    console.error('GET /api/accounting/reports error:', error);
    return NextResponse.json({ message: error.message || 'Internal server error' }, { status: 500 });
  }
}
