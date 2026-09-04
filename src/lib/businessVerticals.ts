// Lead.businessVerticals is a single nullable String column (no FK to
// Vertical — see that field's own schema comment) storing a JSON-encoded
// list of Vertical *names*, e.g. '["Retail Jewellery","Wholesale"]'. Older
// rows written before multi-select support was added still hold a
// JSON-encoded single name, e.g. '"Retail Jewellery"' — parseBusinessVerticals
// reads both shapes as an array so no historical data needs a migration or
// is ever lost.
export function parseBusinessVerticals(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (typeof parsed === 'string' && parsed.length > 0) return [parsed];
    return [];
  } catch {
    return [raw];
  }
}

export function serializeBusinessVerticals(names: string[]): string | null {
  const cleaned = names.filter((n) => typeof n === 'string' && n.length > 0);
  return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
}

// Comma-joined display string for read-only contexts (list columns, detail
// pages) — callers keep their own '—'/'Not assigned' fallback for the empty
// case, same as the single-value parseVerticalName helpers this replaces.
export function formatBusinessVerticals(raw: string | null | undefined): string {
  return parseBusinessVerticals(raw).join(', ');
}
