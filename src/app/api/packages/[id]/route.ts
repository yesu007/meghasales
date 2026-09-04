import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_packages');
  if (denied) return denied;
  try {
    const pkg = await prisma.package.findUnique({ where: { id: parseInt(params.id) } });
    if (!pkg) return NextResponse.json({ message: 'Package not found' }, { status: 404 });
    return NextResponse.json(pkg);
  } catch (error) {
    console.error('GET /api/packages/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_packages');
  if (denied) return denied;
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.package.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Package not found' }, { status: 404 });

    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json({ message: 'Package name cannot be empty' }, { status: 400 });
    }

    // No separate Code field/input anywhere — code always mirrors name
    // (see the Package form's own comment), so an edit that changes the
    // name keeps code in sync automatically. Same as POST's own
    // name->code derivation.
    const trimmedName = body.name !== undefined ? String(body.name).trim() : undefined;

    const pkg = await prisma.package.update({
      where: { id },
      data: {
        ...(trimmedName !== undefined && { name: trimmedName, code: trimmedName }),
        ...(body.sortOrder !== undefined && { sortOrder: Number(body.sortOrder) }),
        ...(body.isActive !== undefined && { isActive: !!body.isActive }),
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'PACKAGE', entityId: id, oldValue: existing, newValue: pkg, description: `Package "${pkg.name}" updated`, request });

    return NextResponse.json(pkg);
  } catch (error: any) {
    if (error.code === 'P2002') {
      // code always mirrors name, so a conflict on either constraint is
      // the same underlying clash from the user's POV.
      return NextResponse.json({ message: 'A package with that name already exists' }, { status: 409 });
    }
    console.error('PATCH /api/packages/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update package' }, { status: 400 });
  }
}

// Soft-delete (isActive = false), same convention as Vertical — a package
// can already be referenced by a Demo (packageId is ON DELETE SET NULL, not
// CASCADE, but a hard delete would still silently blank out that demo's
// package). Deactivating instead keeps every existing reference intact and
// readable, and is fully reversible from the same screen (Edit -> Reactivate).
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_packages');
  if (denied) return denied;
  try {
    const id = parseInt(params.id);
    const existing = await prisma.package.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Package not found' }, { status: 404 });

    const pkg = await prisma.package.update({ where: { id }, data: { isActive: false } });
    await logAudit({ action: 'DELETE', entityType: 'PACKAGE', entityId: id, oldValue: existing, description: `Package "${existing.name}" deleted`, request });

    return NextResponse.json(pkg);
  } catch (error) {
    console.error('DELETE /api/packages/[id] error:', error);
    return NextResponse.json({ message: 'Failed to delete package' }, { status: 400 });
  }
}
