// Atomic invoice number generator, backed by the `invoice_number_seq`
// Postgres sequence (see prisma/migrations/20260716120000_add_invoice_number_sequence).
// A count()-based scheme like `INV-${count+1}` races under concurrent
// creation — e.g. two quotations approved close together can both read the
// same count and collide on the invoice_number unique constraint, rolling
// back the whole approval transaction. nextval() is atomic across concurrent
// transactions, so it can't collide.
export async function nextInvoiceNumber(client: { $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: any[]) => Promise<T> }) {
  const [{ nextval }] = await client.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('invoice_number_seq') AS nextval`;
  return `INV-${String(nextval).padStart(5, '0')}`;
}

// Derives Invoice line items and totals from an approved Quotation's stored
// pricing. Shared between manual invoice generation (POST /api/accounting/invoices)
// and automatic invoice generation on quotation approval (PUT /api/quotations/[id]),
// mirroring the same parsing logic used for the Quotation PDF download
// (src/app/dashboard/quotations/page.tsx downloadQuotationPDF).
// Resource-based (Quotation Calculator) quotations carry their line items in
// pricingSnapshot.resources rather than softwareModules/flat cost fields —
// one invoice line per resource, plus outsourcing/travel/admin/markup as
// extra summary lines when non-zero. Kept as an early return so it can never
// fall through into (or be affected by) the catalog-mode logic below.
function lineItemsFromResourceBasedQuotation(quotation: any) {
  const snapshot = quotation.pricingSnapshot as any;
  const resources = Array.isArray(snapshot?.resources) ? snapshot.resources : [];

  const lineItems = resources.map((r: any) => {
    const qty = Number(r.qty) || 0;
    const unitPrice = (Number(r.durationDays) || 0) * (Number(r.dayRate) || 0);
    return { description: r.role || 'Resource', quantity: qty, unitPrice, total: qty * unitPrice };
  });

  const extra: { label: string; cost: any }[] = [
    { label: 'Outsourcing', cost: quotation.outsourcingCost },
    { label: 'Travel / Other', cost: quotation.travelCost },
    { label: 'Admin / Overhead', cost: quotation.adminCost },
    { label: 'Markup', cost: quotation.markupAmount },
  ];
  for (const e of extra) {
    const cost = Number(e.cost) || 0;
    if (cost > 0) lineItems.push({ description: e.label, quantity: 1, unitPrice: cost, total: cost });
  }

  const subtotal = lineItems.reduce((sum: number, li: any) => sum + li.total, 0);
  return { lineItems, subtotal };
}

export function lineItemsFromQuotation(quotation: any) {
  if (quotation.costingMode === 'RESOURCE_BASED') return lineItemsFromResourceBasedQuotation(quotation);

  const snapshot = quotation.pricingSnapshot as any;
  const modulesList = Array.isArray(quotation.softwareModules) ? quotation.softwareModules : [];

  const lineItems = snapshot?.modules?.length > 0
    ? snapshot.modules.map((m: any) => ({ description: m.moduleName, quantity: 1, unitPrice: Number(m.basePrice), total: Number(m.basePrice) }))
    : modulesList.map((m: any) => {
        const description = typeof m === 'string' ? m : m.name || m.moduleCode || '';
        const unitPrice = typeof m === 'object' && m.cost ? Number(m.cost) : 0;
        const quantity = typeof m === 'object' && m.quantity ? Number(m.quantity) : 1;
        return { description, quantity, unitPrice, total: unitPrice * quantity };
      });

  const extra: { label: string; cost: any }[] = [
    { label: 'Implementation & Setup', cost: quotation.implementationCost },
    { label: 'Training', cost: quotation.trainingCost },
    { label: 'Annual Maintenance (AMC)', cost: quotation.annualMaintenance },
    { label: 'Custom Development', cost: quotation.customDevelopmentCost },
  ];
  for (const e of extra) {
    const cost = Number(e.cost) || 0;
    if (cost > 0) lineItems.push({ description: e.label, quantity: 1, unitPrice: cost, total: cost });
  }

  const subtotal = snapshot?.subtotal !== undefined
    ? Number(snapshot.subtotal)
    : lineItems.reduce((sum: number, li: any) => sum + li.total, 0);

  return { lineItems, subtotal };
}

// Full set of Invoice fields derivable from a Quotation, beyond just line
// items/subtotal — reused by both invoice-creation call sites so they can't
// drift out of sync with each other.
export function invoiceFieldsFromQuotation(quotation: any) {
  const { lineItems, subtotal } = lineItemsFromQuotation(quotation);
  return {
    lineItems,
    subtotal,
    discountPercentage: quotation.discountPercentage,
    discountAmount: quotation.discountAmount,
    taxBreakdown: quotation.taxBreakdown,
    taxAmount: quotation.taxAmount,
    totalAmount: quotation.totalAmount,
    currencyCode: quotation.currencyCode || 'INR',
    exchangeRate: quotation.exchangeRate || 1,
  };
}
