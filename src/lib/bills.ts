import { Prisma, PrismaClient } from '@prisma/client';
import { nextExpenseNumber } from '@/lib/nextExpenseNumber';
import { BILL_TYPES, computeBillItem, computeBillTotals } from '@/lib/billCalc';
export * from '@/lib/billCalc';

type Client = Prisma.TransactionClient | PrismaClient;

// Atomic BILL-00001 numbering, backed by the `bill_number_seq` sequence —
// same reasoning as nextExpenseNumber().
export async function nextBillNumber(client: Client) {
  const [{ nextval }] = await client.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('bill_number_seq') AS nextval`;
  return `BILL-${String(nextval).padStart(5, '0')}`;
}

// Bill payment status -> linked expense status. Bills track partial
// payment, so PARTIALLY_PAID is carried through as its own expense status.
const EXPENSE_STATUS_FOR_BILL: Record<string, string> = { UNPAID: 'PENDING', PARTIALLY_PAID: 'PARTIALLY_PAID', PAID: 'PAID' };

// Bill -> Expense integration. A POSTED bill gets exactly ONE BILL expense
// (keyed on the unique Expense.billId, so calling this again updates it
// rather than adding a duplicate) carrying the bill's category, supplier,
// invoice date/number, attachment and payable amount; its status follows
// the bill's payment status. The sub-category is carried only when every
// line shares one. DRAFT bills never create one; a deleted bill
// soft-deletes its expense.
export async function syncBillExpense(tx: Client, billId: number, performedById: number | null): Promise<void> {
  const bill = await tx.bill.findUniqueOrThrow({
    where: { id: billId },
    include: { supplier: { select: { name: true } }, items: { select: { subCategoryId: true } } },
  });
  const existing = await tx.expense.findUnique({ where: { billId }, select: { id: true } });

  if (bill.deletedAt || bill.status !== 'POSTED') {
    if (existing) await tx.expense.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    return;
  }

  const subCategoryIds = Array.from(new Set(bill.items.map((i) => i.subCategoryId)));
  const status = EXPENSE_STATUS_FOR_BILL[bill.paymentStatus] || 'PENDING';
  const data = {
    categoryId: bill.categoryId,
    subCategoryId: subCategoryIds.length === 1 ? subCategoryIds[0] : null,
    vendor: bill.supplier.name,
    expenseDate: bill.invoiceDate,
    amount: bill.payableAmount,
    currencyCode: 'INR', // bills carry Indian GST/TDS — always INR
    exchangeRate: 1,
    paymentMethod: bill.paymentMethod || 'OTHER',
    status,
    paidDate: status === 'PAID' ? bill.paidDate ?? new Date() : null,
    referenceNumber: bill.invoiceNumber,
    attachmentUrl: bill.attachmentUrl,
    attachmentName: bill.attachmentName,
    notes: `${bill.billNumber}${bill.notes ? ` — ${bill.notes}` : ''}`,
    source: 'BILL',
    deletedAt: null,
  };

  if (existing) {
    await tx.expense.update({ where: { id: existing.id }, data });
  } else {
    await tx.expense.create({ data: { ...data, billId, expenseNumber: await nextExpenseNumber(tx), recordedById: performedById } });
  }
}

export class BillValidationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const num = (v: unknown) => (v === undefined || v === null || v === '' ? 0 : Number(v));

// Validates a create/update request body and returns the rows to write.
// Throws BillValidationError (message shown to the user) on bad input.
// Line-item GST type is snapshotted from the sub-category; TDS % defaults
// to the sub-category's own rate when the line leaves it blank.
export async function parseBillInput(tx: Client, body: any) {
  if (!BILL_TYPES.includes(body.billType)) throw new BillValidationError('Bill type must be Sub-Contractor or Material/Goods');
  if (!body.supplierId) throw new BillValidationError('Vendor is required');
  if (!body.invoiceNumber || !String(body.invoiceNumber).trim()) throw new BillValidationError('Invoice number is required');
  if (!body.invoiceDate || Number.isNaN(new Date(body.invoiceDate).getTime())) throw new BillValidationError('Invoice date is required');
  if (!body.categoryId) throw new BillValidationError('Category is required');
  if (!Array.isArray(body.items) || body.items.length === 0) throw new BillValidationError('Add at least one line item');

  const supplier = await tx.supplier.findUnique({ where: { id: parseInt(body.supplierId) } });
  if (!supplier) throw new BillValidationError('Vendor not found', 404);
  const category = await tx.expenseCategory.findUnique({ where: { id: parseInt(body.categoryId) }, include: { subCategories: true } });
  if (!category) throw new BillValidationError('Category not found', 404);
  const subCategories = new Map(category.subCategories.map((s) => [s.id, s]));

  const items = body.items.map((raw: any, idx: number) => {
    const line = `Line ${idx + 1}`;
    const sub = subCategories.get(parseInt(raw.subCategoryId));
    if (!sub) throw new BillValidationError(`${line}: select a sub-category of "${category.name}"`);
    if (!raw.description || !String(raw.description).trim()) throw new BillValidationError(`${line}: item description is required`);
    const itemValue = num(raw.itemValue);
    if (!Number.isFinite(itemValue) || itemValue <= 0) throw new BillValidationError(`${line}: item value must be greater than 0`);
    const cgstRate = num(raw.cgstRate), sgstRate = num(raw.sgstRate), igstRate = num(raw.igstRate);
    for (const r of [cgstRate, sgstRate, igstRate]) {
      if (!Number.isFinite(r) || r < 0 || r > 100) throw new BillValidationError(`${line}: GST rates must be between 0 and 100`);
    }
    if (igstRate > 0 && (cgstRate > 0 || sgstRate > 0)) throw new BillValidationError(`${line}: use either CGST+SGST (intra-state) or IGST (inter-state), not both`);
    const tdsPercent = raw.tdsPercent === undefined || raw.tdsPercent === null || raw.tdsPercent === ''
      ? (sub.tdsApplicable ? Number(sub.tdsPercent) : 0)
      : num(raw.tdsPercent);
    if (!Number.isFinite(tdsPercent) || tdsPercent < 0 || tdsPercent > 100) throw new BillValidationError(`${line}: TDS % must be between 0 and 100`);

    const c = computeBillItem({ itemValue, cgstRate, sgstRate, igstRate, tdsPercent });
    return {
      subCategoryId: sub.id,
      description: String(raw.description).trim(),
      cgstRate, sgstRate, igstRate, tdsPercent,
      gstType: sub.gstType,
      ...c,
      sortOrder: idx,
    };
  });

  const totals = computeBillTotals(items);
  return {
    supplier,
    category,
    bill: {
      billType: body.billType as string,
      supplierId: supplier.id,
      invoiceNumber: String(body.invoiceNumber).trim(),
      invoiceDate: new Date(body.invoiceDate),
      categoryId: category.id,
      attachmentUrl: body.attachmentUrl || null,
      attachmentName: body.attachmentName || null,
      notes: body.notes || null,
      ...totals,
    },
    items,
  };
}

// FR-14: warn (not block) when the same vendor already has a bill with this
// invoice number — the caller re-submits with allowDuplicate to proceed.
export async function findDuplicateBill(tx: Client, supplierId: number, invoiceNumber: string, excludeId?: number) {
  return tx.bill.findFirst({
    where: { supplierId, invoiceNumber: { equals: invoiceNumber, mode: 'insensitive' }, deletedAt: null, ...(excludeId && { id: { not: excludeId } }) },
    select: { id: true, billNumber: true },
  });
}
