import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const structure = await prisma.salaryStructure.findUnique({
      where: { id },
      include: { components: { include: { component: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!structure) return NextResponse.json({ message: 'Salary structure not found' }, { status: 404 });
    return NextResponse.json(structure);
  } catch (error) {
    console.error('GET /api/payroll/structures/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

interface ComponentInput {
  componentId: number | string;
  value: number | string;
  sortOrder?: number;
}

// When `components` is included in the body, it replaces the structure's
// full component set (delete + recreate inside one transaction) rather
// than patching individual rows — the join table is small and this stays
// simple; existing SalaryStructureAssignments aren't affected since they
// only reference the structure, not its component rows, by id.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.salaryStructure.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Salary structure not found' }, { status: 404 });

    const body = await request.json();
    const components: ComponentInput[] | undefined = Array.isArray(body.components) ? body.components : undefined;

    const structure = await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      for (const field of ['name', 'description', 'isActive'] as const) {
        if (body[field] !== undefined) data[field] = body[field];
      }
      if (Object.keys(data).length > 0) {
        await tx.salaryStructure.update({ where: { id }, data });
      }
      if (components) {
        await tx.salaryStructureComponent.deleteMany({ where: { structureId: id } });
        if (components.length > 0) {
          await tx.salaryStructureComponent.createMany({
            data: components.map((c, i) => ({
              structureId: id,
              componentId: Number(c.componentId),
              value: Number(c.value),
              sortOrder: c.sortOrder ?? i,
            })),
          });
        }
      }
      return tx.salaryStructure.findUniqueOrThrow({ where: { id }, include: { components: { include: { component: true }, orderBy: { sortOrder: 'asc' } } } });
    });

    await logAudit({ action: 'UPDATE', entityType: 'SALARY_STRUCTURE', entityId: structure.id, oldValue: existing, newValue: structure, description: `Salary structure "${structure.name}" updated`, request });

    return NextResponse.json(structure);
  } catch (error: any) {
    console.error('PATCH /api/payroll/structures/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update salary structure' }, { status: 400 });
  }
}
