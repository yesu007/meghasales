import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = InstanceType<typeof Prisma.Decimal>;

export class OverpaymentError extends Error {
  constructor(message = 'Payment exceeds the outstanding balance') {
    super(message);
    this.name = 'OverpaymentError';
  }
}

export interface InvoiceAmounts {
  totalAmount: Decimal | string | number;
  amountPaid: Decimal | string | number;
}

export interface PaymentApplicationResult {
  amountPaid: Decimal;
  balanceDue: Decimal;
  status: 'PARTIALLY_PAID' | 'PAID';
}

export interface PaymentReversalResult {
  amountPaid: Decimal;
  balanceDue: Decimal;
  status: 'PENDING' | 'PARTIALLY_PAID';
}

// Pure, unit-testable: recomputes an invoice's paid amount/balance/status
// after applying a new payment. Throws OverpaymentError if the payment
// would push the paid total past the invoice's total amount.
export function applyPayment(invoice: InvoiceAmounts, amount: Decimal | string | number): PaymentApplicationResult {
  const total = new Decimal(invoice.totalAmount);
  const paidSoFar = new Decimal(invoice.amountPaid);
  const paymentAmount = new Decimal(amount);

  if (paymentAmount.lessThanOrEqualTo(0)) {
    throw new Error('Payment amount must be greater than zero');
  }

  const newAmountPaid = paidSoFar.plus(paymentAmount);
  if (newAmountPaid.greaterThan(total)) {
    throw new OverpaymentError();
  }

  const balanceDue = total.minus(newAmountPaid);
  const status: PaymentApplicationResult['status'] = balanceDue.equals(0) ? 'PAID' : 'PARTIALLY_PAID';

  return { amountPaid: newAmountPaid, balanceDue, status };
}

// The inverse: recomputes amounts after a payment is removed (soft-deleted)
// or reduced. Used when reversing a payment.
export function reversePayment(invoice: InvoiceAmounts, amount: Decimal | string | number): PaymentReversalResult {
  const total = new Decimal(invoice.totalAmount);
  const paidSoFar = new Decimal(invoice.amountPaid);
  const paymentAmount = new Decimal(amount);

  const newAmountPaid = Decimal.max(0, paidSoFar.minus(paymentAmount));
  const balanceDue = total.minus(newAmountPaid);
  const status: PaymentReversalResult['status'] = newAmountPaid.equals(0) ? 'PENDING' : 'PARTIALLY_PAID';

  return { amountPaid: newAmountPaid, balanceDue, status };
}

export type ReminderType = 'UPCOMING_7D' | 'DUE_TODAY' | 'OVERDUE_3D' | 'OVERDUE_7D' | 'OVERDUE_15D' | 'OVERDUE_30D';

// Given an invoice's due date and "today", determines which single reminder
// threshold currently applies (or null if none). Pure so it's testable
// without a database — used by both the manual reminders list and the
// automatic cron generator.
export function matchReminderThreshold(dueDate: Date, today: Date = new Date()): ReminderType | null {
  const dueDay = new Date(dueDate).setHours(0, 0, 0, 0);
  const todayDay = new Date(today).setHours(0, 0, 0, 0);
  const daysUntilDue = Math.round((dueDay - todayDay) / (1000 * 60 * 60 * 24));

  if (daysUntilDue === 7) return 'UPCOMING_7D';
  if (daysUntilDue === 0) return 'DUE_TODAY';
  if (daysUntilDue === -3) return 'OVERDUE_3D';
  if (daysUntilDue === -7) return 'OVERDUE_7D';
  if (daysUntilDue === -15) return 'OVERDUE_15D';
  if (daysUntilDue <= -30) return 'OVERDUE_30D';
  return null;
}
