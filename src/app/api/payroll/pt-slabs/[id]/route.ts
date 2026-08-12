import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// Slabs are never edited in place once relied upon — a rate change adds a
// new slab and deactivates the old one (toggled here), so a payslip
// already generated under the old rate stays explainable rather than
// silently drifting if someone edits a slab's amount after the fact.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.ptSlab.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'PT slab not found' }, { status: 404 });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    const slab = await prisma.ptSlab.update({ where: { id }, data });
    await logAudit({ action: 'UPDATE', entityType: 'PT_SLAB', entityId: slab.id, oldValue: existing, newValue: slab, description: `PT slab ${slab.id} ${slab.isActive ? 'activated' : 'deactivated'}`, request });

    return NextResponse.json(slab);
  } catch (error: any) {
    console.error('PATCH /api/payroll/pt-slabs/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update PT slab' }, { status: 400 });
  }
}
