import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { defaultMonthlySpread } from '@/lib/expenseBudgetVariance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_expense_budgets');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '10');
    const status = searchParams.get('status') || '';
    const verticalId = searchParams.get('verticalId') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const financialYearStart = searchParams.get('financialYearStart') || '';

    const where: Prisma.ExpenseBudgetWhereInput = {};
    const AND: Prisma.ExpenseBudgetWhereInput[] = [];
    if (status) AND.push({ status: status.toUpperCase() });
    if (verticalId) AND.push({ verticalId: parseInt(verticalId) });
    if (categoryId) AND.push({ categoryId: parseInt(categoryId) });
    if (financialYearStart) AND.push({ financialYearStart: new Date(financialYearStart) });
    if (AND.length > 0) where.AND = AND;

    const [budgets, totalElements] = await Promise.all([
      prisma.expenseBudget.findMany({
        where,
        orderBy: [{ financialYearStart: 'desc' }, { createdAt: 'desc' }],
        skip: page * size,
        take: size,
        include: {
          vertical: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.expenseBudget.count({ where }),
    ]);

    const content = budgets.map((b) => ({
      id: b.id,
      financialYearStart: b.financialYearStart,
      financialYearEnd: b.financialYearEnd,
      verticalId: b.verticalId,
      verticalName: b.vertical?.name || 'Company-wide',
      categoryId: b.categoryId,
      categoryName: b.category.name,
      totalAmount: b.totalAmount,
      currencyCode: b.currencyCode,
      status: b.status,
      createdByName: b.createdBy ? `${b.createdBy.firstName} ${b.createdBy.lastName}` : null,
      createdAt: b.createdAt,
    }));

    return NextResponse.json({
      content,
      page,
      size,
      totalElements,
      totalPages: Math.ceil(totalElements / size),
      last: (page + 1) * size >= totalElements,
    });
  } catch (error) {
    console.error('GET /api/expense-budgets error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_expense_budgets');
  if (denied) return denied;

  try {
    const body = await request.json();

    if (!body.financialYearStart) return NextResponse.json({ message: 'financialYearStart is required' }, { status: 400 });
    if (!body.financialYearEnd) return NextResponse.json({ message: 'financialYearEnd is required' }, { status: 400 });
    if (!body.categoryId) return NextResponse.json({ message: 'categoryId is required' }, { status: 400 });
    if (body.totalAmount === undefined || body.totalAmount === null || body.totalAmount === '') {
      return NextResponse.json({ message: 'totalAmount is required' }, { status: 400 });
    }

    const totalAmount = Number(body.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return NextResponse.json({ message: 'totalAmount must be a positive number' }, { status: 400 });
    }

    const category = await prisma.expenseCategory.findUnique({ where: { id: parseInt(body.categoryId) } });
    if (!category) return NextResponse.json({ message: 'Category not found' }, { status: 404 });

    const verticalId = body.verticalId ? parseInt(body.verticalId) : null;
    if (verticalId) {
      const vertical = await prisma.vertical.findUnique({ where: { id: verticalId } });
      if (!vertical) return NextResponse.json({ message: 'Vertical not found' }, { status: 404 });
    }

    const financialYearStart = new Date(body.financialYearStart);
    const financialYearEnd = new Date(body.financialYearEnd);

    // Caller may hand-edit the monthly spread; falls back to an even split
    // across the financial year otherwise. Either way the months must sum
    // to totalAmount — a budget whose monthly detail doesn't add up to its
    // own total would silently corrupt every variance report that reads it.
    const months: { month: string; amount: number }[] =
      Array.isArray(body.months) && body.months.length > 0
        ? body.months
        : defaultMonthlySpread(totalAmount, financialYearStart, financialYearEnd);

    const monthsSum = Math.round(months.reduce((sum, m) => sum + Number(m.amount), 0) * 100) / 100;
    if (Math.abs(monthsSum - Math.round(totalAmount * 100) / 100) > 0.01) {
      return NextResponse.json(
        { message: `Monthly spread (${monthsSum}) must add up to the total budget amount (${totalAmount})` },
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);
    const createdById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const budget = await prisma.expenseBudget.create({
      data: {
        financialYearStart,
        financialYearEnd,
        verticalId,
        categoryId: category.id,
        totalAmount,
        currencyCode: body.currencyCode || 'INR',
        notes: body.notes || null,
        createdById: Number.isFinite(createdById) ? createdById : null,
        months: {
          create: months.map((m) => ({ month: new Date(`${m.month}-01`), amount: Number(m.amount) })),
        },
      },
      include: { category: { select: { name: true } }, vertical: { select: { name: true } }, months: true },
    });

    await logAudit({
      action: 'CREATE',
      entityType: 'EXPENSE_BUDGET',
      entityId: budget.id,
      newValue: budget,
      description: `Expense budget created for ${budget.category.name} (${budget.vertical?.name || 'Company-wide'}), FY ${financialYearStart.getFullYear()}`,
      request,
    });

    return NextResponse.json(budget, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A budget already exists for this financial year, vertical and category — edit or revise it instead' }, { status: 409 });
    }
    console.error('POST /api/expense-budgets error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create expense budget' }, { status: 400 });
  }
}
