import { Prisma, PrismaClient } from '@prisma/client';

type Client = Prisma.TransactionClient | PrismaClient;

// Validates a Reimbursement's Sub Category against its Category — shared by
// create (POST .../mine) and edit (PATCH .../mine/[id]) so both apply the
// same rule. Mirrors Finance's Expenses form: the Sub Category must be one
// of the selected Category's own (ExpenseSubCategory.categoryId) and still
// active, and it's required only when that Category actually has active
// sub-categories to pick from — a category with none leaves it null.
export async function resolveClaimSubCategory(
  tx: Client,
  categoryId: number,
  subCategoryId: unknown
): Promise<{ subCategoryId: number | null } | { error: string }> {
  if (subCategoryId !== undefined && subCategoryId !== null && subCategoryId !== '') {
    const subCategory = await tx.expenseSubCategory.findUnique({ where: { id: Number(subCategoryId) } });
    if (!subCategory || !subCategory.isActive || subCategory.categoryId !== categoryId) {
      return { error: 'Selected sub category does not belong to the selected category' };
    }
    return { subCategoryId: subCategory.id };
  }

  const available = await tx.expenseSubCategory.count({ where: { categoryId, isActive: true } });
  if (available > 0) return { error: 'Sub category is required for the selected category' };
  return { subCategoryId: null };
}
