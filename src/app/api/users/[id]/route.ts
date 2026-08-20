import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logAudit } from '@/lib/audit';
import { requireAnyPermission, requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAnyPermission(['view_users', 'manage_users']);
  if (denied) return denied;

  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(params.id) },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        roles: { include: { role: { select: { id: true, name: true } } } },
      },
    });
    if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });
    return NextResponse.json({ ...user, roles: user.roles.map((ur) => ur.role) });
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_users');
  if (denied) return denied;

  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
    if (!existing) return NextResponse.json({ message: 'User not found' }, { status: 404 });

    const data: any = {};
    if (body.firstName !== undefined) data.firstName = body.firstName;
    if (body.lastName !== undefined) data.lastName = body.lastName;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.email !== undefined) data.email = body.email;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.password) data.password = await bcrypt.hash(body.password, 10);

    const roleIds: number[] | undefined = Array.isArray(body.roleIds) ? body.roleIds.map((rid: any) => parseInt(rid)) : undefined;
    if (roleIds !== undefined && roleIds.length === 0) {
      return NextResponse.json({ message: 'A user must have at least one role' }, { status: 400 });
    }

    const user = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });

      if (roleIds !== undefined) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) });
      }

      return tx.user.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
          createdAt: true,
          roles: { include: { role: { select: { id: true, name: true } } } },
        },
      });
    });

    const responseUser = { ...user, roles: user.roles.map((ur) => ur.role) };
    await logAudit({ action: 'UPDATE', entityType: 'USER', entityId: id, oldValue: existing, newValue: responseUser, description: `User updated: ${user.email}`, request });

    return NextResponse.json(responseUser);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update user' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_users');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true, createdAt: true },
    });
    if (!existing) return NextResponse.json({ message: 'User not found' }, { status: 404 });

    // UserRole rows cascade-delete with the user (onDelete: Cascade in schema).
    await prisma.user.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'USER', entityId: id, oldValue: existing, description: `User deleted: ${existing.email}`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete user' }, { status: 400 });
  }
}
