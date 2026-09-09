// Fixed, CVD-validated 8-slot categorical palette (adjacent-pair order —
// see the dataviz reference palette). A category's swatch is picked purely
// from its position when every category is sorted by (sortOrder, id) — the
// same order every time, independent of which verticals or expenses happen
// to be in a given response, so "the same category always gets the same
// color" holds without a lookup table to maintain by hand.
export const CATEGORICAL_PALETTE = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
];

// A 9th+ category (by sortOrder) shares this neutral swatch rather than a
// hand-picked color past the validated 8 — a generated 9th/10th hue can't
// clear the palette's CVD-separation gate against its neighbors, so per
// the same reference's own rule it folds into "Other" instead. Every
// category still keeps its own name in the legend/tooltip, so identity is
// never lost — only categories past the 8th ever share a swatch.
export const OTHER_CATEGORY_COLOR = '#64748b'; // slate-500, matches this app's existing slate UI palette

export interface CategoryColorInput {
  categoryId: number;
  sortOrder: number;
}

export function buildCategoryColorMap(categories: CategoryColorInput[]): Map<number, string> {
  const bySortOrder = new Map<number, number>();
  for (const c of categories) bySortOrder.set(c.categoryId, c.sortOrder);
  const ordered = Array.from(bySortOrder.entries()).sort((a, b) => a[1] - b[1] || a[0] - b[0]);

  const map = new Map<number, string>();
  ordered.forEach(([categoryId], index) => {
    map.set(categoryId, index < CATEGORICAL_PALETTE.length ? CATEGORICAL_PALETTE[index] : OTHER_CATEGORY_COLOR);
  });
  return map;
}
