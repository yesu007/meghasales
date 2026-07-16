import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { applyPayment, OverpaymentError } from '@/lib/accounting';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

class NotFoundError extends Error {}

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_accounting');
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '10');
    const invoiceId = searchParams.get('invoiceId') || '';
    const leadId = searchParams.get('leadId') || '';
    const paymentMethod = searchParams.get('paymentMethod') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const sortBy = searchParams.get('sortBy') || 'paymentDate';
    const sortDir = searchParams.get('sortDir') || 'desc';

    const where: Prisma.PaymentWhereInput = { deletedAt: null };
    const AND: Prisma.PaymentWhereInput[] = [];

    if (invoiceId) AND.push({ invoiceId: parseInt(invoiceId) });
    if (leadId) AND.push({ invoice: { leadId: parseInt(leadId) } });
    if (paymentMethod) AND.push({ paymentMethod: paymentMethod.toUpperCase() });
    if (dateFrom) AND.push({ paymentDate: { gte: new Date(dateFrom) } });
    if (dateTo) AND.push({ paymentDate: { lte: new Date(dateTo) } });

    if (AND.length > 0) where.AND = AND;

    const validSortFields = ['paymentDate', 'amount', 'createdAt'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'paymentDate';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

    const [payments, totalElements] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip: page * size,
        take: size,
        include: {
          invoice: { select: { invoiceNumber: true, currencyCode: true, lead: { select: { companyName: true } } } },
          recordedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    const content = payments.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoice.invoiceNumber,
      companyName: p.invoice.lead.companyName,
      currencyCode: p.invoice.currencyCode,
      amount: p.amount,
      paymentDate: p.paymentDate,
      paymentMethod: p.paymentMethod,
      referenceNumber: p.referenceNumber,
      attachmentUrl: p.attachmentUrl,
      attachmentName: p.attachmentName,
      notes: p.notes,
      recordedByName: p.recordedBy ? `${p.recordedBy.firstName} ${p.recordedBy.lastName}` : null,
      createdAt: p.createdAt,
    }));

    return NextResponse.json({
      content,
      page,
      size,
      totalElements,
      totalPages: Math.ceil(totalElements / size),
      last: (page + 1) * size >= totalElements,
    });
  } catch (error: any) {
    console.error('GET /api/accounting/payments error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_payments');
  if (denied) return denied;
  try {
    const body = await request.json();

    if (!body.invoiceId) return NextResponse.json({ message: 'invoiceId is required' }, { status: 400 });
    if (body.amount === undefined || body.amount === null) return NextResponse.json({ message: 'amount is required' }, { status: 400 });
    if (!body.paymentMethod) return NextResponse.json({ message: 'paymentMethod is required' }, { status: 400 });

    const invoiceId = parseInt(body.invoiceId);

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice || invoice.deletedAt) throw new NotFoundError('Invoice not found');
      if (invoice.status === 'CANCELLED') throw new Error('Cannot record a payment against a cancelled invoice');

      const applied = applyPayment(invoice, body.amount);

      const count = await tx.payment.count();
      const paymentNumber = `PMT-${String(count + 1).padStart(5, '0')}`;

      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          invoiceId,
          amount: body.amount,
          paymentDate: body.paymentDate ? new Date(body.paymentDate) : new Date(),
          paymentMethod: body.paymentMethod,
          referenceNumber: body.referenceNumber || null,
          attachmentUrl: body.attachmentUrl || null,
          attachmentName: body.attachmentName || null,
          notes: body.notes || null,
          recordedById: body.recordedById ? parseInt(body.recordedById) : null,
        },
      });

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid: applied.amountPaid,
          balanceDue: applied.balanceDue,
          status: applied.status,
        },
        include: { lead: { select: { companyName: true } } },
      });

      return { payment, invoice: updatedInvoice };
    });

    await logAudit({
      action: 'CREATE',
      entityType: 'PAYMENT',
      entityId: result.payment.id,
      newValue: result.payment,
      description: `Payment ${result.payment.paymentNumber} of ${result.payment.amount} recorded against invoice ${result.invoice.invoiceNumber} (${result.invoice.lead.companyName}) — new balance ${result.invoice.balanceDue}`,
      request,
    });

    return NextResponse.json(result.payment, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/accounting/payments error:', error);
    if (error instanceof OverpaymentError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: error.message || 'Failed to record payment' }, { status: 400 });
  }
}
