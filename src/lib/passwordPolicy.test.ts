import { describe, expect, it } from 'vitest';
import { validateNewPassword } from './passwordPolicy';

describe('validateNewPassword', () => {
  it('accepts a matching pair of at least 8 characters', () => {
    expect(validateNewPassword('longenough', 'longenough')).toBeNull();
  });

  it('rejects a missing or short password', () => {
    expect(validateNewPassword('', '')).toMatch(/required/);
    expect(validateNewPassword('short', 'short')).toMatch(/at least 8/);
  });

  it('rejects a missing or mismatched confirmation', () => {
    expect(validateNewPassword('longenough', '')).toMatch(/confirm/i);
    expect(validateNewPassword('longenough', 'different1')).toMatch(/do not match/);
  });

  it('rejects non-string input', () => {
    expect(validateNewPassword(12345678, 12345678)).toMatch(/required/);
  });
});
