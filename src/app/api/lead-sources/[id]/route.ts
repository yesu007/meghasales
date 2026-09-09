import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_lead_sources');
  if (denied) return denied;
  try {
    const source = await prisma.leadSource.findUnique({ where: { id: parseInt(params.id) } });
    if (!source) return NextResponse.json({ message: 'Source not found' }, { status: 404 });
    return NextResponse.json(source);
  } catch (error) {
    console.error('GET /api/lead-sources/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_lead_sources');
  if (denied) return denied;
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.leadSource.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Source not found' }, { status: 404 });

    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json({ message: 'Source name cannot be empty' }, { status: 400 });
    }

    // No separate Code field/input anywhere — code always mirrors name
    // (see the Lead Sources form's own comment), so an edit that changes
    // the name keeps code in sync automatically. Same as POST's own
    // name->code derivation.
    // NOTE: unlike Vertical/Package, `code` here is literally what
    // Lead.leadSource stores (see the LeadSource model's own comment) —
    // renaming an existing, already-in-use source does not update
    // historical Lead rows, which will keep the old code value and no
    // longer resolve to any LeadSource row. Accepted tradeoff of syncing
    // code to name at all; doesn't apply to a brand-new/never-used source.
    const trimmedName = body.name !== undefined ? String(body.name).trim() : undefined;

    const source = await prisma.leadSource.update({
      where: { id },
      data: {
        ...(trimmedName !== undefined && { name: trimmedName, code: trimmedName }),
        ...(body.sortOrder !== undefined && { sortOrder: Number(body.sortOrder) }),
        ...(body.isActive !== undefined && { isActive: !!body.isActive }),
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'LEAD_SOURCE', entityId: id, oldValue: existing, newValue: source, description: `Lead source "${source.name}" updated`, request });

    return NextResponse.json(source);
  } catch (error: any) {
    if (error.code === 'P2002') {
      // code always mirrors name, so a conflict on either constraint is
      // the same underlying clash from the user's POV.
      return NextResponse.json({ message: 'A source with that name already exists' }, { status: 409 });
    }
    console.error('PATCH /api/lead-sources/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update source' }, { status: 400 });
  }
}

// Soft-delete (isActive = false), same convention as Vertical/Package — a
// source can already be referenced by existing Lead rows (leadSource is a
// plain string, not an FK, so nothing breaks either way, but deactivating
// keeps the option visible/reversible from the admin screen instead of
// silently vanishing from history).
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_lead_sources');
  if (denied) return denied;
  try {
    const id = parseInt(params.id);
    const existing = await prisma.leadSource.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Source not found' }, { status: 404 });

    const source = await prisma.leadSource.update({ where: { id }, data: { isActive: false } });
    await logAudit({ action: 'DELETE', entityType: 'LEAD_SOURCE', entityId: id, oldValue: existing, description: `Lead source "${existing.name}" deleted`, request });

    return NextResponse.json(source);
  } catch (error) {
    console.error('DELETE /api/lead-sources/[id] error:', error);
    return NextResponse.json({ message: 'Failed to delete source' }, { status: 400 });
  }
}
