import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        lead: { select: { companyName: true, contactPerson: true, email: true, mobile: true } },
        quotation: { select: { quotationNumber: true, businessModule: true } },
        accountManager: { select: { firstName: true, lastName: true } },
        payments: { where: { deletedAt: null }, orderBy: { paymentDate: 'desc' } },
        reminders: { orderBy: { createdAt: 'desc' } },
        creditNotes: { where: { deletedAt: null } },
      },
    });
    if (!invoice || invoice.deletedAt) return NextResponse.json({ message: 'Invoice not found' }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return NextResponse.json({ message: 'Invoice not found' }, { status: 404 });

    // Once a payment has been recorded, the amounts this invoice was billed
    // for are no longer editable — only status/notes/dates/manager remain
    // changeable, so the paid-to-date figures stay meaningful.
    const financialFields = ['lineItems', 'subtotal', 'discountPercentage', 'discountAmount', 'taxBreakdown', 'taxAmount', 'totalAmount', 'currencyCode'];
    if (Number(existing.amountPaid) > 0 && financialFields.some((f) => body[f] !== undefined)) {
      return NextResponse.json({ message: 'Cannot edit invoice amounts after a payment has been recorded' }, { status: 400 });
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        ...(body.dueDate !== undefined && { dueDate: new Date(body.dueDate) }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.accountManagerId !== undefined && { accountManagerId: body.accountManagerId ? parseInt(body.accountManagerId) : null }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.lineItems !== undefined && { lineItems: body.lineItems }),
        ...(body.subtotal !== undefined && { subtotal: body.subtotal }),
        ...(body.discountPercentage !== undefined && { discountPercentage: body.discountPercentage }),
        ...(body.discountAmount !== undefined && { discountAmount: body.discountAmount }),
        ...(body.taxBreakdown !== undefined && { taxBreakdown: body.taxBreakdown }),
        ...(body.taxAmount !== undefined && { taxAmount: body.taxAmount }),
        ...(body.totalAmount !== undefined && { totalAmount: body.totalAmount, balanceDue: body.totalAmount }),
        ...(body.updatedById !== undefined && { updatedById: body.updatedById ? parseInt(body.updatedById) : null }),
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'INVOICE', entityId: id, oldValue: existing, newValue: invoice, description: `Invoice ${invoice.invoiceNumber} updated`, request });

    return NextResponse.json(invoice);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update invoice' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id);
    const existing = await prisma.invoice.findUnique({ where: { id }, include: { payments: { where: { deletedAt: null } } } });
    if (!existing || existing.deletedAt) return NextResponse.json({ message: 'Invoice not found' }, { status: 404 });

    if (existing.payments.length > 0) {
      return NextResponse.json({ message: 'Cannot delete an invoice with recorded payments' }, { status: 400 });
    }

    const invoice = await prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit({ action: 'DELETE', entityType: 'INVOICE', entityId: id, oldValue: existing, description: `Invoice ${existing.invoiceNumber} deleted`, request });

    return NextResponse.json(invoice);
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete invoice' }, { status: 400 });
  }
}
