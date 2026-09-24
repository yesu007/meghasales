import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { findEmployeeForUser } from '@/lib/payroll/selfEmployee';
import { logAudit } from '@/lib/audit';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

const INCLUDE = {
  category: { select: { id: true, name: true } },
  lead: { select: { id: true, companyName: true } },
  project: { select: { id: true, projectName: true } },
  product: { select: { id: true, productName: true } },
} as const;

// Self-service, like leave-requests/mine and my-payslips — no permission
// check, scoped to whichever Employee the session resolves to. An employee
// only ever sees (and can only ever create claims against) their own
// employeeId, resolved server-side from the session, never taken from the
// request body — so nobody can file a claim "on behalf of" someone else.
export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const employee = await findEmployeeForUser(userId);
    if (!employee) return NextResponse.json({ employee: null, claims: [] });

    const claims = await prisma.expenseClaim.findMany({
      where: { employeeId: employee.id },
      include: INCLUDE,
      orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
    });

    return NextResponse.json({ employee: { employeeCode: employee.employeeCode }, claims });
  } catch (error) {
    console.error('GET /api/payroll/expense-claims/mine error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Creates a claim, always starting DRAFT — `submit: true` additionally
// transitions it straight to SUBMITTED in the same call (the form's
// "Submit" button vs "Save as Draft" button), rather than a create-then-
// PATCH round trip that would briefly leave a DRAFT row on screen either
// way.
export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const employee = await findEmployeeForUser(userId);
    if (!employee) return NextResponse.json({ message: 'You do not have a payroll profile to file a reimbursement against' }, { status: 404 });

    const body = await request.json();
    const { expenseDate, categoryId, description, amount, leadId, projectId, productId, attachmentUrl, attachmentName, submit } = body;
    if (!expenseDate || !categoryId || !description || amount == null) {
      return NextResponse.json({ message: 'expenseDate, categoryId, description, and amount are required' }, { status: 400 });
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ message: 'amount must be a positive number' }, { status: 400 });
    }
    const date = new Date(expenseDate);
    if (Number.isNaN(date.getTime())) return NextResponse.json({ message: 'expenseDate is not a valid date' }, { status: 400 });
    if (date > new Date()) return NextResponse.json({ message: 'expenseDate cannot be in the future' }, { status: 400 });

    const category = await prisma.expenseCategory.findUnique({ where: { id: Number(categoryId) } });
    if (!category || !category.isActive) return NextResponse.json({ message: 'Expense type not found' }, { status: 404 });

    // Project scoped to Lead, same mutual-relationship (not mutually
    // exclusive here — a claim can carry both, e.g. "this customer, this
    // specific project") as Demo/Quotation's own leadId+projectId pair —
    // just validated to actually belong to that lead when both are given.
    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: Number(projectId) } });
      if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
      if (leadId && project.customerId !== Number(leadId) && project.leadId !== Number(leadId)) {
        return NextResponse.json({ message: 'Selected project does not belong to the selected customer' }, { status: 400 });
      }
    }
    // Product — scoped to the same Customer/Lead as Project (Product Master
    // itself has no projectId to check against, see the schema's own
    // comment), validated the same "belongs to the selected customer" way.
    if (productId) {
      const product = await prisma.product.findUnique({ where: { id: Number(productId) } });
      if (!product) return NextResponse.json({ message: 'Product not found' }, { status: 404 });
      if (leadId && product.customerId !== Number(leadId) && product.leadId !== Number(leadId)) {
        return NextResponse.json({ message: 'Selected product does not belong to the selected customer' }, { status: 400 });
      }
    }

    const claim = await prisma.expenseClaim.create({
      data: {
        employeeId: employee.id,
        expenseDate: date,
        categoryId: category.id,
        leadId: leadId ? Number(leadId) : null,
        projectId: projectId ? Number(projectId) : null,
        productId: productId ? Number(productId) : null,
        description,
        amount: amountNum,
        attachmentUrl: attachmentUrl || null,
        attachmentName: attachmentName || null,
        status: submit ? 'SUBMITTED' : 'DRAFT',
        submittedAt: submit ? new Date() : null,
      },
      include: INCLUDE,
    });

    await logAudit({ action: 'CREATE', entityType: 'EXPENSE_CLAIM', entityId: claim.id, newValue: claim, description: `Reimbursement of ₹${claim.amount} ${submit ? 'submitted' : 'saved as draft'} by employee ${employee.employeeCode}`, request });

    return NextResponse.json(claim, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/expense-claims/mine error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create reimbursement' }, { status: 400 });
  }
}
