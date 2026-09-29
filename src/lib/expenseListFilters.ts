import { Prisma } from '@prisma/client';

// Expense list filters, shared by GET /api/expenses (the paginated list) and
// GET /api/expenses/export (the CSV report) so an export always contains
// exactly the records the list is showing for the same query string.
export function buildExpenseWhere(searchParams: URLSearchParams): Prisma.ExpenseWhereInput {
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '';
  const categoryId = searchParams.get('categoryId') || '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';

  const where: Prisma.ExpenseWhereInput = { deletedAt: null };
  const AND: Prisma.ExpenseWhereInput[] = [];

  if (search) {
    const searchTerm = search.trim();
    AND.push({
      OR: [
        { expenseNumber: { contains: searchTerm, mode: 'insensitive' } },
        { vendor: { contains: searchTerm, mode: 'insensitive' } },
        { referenceNumber: { contains: searchTerm, mode: 'insensitive' } },
      ],
    });
  }

  if (status) AND.push({ status: status.toUpperCase() });
  if (categoryId) AND.push({ categoryId: parseInt(categoryId) });
  const subCategoryId = searchParams.get('subCategoryId') || '';
  if (subCategoryId) AND.push({ subCategoryId: parseInt(subCategoryId) });
  // Source / Type filter: MANUAL | SALARY (payroll) | REIMBURSEMENT | BILL.
  const source = (searchParams.get('source') || '').toUpperCase();
  if (source) AND.push({ source });
  if (dateFrom) AND.push({ expenseDate: { gte: new Date(dateFrom) } });
  if (dateTo) AND.push({ expenseDate: { lte: new Date(dateTo) } });
  // Used by the Projects page's Budget vs Actual panel to total a single
  // project's actual expenses.
  const projectId = searchParams.get('projectId') || '';
  if (projectId) AND.push({ projectId: parseInt(projectId) });
  // Same, for a single Product's Product Expenses tab.
  const productId = searchParams.get('productId') || '';
  if (productId) AND.push({ productId: parseInt(productId) });
  // Overall / Project / Product Expenses list tabs — same three-way split
  // as the create form's own Expense Type toggle (both FKs null = Overall,
  // projectId set = Project, productId set = Product) and the Expense
  // Report's own projectOnly filter (see expenseReports.ts). OVERALL must
  // exclude Product Expenses too, or a Product-linked row (which has no
  // projectId) would wrongly count as Overall spend.
  // Reimbursement expenses stay out of the Project / Product tabs even when
  // the source claim is tagged to one — they're listed only under Overall.
  const expenseType = searchParams.get('expenseType') || '';
  if (expenseType === 'PROJECT') AND.push({ projectId: { not: null }, source: { not: 'REIMBURSEMENT' } });
  else if (expenseType === 'PRODUCT') AND.push({ productId: { not: null }, source: { not: 'REIMBURSEMENT' } });
  else if (expenseType === 'OVERALL') AND.push({ projectId: null, productId: null });

  if (AND.length > 0) where.AND = AND;
  return where;
}
