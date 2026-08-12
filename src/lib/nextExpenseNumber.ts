// Atomic expense number generator, backed by the `expense_number_seq`
// Postgres sequence (see prisma/migrations/20260812174441_add_expenses).
// Same reasoning as nextInvoiceNumber() in src/lib/invoiceFromQuotation.ts:
// a count()-based scheme races under concurrent creation, nextval() can't
// collide across concurrent transactions.
export async function nextExpenseNumber(client: { $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: any[]) => Promise<T> }) {
  const [{ nextval }] = await client.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('expense_number_seq') AS nextval`;
  return `EXP-${String(nextval).padStart(5, '0')}`;
}
