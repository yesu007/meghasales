import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { resolveClaimSubCategory } from '@/lib/payroll/expenseClaimCategory';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// Edits a claim's own fields, and/or (with `submit: true`) moves it
// Draft -> Submitted — the same "field edits and a status move can ride in
// one PATCH" shape as recalculatePayslip's lopDays+adjustments. Allowed
// while DRAFT or SUBMITTED (the employee can still correct their own claim
// before it's been decided); blocked once Management has acted on it
// (APPROVED/REJECTED/PAID), since those are terminal decisions on record.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const id = parseInt(params.id);
    const existing = await prisma.expenseClaim.findUnique({ where: { id }, include: { employee: true } });
    if (!existing) return NextResponse.json({ message: 'Reimbursement not found' }, { status: 404 });
    if (existing.employee.userId !== userId) return NextResponse.json({ message: 'You can only edit your own reimbursements' }, { status: 403 });
    if (existing.status !== 'DRAFT' && existing.status !== 'SUBMITTED') {
      return NextResponse.json({ message: 'Only a Draft or Submitted reimbursement can be edited' }, { status: 400 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.expenseDate !== undefined) {
      const date = new Date(body.expenseDate);
      if (Number.isNaN(date.getTime())) return NextResponse.json({ message: 'expenseDate is not a valid date' }, { status: 400 });
      if (date > new Date()) return NextResponse.json({ message: 'expenseDate cannot be in the future' }, { status: 400 });
      data.expenseDate = date;
    }
    if (body.categoryId !== undefined) {
      const category = await prisma.expenseCategory.findUnique({ where: { id: Number(body.categoryId) } });
      if (!category || !category.isActive) return NextResponse.json({ message: 'Category not found' }, { status: 404 });
      data.categoryId = category.id;
    }
    // Sub Category is only (re)validated when this request touches Category
    // or Sub Category — a submit-only PATCH on a claim filed before Sub
    // Category existed shouldn't suddenly be blocked. Changing Category
    // without sending a Sub Category drops the old one (it belonged to the
    // previous Category), which then has to satisfy the new Category's rule.
    if (body.categoryId !== undefined || body.subCategoryId !== undefined) {
      const categoryId = (data.categoryId as number | undefined) ?? existing.categoryId;
      const categoryChanged = categoryId !== existing.categoryId;
      const requested = body.subCategoryId !== undefined ? body.subCategoryId : categoryChanged ? null : existing.subCategoryId;
      const subCategory = await resolveClaimSubCategory(prisma, categoryId, requested);
      if ('error' in subCategory) return NextResponse.json({ message: subCategory.error }, { status: 400 });
      data.subCategoryId = subCategory.subCategoryId;
    }
    if (body.description !== undefined) data.description = body.description;
    if (body.amount !== undefined) {
      const amountNum = Number(body.amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) return NextResponse.json({ message: 'amount must be a positive number' }, { status: 400 });
      data.amount = amountNum;
    }
    if (body.leadId !== undefined) data.leadId = body.leadId ? Number(body.leadId) : null;
    if (body.projectId !== undefined) data.projectId = body.projectId ? Number(body.projectId) : null;
    if (body.productId !== undefined) data.productId = body.productId ? Number(body.productId) : null;
    if (body.attachmentUrl !== undefined) data.attachmentUrl = body.attachmentUrl || null;
    if (body.attachmentName !== undefined) data.attachmentName = body.attachmentName || null;

    if (body.submit) {
      const expenseDate = (data.expenseDate as Date) ?? existing.expenseDate;
      const description = (data.description as string) ?? existing.description;
      const amount = data.amount ?? existing.amount;
      if (!expenseDate || !description || Number(amount) <= 0) {
        return NextResponse.json({ message: 'expenseDate, description, and a positive amount are required to submit' }, { status: 400 });
      }
      data.status = 'SUBMITTED';
      data.submittedAt = new Date();
    }

    data.version = { increment: 1 };
    const updateResult = await prisma.expenseClaim.updateMany({ where: { id, version: existing.version }, data });
    if (updateResult.count === 0) {
      return NextResponse.json({ message: 'This reimbursement was modified elsewhere — reload and try again' }, { status: 409 });
    }

    const claim = await prisma.expenseClaim.findUniqueOrThrow({
      where: { id },
      include: { category: { select: { id: true, name: true } }, subCategory: { select: { id: true, name: true } }, lead: { select: { id: true, companyName: true } }, project: { select: { id: true, projectName: true } }, product: { select: { id: true, productName: true } } },
    });
    await logAudit({ action: 'UPDATE', entityType: 'EXPENSE_CLAIM', entityId: id, newValue: { status: claim.status }, description: `Reimbursement ${id} ${body.submit ? 'submitted' : 'updated'}`, request });

    return NextResponse.json(claim);
  } catch (error: any) {
    console.error('PATCH /api/payroll/expense-claims/mine/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update reimbursement' }, { status: 400 });
  }
}

// Delete — own claim only, allowed while DRAFT or SUBMITTED (not yet
// decided); once Management has approved/rejected/paid it, it stays on
// record and can no longer be deleted.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const id = parseInt(params.id);
    const existing = await prisma.expenseClaim.findUnique({ where: { id }, include: { employee: true } });
    if (!existing) return NextResponse.json({ message: 'Reimbursement not found' }, { status: 404 });
    if (existing.employee.userId !== userId) return NextResponse.json({ message: 'You can only delete your own reimbursements' }, { status: 403 });
    if (existing.status !== 'DRAFT' && existing.status !== 'SUBMITTED') {
      return NextResponse.json({ message: 'Only a Draft or Submitted reimbursement can be deleted' }, { status: 400 });
    }

    await prisma.expenseClaim.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'EXPENSE_CLAIM', entityId: id, oldValue: existing, description: `Draft reimbursement ${id} deleted`, request });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/payroll/expense-claims/mine/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete reimbursement' }, { status: 400 });
  }
}
