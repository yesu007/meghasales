export const RUN_STATUSES = ['DRAFT', 'APPROVED', 'PROCESSED', 'PAID', 'CANCELLED'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

// Every status can move to every other status — same rationale as
// AdminTicket's isValidStatusTransition: a mistaken approval, "processed",
// or "paid" mark should be reversible by reopening to DRAFT rather than
// abandoning the run and starting a new one for the same period (which the
// [year, month] unique constraint wouldn't even allow).
const RUN_STATUS_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  DRAFT: ['APPROVED', 'PROCESSED', 'PAID', 'CANCELLED'],
  APPROVED: ['DRAFT', 'PROCESSED', 'PAID', 'CANCELLED'],
  PROCESSED: ['DRAFT', 'APPROVED', 'PAID', 'CANCELLED'],
  PAID: ['DRAFT', 'APPROVED', 'PROCESSED', 'CANCELLED'],
  CANCELLED: ['DRAFT', 'APPROVED', 'PROCESSED', 'PAID'],
};

export function isValidRunStatusTransition(from: RunStatus, to: RunStatus): boolean {
  if (from === to) return false;
  return RUN_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const ADJUSTMENT_TYPES = ['EARNING', 'DEDUCTION'] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];
