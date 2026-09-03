import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Full replace of one employee's vertical split, same convention as the
// matrix cell edits elsewhere in this app (Expense Budgets) — the grid
// always submits the complete row, so a category/vertical dropped back to
// 0% simply isn't sent rather than needing an explicit delete call.
export async function PATCH(request: NextRequest, { params }: { params: { employeeId: string } }) {
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  const employeeId = parseInt(params.employeeId);
  if (Number.isNaN(employeeId)) return NextResponse.json({ message: 'Invalid employeeId' }, { status: 400 });

  try {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return NextResponse.json({ message: 'Employee not found' }, { status: 404 });

    const body = await request.json();
    const allocations: { verticalId: number | null; percentage: number }[] = Array.isArray(body.allocations)
      ? body.allocations
          .map((a: any) => ({
            verticalId: a.verticalId === null || a.verticalId === undefined ? null : Number(a.verticalId),
            percentage: Number(a.percentage),
          }))
          .filter((a: { verticalId: number | null; percentage: number }) => a.percentage > 0)
      : [];

    await prisma.$transaction(async (tx) => {
      await tx.employeeVerticalAllocation.deleteMany({ where: { employeeId } });
      if (allocations.length > 0) {
        await tx.employeeVerticalAllocation.createMany({
          data: allocations.map((a) => ({ employeeId, verticalId: a.verticalId, percentage: a.percentage })),
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`PATCH /api/employee-vertical-allocations/${params.employeeId} error:`, error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
