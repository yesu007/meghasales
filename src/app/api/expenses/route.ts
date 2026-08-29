import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { getExchangeRate, RateNotFoundError } from '@/lib/exchangeRate';
import { nextExpenseNumber } from '@/lib/nextExpenseNumber';

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
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const sortBy = searchParams.get('sortBy') || 'expenseDate';
    const sortDir = searchParams.get('sortDir') || 'desc';

    const where: Prisma.ExpenseWhereInput = { deletedAt: null };
    const AND: Prisma.ExpenseWhereInput[] = [];

    if (search) {
      const searchTerm = search.trim();
      AND.push({
        OR: [
          { expenseNumber: { contains: searchTerm, mode: 'insensitive' } },
          { vendor: { contains: searchTerm, mode: 'insensitive' } },
          { referenceNumber: { contains: searchTerm, mode: 'insensitive' } },
        ],
      });
    }

    if (status) AND.push({ status: status.toUpperCase() });
    if (categoryId) AND.push({ categoryId: parseInt(categoryId) });
    const subCategoryId = searchParams.get('subCategoryId') || '';
    if (subCategoryId) AND.push({ subCategoryId: parseInt(subCategoryId) });
    if (dateFrom) AND.push({ expenseDate: { gte: new Date(dateFrom) } });
    if (dateTo) AND.push({ expenseDate: { lte: new Date(dateTo) } });

    if (AND.length > 0) where.AND = AND;

    const validSortFields = ['expenseDate', 'amount', 'status', 'createdAt'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'expenseDate';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

    const [expenses, totalElements] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip: page * size,
        take: size,
        include: {
          category: { select: { name: true } },
          subCategory: { select: { name: true } },
          recordedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.expense.count({ where }),
    ]);

    const content = expenses.map((e) => ({
      id: e.id,
      expenseNumber: e.expenseNumber,
      categoryId: e.categoryId,
      categoryName: e.category.name,
      subCategoryId: e.subCategoryId,
      subCategoryName: e.subCategory?.name ?? null,
      vendor: e.vendor,
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
      notes: e.notes,
      recordedByName: e.recordedBy ? `${e.recordedBy.firstName} ${e.recordedBy.lastName}` : null,
      createdAt: e.createdAt,
    }));

    return NextResponse.json({
      content,
      page,
      size,
      totalElements,
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

    const session = await getServerSession(authOptions);
    const recordedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const expenseNumber = await nextExpenseNumber(prisma);

    const expense = await prisma.expense.create({
      data: {
        expenseNumber,
        categoryId: category.id,
        subCategoryId,
        vendor: body.vendor || null,
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
