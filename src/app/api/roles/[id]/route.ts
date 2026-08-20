import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requireAnyPermission, requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAnyPermission(['view_roles', 'manage_roles', 'view_users', 'manage_users']);
  if (denied) return denied;

  try {
    const role = await prisma.role.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        permissions: { include: { permission: true } },
        users: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
    });
    if (!role) return NextResponse.json({ message: 'Role not found' }, { status: 404 });

    return NextResponse.json({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((rp) => ({ id: rp.permission.id, name: rp.permission.name, module: rp.permission.module })),
      users: role.users.map((ur) => ur.user),
    });
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_roles');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();

    const existing = await prisma.role.findUnique({ where: { id }, include: { permissions: true } });
    if (!existing) return NextResponse.json({ message: 'Role not found' }, { status: 404 });

    const permissionIds: number[] | undefined = Array.isArray(body.permissionIds)
      ? body.permissionIds.map((pid: any) => parseInt(pid))
      : undefined;

    const role = await prisma.$transaction(async (tx) => {
      const updated = await tx.role.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
        },
      });

      // Full replace of the permission set, rather than a diff — the UI
      // always submits the complete desired set from its checkbox matrix.
      if (permissionIds !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })) });
        }
      }

      return tx.role.findUniqueOrThrow({ where: { id }, include: { permissions: { include: { permission: true } } } });
    });

    // Flattened to the same { id, name, module } shape GET /api/roles uses,
    // rather than the raw RolePermission join rows.
    const responseRole = { ...role, permissions: role.permissions.map((rp) => rp.permission) };

    await logAudit({ action: 'UPDATE', entityType: 'ROLE', entityId: id, oldValue: existing, newValue: responseRole, description: `Role updated: ${role.name}`, request });

    return NextResponse.json(responseRole);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update role' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_roles');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!existing) return NextResponse.json({ message: 'Role not found' }, { status: 404 });

    if (existing._count.users > 0) {
      return NextResponse.json(
        { message: `Cannot delete — ${existing._count.users} user(s) still have this role. Reassign them first.` },
        { status: 409 }
      );
    }

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      prisma.role.delete({ where: { id } }),
    ]);
    await logAudit({ action: 'DELETE', entityType: 'ROLE', entityId: id, oldValue: existing, description: `Role deleted: ${existing.name}`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete role' }, { status: 400 });
  }
}
