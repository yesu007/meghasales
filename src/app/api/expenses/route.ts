import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { getExchangeRate, RateNotFoundError } from '@/lib/exchangeRate';
import { nextExpenseNumber } from '@/lib/nextExpenseNumber';
import { buildExpenseWhere } from '@/lib/expenseListFilters';

export const dynamic = 'force-dynamic';

// Only rate type populated today — same as Payment (see
// src/app/api/accounting/payments/route.ts), no daily-rate ingestion job.
const EXPENSE_RATE_TYPE = 'MANUAL';

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_expenses');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '10');
    const sortBy = searchParams.get('sortBy') || 'expenseDate';
    const sortDir = searchParams.get('sortDir') || 'desc';

    const where = buildExpenseWhere(searchParams);

    const validSortFields = ['expenseDate', 'amount', 'status', 'createdAt'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'expenseDate';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

    const [expenses, totalElements, amountRows] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip: page * size,
        take: size,
        include: {
          category: { select: { name: true } },
          subCategory: { select: { name: true } },
          recordedBy: { select: { firstName: true, lastName: true } },
          // BILL expenses: the source bill, for the badge / payment summary.
          bill: {
            select: {
              id: true, billNumber: true, paymentStatus: true, paidAmount: true, status: true,
              billType: true, invoiceNumber: true, invoiceDate: true, itemTotal: true, gstTotal: true, tdsTotal: true, payableAmount: true,
              supplier: { select: { name: true } },
            },
          },
          // REIMBURSEMENT expenses: the source claim's details, shown inline.
          expenseClaim: {
            select: {
              id: true, status: true, expenseDate: true, description: true, amount: true, attachmentName: true,
              submittedAt: true, approvedAt: true, paidAt: true, paymentType: true, paymentProofName: true,
              employee: { select: { employeeCode: true, firstName: true, lastName: true } },
              lead: { select: { companyName: true } },
              project: { select: { projectName: true } },
              product: { select: { productName: true } },
            },
          },
          // SALARY expenses: the run's employee-wise payslips, shown in the
          // list row's "Employee Details" accordion.
          payrollRun: {
            select: {
              id: true, payPeriodYear: true, payPeriodMonth: true, status: true,
              payslips: {
                orderBy: { employee: { firstName: 'asc' } },
                select: {
                  id: true, totalDays: true, payableDays: true, lopDays: true, grossEarnings: true, totalDeductions: true, netPay: true,
                  employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true, designation: true } },
                },
              },
            },
          },
        },
      }),
      prisma.expense.count({ where }),
      // Every filtered record (not just this page) for the list's Total row.
      prisma.expense.findMany({ where, select: { amount: true, currencyCode: true, exchangeRate: true } }),
    ]);
    // In INR — non-INR amounts via each record's own snapshot exchangeRate
    // (same conversion as the P&L reports' toInr).
    const totalAmount = amountRows.reduce((sum, r) => sum + (r.currencyCode === 'INR' ? Number(r.amount) : Number(r.amount) * Number(r.exchangeRate)), 0);

    const content = expenses.map((e) => ({
      id: e.id,
      expenseNumber: e.expenseNumber,
      categoryId: e.categoryId,
      categoryName: e.category.name,
      subCategoryId: e.subCategoryId,
      subCategoryName: e.subCategory?.name ?? null,
      vendor: e.vendor,
      vendorLeadId: e.vendorLeadId,
      projectId: e.projectId,
      productId: e.productId,
      expenseDate: e.expenseDate,
      amount: e.amount,
      currencyCode: e.currencyCode,
      exchangeRate: e.exchangeRate,
      paymentMethod: e.paymentMethod,
      status: e.status,
      paidDate: e.paidDate,
      referenceNumber: e.referenceNumber,
      attachmentUrl: e.attachmentUrl,
      attachmentName: e.attachmentName,
      paymentProofUrl: e.paymentProofUrl,
      paymentProofName: e.paymentProofName,
      notes: e.notes,
      recordedByName: e.recordedBy ? `${e.recordedBy.firstName} ${e.recordedBy.lastName}` : null,
      createdAt: e.createdAt,
      source: e.source,
      bill: e.source === 'BILL' && e.bill
        ? {
            billId: e.bill.id, billNumber: e.bill.billNumber, paymentStatus: e.bill.paymentStatus, paidAmount: e.bill.paidAmount, status: e.bill.status,
            billType: e.bill.billType, invoiceNumber: e.bill.invoiceNumber, invoiceDate: e.bill.invoiceDate, supplierName: e.bill.supplier.name,
            itemTotal: e.bill.itemTotal, gstTotal: e.bill.gstTotal, tdsTotal: e.bill.tdsTotal, payableAmount: e.bill.payableAmount,
          }
        : null,
      reimbursement: e.source === 'REIMBURSEMENT' && e.expenseClaim
        ? {
            claimId: e.expenseClaim.id,
            claimStatus: e.expenseClaim.status,
            claimDate: e.expenseClaim.expenseDate,
            description: e.expenseClaim.description,
            amount: e.expenseClaim.amount,
            attachmentName: e.expenseClaim.attachmentName,
            submittedAt: e.expenseClaim.submittedAt,
            approvedAt: e.expenseClaim.approvedAt,
            paidAt: e.expenseClaim.paidAt,
            paymentType: e.expenseClaim.paymentType,
            paymentProofName: e.expenseClaim.paymentProofName,
            employeeName: `${e.expenseClaim.employee.firstName} ${e.expenseClaim.employee.lastName}`.trim(),
            employeeCode: e.expenseClaim.employee.employeeCode,
            customerName: e.expenseClaim.lead?.companyName ?? null,
            projectName: e.expenseClaim.project?.projectName ?? null,
            productName: e.expenseClaim.product?.productName ?? null,
          }
        : null,
      payroll:e.source === 'SALARY' && e.payrollRun
        ? {
            runId: e.payrollRun.id,
            payPeriodYear: e.payrollRun.payPeriodYear,
            payPeriodMonth: e.payrollRun.payPeriodMonth,
            runStatus: e.payrollRun.status,
            employees: e.payrollRun.payslips.map((p) => ({
              payslipId: p.id,
              employeeName: `${p.employee.firstName} ${p.employee.lastName}`.trim(),
              employeeCode: p.employee.employeeCode,
              department: p.employee.department,
              designation: p.employee.designation,
              totalDays: p.totalDays,
              payableDays: p.payableDays,
              lopDays: p.lopDays,
              grossEarnings: p.grossEarnings,
              totalDeductions: p.totalDeductions,
              netPay: p.netPay,
            })),
          }
        : null,
    }));

    return NextResponse.json({
      content,
      page,
      size,
      totalElements,
      totalAmount,
      totalPages: Math.ceil(totalElements / size),
      last: (page + 1) * size >= totalElements,
    });
  } catch (error: any) {
    console.error('GET /api/expenses error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const body = await request.json();

    if (!body.categoryId) return NextResponse.json({ message: 'categoryId is required' }, { status: 400 });
    if (body.amount === undefined || body.amount === null || body.amount === '') {
      return NextResponse.json({ message: 'amount is required' }, { status: 400 });
    }
    if (!body.expenseDate) return NextResponse.json({ message: 'expenseDate is required' }, { status: 400 });
    if (!body.paymentMethod) return NextResponse.json({ message: 'paymentMethod is required' }, { status: 400 });

    const category = await prisma.expenseCategory.findUnique({ where: { id: parseInt(body.categoryId) } });
    if (!category) return NextResponse.json({ message: 'Category not found' }, { status: 404 });

    let subCategoryId: number | null = null;
    if (body.subCategoryId !== undefined && body.subCategoryId !== null && body.subCategoryId !== '') {
      const subCategory = await prisma.expenseSubCategory.findUnique({ where: { id: parseInt(body.subCategoryId) } });
      if (!subCategory || subCategory.categoryId !== category.id) {
        return NextResponse.json({ message: 'Sub-category not found for the selected category' }, { status: 404 });
      }
      subCategoryId = subCategory.id;
    }

    const currencyCode: string = body.currencyCode || 'INR';
    const expenseDate = new Date(body.expenseDate);
    const dateStr = expenseDate.toISOString().slice(0, 10);

    // Snapshot the rate to INR at record time (never recompute historical
    // expenses against today's rate) — same reasoning as Payment.exchangeRate.
    // Unlike Payment, an expense doesn't have to match a specific existing
    // record's currency, so there's nothing to reconcile if the rate is
    // slightly off; still fail rather than silently defaulting to 1 for a
    // foreign-currency expense, since that would misreport the amount.
    let exchangeRate = 1;
    if (currencyCode !== 'INR') {
      if (body.exchangeRate !== undefined && body.exchangeRate !== null && body.exchangeRate !== '') {
        const manualRate = Number(body.exchangeRate);
        if (!Number.isFinite(manualRate) || manualRate <= 0) {
          return NextResponse.json({ message: 'exchangeRate must be a positive number' }, { status: 400 });
        }
        exchangeRate = manualRate;
      } else {
        try {
          exchangeRate = await getExchangeRate(currencyCode, 'INR', dateStr, EXPENSE_RATE_TYPE);
        } catch (error) {
          if (error instanceof RateNotFoundError) {
            return NextResponse.json({ message: `${error.message} — supply exchangeRate manually` }, { status: 400 });
          }
          throw error;
        }
      }
    }

    // Vendor is now picked from the Customer module (a Lead row) via
    // vendorLeadId, same as any other Lead-referencing dropdown in the app
    // (e.g. Invoice.leadId). vendor (text) is kept in sync from the
    // resolved companyName so existing vendor-text search/CSV consumers
    // keep working unchanged — see the schema comment on Expense.vendor.
    let vendorLeadId: number | null = null;
    let vendorName: string | null = null;
    if (body.vendorLeadId !== undefined && body.vendorLeadId !== null && body.vendorLeadId !== '') {
      const vendorLead = await prisma.lead.findUnique({ where: { id: parseInt(body.vendorLeadId) } });
      if (!vendorLead) return NextResponse.json({ message: 'Selected vendor (customer) not found' }, { status: 404 });
      vendorLeadId = vendorLead.id;
      vendorName = vendorLead.companyName;
    }

    // Project Expense vs Overall Expense (the create form's toggle) —
    // projectId is set only for a Project Expense; Overall stays null.
    let projectId: number | null = null;
    if (body.projectId !== undefined && body.projectId !== null && body.projectId !== '') {
      const project = await prisma.project.findUnique({ where: { id: parseInt(body.projectId) } });
      if (!project) return NextResponse.json({ message: 'Selected project not found' }, { status: 404 });
      projectId = project.id;
    }

    // Same, for a Product Expense.
    let productId: number | null = null;
    if (body.productId !== undefined && body.productId !== null && body.productId !== '') {
      const product = await prisma.product.findUnique({ where: { id: parseInt(body.productId) } });
      if (!product) return NextResponse.json({ message: 'Selected product not found' }, { status: 404 });
      productId = product.id;
    }

    const session = await getServerSession(authOptions);
    const recordedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const expenseNumber = await nextExpenseNumber(prisma);

    const expense = await prisma.expense.create({
      data: {
        expenseNumber,
        categoryId: category.id,
        subCategoryId,
        vendorLeadId,
        vendor: vendorName,
        projectId,
        productId,
        expenseDate,
        amount: Number(body.amount),
        currencyCode,
        exchangeRate,
        paymentMethod: body.paymentMethod,
        status: body.status === 'PAID' ? 'PAID' : 'PENDING',
        paidDate: body.status === 'PAID' ? (body.paidDate ? new Date(body.paidDate) : new Date()) : null,
        referenceNumber: body.referenceNumber || null,
        attachmentUrl: body.attachmentUrl || null,
        attachmentName: body.attachmentName || null,
        notes: body.notes || null,
        recordedById: Number.isFinite(recordedById) ? recordedById : null,
      },
      include: { category: { select: { name: true } } },
    });

    await logAudit({ action: 'CREATE', entityType: 'EXPENSE', entityId: expense.id, newValue: expense, description: `Expense ${expense.expenseNumber} (${expense.category.name}) recorded for ${expense.amount} ${expense.currencyCode}`, request });

    return NextResponse.json(expense, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/expenses error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create expense' }, { status: 400 });
  }
}
