import { Prisma, PrismaClient } from '@prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

export const ROLE_MANAGEMENT_LOCKOUT_MESSAGE =
  'This change would leave no active user able to view and edit roles — keep View and Edit on Roles & Permissions for at least one active user.';

// With no ADMIN bypass, unticking Roles → View/Edit on the last role that
// has them (or deactivating/deleting/re-roling the last user who holds
// them) would lock everyone out of permission management for good. Call
// inside the same transaction as the change, after applying it; throws so
// the transaction rolls back. `excludeUserId` treats that user as already
// gone (for a delete that hasn't run yet).
export async function assertRoleManagementRemains(client: Client, excludeUserId?: number): Promise<void> {
  const holds = (name: string): Prisma.UserWhereInput => ({ roles: { some: { role: { permissions: { some: { permission: { name } } } } } } });
  const remaining = await client.user.count({
    where: { isActive: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}), AND: [holds('view_roles'), holds('edit_roles')] },
  });
  if (remaining === 0) throw new Error(ROLE_MANAGEMENT_LOCKOUT_MESSAGE);
}
