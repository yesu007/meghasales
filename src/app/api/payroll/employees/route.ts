import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { nextEmployeeCode } from '@/lib/payroll/employeeCode';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';

    const employees = await prisma.employee.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { employeeCode: { contains: search, mode: 'insensitive' } },
                { department: { contains: search, mode: 'insensitive' } },
                { designation: { contains: search, mode: 'insensitive' } },
                { user: { firstName: { contains: search, mode: 'insensitive' } } },
                { user: { lastName: { contains: search, mode: 'insensitive' } } },
                { user: { email: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        salaryAssignments: { where: { effectiveTo: null }, take: 1, include: { structure: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const content = employees.map((e) => {
      const current = e.salaryAssignments[0];
      const { salaryAssignments, ...rest } = e;
      return {
        ...rest,
        userName: `${e.user.firstName} ${e.user.lastName}`,
        userEmail: e.user.email,
        currentStructureName: current?.structure.name ?? null,
        currentCtcAnnual: current?.ctcAnnual ?? null,
      };
    });

    return NextResponse.json({ content, totalElements: content.length });
  } catch (error) {
    console.error('GET /api/payroll/employees error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.userId) {
      return NextResponse.json({ message: 'userId is required' }, { status: 400 });
    }

    const userId = Number(body.userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });

    const existing = await prisma.employee.findUnique({ where: { userId } });
    if (existing) return NextResponse.json({ message: 'This user already has an employee profile' }, { status: 409 });

    const employee = await prisma.$transaction(async (tx) => {
      const employeeCode = await nextEmployeeCode(tx);
      return tx.employee.create({
        data: {
          userId,
          employeeCode,
          department: body.department || null,
          designation: body.designation || null,
          dateOfJoining: body.dateOfJoining ? new Date(body.dateOfJoining) : null,
          employmentType: body.employmentType || 'FULL_TIME',
          panNumber: body.panNumber || null,
          uanNumber: body.uanNumber || null,
          esicNumber: body.esicNumber || null,
          bankAccountNumber: body.bankAccountNumber || null,
          bankIfsc: body.bankIfsc || null,
          bankAccountHolder: body.bankAccountHolder || null,
          bankName: body.bankName || null,
          taxRegime: body.taxRegime || 'NEW',
          pfApplicable: body.pfApplicable ?? true,
          esiApplicable: body.esiApplicable ?? false,
          ptApplicable: body.ptApplicable ?? true,
        },
      });
    });

    await logAudit({ action: 'CREATE', entityType: 'EMPLOYEE', entityId: employee.id, newValue: employee, description: `Employee ${employee.employeeCode} (${user.firstName} ${user.lastName}) onboarded to payroll`, request });

    return NextResponse.json(employee, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/employees error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create employee' }, { status: 400 });
  }
}
