import { describe, it, expect } from 'vitest';
import { validateEventInput, validateDiscussionInput } from './eventValidation';

describe('validateEventInput', () => {
  const base = {
    title: 'Kickoff meeting',
    eventType: 'MEETING',
    eventDateTime: '2026-08-01T10:00:00.000Z',
  };

  it('accepts a minimal valid event', () => {
    expect(validateEventInput(base)).toBeNull();
  });

  it('rejects a missing title', () => {
    expect(validateEventInput({ ...base, title: '' })).toMatch(/title/i);
    expect(validateEventInput({ ...base, title: '   ' })).toMatch(/title/i);
  });

  it('rejects an unknown event type', () => {
    expect(validateEventInput({ ...base, eventType: 'PARTY' })).toMatch(/event type/i);
  });

  it('rejects a missing or invalid event date/time', () => {
    expect(validateEventInput({ ...base, eventDateTime: undefined })).toMatch(/date/i);
    expect(validateEventInput({ ...base, eventDateTime: 'not-a-date' })).toMatch(/date/i);
  });

  it('rejects a non-positive duration', () => {
    expect(validateEventInput({ ...base, duration: 0 })).toMatch(/duration/i);
    expect(validateEventInput({ ...base, duration: -5 })).toMatch(/duration/i);
  });

  it('accepts a positive duration', () => {
    expect(validateEventInput({ ...base, duration: 30 })).toBeNull();
  });

  it('rejects a follow-up date before the event date', () => {
    expect(
      validateEventInput({ ...base, followUpDate: '2026-07-31T10:00:00.000Z' })
    ).toMatch(/follow-up/i);
  });

  it('accepts a follow-up date equal to the event date (boundary)', () => {
    expect(
      validateEventInput({ ...base, followUpDate: '2026-08-01T10:00:00.000Z' })
    ).toBeNull();
  });

  it('accepts a follow-up date after the event date', () => {
    expect(
      validateEventInput({ ...base, followUpDate: '2026-08-05T10:00:00.000Z' })
    ).toBeNull();
  });

  it('rejects an invalid status', () => {
    expect(validateEventInput({ ...base, status: 'DONE' })).toMatch(/status/i);
  });

  it('accepts each valid status', () => {
    for (const status of ['SCHEDULED', 'COMPLETED', 'CANCELLED']) {
      expect(validateEventInput({ ...base, status })).toBeNull();
    }
  });
});

describe('validateDiscussionInput', () => {
  it('rejects missing notes', () => {
    expect(validateDiscussionInput({})).toMatch(/notes/i);
    expect(validateDiscussionInput({ notes: '   ' })).toMatch(/notes/i);
  });

  it('accepts non-empty notes', () => {
    expect(validateDiscussionInput({ notes: 'Discussed pricing' })).toBeNull();
  });
});
