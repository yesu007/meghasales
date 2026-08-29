import { describe, it, expect } from 'vitest';
import { invoiceFieldsFromQuotation } from './invoiceFromQuotation';

function baseQuotation(overrides: Record<string, any> = {}) {
  return {
    softwareModules: null,
    pricingSnapshot: { subtotal: 1000, modules: [] },
    implementationCost: null,
    trainingCost: null,
    annualMaintenance: null,
    customDevelopmentCost: null,
    discountPercentage: null,
    discountAmount: null,
    taxBreakdown: null,
    taxAmount: null,
    totalAmount: '1000.00',
    currencyCode: 'USD',
    exchangeRate: '83.5',
    ...overrides,
  };
}

describe('invoiceFieldsFromQuotation', () => {
  it('carries the quotation exchangeRate through to the invoice fields', () => {
    const derived = invoiceFieldsFromQuotation(baseQuotation());
    expect(derived.exchangeRate).toBe('83.5');
  });

  it('defaults exchangeRate to 1 when the quotation has none', () => {
    const derived = invoiceFieldsFromQuotation(baseQuotation({ exchangeRate: null }));
    expect(derived.exchangeRate).toBe(1);
  });

  it('defaults currencyCode to INR when the quotation has none (pre-existing behavior, unchanged)', () => {
    const derived = invoiceFieldsFromQuotation(baseQuotation({ currencyCode: null }));
    expect(derived.currencyCode).toBe('INR');
  });

  it('builds one line item per resource for a resource-based quotation, ignoring softwareModules', () => {
    const derived = invoiceFieldsFromQuotation(baseQuotation({
      costingMode: 'RESOURCE_BASED',
      softwareModules: ['SHOULD_BE_IGNORED'],
      pricingSnapshot: {
        resources: [
          { role: 'Developer', qty: 2, durationDays: 10, dayRate: 5000 },
          { role: 'QA', qty: 1, durationDays: 5, dayRate: 4000 },
        ],
      },
      outsourcingCost: 10000,
      travelCost: 0,
      adminCost: 5000,
      markupAmount: 0,
      totalAmount: '125000.00',
    }));

    expect(derived.lineItems).toEqual([
      { description: 'Developer', quantity: 2, unitPrice: 50000, total: 100000 },
      { description: 'QA', quantity: 1, unitPrice: 20000, total: 20000 },
      { description: 'Outsourcing', quantity: 1, unitPrice: 10000, total: 10000 },
      { description: 'Admin / Overhead', quantity: 1, unitPrice: 5000, total: 5000 },
    ]);
    expect(derived.subtotal).toBe(135000);
  });

  it('omits zero-value extra lines (travel/markup) for a resource-based quotation', () => {
    const derived = invoiceFieldsFromQuotation(baseQuotation({
      costingMode: 'RESOURCE_BASED',
      pricingSnapshot: { resources: [{ role: 'Developer', qty: 1, durationDays: 10, dayRate: 5000 }] },
      outsourcingCost: 0,
      travelCost: 0,
      adminCost: 0,
      markupAmount: 0,
    }));
    expect(derived.lineItems).toEqual([{ description: 'Developer', quantity: 1, unitPrice: 50000, total: 50000 }]);
    expect(derived.subtotal).toBe(50000);
  });
});
