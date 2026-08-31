import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
import { getServerSession } from 'next-auth/next';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { invoiceFieldsFromQuotation, nextInvoiceNumber } from '@/lib/invoiceFromQuotation';
import { requirePermission } from '@/lib/rbac';

// Prisma Decimal/Date instances aren't plain JSON values; round-tripping
// through JSON collapses them to the same strings Prisma would render
// anyway — same convention as src/lib/audit.ts's toJsonSafe.
function toJsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

export const dynamic = 'force-dynamic';

// Approving a quotation should immediately produce an invoice so it shows up
// under Accounting > Pending Invoices without a separate manual step. Kept
// idempotent (checked by caller) since this also runs alongside the manual
// "Generate Invoice" button on the Quotations page, which stays as a
// fallback for quotations approved before this existed.
//
// Runs inside the same transaction as the status update (see PUT below) so
// a failure here — e.g. a quotation missing totalAmount, which is required
// on Invoice — rolls back the status change instead of leaving the
// quotation marked APPROVED with no invoice and the request reporting 400.
async function generateInvoiceForQuotation(tx: Prisma.TransactionClient, quotation: any) {
  const derived = invoiceFieldsFromQuotation(quotation);
  const totalAmount = derived.totalAmount ?? derived.subtotal;
  const invoiceNumber = await nextInvoiceNumber(tx);

  return tx.invoice.create({
    data: {
      invoiceNumber,
      leadId: quotation.leadId,
      quotationId: quotation.id,
      legalEntityId: quotation.legalEntityId,
      invoiceDate: new Date(),
      dueDate: dayjs().add(30, 'day').toDate(),
      lineItems: derived.lineItems,
      subtotal: derived.subtotal,
      discountPercentage: derived.discountPercentage,
      discountAmount: derived.discountAmount,
      taxBreakdown: derived.taxBreakdown,
      taxAmount: derived.taxAmount,
      totalAmount,
      amountPaid: 0,
      balanceDue: totalAmount,
      currencyCode: derived.currencyCode,
      exchangeRate: derived.exchangeRate,
    },
    include: { lead: { select: { companyName: true } } },
  });
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_quotations');
  if (denied) return denied;

  try {
    const quotation = await prisma.quotation.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        lead: { select: { companyName: true, contactPerson: true, email: true, mobile: true } },
        legalEntity: { select: { companyId: true } },
      },
    });
    if (!quotation) return NextResponse.json({ message: 'Quotation not found' }, { status: 404 });
    return NextResponse.json(quotation);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_quotations');
  if (denied) return denied;

  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.quotation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Quotation not found' }, { status: 404 });

    // Overriding the system-calculated total is a distinct, more sensitive
    // action than ordinary quoting — gated on its own permission rather than
    // manage_quotations so an authoring role (e.g. SALES) can edit a
    // quotation without also being able to unilaterally override pricing.
    // Re-checked on every save that carries an override (not just the one
    // that first sets it) since the calculator resubmits it unchanged
    // whenever an already-overridden quotation is edited.
    if (body.totalAmountOverridden === true) {
      const overrideDenied = await requirePermission('authorize_quotation_override');
      if (overrideDenied) return overrideDenied;
    }

    // A pure status transition (Draft -> Sent -> Approved) isn't a new
    // "version" of the quotation's commercial content — only edits that
    // touch anything besides status bump the counter and get an entry in
    // QuotationRevision, so version history stays a re-quote trail rather
    // than noise from every status click.
    const isContentUpdate = Object.keys(body).some((key) => key !== 'status');
    const session = isContentUpdate ? await getServerSession(authOptions) : null;
    const revisedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    // Status update and any resulting invoice generation must succeed or
    // fail together — otherwise a failure generating the invoice leaves the
    // quotation marked APPROVED while the request reports an error.
    const { quotation, generatedInvoice } = await prisma.$transaction(async (tx) => {
      if (isContentUpdate) {
        await tx.quotationRevision.create({
          data: {
            quotationId: id,
            versionNumber: existing.version,
            snapshot: toJsonSafe(existing),
            revisedById: Number.isFinite(revisedById) ? revisedById : null,
          },
        });
      }

      const quotation = await tx.quotation.update({
        where: { id },
        data: {
          ...(isContentUpdate && { version: { increment: 1 } }),
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
          ...(body.taxInclusive !== undefined && { taxInclusive: !!body.taxInclusive }),
          ...(body.taxBreakdown !== undefined && { taxBreakdown: body.taxBreakdown }),
          ...(body.clientCountry !== undefined && { clientCountry: body.clientCountry }),
          ...(body.clientState !== undefined && { clientState: body.clientState }),
          ...(body.currencyCode !== undefined && { currencyCode: body.currencyCode }),
          ...(body.exchangeRate !== undefined && { exchangeRate: body.exchangeRate }),
          ...(body.addons !== undefined && { addons: body.addons }),
          ...(body.pricingSnapshot !== undefined && { pricingSnapshot: body.pricingSnapshot }),
          ...(body.notes !== undefined && { notes: body.notes }),
          ...(body.additionalTerms !== undefined && { additionalTerms: body.additionalTerms }),
          ...(body.validUntil !== undefined && { validUntil: body.validUntil ? new Date(body.validUntil) : null }),
          // Resource-based (Quotation Calculator) fields — see POST above for
          // where these are computed. This PUT stays a generic spread updater
          // for both costing modes; a resource-based edit resubmits its own
          // freshly server-recomputed values for all of these at once.
          ...(body.costingMode !== undefined && { costingMode: body.costingMode }),
          ...(body.projectName !== undefined && { projectName: body.projectName }),
          ...(body.verticalId !== undefined && { verticalId: body.verticalId ? parseInt(body.verticalId) : null }),
          ...(body.legalEntityId !== undefined && { legalEntityId: body.legalEntityId ? parseInt(body.legalEntityId) : null }),
          ...(body.resourceCostTotal !== undefined && { resourceCostTotal: body.resourceCostTotal }),
          ...(body.outsourcingCost !== undefined && { outsourcingCost: body.outsourcingCost }),
          ...(body.travelCost !== undefined && { travelCost: body.travelCost }),
          ...(body.adminCost !== undefined && { adminCost: body.adminCost }),
          ...(body.markupPercentage !== undefined && { markupPercentage: body.markupPercentage }),
          ...(body.markupAmount !== undefined && { markupAmount: body.markupAmount }),
          ...(body.marginPercent !== undefined && { marginPercent: body.marginPercent }),
          ...(body.calculatedTotalAmount !== undefined && { calculatedTotalAmount: body.calculatedTotalAmount }),
          ...(body.totalAmountOverridden !== undefined && { totalAmountOverridden: !!body.totalAmountOverridden }),
        },
      });

      let generatedInvoice = null;
      if (body.status === 'APPROVED' && existing.status !== 'APPROVED') {
        const existingInvoice = await tx.invoice.findFirst({ where: { quotationId: id, deletedAt: null } });
        if (!existingInvoice) {
          generatedInvoice = await generateInvoiceForQuotation(tx, quotation);
        }
      }

      return { quotation, generatedInvoice };
    });

    await logAudit({ action: 'UPDATE', entityType: 'QUOTATION', entityId: id, oldValue: existing, newValue: quotation, description: `Quotation ${quotation.quotationNumber} updated`, request });
    if (generatedInvoice) {
      await logAudit({
        action: 'CREATE',
        entityType: 'INVOICE',
        entityId: generatedInvoice.id,
        newValue: generatedInvoice,
        description: `Invoice ${generatedInvoice.invoiceNumber} auto-generated for ${generatedInvoice.lead.companyName} on approval of quotation ${quotation.quotationNumber}`,
        request,
      });
    }

    return NextResponse.json({ ...quotation, generatedInvoice });
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update quotation' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_quotations');
  if (denied) return denied;

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
