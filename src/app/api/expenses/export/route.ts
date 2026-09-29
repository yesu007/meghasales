import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { buildExpenseWhere } from '@/lib/expenseListFilters';

export const dynamic = 'force-dynamic';

// Safety cap so an unfiltered export on a large table can't exhaust memory
// — same as the Audit Log export.
const MAX_EXPORT_ROWS = 10000;

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const formatDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
const SOURCE_LABELS: Record<string, string> = { MANUAL: 'Manual', SALARY: 'Salary (Payroll)', REIMBURSEMENT: 'Reimbursement', BILL: 'Bill' };

// CSV report of the Expenses list — takes the exact same query string as
// GET /api/expenses (tab, status, category, sub category, source, project,
// product), minus paging, so it exports every filtered record.
export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_expenses');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const expenses = await prisma.expense.findMany({
      where: buildExpenseWhere(searchParams),
      orderBy: { expenseDate: 'desc' },
      take: MAX_EXPORT_ROWS,
      include: {
        category: { select: { name: true } },
        subCategory: { select: { name: true } },
        project: { select: { projectName: true } },
        product: { select: { productName: true } },
        recordedBy: { select: { firstName: true, lastName: true } },
        expenseClaim: { select: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } } },
      },
    });

    const header = [
      'Expense No', 'Expense Date', 'Expense Type', 'Project', 'Product', 'Category', 'Sub Category', 'Source',
      'Employee', 'Vendor', 'Reference / Bill No', 'Payment Method', 'Currency', 'Amount', 'Status', 'Paid Date', 'Notes', 'Recorded By',
    ];
    const rows = expenses.map((e) => [
      e.expenseNumber,
      formatDate(e.expenseDate),
      // Reimbursements are always reported as Overall (see the list tabs).
      e.source !== 'REIMBURSEMENT' && e.projectId ? 'Project' : e.source !== 'REIMBURSEMENT' && e.productId ? 'Product' : 'Overall',
      e.project?.projectName ?? '',
      e.product?.productName ?? '',
      e.category.name,
      e.subCategory?.name ?? '',
      SOURCE_LABELS[e.source] ?? e.source,
      e.expenseClaim ? `${e.expenseClaim.employee.firstName} ${e.expenseClaim.employee.lastName} (${e.expenseClaim.employee.employeeCode})`.trim() : '',
      e.vendor ?? '',
      e.referenceNumber ?? '',
      e.paymentMethod.replace('_', ' '),
      e.currencyCode,
      Number(e.amount).toFixed(2),
      e.status.replace('_', ' '),
      formatDate(e.paidDate),
      e.notes ?? '',
      e.recordedBy ? `${e.recordedBy.firstName} ${e.recordedBy.lastName}` : '',
    ]);

    // Total row under the Amount column — same figure as the Expenses list's
    // Total: in INR, non-INR amounts via each record's own exchange rate.
    const totalAmount = expenses.reduce((sum, e) => sum + (e.currencyCode === 'INR' ? Number(e.amount) : Number(e.amount) * Number(e.exchangeRate)), 0);
    const amountCol = header.indexOf('Amount');
    const totalRow = header.map((_, i) => (i === 0 ? 'Total' : i === amountCol - 1 ? 'INR' : i === amountCol ? totalAmount.toFixed(2) : ''));

    // Leading BOM so Excel opens the file as UTF-8 (₹, accented names).
    const csv = '﻿' + [header, ...rows, totalRow].map((row) => row.map(csvEscape).join(',')).join('\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="expenses-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('GET /api/expenses/export error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
