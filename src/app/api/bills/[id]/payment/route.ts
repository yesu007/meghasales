import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { BILL_PAYMENT_STATUSES, syncBillExpense } from '@/lib/bills';

export const dynamic = 'force-dynamic';

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'UPI', 'OTHER'];

// Updates a posted bill's payment status (Paid / Partially Paid / Unpaid)
// and mirrors it onto the linked expense.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();
    const existing = await prisma.bill.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ message: 'Bill not found' }, { status: 404 });
    if (existing.status !== 'POSTED') return NextResponse.json({ message: 'Post the bill before recording payment' }, { status: 400 });

    const session = await getServerSession(authOptions);
    const userId = session?.user ? parseInt((session.user as any).id, 10) : NaN;

    // Record a payment (the Payment popup): body.payAmount is THIS payment,
    // added to what's already been paid. The bill keeps one running total
    // (paidAmount) — no per-payment rows — so previous payments are kept by
    // adding to it, never by re-entering the total. Status follows the new
    // total: < payable → Partially Paid, = payable → Paid.
    if (body.payAmount !== undefined) {
      if (body.paymentMethod && !PAYMENT_METHODS.includes(body.paymentMethod)) {
        return NextResponse.json({ message: 'Invalid payment method' }, { status: 400 });
      }
      // Whole paise throughout, so ₹0.10 + ₹0.20 style sums stay exact.
      const toPaise = (v: unknown) => Math.round(Number(v) * 100);
      const payablePaise = toPaise(existing.payableAmount);
      const alreadyPaidPaise = toPaise(existing.paidAmount);
      const remainingPaise = payablePaise - alreadyPaidPaise;
      const payPaise = toPaise(body.payAmount);
      if (remainingPaise <= 0) return NextResponse.json({ message: 'This bill is already fully paid' }, { status: 400 });
      if (!Number.isFinite(payPaise) || payPaise <= 0) return NextResponse.json({ message: 'Pay amount must be greater than 0' }, { status: 400 });
      if (payPaise > remainingPaise) {
        return NextResponse.json({ message: `Pay amount cannot exceed the remaining amount (${(remainingPaise / 100).toFixed(2)})` }, { status: 400 });
      }
      const newPaidPaise = alreadyPaidPaise + payPaise;
      const nextStatus = newPaidPaise >= payablePaise ? 'PAID' : 'PARTIALLY_PAID';

      const updated = await prisma.$transaction(async (tx) => {
        // Only applies if paidAmount is still what this payment was based on
        // — a concurrent payment can't be double-counted or lost.
        const result = await tx.bill.updateMany({
          where: { id, paidAmount: existing.paidAmount },
          data: {
            paymentStatus: nextStatus,
            paidAmount: newPaidPaise / 100,
            paymentMethod: body.paymentMethod || existing.paymentMethod || null,
            paidDate: body.paidDate ? new Date(body.paidDate) : new Date(),
            ...(body.paymentProofUrl !== undefined
              ? { paymentProofUrl: body.paymentProofUrl || null, paymentProofName: body.paymentProofUrl ? body.paymentProofName || null : null }
              : {}),
          },
        });
        if (result.count === 0) return null;
        await syncBillExpense(tx, id, Number.isFinite(userId) ? userId : null);
        return tx.bill.findUniqueOrThrow({ where: { id } });
      });
      if (!updated) return NextResponse.json({ message: 'This bill was paid elsewhere in the meantime — reload and try again' }, { status: 409 });

      await logAudit({ action: 'UPDATE', entityType: 'BILL', entityId: id, oldValue: existing, newValue: updated, description: `Bill ${updated.billNumber} payment of ${(payPaise / 100).toFixed(2)} recorded — paid ${(newPaidPaise / 100).toFixed(2)} of ${(payablePaise / 100).toFixed(2)} (${nextStatus})`, request });
      return NextResponse.json(updated);
    }

    const paymentStatus = body.paymentStatus;
    if (!BILL_PAYMENT_STATUSES.includes(paymentStatus)) {
      return NextResponse.json({ message: 'Payment status must be UNPAID, PARTIALLY_PAID or PAID' }, { status: 400 });
    }
    if (body.paymentMethod && !PAYMENT_METHODS.includes(body.paymentMethod)) {
      return NextResponse.json({ message: 'Invalid payment method' }, { status: 400 });
    }

    const payable = Number(existing.payableAmount);
    let paidAmount = 0;
    if (paymentStatus === 'PAID') paidAmount = payable;
    if (paymentStatus === 'PARTIALLY_PAID') {
      paidAmount = Number(body.paidAmount);
      if (!Number.isFinite(paidAmount) || paidAmount <= 0 || paidAmount >= payable) {
        return NextResponse.json({ message: `Paid amount must be greater than 0 and less than the payable amount (${payable.toFixed(2)})` }, { status: 400 });
      }
    }

    const bill = await prisma.$transaction(async (tx) => {
      const updated = await tx.bill.update({
        where: { id },
        data: {
          paymentStatus,
          paidAmount,
          paymentMethod: paymentStatus === 'UNPAID' ? null : body.paymentMethod || existing.paymentMethod || null,
          paidDate: paymentStatus === 'UNPAID' ? null : body.paidDate ? new Date(body.paidDate) : new Date(),
          // Payment proof from the popup (uploaded first via /api/bills/upload).
          // Omitted = keep the current one; null/'' = removed; cleared when Unpaid.
          ...(paymentStatus === 'UNPAID'
            ? { paymentProofUrl: null, paymentProofName: null }
            : body.paymentProofUrl !== undefined
              ? { paymentProofUrl: body.paymentProofUrl || null, paymentProofName: body.paymentProofUrl ? body.paymentProofName || null : null }
              : {}),
        },
      });
      await syncBillExpense(tx, id, Number.isFinite(userId) ? userId : null);
      return updated;
    });

    await logAudit({ action: 'UPDATE', entityType: 'BILL', entityId: id, oldValue: existing, newValue: bill, description: `Bill ${bill.billNumber} payment status set to ${paymentStatus}${paymentStatus === 'PARTIALLY_PAID' ? ` (${paidAmount} of ${payable})` : ''}`, request });
    return NextResponse.json(bill);
  } catch (error: any) {
    console.error('PUT /api/bills/[id]/payment error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update payment status' }, { status: 400 });
  }
}
