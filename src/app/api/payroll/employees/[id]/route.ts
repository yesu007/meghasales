import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { isProbationEmploymentType } from '@/lib/payroll/probationEngine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        user: { select: { phone: true } }, // only for a linked login's phone — name/email live on Employee itself
        manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        vertical: { select: { id: true, name: true, code: true } },
        salaryAssignments: {
          orderBy: { effectiveFrom: 'desc' },
          include: { structure: { select: { id: true, name: true } } },
        },
      },
    });
    if (!employee) return NextResponse.json({ message: 'Employee not found' }, { status: 404 });
    return NextResponse.json(employee);
  } catch (error) {
    console.error('GET /api/payroll/employees/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

const EDITABLE_FIELDS = [
  'firstName', 'lastName', 'department', 'designation', 'role', 'employmentType', 'panNumber', 'uanNumber', 'esicNumber',
  'bankAccountNumber', 'bankIfsc', 'bankAccountHolder', 'bankName', 'taxRegime',
  'pfApplicable', 'esiApplicable', 'ptApplicable', 'status', 'timesheetStatus',
] as const;
const DATE_FIELDS = ['dateOfJoining', 'dateOfLeaving', 'probationEndDate'] as const;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Employee not found' }, { status: 404 });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) data[field] = body[field] === '' ? null : body[field];
    }
    for (const field of DATE_FIELDS) {
      if (body[field] !== undefined) data[field] = body[field] ? new Date(body[field]) : null;
    }
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!email) return NextResponse.json({ message: 'email cannot be empty' }, { status: 400 });
      if (email !== existing.email) {
        const conflict = await prisma.employee.findFirst({ where: { email, id: { not: id } } });
        if (conflict) return NextResponse.json({ message: 'Another employee already uses this email' }, { status: 409 });
      }
      data.email = email;
    }
    if (body.managerId !== undefined) {
      const managerId = body.managerId === '' || body.managerId === null ? null : parseInt(body.managerId);
      if (managerId !== null) {
        if (managerId === id) return NextResponse.json({ message: 'An employee cannot be their own manager' }, { status: 400 });
        const manager = await prisma.employee.findUnique({ where: { id: managerId } });
        if (!manager) return NextResponse.json({ message: 'Manager not found' }, { status: 400 });
      }
      data.managerId = managerId;
    }
    if (body.verticalId !== undefined) {
      const verticalId = body.verticalId === '' || body.verticalId === null ? null : parseInt(body.verticalId);
      if (verticalId !== null) {
        const vertical = await prisma.vertical.findUnique({ where: { id: verticalId } });
        if (!vertical) return NextResponse.json({ message: 'Vertical not found' }, { status: 400 });
      }
      data.verticalId = verticalId;
    }
    // Needs int parsing + a positive-number check, so handled separately
    // from the generic EDITABLE_FIELDS pass-through above.
    if (body.probationDurationMonths !== undefined) {
      if (body.probationDurationMonths === '' || body.probationDurationMonths === null) {
        data.probationDurationMonths = null;
      } else {
        const months = parseInt(body.probationDurationMonths, 10);
        if (!Number.isFinite(months) || months <= 0) {
          return NextResponse.json({ message: 'Probation Duration must be a positive number of months' }, { status: 400 });
        }
        data.probationDurationMonths = months;
      }
    }

    // Probation Duration/End Date only apply to the PROBATION employment
    // type — forced null the moment the (possibly just-updated)
    // employmentType isn't PROBATION, same as on create. Otherwise,
    // validate the (possibly just-updated) Probation End Date against the
    // (possibly just-updated) Date of Joining — the source-of-truth
    // End Date the user saved, whether auto-calculated or manually
    // adjusted client-side, must never be allowed to precede it.
    const effectiveEmploymentType = data.employmentType !== undefined ? String(data.employmentType) : existing.employmentType;
    if (!isProbationEmploymentType(effectiveEmploymentType)) {
      data.probationDurationMonths = null;
      data.probationEndDate = null;
    } else if (data.probationEndDate) {
      const effectiveDateOfJoining = data.dateOfJoining !== undefined ? (data.dateOfJoining as Date | null) : existing.dateOfJoining;
      if (effectiveDateOfJoining && (data.probationEndDate as Date) < effectiveDateOfJoining) {
        return NextResponse.json({ message: 'Probation End Date cannot be earlier than Date of Joining' }, { status: 400 });
      }
    }

    // The Employee ID (employeeCode) is normally auto-assigned at onboarding,
    // but HR sometimes needs to correct it (e.g. migrating a legacy code).
    // employeeCode is the single source of truth read live through the
    // Employee<->User relation everywhere it's displayed (Users list, my
    // payslips, reports, ...) — there's no duplicate copy on User to fall
    // out of sync, so updating it here is all that's needed for it to be
    // reflected everywhere else.
    if (body.employeeCode !== undefined) {
      const employeeCode = String(body.employeeCode).trim();
      if (!employeeCode) return NextResponse.json({ message: 'Employee ID cannot be empty' }, { status: 400 });
      if (employeeCode !== existing.employeeCode) {
        const conflict = await prisma.employee.findFirst({ where: { employeeCode, id: { not: id } } });
        if (conflict) return NextResponse.json({ message: 'Another employee already uses this Employee ID' }, { status: 409 });
      }
      data.employeeCode = employeeCode;
    }

    const employee = await prisma.employee.update({ where: { id }, data });
    await logAudit({
      action: 'UPDATE',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      oldValue: existing,
      newValue: employee,
      description: existing.employeeCode !== employee.employeeCode
        ? `Employee ID changed from ${existing.employeeCode} to ${employee.employeeCode}`
        : `Employee ${employee.employeeCode} profile updated`,
      request,
    });

    return NextResponse.json(employee);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'Another employee already uses this Employee ID' }, { status: 409 });
    }
    console.error('PATCH /api/payroll/employees/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update employee' }, { status: 400 });
  }
}

// Only removable if they were never actually run through payroll — once
// a Payslip exists, the FK is RESTRICT (not CASCADE) specifically so this
// can't silently erase paid-run history. That's what "Mark as Exited"
// (the status field, PATCH above) is for instead; this DELETE is for
// undoing a wrong onboarding, not offboarding a real employee.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Employee not found' }, { status: 404 });

    const payslipCount = await prisma.payslip.count({ where: { employeeId: id } });
    if (payslipCount > 0) {
      return NextResponse.json({ message: `Cannot delete — this employee has ${payslipCount} payslip(s) on record. Set their status to Exited instead.` }, { status: 409 });
    }

    await prisma.employee.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'EMPLOYEE', entityId: id, oldValue: existing, description: `Employee ${existing.employeeCode} removed from payroll`, request });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('DELETE /api/payroll/employees/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete employee' }, { status: 400 });
  }
}
