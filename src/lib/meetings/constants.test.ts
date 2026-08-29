import { describe, it, expect } from 'vitest';
import { classifyActionItemSlaStatus } from './constants';

const NOW = new Date('2026-08-25T12:00:00.000Z');

describe('classifyActionItemSlaStatus', () => {
  it('is NOT_APPLICABLE for a cancelled item regardless of due date', () => {
    expect(classifyActionItemSlaStatus({ status: 'CANCELLED', dueDate: new Date('2026-08-01T00:00:00.000Z'), completedAt: null }, NOW)).toBe(
      'NOT_APPLICABLE'
    );
  });

  it('is ON_TIME for a resolved item completed before its due date', () => {
    expect(
      classifyActionItemSlaStatus(
        { status: 'CLOSED', dueDate: new Date('2026-08-25T00:00:00.000Z'), completedAt: new Date('2026-08-20T00:00:00.000Z') },
        NOW
      )
    ).toBe('ON_TIME');
  });

  it('is BREACHED for a resolved item completed after its due date', () => {
    expect(
      classifyActionItemSlaStatus(
        { status: 'VERIFIED', dueDate: new Date('2026-08-20T00:00:00.000Z'), completedAt: new Date('2026-08-25T00:00:00.000Z') },
        NOW
      )
    ).toBe('BREACHED');
  });

  it('is OVERDUE for an open item past its due date', () => {
    expect(classifyActionItemSlaStatus({ status: 'IN_PROGRESS', dueDate: new Date('2026-08-24T00:00:00.000Z'), completedAt: null }, NOW)).toBe(
      'OVERDUE'
    );
  });

  it('is DUE_SOON for an open item due within the warning window', () => {
    expect(classifyActionItemSlaStatus({ status: 'ASSIGNED', dueDate: new Date('2026-08-26T18:00:00.000Z'), completedAt: null }, NOW)).toBe(
      'DUE_SOON'
    );
  });

  it('is ON_TRACK for an open item well before its due date', () => {
    expect(classifyActionItemSlaStatus({ status: 'DRAFT', dueDate: new Date('2026-09-10T00:00:00.000Z'), completedAt: null }, NOW)).toBe(
      'ON_TRACK'
    );
  });
});
