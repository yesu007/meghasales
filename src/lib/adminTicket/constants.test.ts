import { describe, it, expect } from 'vitest';
import { isValidStatusTransition } from './constants';

describe('isValidStatusTransition', () => {
  it('allows OPEN -> IN_PROGRESS', () => {
    expect(isValidStatusTransition('OPEN', 'IN_PROGRESS')).toBe(true);
  });

  it('allows IN_PROGRESS -> COMPLETED', () => {
    expect(isValidStatusTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
  });

  it('rejects a no-op transition to the same status', () => {
    expect(isValidStatusTransition('OPEN', 'OPEN')).toBe(false);
  });

  it('rejects any transition out of COMPLETED (terminal)', () => {
    expect(isValidStatusTransition('COMPLETED', 'OPEN')).toBe(false);
    expect(isValidStatusTransition('COMPLETED', 'IN_PROGRESS')).toBe(false);
  });

  it('rejects any transition out of CANCELLED (terminal)', () => {
    expect(isValidStatusTransition('CANCELLED', 'OPEN')).toBe(false);
  });

  it('rejects skipping straight from OPEN to COMPLETED without going through a working state', () => {
    // OPEN can go to IN_PROGRESS/PENDING/CANCELLED only, per the transition table.
    expect(isValidStatusTransition('OPEN', 'COMPLETED')).toBe(false);
  });
});
