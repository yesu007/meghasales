import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { allocationCheck, computeVerticalWeightage } from '@/lib/salaryAllocation';

export const dynamic = 'force-dynamic';

const COMPANY_WIDE = 'company-wide';

export async function GET() {
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  const today = new Date();

  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ department: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, designation: true, department: true },
  });
  const employeeIds = employees.map((e) => e.id);

  const [verticals, allocations, assignments] = await Promise.all([
    prisma.vertical.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { head: { select: { firstName: true, lastName: true } } },
    }),
    employeeIds.length
      ? prisma.employeeVerticalAllocation.findMany({ where: { employeeId: { in: employeeIds } } })
      : Promise.resolve([]),
    // Current CTC as of today — same "most recent assignment covering this
    // date" rule payroll's own run engine uses (see runService.ts). Fetched
    // once for every employee rather than N findFirst calls.
    employeeIds.length
      ? prisma.salaryStructureAssignment.findMany({
          where: { employeeId: { in: employeeIds }, effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] },
          orderBy: { effectiveFrom: 'desc' },
          select: { employeeId: true, ctcAnnual: true },
        })
      : Promise.resolve([]),
  ]);

  // First hit per employee wins — assignments are ordered most-recent-first.
  const currentCtcByEmployee = new Map<number, number>();
  for (const a of assignments) {
    if (!currentCtcByEmployee.has(a.employeeId)) currentCtcByEmployee.set(a.employeeId, Number(a.ctcAnnual));
  }

  const allocationsByEmployee = new Map<number, Map<string, number>>();
  for (const a of allocations) {
    const key = a.verticalId === null ? COMPANY_WIDE : String(a.verticalId);
    if (!allocationsByEmployee.has(a.employeeId)) allocationsByEmployee.set(a.employeeId, new Map());
    allocationsByEmployee.get(a.employeeId)!.set(key, Number(a.percentage));
  }

  const verticalKeys = [...verticals.map((v) => String(v.id)), COMPANY_WIDE];

  const employeeRows = employees.map((e) => {
    const ctc = currentCtcByEmployee.get(e.id);
    // Annual CTC on file, halved into the monthly figure every other money
    // column in this app already assumes — never re-entered here, so it can
    // never drift from what Payroll actually pays this person.
    const monthlySalary = ctc !== undefined ? ctc / 12 : null;
    const splitsMap = allocationsByEmployee.get(e.id) || new Map<string, number>();
    const totalAllocationPct = Array.from(splitsMap.values()).reduce((a, b) => a + b, 0);
    return {
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      designation: e.designation,
      department: e.department,
      monthlySalary,
      allocations: Object.fromEntries(splitsMap),
      totalAllocationPct,
      check: allocationCheck(totalAllocationPct),
    };
  });

  const totals = { monthlySalary: employeeRows.reduce((s, e) => s + (e.monthlySalary ?? 0), 0) };

  const weightage = computeVerticalWeightage(
    employeeRows.map((e) => ({
      monthlySalary: e.monthlySalary ?? 0,
      splits: Object.entries(e.allocations).map(([verticalKey, percentage]) => ({ verticalKey, percentage })),
    })),
    verticalKeys
  );

  return NextResponse.json({
    verticals: verticals.map((v) => ({ id: v.id, name: v.name, headName: v.head ? `${v.head.firstName} ${v.head.lastName}` : null })),
    employees: employeeRows,
    totals,
    weightage,
  });
}
