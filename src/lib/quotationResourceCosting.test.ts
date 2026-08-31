import { describe, it, expect } from 'vitest';
import { computeResourceCosting, dayRateFromAnnualCtc } from './quotationResourceCosting';

describe('dayRateFromAnnualCtc', () => {
  it('divides annual CTC by the 260-working-day convention', () => {
    expect(dayRateFromAnnualCtc(1300000)).toBe(5000);
  });

  it('rounds to 2 decimal places', () => {
    expect(dayRateFromAnnualCtc(1000000)).toBeCloseTo(3846.15, 2);
  });
});

describe('computeResourceCosting', () => {
  // Same figures as the approved mockup's seed data (resources, 10% admin,
  // 25% markup, 18% tax) — pinning the server math to the exact numbers the
  // mockup itself produces (₹12,81,775 total, ~32.2% margin).
  it('matches the reference mockup scenario', () => {
    const result = computeResourceCosting({
      resources: [
        { role: 'Solution Architect', qty: 1, durationDays: 15, dayRate: 12000 },
        { role: 'Backend Developer', qty: 2, durationDays: 40, dayRate: 6500 },
        { role: 'QA Engineer', qty: 1, durationDays: 20, dayRate: 4500 },
      ],
      adminMode: 'PCT',
      adminValue: 10,
      outsourcingCost: 0,
      travelCost: 0,
      markupMode: 'PCT',
      markupValue: 25,
      taxPercentage: 18,
    });

    expect(result.resourceCostTotal).toBe(790000);
    expect(result.adminCost).toBe(79000);
    expect(result.baseCost).toBe(869000);
    expect(result.markupAmount).toBe(217250);
    expect(result.preTax).toBe(1086250);
    expect(result.taxAmount).toBeCloseTo(195525, 5);
    expect(result.calculatedTotalAmount).toBeCloseTo(1281775, 5);
    expect(result.totalAmount).toBeCloseTo(1281775, 5);
    expect(result.totalAmountOverridden).toBe(false);
    expect(result.marginPercent).toBeCloseTo(32.2034, 3);
  });

  it('uses a fixed admin amount instead of a percentage when adminMode is FIXED', () => {
    const result = computeResourceCosting({
      resources: [{ role: 'Developer', qty: 1, durationDays: 10, dayRate: 5000 }],
      adminMode: 'FIXED',
      adminValue: 3000,
      outsourcingCost: 0,
      travelCost: 0,
      markupMode: 'PCT',
      markupValue: 0,
      taxPercentage: 0,
    });
    expect(result.resourceCostTotal).toBe(50000);
    expect(result.adminCost).toBe(3000);
    expect(result.baseCost).toBe(53000);
  });

  it('includes outsourcing and travel costs in the base cost', () => {
    const result = computeResourceCosting({
      resources: [{ role: 'Developer', qty: 1, durationDays: 10, dayRate: 5000 }],
      adminMode: 'PCT',
      adminValue: 0,
      outsourcingCost: 10000,
      travelCost: 5000,
      markupMode: 'PCT',
      markupValue: 0,
      taxPercentage: 0,
    });
    expect(result.baseCost).toBe(65000);
    expect(result.totalAmount).toBe(65000);
  });

  it('uses the override amount as the total and flags it as overridden', () => {
    const result = computeResourceCosting({
      resources: [{ role: 'Developer', qty: 1, durationDays: 10, dayRate: 5000 }],
      adminMode: 'PCT',
      adminValue: 0,
      outsourcingCost: 0,
      travelCost: 0,
      markupMode: 'PCT',
      markupValue: 20,
      taxPercentage: 0,
      overrideAmount: 70000,
    });
    expect(result.calculatedTotalAmount).toBe(60000);
    expect(result.totalAmount).toBe(70000);
    expect(result.totalAmountOverridden).toBe(true);
    // margin is measured against the published (overridden) total, not the
    // system-calculated one — a higher override looks like a healthier margin.
    expect(result.marginPercent).toBeCloseTo(((70000 - 50000) / 70000) * 100, 5);
  });

  it('applies a percentage discount to the subtotal before tax', () => {
    const result = computeResourceCosting({
      resources: [{ role: 'Developer', qty: 1, durationDays: 10, dayRate: 5000 }],
      adminMode: 'PCT',
      adminValue: 0,
      outsourcingCost: 0,
      travelCost: 0,
      markupMode: 'PCT',
      markupValue: 25,
      discountMode: 'PCT',
      discountValue: 10,
      taxPercentage: 18,
    });
    // subtotal = 50000 * 1.25 = 62500; discount = 10% = 6250; taxable = 56250
    expect(result.subtotal).toBe(62500);
    expect(result.discountAmount).toBe(6250);
    expect(result.preTax).toBe(56250);
    expect(result.taxAmount).toBeCloseTo(10125, 5);
    expect(result.calculatedTotalAmount).toBeCloseTo(66375, 5);
  });

  it('applies a fixed discount amount instead of a percentage when discountMode is FIXED', () => {
    const result = computeResourceCosting({
      resources: [{ role: 'Developer', qty: 1, durationDays: 10, dayRate: 5000 }],
      adminMode: 'PCT',
      adminValue: 0,
      outsourcingCost: 0,
      travelCost: 0,
      markupMode: 'PCT',
      markupValue: 0,
      discountMode: 'FIXED',
      discountValue: 2000,
      taxPercentage: 0,
    });
    expect(result.subtotal).toBe(50000);
    expect(result.discountAmount).toBe(2000);
    expect(result.preTax).toBe(48000);
    expect(result.totalAmount).toBe(48000);
  });

  it('defaults to zero discount when discountMode/discountValue are omitted', () => {
    const result = computeResourceCosting({
      resources: [{ role: 'Developer', qty: 1, durationDays: 10, dayRate: 5000 }],
      adminMode: 'PCT',
      adminValue: 0,
      outsourcingCost: 0,
      travelCost: 0,
      markupMode: 'PCT',
      markupValue: 0,
      taxPercentage: 0,
    });
    expect(result.discountAmount).toBe(0);
    expect(result.preTax).toBe(result.subtotal);
  });

  it('does not divide by zero when the total amount is zero', () => {
    const result = computeResourceCosting({
      resources: [],
      adminMode: 'PCT',
      adminValue: 0,
      outsourcingCost: 0,
      travelCost: 0,
      markupMode: 'PCT',
      markupValue: 0,
      taxPercentage: 0,
    });
    expect(result.marginPercent).toBe(0);
    expect(result.totalAmount).toBe(0);
  });
});
