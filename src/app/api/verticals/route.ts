import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission, checkPermission } from '@/lib/rbac';
import { thisFinancialYearStart } from '@/lib/financialYear';

export const dynamic = 'force-dynamic';

// Derives a stable, unique CODE from the vertical name — the admin form
// only asks for a name (matching what was actually requested: Vertical
// Name, Head, Budget), so the machine-readable code other modules can key
// off is generated here rather than typed by hand.
async function uniqueCodeFromName(name: string): Promise<string> {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'VERTICAL';

  let code = base;
  let suffix = 2;
  while (await prisma.vertical.findUnique({ where: { code } })) {
    code = `${base}_${suffix}`;
    suffix += 1;
  }
  return code;
}

// GET returns only active verticals by default (the shape every existing
// picker — the Expense Budget form, etc. — already expects); the admin
// screen passes includeInactive=true to also see (and be able to
// reactivate) deactivated ones.
//
// includeActuals=true is a separate, opt-in addition for the Verticals
// admin screen's Budget vs Actual column/chart — it costs one extra query
// (never touched by any other existing caller) and attaches
// actualExpenses/actualExpenseBreakdown per vertical. Per explicit product
// direction, this reuses the exact same figure as the Expense Budgets
// page's own "Column Total" row (src/app/dashboard/expense-budgets/
// page.tsx's <tfoot>) — SUM(ExpenseBudget.totalAmount) for that vertical in
// the given financial year (defaults to the current one, same 01-Aug–31-Jul
// convention that page uses) — computed server-side from the same
// ExpenseBudget rows rather than re-deriving it, so this is guaranteed to
// match Column Total for every vertical, not a second calculation.
export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_verticals');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const includeActuals = searchParams.get('includeActuals') === 'true';

    const verticals = await prisma.vertical.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { head: { select: { id: true, firstName: true, lastName: true } } },
    });

    type ActualBreakdownEntry = { categoryId: number; categoryName: string; categorySortOrder: number; amount: number };
    let actualsByVertical: Map<number, { total: number; breakdown: ActualBreakdownEntry[] }> | null = null;

    if (includeActuals) {
      // Actual Expenses are financial data one level more sensitive than
      // "which verticals exist" — gate them on the same permission the
      // Expense Budgets variance report already requires, without denying
      // the rest of this (already-authorized) response for a caller who
      // lacks it.
      const session = await getServerSession(authOptions);
      if (checkPermission(session, 'view_expense_budgets')) {
        const fyStartParam = searchParams.get('financialYearStart');
        const fyStart = fyStartParam ? new Date(fyStartParam) : thisFinancialYearStart().toDate();

        // Same rows the Expense Budgets matrix fetches for its own Column
        // Total (GET /api/expense-budgets -> prisma.expenseBudget.findMany)
        // — summing totalAmount per vertical here reproduces that exact
        // figure rather than introducing a second calculation.
        const budgetRows = await prisma.expenseBudget.findMany({
          where: { financialYearStart: fyStart, verticalId: { not: null } },
          select: {
            verticalId: true,
            categoryId: true,
            totalAmount: true,
            category: { select: { name: true, sortOrder: true } },
          },
        });

        actualsByVertical = new Map();
        for (const row of budgetRows) {
          const verticalId = row.verticalId as number;
          const entry = actualsByVertical.get(verticalId) || { total: 0, breakdown: [] as ActualBreakdownEntry[] };
          const amount = Number(row.totalAmount);
          // Skip zero-amount categories — no visual segment/legend entry
          // for a category budgeted at zero.
          if (amount > 0) {
            entry.total += amount;
            entry.breakdown.push({ categoryId: row.categoryId, categoryName: row.category.name, categorySortOrder: row.category.sortOrder, amount });
          }
          actualsByVertical.set(verticalId, entry);
        }
      }
    }

    const content = verticals.map((v) => {
      const actuals = actualsByVertical?.get(v.id);
      return {
        id: v.id,
        name: v.name,
        code: v.code,
        headId: v.headId,
        headName: v.head ? `${v.head.firstName} ${v.head.lastName}` : null,
        budget: v.budget,
        budgetCurrencyCode: v.budgetCurrencyCode,
        isActive: v.isActive,
        sortOrder: v.sortOrder,
        ...(includeActuals ? {
          actualExpenses: actuals?.total ?? 0,
          actualExpenseBreakdown: actuals?.breakdown ?? [],
        } : {}),
      };
    });

    return NextResponse.json(content);
  } catch (error) {
    console.error('GET /api/verticals error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_verticals');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ message: 'Vertical name is required' }, { status: 400 });
    }

    if (body.headId) {
      const head = await prisma.user.findUnique({ where: { id: parseInt(body.headId) } });
      if (!head) return NextResponse.json({ message: 'Selected head not found' }, { status: 404 });
    }

    const name = String(body.name).trim();
    const code = await uniqueCodeFromName(name);

    const vertical = await prisma.vertical.create({
      data: {
        name,
        code,
        headId: body.headId ? parseInt(body.headId) : null,
        budget: body.budget !== undefined && body.budget !== null && body.budget !== '' ? Number(body.budget) : null,
        budgetCurrencyCode: body.budgetCurrencyCode || 'INR',
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
      },
      include: { head: { select: { firstName: true, lastName: true } } },
    });

    await logAudit({ action: 'CREATE', entityType: 'VERTICAL', entityId: vertical.id, newValue: vertical, description: `Vertical "${vertical.name}" created`, request });

    return NextResponse.json(vertical, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A vertical with that name already exists' }, { status: 409 });
    }
    console.error('POST /api/verticals error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create vertical' }, { status: 400 });
  }
}
