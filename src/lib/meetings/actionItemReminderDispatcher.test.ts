import { describe, it, expect } from 'vitest';
import { classifyReminderEventType } from './actionItemReminderDispatcher';

describe('classifyReminderEventType', () => {
  it('classifies a negative offset as a due-soon advance warning', () => {
    expect(classifyReminderEventType(-2, 'ASSIGNEE')).toBe('ACTION_ITEM_DUE_SOON');
  });

  it('classifies a negative offset as due-soon regardless of recipient type', () => {
    expect(classifyReminderEventType(-1, 'ORGANIZER')).toBe('ACTION_ITEM_DUE_SOON');
  });

  it('classifies a 0/positive offset to the assignee as overdue', () => {
    expect(classifyReminderEventType(0, 'ASSIGNEE')).toBe('ACTION_ITEM_OVERDUE');
    expect(classifyReminderEventType(2, 'ASSIGNEE')).toBe('ACTION_ITEM_OVERDUE');
  });

  it('classifies a 0/positive offset to the organizer as escalated', () => {
    expect(classifyReminderEventType(0, 'ORGANIZER')).toBe('ACTION_ITEM_ESCALATED');
    expect(classifyReminderEventType(2, 'ORGANIZER')).toBe('ACTION_ITEM_ESCALATED');
  });
});
