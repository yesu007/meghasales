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
});
