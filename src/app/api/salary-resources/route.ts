import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { salaryAfterIncrement, allocationCheck, computeCategoryWeightage } from '@/lib/salaryAllocation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get('includeInactive') === 'true';

  const [categories, resources] = await Promise.all([
    prisma.allocationCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.salaryResource.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { splits: { select: { categoryId: true, percentage: true } } },
    }),
  ]);

  const rows = resources.map((r) => {
    const maxSalary = r.maxSalary === null ? null : Number(r.maxSalary);
    const incrementProvision = r.incrementProvision === null ? null : Number(r.incrementProvision);
    const afterIncrement = salaryAfterIncrement(maxSalary, incrementProvision);
    const splitsByCode: Record<string, number> = {};
    let totalAllocationPct = 0;
    for (const s of r.splits) {
      const cat = categories.find((c) => c.id === s.categoryId);
      const pct = Number(s.percentage);
      if (cat) splitsByCode[cat.code] = pct;
      totalAllocationPct += pct;
    }
    return {
      id: r.id,
      resourceType: r.resourceType,
      name: r.name,
      maxSalary,
      incrementProvision,
      salaryAfterIncrement: afterIncrement,
      remark: r.remark,
      sortOrder: r.sortOrder,
      splits: splitsByCode,
      totalAllocationPct,
      check: allocationCheck(totalAllocationPct),
    };
  });

  const totals = resources.reduce(
    (acc, r) => {
      acc.maxSalary += r.maxSalary === null ? 0 : Number(r.maxSalary);
      acc.incrementProvision += r.incrementProvision === null ? 0 : Number(r.incrementProvision);
      acc.salaryAfterIncrement += salaryAfterIncrement(
        r.maxSalary === null ? null : Number(r.maxSalary),
        r.incrementProvision === null ? null : Number(r.incrementProvision)
      );
      return acc;
    },
    { maxSalary: 0, incrementProvision: 0, salaryAfterIncrement: 0 }
  );

  const weightage = computeCategoryWeightage(
    resources.map((r) => ({
      salaryAfterIncrement: salaryAfterIncrement(
        r.maxSalary === null ? null : Number(r.maxSalary),
        r.incrementProvision === null ? null : Number(r.incrementProvision)
      ),
      splits: r.splits.map((s) => ({ categoryId: s.categoryId, percentage: Number(s.percentage) })),
    })),
    categories
  );

  return NextResponse.json({ categories, resources: rows, totals, weightage });
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.resourceType || !String(body.resourceType).trim()) {
      return NextResponse.json({ message: 'Resource type is required' }, { status: 400 });
    }
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ message: 'Name is required' }, { status: 400 });
    }
    const splits: { categoryId: number; percentage: number }[] = Array.isArray(body.splits)
      ? body.splits
          .map((s: any) => ({ categoryId: Number(s.categoryId), percentage: Number(s.percentage) }))
          .filter((s: { categoryId: number; percentage: number }) => Number.isFinite(s.categoryId) && s.percentage > 0)
      : [];

    const maxSort = await prisma.salaryResource.aggregate({ _max: { sortOrder: true } });

    const resource = await prisma.salaryResource.create({
      data: {
        resourceType: String(body.resourceType).trim(),
        name: String(body.name).trim(),
        maxSalary: body.maxSalary === '' || body.maxSalary === undefined || body.maxSalary === null ? null : Number(body.maxSalary),
        incrementProvision: body.incrementProvision === '' || body.incrementProvision === undefined || body.incrementProvision === null ? null : Number(body.incrementProvision),
        remark: body.remark || null,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        splits: { create: splits },
      },
      include: { splits: true },
    });
    return NextResponse.json(resource, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/salary-resources error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
