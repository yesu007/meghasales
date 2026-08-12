import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const structures = await prisma.salaryStructure.findMany({
      include: {
        components: { include: { component: true }, orderBy: { sortOrder: 'asc' } },
        _count: { select: { assignments: true } },
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(structures);
  } catch (error) {
    console.error('GET /api/payroll/structures error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

interface ComponentInput {
  componentId: number | string;
  value: number | string;
  sortOrder?: number;
}

export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.name) return NextResponse.json({ message: 'name is required' }, { status: 400 });
    const components: ComponentInput[] = Array.isArray(body.components) ? body.components : [];

    const structure = await prisma.$transaction(async (tx) => {
      const created = await tx.salaryStructure.create({
        data: { name: body.name, description: body.description || null },
      });
      if (components.length > 0) {
        await tx.salaryStructureComponent.createMany({
          data: components.map((c, i) => ({
            structureId: created.id,
            componentId: Number(c.componentId),
            value: Number(c.value),
            sortOrder: c.sortOrder ?? i,
          })),
        });
      }
      return tx.salaryStructure.findUniqueOrThrow({ where: { id: created.id }, include: { components: { include: { component: true } } } });
    });

    await logAudit({ action: 'CREATE', entityType: 'SALARY_STRUCTURE', entityId: structure.id, newValue: structure, description: `Salary structure "${structure.name}" created`, request });

    return NextResponse.json(structure, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A structure with that name already exists' }, { status: 409 });
    }
    console.error('POST /api/payroll/structures error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create salary structure' }, { status: 400 });
  }
}
