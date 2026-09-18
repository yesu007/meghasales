import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { nextEmployeeCode } from '@/lib/payroll/employeeCode';
import { computeProbationEndDate, isProbationEmploymentType } from '@/lib/payroll/probationEngine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '10');

    const where = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { employeeCode: { contains: search, mode: 'insensitive' as const } },
              { department: { contains: search, mode: 'insensitive' as const } },
              { designation: { contains: search, mode: 'insensitive' as const } },
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [employees, totalElements] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: {
          manager: { select: { id: true, firstName: true, lastName: true } },
          vertical: { select: { id: true, name: true } },
          salaryAssignments: { where: { effectiveTo: null }, take: 1, include: { structure: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: page * size,
        take: size,
      }),
      prisma.employee.count({ where }),
    ]);

    const content = employees.map((e) => {
      const current = e.salaryAssignments[0];
      const { salaryAssignments, ...rest } = e;
      return {
        ...rest,
        userName: `${e.firstName} ${e.lastName}`,
        userEmail: e.email,
        hasLogin: e.userId != null,
        currentStructureName: current?.structure.name ?? null,
        currentCtcAnnual: current?.ctcAnnual ?? null,
      };
    });

    return NextResponse.json({
      content,
      page,
      size,
      totalElements,
      totalPages: Math.ceil(totalElements / size),
      last: (page + 1) * size >= totalElements,
    });
  } catch (error) {
    console.error('GET /api/payroll/employees error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Name and email are entered directly rather than picked from a dropdown
// of existing system Users — most staff need a payroll record without
// ever needing CRM login access. If the entered email happens to match
// an existing User's, that User is transparently linked (enabling this
// person's My Payslips/My Leave self-service); otherwise the employee is
// simply payroll-only, no login required.
export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const body = await request.json();
    const firstName = (body.firstName || '').trim();
    const lastName = (body.lastName || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    if (!firstName || !lastName || !email) {
      return NextResponse.json({ message: 'firstName, lastName, and email are required' }, { status: 400 });
    }

    const existingByEmail = await prisma.employee.findFirst({ where: { email } });
    if (existingByEmail) return NextResponse.json({ message: 'An employee with this email already exists' }, { status: 409 });

    const matchingUser = await prisma.user.findUnique({ where: { email } });
    if (matchingUser) {
      const alreadyLinked = await prisma.employee.findUnique({ where: { userId: matchingUser.id } });
      if (alreadyLinked) return NextResponse.json({ message: 'This email belongs to a system user who already has an employee profile' }, { status: 409 });
    }

    let managerId: number | null = null;
    if (body.managerId !== undefined && body.managerId !== '' && body.managerId !== null) {
      managerId = parseInt(body.managerId);
      const manager = await prisma.employee.findUnique({ where: { id: managerId } });
      if (!manager) return NextResponse.json({ message: 'Manager not found' }, { status: 400 });
    }

    let verticalId: number | null = null;
    if (body.verticalId !== undefined && body.verticalId !== '' && body.verticalId !== null) {
      verticalId = parseInt(body.verticalId);
      const vertical = await prisma.vertical.findUnique({ where: { id: verticalId } });
      if (!vertical) return NextResponse.json({ message: 'Vertical not found' }, { status: 400 });
    }

    const employmentType = body.employmentType || 'FULL_TIME';
    const dateOfJoining = body.dateOfJoining ? new Date(body.dateOfJoining) : null;

    // Probation Duration/End Date only ever apply to the PROBATION
    // employment type — left null (not merely unvalidated) for every
    // other type, same "forced null when the field doesn't apply" pattern
    // used for Annual Quota on non-Annual-Leave leave types. End Date
    // defaults to Date of Joining + Duration (computeProbationEndDate),
    // but an explicitly-submitted probationEndDate (the form's own
    // possibly-manually-edited value) always wins — the API never
    // silently overrides what the user actually saved.
    let probationDurationMonths: number | null = null;
    let probationEndDate: Date | null = null;
    if (isProbationEmploymentType(employmentType)) {
      if (body.probationDurationMonths !== undefined && body.probationDurationMonths !== '' && body.probationDurationMonths !== null) {
        probationDurationMonths = parseInt(body.probationDurationMonths, 10);
        if (!Number.isFinite(probationDurationMonths) || probationDurationMonths <= 0) {
          return NextResponse.json({ message: 'Probation Duration must be a positive number of months' }, { status: 400 });
        }
      }
      if (body.probationEndDate) {
        probationEndDate = new Date(body.probationEndDate);
      } else if (dateOfJoining && probationDurationMonths != null) {
        probationEndDate = computeProbationEndDate(dateOfJoining, probationDurationMonths);
      }
      if (probationEndDate && dateOfJoining && probationEndDate < dateOfJoining) {
        return NextResponse.json({ message: 'Probation End Date cannot be earlier than Date of Joining' }, { status: 400 });
      }
    }

    const employee = await prisma.$transaction(async (tx) => {
      const employeeCode = await nextEmployeeCode(tx);
      return tx.employee.create({
        data: {
          userId: matchingUser?.id ?? null,
          employeeCode,
          firstName,
          lastName,
          email,
          department: body.department || null,
          designation: body.designation || null,
          role: body.role || null,
          managerId,
          verticalId,
          dateOfJoining,
          employmentType,
          probationDurationMonths,
          probationEndDate,
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

    await logAudit({
      action: 'CREATE',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      newValue: employee,
      description: `Employee ${employee.employeeCode} (${firstName} ${lastName}) onboarded to payroll${matchingUser ? ' — linked to existing system user' : ''}`,
      request,
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/employees error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create employee' }, { status: 400 });
  }
}
