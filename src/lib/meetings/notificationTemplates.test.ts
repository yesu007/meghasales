import { describe, it, expect } from 'vitest';
import { renderTemplate } from './notificationTemplates';

describe('renderTemplate', () => {
  it('substitutes a known token', () => {
    expect(renderTemplate('Hello {{name}}', { name: 'Ravi' })).toBe('Hello Ravi');
  });

  it('substitutes multiple distinct tokens', () => {
    expect(renderTemplate('{{a}} and {{b}}', { a: 'X', b: 'Y' })).toBe('X and Y');
  });

  it('substitutes a repeated token every occurrence', () => {
    expect(renderTemplate('{{name}}, {{name}}!', { name: 'Ravi' })).toBe('Ravi, Ravi!');
  });

  it('renders an unknown token as an empty string', () => {
    expect(renderTemplate('Reason: {{reason}}', {})).toBe('Reason: ');
  });

  it('is a no-op on a body with no tokens', () => {
    expect(renderTemplate('Plain text, no tokens here.', { name: 'Ravi' })).toBe('Plain text, no tokens here.');
  });
});
