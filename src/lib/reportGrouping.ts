// Pure, unit-testable: sums `getAmount(item)` per (key, currency) pair
// instead of blindly summing everything together — a customer/period with
// invoices or payments in more than one currency must never have those
// amounts collapsed into one meaningless blended total. Used by
// accountingReports.ts for reports that aggregate across multiple rows
// (e.g. per-customer collections). Kept dependency-free (no `@/lib/prisma`
// import) so it's importable from Vitest without a path-alias setup.
export function groupSumsByCurrency<T>(
  items: T[],
  getKey: (item: T) => string,
  getCurrency: (item: T) => string,
  getAmount: (item: T) => number
): { key: string; currencyCode: string; total: number; count: number }[] {
  const buckets: Record<string, { key: string; currencyCode: string; total: number; count: number }> = {};
  for (const item of items) {
    const key = getKey(item);
    const currencyCode = getCurrency(item);
    const bucketKey = `${key} ${currencyCode}`;
    if (!buckets[bucketKey]) buckets[bucketKey] = { key, currencyCode, total: 0, count: 0 };
    buckets[bucketKey].total += getAmount(item);
    buckets[bucketKey].count += 1;
  }
  return Object.values(buckets);
}
