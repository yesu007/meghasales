import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { dayRateFromAnnualCtc } from '@/lib/quotationResourceCosting';

export const dynamic = 'force-dynamic';

// Employee day-rates for the Quotation Calculator's Resources autocomplete.
// Gated on manage_quotations (not view_payroll) since it's serving the
// quotation-costing feature, not payroll browsing — and deliberately
// returns only name/designation/department plus a *derived* day rate, never
// the underlying annual CTC itself, so a quotation creator can look up a
// realistic billing rate for a colleague without being able to see anyone's
// actual salary.
export async function GET(request: NextRequest) {
  const denied = await requirePermission('manage_quotations');
  if (denied) return denied;

  try {
    const employees = await prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        designation: true,
        department: true,
        salaryAssignments: {
          where: { effectiveTo: null },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          select: { ctcAnnual: true },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const content = employees.map((e) => {
      const ctcAnnual = e.salaryAssignments[0]?.ctcAnnual ? Number(e.salaryAssignments[0].ctcAnnual) : null;
      return {
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        employeeCode: e.employeeCode,
        designation: e.designation,
        department: e.department,
        dayRate: ctcAnnual != null ? dayRateFromAnnualCtc(ctcAnnual) : null,
      };
    });

    return NextResponse.json(content);
  } catch (error) {
    console.error('GET /api/quotations/resource-employees error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
