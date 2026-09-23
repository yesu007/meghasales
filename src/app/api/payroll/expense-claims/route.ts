import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// Management review queue — every employee's claims (optionally filtered
// by status), same shape as GET /api/payroll/leave-requests. Draft claims
// are never shown here — they're not yet the employee's decision to submit,
// same "not the approver's business until Submitted" boundary as a Draft
// leave request would be if this app had one.
export async function GET(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('approve_expense_claims');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';

    const claims = await prisma.expenseClaim.findMany({
      where: status ? { status } : { status: { not: 'DRAFT' } },
      include: {
        employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true } },
        category: { select: { id: true, name: true } },
        lead: { select: { id: true, companyName: true } },
        project: { select: { id: true, projectName: true } },
        product: { select: { id: true, productName: true } },
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
    });

    return NextResponse.json(claims);
  } catch (error) {
    console.error('GET /api/payroll/expense-claims error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
