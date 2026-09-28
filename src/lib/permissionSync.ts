import { Prisma, PrismaClient } from '@prisma/client';
import { catalogPermissions, RETIRED_PERMISSIONS } from './permissionCatalog';

type Client = PrismaClient | Prisma.TransactionClient;

// Brings the permissions table in line with PERMISSION_CATALOG: upserts every
// catalog permission with its module/page/action, grants each new permission
// to every role holding one of its `from` permissions (so a split
// manage_x → create/edit/delete_x keeps each role's existing access), gives
// ADMIN every permission that didn't exist before this run (never
// re-granting one an administrator deliberately unticked — there is no
// ADMIN bypass), then removes the retired catch-all permissions.
// Idempotent. Used by prisma/seed.ts after its own (older) permission
// blocks; the split_manage_into_create_edit_delete migration does the same
// in SQL for existing databases.
export async function syncPermissionCatalog(client: Client): Promise<void> {
  const catalog = catalogPermissions();
  const existed = new Set((await client.permission.findMany({ select: { name: true } })).map((p) => p.name));

  for (const p of catalog) {
    await client.permission.upsert({
      where: { name: p.name },
      update: { module: p.module, page: p.page, action: p.action, sortOrder: p.sortOrder },
      create: { name: p.name, description: p.description, module: p.module, page: p.page, action: p.action, sortOrder: p.sortOrder },
    });
  }

  const byName = new Map((await client.permission.findMany({ select: { id: true, name: true } })).map((p) => [p.name, p.id]));
  for (const p of catalog) {
    if (!p.from?.length) continue;
    const sourceIds = p.from.map((n) => byName.get(n)).filter((id): id is number => id !== undefined);
    if (!sourceIds.length) continue;
    const holders = await client.rolePermission.findMany({ where: { permissionId: { in: sourceIds } }, select: { roleId: true }, distinct: ['roleId'] });
    if (holders.length) {
      await client.rolePermission.createMany({ data: holders.map((h) => ({ roleId: h.roleId, permissionId: byName.get(p.name)! })), skipDuplicates: true });
    }
  }

  const admin = await client.role.findUnique({ where: { name: 'ADMIN' } });
  const created = catalog.filter((p) => !existed.has(p.name));
  if (admin && created.length) {
    await client.rolePermission.createMany({ data: created.map((p) => ({ roleId: admin.id, permissionId: byName.get(p.name)! })), skipDuplicates: true });
  }

  const retiredIds = RETIRED_PERMISSIONS.map((n) => byName.get(n)).filter((id): id is number => id !== undefined);
  if (retiredIds.length) {
    await client.rolePermission.deleteMany({ where: { permissionId: { in: retiredIds } } });
    await client.permission.deleteMany({ where: { id: { in: retiredIds } } });
  }
}
