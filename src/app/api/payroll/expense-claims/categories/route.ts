import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// "Expense Type" dropdown for the Reimbursement form — the same
// ExpenseCategory master Finance's own Expenses module uses (so a category
// added there is automatically selectable here too), but bare-login gated
// rather than requiring view_expenses: any employee filing their own claim
// needs to see this list, not just Finance.
export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const categories = await prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error('GET /api/payroll/expense-claims/categories error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
