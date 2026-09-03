import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// PATCH replaces the resource's scalar fields and, when `splits` is
// present, its entire split set — a full replace rather than a per-category
// upsert, since the matrix UI always submits the complete row (including
// categories dropped back to 0%, which simply aren't sent) on every edit.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  const id = parseInt(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ message: 'Invalid id' }, { status: 400 });

  try {
    const body = await request.json();
    const existing = await prisma.salaryResource.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Resource not found' }, { status: 404 });

    const data: Record<string, any> = {};
    if (body.resourceType !== undefined) data.resourceType = String(body.resourceType).trim();
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.maxSalary !== undefined) data.maxSalary = body.maxSalary === '' || body.maxSalary === null ? null : Number(body.maxSalary);
    if (body.incrementProvision !== undefined) data.incrementProvision = body.incrementProvision === '' || body.incrementProvision === null ? null : Number(body.incrementProvision);
    if (body.remark !== undefined) data.remark = body.remark || null;
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    const resource = await prisma.$transaction(async (tx) => {
      const updated = await tx.salaryResource.update({ where: { id }, data });
      if (Array.isArray(body.splits)) {
        const splits = body.splits
          .map((s: any) => ({ categoryId: Number(s.categoryId), percentage: Number(s.percentage) }))
          .filter((s: { categoryId: number; percentage: number }) => Number.isFinite(s.categoryId) && s.percentage > 0);
        await tx.salaryAllocationSplit.deleteMany({ where: { resourceId: id } });
        if (splits.length > 0) {
          await tx.salaryAllocationSplit.createMany({ data: splits.map((s: { categoryId: number; percentage: number }) => ({ resourceId: id, categoryId: s.categoryId, percentage: s.percentage })) });
        }
      }
      return tx.salaryResource.findUnique({ where: { id }, include: { splits: true } });
    });

    return NextResponse.json(resource);
  } catch (error: any) {
    console.error(`PATCH /api/salary-resources/${params.id} error:`, error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Soft delete, same convention as Vertical/Project — a resource with
// history (splits, and eventually reports keyed off it) is deactivated
// rather than removed, so past figures never lose the row that produced
// them.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  const id = parseInt(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ message: 'Invalid id' }, { status: 400 });

  try {
    await prisma.salaryResource.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') return NextResponse.json({ message: 'Resource not found' }, { status: 404 });
    console.error(`DELETE /api/salary-resources/${params.id} error:`, error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
