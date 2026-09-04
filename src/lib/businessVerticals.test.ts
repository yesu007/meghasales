import { describe, it, expect } from 'vitest';
import { parseBusinessVerticals, serializeBusinessVerticals, formatBusinessVerticals } from './businessVerticals';

describe('parseBusinessVerticals', () => {
  it('returns an empty array for null/undefined/empty', () => {
    expect(parseBusinessVerticals(null)).toEqual([]);
    expect(parseBusinessVerticals(undefined)).toEqual([]);
    expect(parseBusinessVerticals('')).toEqual([]);
  });

  it('parses a modern JSON array of names', () => {
    expect(parseBusinessVerticals('["Retail Jewellery","Wholesale"]')).toEqual(['Retail Jewellery', 'Wholesale']);
  });

  it('parses a legacy single-name JSON string as a one-element array', () => {
    expect(parseBusinessVerticals('"Retail Jewellery"')).toEqual(['Retail Jewellery']);
  });

  it('falls back to the raw string for non-JSON legacy data', () => {
    expect(parseBusinessVerticals('Retail Jewellery')).toEqual(['Retail Jewellery']);
  });

  it('drops empty/non-string entries from an array', () => {
    expect(parseBusinessVerticals('["Retail Jewellery","", null, "Wholesale"]')).toEqual(['Retail Jewellery', 'Wholesale']);
  });
});

describe('serializeBusinessVerticals', () => {
  it('serializes a list of names to a JSON array string', () => {
    expect(serializeBusinessVerticals(['Retail Jewellery', 'Wholesale'])).toBe('["Retail Jewellery","Wholesale"]');
  });

  it('returns null for an empty list', () => {
    expect(serializeBusinessVerticals([])).toBeNull();
  });

  it('drops empty entries before serializing', () => {
    expect(serializeBusinessVerticals(['Retail Jewellery', ''])).toBe('["Retail Jewellery"]');
  });

  it('round-trips through parseBusinessVerticals', () => {
    const names = ['Retail Jewellery', 'Wholesale', 'Export'];
    expect(parseBusinessVerticals(serializeBusinessVerticals(names))).toEqual(names);
  });
});

describe('formatBusinessVerticals', () => {
  it('comma-joins multiple names', () => {
    expect(formatBusinessVerticals('["Retail Jewellery","Wholesale"]')).toBe('Retail Jewellery, Wholesale');
  });

  it('returns an empty string when nothing is set', () => {
    expect(formatBusinessVerticals(null)).toBe('');
  });

  it('formats legacy single-value data the same as modern data', () => {
    expect(formatBusinessVerticals('"Retail Jewellery"')).toBe('Retail Jewellery');
  });
});
