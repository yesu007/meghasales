import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { formatCurrency, localeForCurrency, symbolForCurrency } from './currency';

const { Decimal } = Prisma;

describe('localeForCurrency', () => {
  it('maps known currency codes to their grouping locale', () => {
    expect(localeForCurrency('INR')).toBe('en-IN');
    expect(localeForCurrency('USD')).toBe('en-US');
    expect(localeForCurrency('AED')).toBe('en-AE');
  });

  it('is case-insensitive', () => {
    expect(localeForCurrency('inr')).toBe('en-IN');
  });

  it('falls back to en-US for an unknown code rather than throwing', () => {
    expect(localeForCurrency('XYZ')).toBe('en-US');
  });
});

describe('symbolForCurrency', () => {
  it('returns the known symbol for a seeded currency', () => {
    expect(symbolForCurrency('INR')).toBe('₹');
    expect(symbolForCurrency('USD')).toBe('$');
    expect(symbolForCurrency('AED')).toBe('AED');
  });

  it('is case-insensitive', () => {
    expect(symbolForCurrency('inr')).toBe('₹');
  });

  it('falls back to the currency code itself for an unknown currency', () => {
    expect(symbolForCurrency('XYZ')).toBe('XYZ');
  });

  it('has a real symbol for every currency seeded in prisma/seed.ts', () => {
    // Keep in sync with the `currencies` array in prisma/seed.ts — a
    // newly-seeded currency missing an entry here would silently fall
    // back to rendering its own 3-letter code instead of a symbol.
    expect(symbolForCurrency('INR')).toBe('₹');
    expect(symbolForCurrency('USD')).toBe('$');
    expect(symbolForCurrency('GBP')).toBe('£');
    expect(symbolForCurrency('AED')).toBe('AED');
    expect(symbolForCurrency('THB')).toBe('฿');
    expect(symbolForCurrency('SGD')).toBe('SGD');
    expect(symbolForCurrency('SAR')).toBe('SAR');
  });
});

describe('formatCurrency', () => {
  it('groups INR with lakh-style separators, not thousands', () => {
    expect(formatCurrency(125000, 'INR', { symbol: '₹' })).toBe('₹1,25,000.00');
  });

  it('groups USD with thousands separators, not en-IN lakh grouping', () => {
    expect(formatCurrency(125000, 'USD', { symbol: '$' })).toBe('$125,000.00');
  });

  it('adds a separating space for multi-character symbols but not single-glyph ones', () => {
    expect(formatCurrency(8500, 'AED', { symbol: 'AED' })).toBe('AED 8,500.00');
    expect(formatCurrency(1800, 'GBP', { symbol: '£' })).toBe('£1,800.00');
  });

  it('uses the known default symbol for a currency when none is explicitly supplied', () => {
    expect(formatCurrency(2500, 'USD')).toBe('$2,500.00');
    expect(formatCurrency(2500, 'INR')).toBe('₹2,500.00');
  });

  it('respects a custom decimalPlaces option', () => {
    expect(formatCurrency(2500, 'USD', { symbol: '$', decimalPlaces: 0 })).toBe('$2,500');
  });

  it('formats negative amounts (e.g. credit notes/refunds)', () => {
    expect(formatCurrency(-500, 'USD', { symbol: '$' })).toBe('$-500.00');
  });

  it('formats zero', () => {
    expect(formatCurrency(0, 'INR', { symbol: '₹' })).toBe('₹0.00');
  });

  it('accepts string and Decimal inputs, not just numbers', () => {
    expect(formatCurrency('1234.5', 'USD', { symbol: '$' })).toBe('$1,234.50');
    expect(formatCurrency(new Decimal('1234.50'), 'USD', { symbol: '$' })).toBe('$1,234.50');
  });

  it('accepts a Decimal shaped like a Prisma _sum aggregation result (extra precision, rounds to display decimals)', () => {
    // Summing several Decimal(15,2) line items in Postgres can carry more
    // fractional digits than any single row had — formatCurrency must still
    // round to the requested display precision rather than choking on it.
    const aggregated = new Decimal('12345.678');
    expect(formatCurrency(aggregated, 'USD', { symbol: '$' })).toBe('$12,345.68');
    expect(formatCurrency(aggregated, 'INR', { symbol: '₹' })).toBe('₹12,345.68');
  });

  it('does not throw for an unmapped currency code, falling back to its own code as symbol and en-US grouping', () => {
    expect(formatCurrency(1000, 'XYZ')).toBe('XYZ 1,000.00');
  });
});
