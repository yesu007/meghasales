// Derives Invoice line items and totals from an approved Quotation's stored
// pricing. Shared between manual invoice generation (POST /api/accounting/invoices)
// and automatic invoice generation on quotation approval (PUT /api/quotations/[id]),
// mirroring the same parsing logic used for the Quotation PDF download
// (src/app/dashboard/quotations/page.tsx downloadQuotationPDF).
export function lineItemsFromQuotation(quotation: any) {
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
  };
}
