import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// name/module are never editable here — routes check permission.name as a
// string literal in code, so renaming one would silently break whatever it
// gates. Only the description (documentation only) can change.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_roles');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();

    const existing = await prisma.permission.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Permission not found' }, { status: 404 });

    const permission = await prisma.permission.update({
      where: { id },
      data: { description: body.description ?? null },
    });

    await logAudit({ action: 'UPDATE', entityType: 'PERMISSION', entityId: id, oldValue: existing, newValue: permission, description: `Permission updated: ${permission.name}`, request });

    return NextResponse.json(permission);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update permission' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_roles');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.permission.findUnique({
      where: { id },
      include: { _count: { select: { roles: true } } },
    });
    if (!existing) return NextResponse.json({ message: 'Permission not found' }, { status: 404 });

    if (existing._count.roles > 0) {
      return NextResponse.json(
        { message: `Cannot delete — this permission is still granted to ${existing._count.roles} role(s). Remove it from those roles first.` },
        { status: 409 }
      );
    }

    await prisma.permission.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'PERMISSION', entityId: id, oldValue: existing, description: `Permission deleted: ${existing.name}`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete permission' }, { status: 400 });
  }
}
