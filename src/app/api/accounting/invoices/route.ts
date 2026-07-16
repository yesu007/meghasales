import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { invoiceFieldsFromQuotation, nextInvoiceNumber } from '@/lib/invoiceFromQuotation';

export const dynamic = 'force-dynamic';

// Invoice.status only ever stores PENDING | PARTIALLY_PAID | PAID | CANCELLED.
// OVERDUE is derived here at read time rather than stored, since a partially
// paid invoice can simultaneously be overdue — storing it as a 5th mutually
// exclusive value would create ambiguous states.
function computeDisplayStatus(status: string, dueDate: Date): string {
  if (status === 'PENDING' || status === 'PARTIALLY_PAID') {
    if (new Date(dueDate) < new Date(new Date().toDateString())) return 'OVERDUE';
  }
  return status;
}

function daysOverdue(dueDate: Date): number {
  const diff = Date.now() - new Date(dueDate).setHours(0, 0, 0, 0);
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
}

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_accounting');
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '10');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const leadId = searchParams.get('leadId') || '';
    const accountManagerId = searchParams.get('accountManagerId') || '';
    const dueDateFrom = searchParams.get('dueDateFrom') || '';
    const dueDateTo = searchParams.get('dueDateTo') || '';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortDir = searchParams.get('sortDir') || 'desc';

    const where: Prisma.InvoiceWhereInput = { deletedAt: null };
    const AND: Prisma.InvoiceWhereInput[] = [];

    if (search) {
      const searchTerm = search.trim();
      AND.push({
        OR: [
          { invoiceNumber: { contains: searchTerm, mode: 'insensitive' } },
          { lead: { companyName: { contains: searchTerm, mode: 'insensitive' } } },
          { lead: { contactPerson: { contains: searchTerm, mode: 'insensitive' } } },
        ],
      });
    }

    if (status === 'OVERDUE') {
      AND.push({ status: { in: ['PENDING', 'PARTIALLY_PAID'] }, dueDate: { lt: new Date(new Date().toDateString()) } });
    } else if (status === 'OPEN') {
      // "Open" = still awaiting payment (used by the Pending Invoices page) —
      // distinct from an exact status match since it spans two statuses.
      AND.push({ status: { in: ['PENDING', 'PARTIALLY_PAID'] } });
    } else if (status) {
      AND.push({ status: status.toUpperCase() });
    }

    if (leadId) AND.push({ leadId: parseInt(leadId) });
    if (accountManagerId) AND.push({ accountManagerId: parseInt(accountManagerId) });
    if (dueDateFrom) AND.push({ dueDate: { gte: new Date(dueDateFrom) } });
    if (dueDateTo) AND.push({ dueDate: { lte: new Date(dueDateTo) } });

    if (AND.length > 0) where.AND = AND;

    const validSortFields = ['invoiceDate', 'dueDate', 'totalAmount', 'balanceDue', 'status', 'createdAt'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

    const [invoices, totalElements] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip: page * size,
        take: size,
        include: {
          lead: { select: { companyName: true, contactPerson: true } },
          quotation: { select: { quotationNumber: true, businessModule: true } },
          accountManager: { select: { firstName: true, lastName: true } },
          payments: { where: { deletedAt: null }, orderBy: { paymentDate: 'desc' }, take: 1 },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    const content = invoices.map((inv) => {
      const latestPayment = inv.payments[0] || null;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        leadId: inv.leadId,
        companyName: inv.lead.companyName,
        contactPerson: inv.lead.contactPerson,
        project: inv.quotation?.businessModule || inv.quotation?.quotationNumber || null,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        totalAmount: inv.totalAmount,
        amountPaid: inv.amountPaid,
        balanceDue: inv.balanceDue,
        currencyCode: inv.currencyCode,
        status: inv.status,
        displayStatus: computeDisplayStatus(inv.status, inv.dueDate),
        daysOverdue: daysOverdue(inv.dueDate),
        accountManagerId: inv.accountManagerId,
        accountManagerName: inv.accountManager ? `${inv.accountManager.firstName} ${inv.accountManager.lastName}` : null,
        latestPaymentDate: latestPayment?.paymentDate || null,
        latestPaymentMethod: latestPayment?.paymentMethod || null,
        latestPaymentReference: latestPayment?.referenceNumber || null,
        latestPaymentNotes: latestPayment?.notes || null,
        createdAt: inv.createdAt,
      };
    });

    return NextResponse.json({
      content,
      page,
      size,
      totalElements,
      totalPages: Math.ceil(totalElements / size),
      last: (page + 1) * size >= totalElements,
    });
  } catch (error: any) {
    console.error('GET /api/accounting/invoices error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_invoices');
  if (denied) return denied;
  try {
    const body = await request.json();

    if (!body.leadId) {
      return NextResponse.json({ message: 'leadId is required' }, { status: 400 });
    }
    if (!body.dueDate) {
      return NextResponse.json({ message: 'dueDate is required' }, { status: 400 });
    }

    let lineItems = body.lineItems;
    let subtotal = body.subtotal;
    let discountPercentage = body.discountPercentage ?? null;
    let discountAmount = body.discountAmount ?? null;
    let taxBreakdown = body.taxBreakdown ?? null;
    let taxAmount = body.taxAmount ?? null;
    let totalAmount = body.totalAmount;
    let currencyCode = body.currencyCode || 'INR';

    if (body.quotationId) {
      const quotationId = parseInt(body.quotationId);
      const quotation = await prisma.quotation.findUnique({ where: { id: quotationId } });
      if (!quotation) return NextResponse.json({ message: 'Quotation not found' }, { status: 404 });

      // A quotation should only ever back one invoice — this route is also
      // hit automatically when a quotation is approved (see
      // src/app/api/quotations/[id]/route.ts), so a manual "Generate
      // Invoice" click afterwards must not create a duplicate.
      const existingInvoice = await prisma.invoice.findFirst({ where: { quotationId, deletedAt: null } });
      if (existingInvoice) {
        return NextResponse.json(
          { message: `Invoice ${existingInvoice.invoiceNumber} already exists for this quotation`, invoiceId: existingInvoice.id },
          { status: 409 }
        );
      }

      const derived = invoiceFieldsFromQuotation(quotation);
      lineItems = derived.lineItems;
      subtotal = derived.subtotal;
      discountPercentage = derived.discountPercentage;
      discountAmount = derived.discountAmount;
      taxBreakdown = derived.taxBreakdown;
      taxAmount = derived.taxAmount;
      totalAmount = derived.totalAmount;
      currencyCode = derived.currencyCode;
    }

    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json({ message: 'At least one line item is required' }, { status: 400 });
    }
    if (subtotal === undefined || totalAmount === undefined) {
      return NextResponse.json({ message: 'subtotal and totalAmount are required' }, { status: 400 });
    }

    const invoiceNumber = await nextInvoiceNumber(prisma);

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        leadId: parseInt(body.leadId),
        quotationId: body.quotationId ? parseInt(body.quotationId) : null,
        invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : new Date(),
        dueDate: new Date(body.dueDate),
        lineItems,
        subtotal,
        discountPercentage,
        discountAmount,
        taxBreakdown,
        taxAmount,
        totalAmount,
        amountPaid: 0,
        balanceDue: totalAmount,
        currencyCode,
        accountManagerId: body.accountManagerId ? parseInt(body.accountManagerId) : null,
        notes: body.notes || null,
        createdById: body.createdById ? parseInt(body.createdById) : null,
      },
      include: { lead: { select: { companyName: true } } },
    });

    await logAudit({ action: 'CREATE', entityType: 'INVOICE', entityId: invoice.id, newValue: invoice, description: `Invoice ${invoice.invoiceNumber} created for ${invoice.lead.companyName}`, request });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/accounting/invoices error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create invoice' }, { status: 400 });
  }
}
