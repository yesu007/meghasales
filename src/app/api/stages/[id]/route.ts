import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_stages');
  if (denied) return denied;
  try {
    const stage = await prisma.stage.findUnique({ where: { id: parseInt(params.id) } });
    if (!stage) return NextResponse.json({ message: 'Stage not found' }, { status: 404 });
    return NextResponse.json(stage);
  } catch (error) {
    console.error('GET /api/stages/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_stages');
  if (denied) return denied;
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.stage.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Stage not found' }, { status: 404 });

    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json({ message: 'Stage name cannot be empty' }, { status: 400 });
    }

    // No separate Code field/input anywhere — code always mirrors name
    // (see the Stages form's own comment), so an edit that changes the
    // name keeps code in sync automatically. Same as POST's own
    // name->code derivation. (Implementation.currentStage stores `name`,
    // not `code` — see the Stage model's own comment — so renaming an
    // in-use stage can still orphan historical Implementation rows the
    // same way it already could before this change; unrelated to code.)
    const trimmedName = body.name !== undefined ? String(body.name).trim() : undefined;

    const stage = await prisma.stage.update({
      where: { id },
      data: {
        ...(trimmedName !== undefined && { name: trimmedName, code: trimmedName }),
        ...(body.sortOrder !== undefined && { sortOrder: Number(body.sortOrder) }),
        ...(body.isActive !== undefined && { isActive: !!body.isActive }),
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'STAGE', entityId: id, oldValue: existing, newValue: stage, description: `Stage "${stage.name}" updated`, request });

    return NextResponse.json(stage);
  } catch (error: any) {
    if (error.code === 'P2002') {
      // code always mirrors name, so a conflict on either constraint is
      // the same underlying clash from the user's POV.
      return NextResponse.json({ message: 'A stage with that name already exists' }, { status: 409 });
    }
    console.error('PATCH /api/stages/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update stage' }, { status: 400 });
  }
}

// Soft-delete (isActive = false), same convention as Lead Source/Vertical/
// Package — a stage can already be referenced by existing Implementation
// rows (currentStage is a plain string, not an FK, so nothing breaks either
// way, but deactivating keeps the option visible/reversible from the admin
// screen instead of silently vanishing from history).
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_stages');
  if (denied) return denied;
  try {
    const id = parseInt(params.id);
    const existing = await prisma.stage.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Stage not found' }, { status: 404 });

    const stage = await prisma.stage.update({ where: { id }, data: { isActive: false } });
    await logAudit({ action: 'DELETE', entityType: 'STAGE', entityId: id, oldValue: existing, description: `Stage "${existing.name}" deleted`, request });

    return NextResponse.json(stage);
  } catch (error) {
    console.error('DELETE /api/stages/[id] error:', error);
    return NextResponse.json({ message: 'Failed to delete stage' }, { status: 400 });
  }
}
