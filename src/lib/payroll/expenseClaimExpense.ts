import { Prisma, PrismaClient } from '@prisma/client';
import { nextExpenseNumber } from '@/lib/nextExpenseNumber';

type Client = Prisma.TransactionClient | PrismaClient;

// Reimbursement -> Expense integration. Once an ExpenseClaim is APPROVED it
// gets exactly ONE REIMBURSEMENT expense in the Expense module, carrying the
// claim's own category/sub-category, project/product, date and amount; its
// status follows the claim: APPROVED -> PENDING, PAID -> PAID (with the
// claim's payment type as the payment method). The claim workflow has no
// "processed" step, so a reimbursement expense goes Pending -> Paid. DRAFT,
// SUBMITTED and REJECTED claims never create one. Keyed on the unique
// Expense.expenseClaimId, so calling this again for the same claim updates
// that one expense rather than adding a duplicate. Other claim details
// (claimant, customer, description, attachment) are read through the
// relation when displayed, not copied.
const EXPENSE_STATUS_FOR_CLAIM: Record<string, string> = { APPROVED: 'PENDING', PAID: 'PAID' };
const PAYMENT_METHOD_FOR_CLAIM: Record<string, string> = { HAND_CASH: 'CASH', BANK_TRANSFER: 'BANK_TRANSFER' };

export async function syncExpenseClaimExpense(tx: Client, claimId: number, performedById: number | null): Promise<void> {
  const claim = await tx.expenseClaim.findUniqueOrThrow({ where: { id: claimId } });
  const expenseStatus = EXPENSE_STATUS_FOR_CLAIM[claim.status];
  if (!expenseStatus) return;

  const data = {
    categoryId: claim.categoryId,
    subCategoryId: claim.subCategoryId,
    projectId: claim.projectId,
    productId: claim.productId,
    expenseDate: claim.expenseDate,
    amount: claim.amount,
    currencyCode: 'INR', // claims are always INR
    exchangeRate: 1,
    paymentMethod: (claim.paymentType && PAYMENT_METHOD_FOR_CLAIM[claim.paymentType]) || 'OTHER',
    status: expenseStatus,
    paidDate: expenseStatus === 'PAID' ? claim.paidAt ?? new Date() : null,
    referenceNumber: `REIMB-${String(claim.id).padStart(5, '0')}`,
    source: 'REIMBURSEMENT',
    deletedAt: null,
  };

  const existing = await tx.expense.findUnique({ where: { expenseClaimId: claimId }, select: { id: true } });
  if (existing) {
    await tx.expense.update({ where: { id: existing.id }, data });
  } else {
    await tx.expense.create({ data: { ...data, expenseClaimId: claimId, expenseNumber: await nextExpenseNumber(tx), recordedById: performedById } });
  }
}
