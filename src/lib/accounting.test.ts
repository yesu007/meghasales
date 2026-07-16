import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { applyPayment, reversePayment, matchReminderThreshold, OverpaymentError } from './accounting';

const { Decimal } = Prisma;

describe('applyPayment', () => {
  it('marks the invoice PAID when the payment covers the full balance', () => {
    const result = applyPayment({ totalAmount: '1000.00', amountPaid: '0.00' }, '1000.00');
    expect(result.amountPaid.toString()).toBe('1000');
    expect(result.balanceDue.toString()).toBe('0');
    expect(result.status).toBe('PAID');
  });

  it('marks the invoice PARTIALLY_PAID when the payment is less than the balance', () => {
    const result = applyPayment({ totalAmount: '1000.00', amountPaid: '0.00' }, '400.00');
    expect(result.amountPaid.toString()).toBe('400');
    expect(result.balanceDue.toString()).toBe('600');
    expect(result.status).toBe('PARTIALLY_PAID');
  });

  it('accumulates against an already partially paid invoice', () => {
    const result = applyPayment({ totalAmount: '1000.00', amountPaid: '400.00' }, '600.00');
    expect(result.amountPaid.toString()).toBe('1000');
    expect(result.balanceDue.toString()).toBe('0');
    expect(result.status).toBe('PAID');
  });

  it('throws OverpaymentError when the payment exceeds the outstanding balance', () => {
    expect(() => applyPayment({ totalAmount: '1000.00', amountPaid: '400.00' }, '700.00')).toThrow(OverpaymentError);
  });

  it('throws OverpaymentError even for a fresh invoice paid past its total', () => {
    expect(() => applyPayment({ totalAmount: '1000.00', amountPaid: '0.00' }, '1000.01')).toThrow(OverpaymentError);
  });

  it('rejects a zero payment amount', () => {
    expect(() => applyPayment({ totalAmount: '1000.00', amountPaid: '0.00' }, '0')).toThrow('Payment amount must be greater than zero');
  });

  it('rejects a negative payment amount', () => {
    expect(() => applyPayment({ totalAmount: '1000.00', amountPaid: '0.00' }, '-50')).toThrow('Payment amount must be greater than zero');
  });

  it('accepts Decimal instances as well as strings/numbers', () => {
    const result = applyPayment({ totalAmount: new Decimal('500.50'), amountPaid: new Decimal('0') }, new Decimal('500.50'));
    expect(result.status).toBe('PAID');
  });
});

describe('reversePayment', () => {
  it('reverts a fully paid invoice back to PARTIALLY_PAID when only part of the payment is removed', () => {
    const result = reversePayment({ totalAmount: '1000.00', amountPaid: '1000.00' }, '400.00');
    expect(result.amountPaid.toString()).toBe('600');
    expect(result.balanceDue.toString()).toBe('400');
    expect(result.status).toBe('PARTIALLY_PAID');
  });

  it('reverts an invoice back to PENDING when the entire paid amount is removed', () => {
    const result = reversePayment({ totalAmount: '1000.00', amountPaid: '600.00' }, '600.00');
    expect(result.amountPaid.toString()).toBe('0');
    expect(result.balanceDue.toString()).toBe('1000');
    expect(result.status).toBe('PENDING');
  });

  it('floors amountPaid at zero rather than going negative', () => {
    const result = reversePayment({ totalAmount: '1000.00', amountPaid: '300.00' }, '9999.00');
    expect(result.amountPaid.toString()).toBe('0');
    expect(result.balanceDue.toString()).toBe('1000');
    expect(result.status).toBe('PENDING');
  });

  it('is the exact inverse of applyPayment for a single payment', () => {
    const invoice = { totalAmount: '1000.00', amountPaid: '0.00' };
    const applied = applyPayment(invoice, '350.00');
    const reversed = reversePayment({ totalAmount: invoice.totalAmount, amountPaid: applied.amountPaid }, '350.00');
    expect(reversed.amountPaid.toString()).toBe('0');
    expect(reversed.status).toBe('PENDING');
  });
});

describe('matchReminderThreshold', () => {
  const today = new Date('2026-07-16T00:00:00Z');

  it('matches UPCOMING_7D exactly 7 days before the due date', () => {
    expect(matchReminderThreshold(new Date('2026-07-23T00:00:00Z'), today)).toBe('UPCOMING_7D');
  });

  it('matches DUE_TODAY when the due date is today', () => {
    expect(matchReminderThreshold(new Date('2026-07-16T00:00:00Z'), today)).toBe('DUE_TODAY');
  });

  it('matches OVERDUE_3D exactly 3 days after the due date', () => {
    expect(matchReminderThreshold(new Date('2026-07-13T00:00:00Z'), today)).toBe('OVERDUE_3D');
  });

  it('matches OVERDUE_7D exactly 7 days after the due date', () => {
    expect(matchReminderThreshold(new Date('2026-07-09T00:00:00Z'), today)).toBe('OVERDUE_7D');
  });

  it('matches OVERDUE_15D exactly 15 days after the due date', () => {
    expect(matchReminderThreshold(new Date('2026-07-01T00:00:00Z'), today)).toBe('OVERDUE_15D');
  });

  it('matches OVERDUE_30D at exactly 30 days overdue', () => {
    expect(matchReminderThreshold(new Date('2026-06-16T00:00:00Z'), today)).toBe('OVERDUE_30D');
  });

  it('matches OVERDUE_30D for anything beyond 30 days overdue too (open-ended top bucket)', () => {
    expect(matchReminderThreshold(new Date('2026-01-01T00:00:00Z'), today)).toBe('OVERDUE_30D');
  });

  it('returns null for a day that does not land on any threshold', () => {
    expect(matchReminderThreshold(new Date('2026-07-20T00:00:00Z'), today)).toBeNull();
    expect(matchReminderThreshold(new Date('2026-07-14T00:00:00Z'), today)).toBeNull();
  });

  it('ignores time-of-day components when comparing dates', () => {
    // Both timestamps fall on the same local calendar day regardless of the
    // runner's timezone (unlike times near midnight UTC, which can shift a
    // local calendar day depending on UTC offset).
    const dueDateWithTime = new Date('2026-07-16T09:45:00Z');
    const todayWithTime = new Date('2026-07-16T08:15:00Z');
    expect(matchReminderThreshold(dueDateWithTime, todayWithTime)).toBe('DUE_TODAY');
  });
});
