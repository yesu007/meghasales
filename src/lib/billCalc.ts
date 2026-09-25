// Pure bill constants/calculations — no Prisma import, so the Bills page
// (client component) can use the same math for its live preview.

export const BILL_TYPES = ['SUB_CONTRACTOR', 'MATERIAL'] as const;
export const BILL_PAYMENT_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID'] as const;
export const GST_TYPES = ['INPUT', 'OUTPUT'] as const;

// 15-char Indian GSTIN: 2-digit state code, 10-char PAN, entity number,
// 'Z', checksum character.
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface BillItemInput {
  subCategoryId: number;
  description: string;
  itemValue: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  tdsPercent: number;
  gstType: string;
}

// Per line: GST components and TDS are computed independently on the item
// value, then combined only in the payable formula
//   Payable = Item Value − TDS + GST
// Shared by the API (source of truth, stored) and the bill form (live preview).
export function computeBillItem(item: Omit<BillItemInput, 'subCategoryId' | 'description' | 'gstType'>) {
  const itemValue = round2(item.itemValue || 0);
  const cgstAmount = round2((itemValue * (item.cgstRate || 0)) / 100);
  const sgstAmount = round2((itemValue * (item.sgstRate || 0)) / 100);
  const igstAmount = round2((itemValue * (item.igstRate || 0)) / 100);
  const gstAmount = round2(cgstAmount + sgstAmount + igstAmount);
  const tdsAmount = round2((itemValue * (item.tdsPercent || 0)) / 100);
  const payableAmount = round2(itemValue - tdsAmount + gstAmount);
  return { itemValue, cgstAmount, sgstAmount, igstAmount, gstAmount, tdsAmount, payableAmount };
}

export function computeBillTotals(items: Omit<BillItemInput, 'subCategoryId' | 'description' | 'gstType'>[]) {
  const totals = { itemTotal: 0, cgstTotal: 0, sgstTotal: 0, igstTotal: 0, gstTotal: 0, tdsTotal: 0, payableAmount: 0 };
  for (const item of items) {
    const c = computeBillItem(item);
    totals.itemTotal += c.itemValue;
    totals.cgstTotal += c.cgstAmount;
    totals.sgstTotal += c.sgstAmount;
    totals.igstTotal += c.igstAmount;
    totals.gstTotal += c.gstAmount;
    totals.tdsTotal += c.tdsAmount;
    totals.payableAmount += c.payableAmount;
  }
  return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])) as typeof totals;
}
