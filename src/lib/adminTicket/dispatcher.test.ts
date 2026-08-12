import { describe, it, expect } from 'vitest';
import { formatDaysRemaining } from './dispatcher';

describe('formatDaysRemaining', () => {
  const now = new Date('2026-08-12T00:00:00Z');

  it('reports days remaining ahead of the due date', () => {
    expect(formatDaysRemaining(new Date('2026-08-19T00:00:00Z'), now)).toBe('7 days remaining');
  });

  it('uses singular phrasing for exactly one day remaining', () => {
    expect(formatDaysRemaining(new Date('2026-08-13T00:00:00Z'), now)).toBe('1 day remaining');
  });

  it('reports "due today" when the due date is today', () => {
    expect(formatDaysRemaining(new Date('2026-08-12T18:00:00Z'), now)).toBe('due today');
  });

  it('reports overdue days once the due date has passed', () => {
    expect(formatDaysRemaining(new Date('2026-08-10T00:00:00Z'), now)).toBe('overdue by 2 days');
  });

  it('uses singular phrasing for exactly one day overdue', () => {
    expect(formatDaysRemaining(new Date('2026-08-11T00:00:00Z'), now)).toBe('overdue by 1 day');
  });

  it('ignores time-of-day, comparing calendar dates only', () => {
    expect(formatDaysRemaining(new Date('2026-08-13T23:59:00Z'), new Date('2026-08-12T23:00:00Z'))).toBe('1 day remaining');
  });
});
