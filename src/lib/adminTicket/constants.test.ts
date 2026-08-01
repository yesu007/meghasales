import { describe, it, expect } from 'vitest';
import { isValidStatusTransition, STATUSES, TicketStatus } from './constants';

describe('isValidStatusTransition', () => {
  it('allows OPEN -> IN_PROGRESS', () => {
    expect(isValidStatusTransition('OPEN', 'IN_PROGRESS')).toBe(true);
  });

  it('allows IN_PROGRESS -> COMPLETED', () => {
    expect(isValidStatusTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
  });

  it('allows OPEN -> COMPLETED directly (the dropdown offers every status, not just a fixed workflow)', () => {
    expect(isValidStatusTransition('OPEN', 'COMPLETED')).toBe(true);
  });

  it('rejects a no-op transition to the same status', () => {
    expect(isValidStatusTransition('OPEN', 'OPEN')).toBe(false);
  });

  it('allows reopening a COMPLETED ticket', () => {
    expect(isValidStatusTransition('COMPLETED', 'OPEN')).toBe(true);
    expect(isValidStatusTransition('COMPLETED', 'IN_PROGRESS')).toBe(true);
  });

  it('allows reopening a CANCELLED ticket', () => {
    expect(isValidStatusTransition('CANCELLED', 'OPEN')).toBe(true);
  });

  it('allows moving between every distinct pair of statuses', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (from === to) continue;
        expect(isValidStatusTransition(from as TicketStatus, to as TicketStatus)).toBe(true);
      }
    }
  });
});
