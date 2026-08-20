import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requireAnyPermission, requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// view_users/manage_users can also list roles — the Users page's role
// multi-select needs this list too, and a user manager isn't necessarily a
// role manager.
export async function GET() {
  const denied = await requireAnyPermission(['view_roles', 'manage_roles', 'view_users', 'manage_users']);
  if (denied) return denied;

  try {
    const roles = await prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });

    const content = roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      userCount: role._count.users,
      permissions: role.permissions.map((rp) => ({ id: rp.permission.id, name: rp.permission.name, module: rp.permission.module })),
    }));

    return NextResponse.json(content);
  } catch (error) {
    console.error('GET /api/roles error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_roles');
  if (denied) return denied;

  try {
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json({ message: 'name is required' }, { status: 400 });
    }

    const existing = await prisma.role.findUnique({ where: { name: body.name } });
    if (existing) {
      return NextResponse.json({ message: 'A role with this name already exists' }, { status: 409 });
    }

    const permissionIds: number[] = Array.isArray(body.permissionIds) ? body.permissionIds.map((id: any) => parseInt(id)) : [];

    const role = await prisma.role.create({
      data: {
        name: body.name,
        description: body.description || null,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
      include: { permissions: { include: { permission: true } } },
    });

    // Flattened to the same { id, name, module } shape GET /api/roles uses,
    // rather than the raw RolePermission join rows.
    const responseRole = { ...role, permissions: role.permissions.map((rp) => rp.permission) };

    await logAudit({ action: 'CREATE', entityType: 'ROLE', entityId: role.id, newValue: responseRole, description: `Role created: ${role.name}`, request });

    return NextResponse.json(responseRole, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/roles error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create role' }, { status: 400 });
  }
}
