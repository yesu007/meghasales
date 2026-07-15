import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { reversePayment } from '@/lib/accounting';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        invoice: { select: { invoiceNumber: true, currencyCode: true, lead: { select: { companyName: true } } } },
        recordedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!payment || payment.deletedAt) return NextResponse.json({ message: 'Payment not found' }, { status: 404 });
    return NextResponse.json(payment);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Only non-financial fields are editable — changing the amount would
// silently desync the invoice balance without going through applyPayment(),
// so amount corrections must be done via delete + re-record instead.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.payment.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return NextResponse.json({ message: 'Payment not found' }, { status: 404 });

    if (body.amount !== undefined) {
      return NextResponse.json({ message: 'Payment amount cannot be edited — delete this payment and record a new one instead' }, { status: 400 });
    }

    const payment = await prisma.payment.update({
      where: { id },
      data: {
        ...(body.paymentDate !== undefined && { paymentDate: new Date(body.paymentDate) }),
        ...(body.paymentMethod !== undefined && { paymentMethod: body.paymentMethod }),
        ...(body.referenceNumber !== undefined && { referenceNumber: body.referenceNumber }),
        ...(body.attachmentUrl !== undefined && { attachmentUrl: body.attachmentUrl }),
        ...(body.attachmentName !== undefined && { attachmentName: body.attachmentName }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'PAYMENT', entityId: id, oldValue: existing, newValue: payment, description: `Payment ${payment.paymentNumber} updated`, request });

    return NextResponse.json(payment);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update payment' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id);

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id } });
      if (!payment || payment.deletedAt) throw new Error('Payment not found');

      const invoice = await tx.invoice.findUnique({ where: { id: payment.invoiceId } });
      if (!invoice) throw new Error('Associated invoice not found');

      const reversed = reversePayment(invoice, payment.amount);

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: reversed.amountPaid, balanceDue: reversed.balanceDue, status: reversed.status },
      });

      const deletedPayment = await tx.payment.update({ where: { id }, data: { deletedAt: new Date() } });
      return { payment: deletedPayment, invoiceNumber: invoice.invoiceNumber };
    });

    await logAudit({ action: 'DELETE', entityType: 'PAYMENT', entityId: id, oldValue: result.payment, description: `Payment ${result.payment.paymentNumber} deleted, reversed against invoice ${result.invoiceNumber}`, request });

    return NextResponse.json(result.payment);
  } catch (error: any) {
    const status = error.message === 'Payment not found' ? 404 : 400;
    return NextResponse.json({ message: error.message || 'Failed to delete payment' }, { status });
  }
}
