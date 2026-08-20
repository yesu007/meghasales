import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requirePermission('manage_roles');
  if (denied) return denied;

  try {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json(permissions);
  } catch (error) {
    console.error('GET /api/permissions error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Lets an admin define a brand-new permission string from the Roles UI.
// Note: creating one here only makes it assignable to a role — it has no
// effect until a route in code actually calls requirePermission() with this
// exact name.
export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_roles');
  if (denied) return denied;

  try {
    const body = await request.json();

    if (!body.name || !body.module) {
      return NextResponse.json({ message: 'name and module are required' }, { status: 400 });
    }

    const existing = await prisma.permission.findUnique({ where: { name: body.name } });
    if (existing) {
      return NextResponse.json({ message: 'A permission with this name already exists' }, { status: 409 });
    }

    const permission = await prisma.permission.create({
      data: { name: body.name, module: body.module, description: body.description || null },
    });

    await logAudit({ action: 'CREATE', entityType: 'PERMISSION', entityId: permission.id, newValue: permission, description: `Permission created: ${permission.name}`, request });

    return NextResponse.json(permission, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/permissions error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create permission' }, { status: 400 });
  }
}
