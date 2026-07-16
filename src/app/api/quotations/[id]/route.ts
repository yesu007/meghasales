import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { invoiceFieldsFromQuotation } from '@/lib/invoiceFromQuotation';

export const dynamic = 'force-dynamic';

// Approving a quotation should immediately produce an invoice so it shows up
// under Accounting > Pending Invoices without a separate manual step. Kept
// idempotent (checked by caller) since this also runs alongside the manual
// "Generate Invoice" button on the Quotations page, which stays as a
// fallback for quotations approved before this existed.
async function generateInvoiceForQuotation(quotation: any, request: NextRequest) {
  const derived = invoiceFieldsFromQuotation(quotation);
  const count = await prisma.invoice.count();
  const invoiceNumber = `INV-${String(count + 1).padStart(5, '0')}`;

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      leadId: quotation.leadId,
      quotationId: quotation.id,
      invoiceDate: new Date(),
      dueDate: dayjs().add(30, 'day').toDate(),
      lineItems: derived.lineItems,
      subtotal: derived.subtotal,
      discountPercentage: derived.discountPercentage,
      discountAmount: derived.discountAmount,
      taxBreakdown: derived.taxBreakdown,
      taxAmount: derived.taxAmount,
      totalAmount: derived.totalAmount,
      amountPaid: 0,
      balanceDue: derived.totalAmount,
      currencyCode: derived.currencyCode,
    },
    include: { lead: { select: { companyName: true } } },
  });

  await logAudit({
    action: 'CREATE',
    entityType: 'INVOICE',
    entityId: invoice.id,
    newValue: invoice,
    description: `Invoice ${invoice.invoiceNumber} auto-generated for ${invoice.lead.companyName} on approval of quotation ${quotation.quotationNumber}`,
    request,
  });

  return invoice;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const quotation = await prisma.quotation.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        lead: { select: { companyName: true, contactPerson: true, email: true, mobile: true } },
      },
    });
    if (!quotation) return NextResponse.json({ message: 'Quotation not found' }, { status: 404 });
    return NextResponse.json(quotation);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.quotation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Quotation not found' }, { status: 404 });

    const quotation = await prisma.quotation.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.softwareModules !== undefined && { softwareModules: body.softwareModules }),
        ...(body.businessModule !== undefined && { businessModule: body.businessModule }),
        ...(body.implementationCost !== undefined && { implementationCost: body.implementationCost }),
        ...(body.trainingCost !== undefined && { trainingCost: body.trainingCost }),
        ...(body.annualMaintenance !== undefined && { annualMaintenance: body.annualMaintenance }),
        ...(body.customDevelopmentCost !== undefined && { customDevelopmentCost: body.customDevelopmentCost }),
        ...(body.totalAmount !== undefined && { totalAmount: body.totalAmount }),
        ...(body.discountPercentage !== undefined && { discountPercentage: body.discountPercentage }),
        ...(body.discountAmount !== undefined && { discountAmount: body.discountAmount }),
        ...(body.taxAmount !== undefined && { taxAmount: body.taxAmount }),
        ...(body.taxBreakdown !== undefined && { taxBreakdown: body.taxBreakdown }),
        ...(body.clientCountry !== undefined && { clientCountry: body.clientCountry }),
        ...(body.clientState !== undefined && { clientState: body.clientState }),
        ...(body.currencyCode !== undefined && { currencyCode: body.currencyCode }),
        ...(body.addons !== undefined && { addons: body.addons }),
        ...(body.pricingSnapshot !== undefined && { pricingSnapshot: body.pricingSnapshot }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.validUntil !== undefined && { validUntil: body.validUntil ? new Date(body.validUntil) : null }),
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'QUOTATION', entityId: id, oldValue: existing, newValue: quotation, description: `Quotation ${quotation.quotationNumber} updated`, request });

    let generatedInvoice = null;
    if (body.status === 'APPROVED' && existing.status !== 'APPROVED') {
      const existingInvoice = await prisma.invoice.findFirst({ where: { quotationId: id, deletedAt: null } });
      if (!existingInvoice) {
        generatedInvoice = await generateInvoiceForQuotation(quotation, request);
      }
    }

    return NextResponse.json({ ...quotation, generatedInvoice });
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update quotation' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id);
    const existing = await prisma.quotation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Quotation not found' }, { status: 404 });

    await prisma.quotation.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'QUOTATION', entityId: id, oldValue: existing, description: `Quotation ${existing.quotationNumber} deleted`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete quotation' }, { status: 400 });
  }
}
