import { NextRequest, NextResponse } from 'next/server';
import { buildExpenseReport, ExpenseReportType } from '@/lib/expenseReports';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Same shape as /api/accounting/reports — validate the type against a
// whitelist, pass the filters straight through, return the ReportResult.
// Gated on view_expenses (not view_reports): reaching the Reports hub is a
// weaker grant than reading every expense the company has recorded, so the
// report enforces the data permission, not the navigation one.
const VALID_TYPES: ExpenseReportType[] = [
  'detail',
  'by-category',
  'by-sub-category',
  'by-vendor',
  'by-payment-method',
  'by-project',
  'by-vertical',
  'monthly',
];

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_expenses');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as ExpenseReportType;
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ message: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const report = await buildExpenseReport(type, {
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      categoryId: searchParams.get('categoryId') || undefined,
      subCategoryId: searchParams.get('subCategoryId') || undefined,
      status: searchParams.get('status') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      verticalId: searchParams.get('verticalId') || undefined,
      projectOnly: searchParams.get('projectOnly') === 'true',
    });

    return NextResponse.json(report);
  } catch (error: any) {
    console.error('GET /api/reports/expenses error:', error);
    return NextResponse.json({ message: error.message || 'Internal server error' }, { status: 500 });
  }
}
