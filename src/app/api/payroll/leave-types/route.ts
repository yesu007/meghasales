import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// No permission check on GET beyond the feature flag — the leave
// application form (self-service, open to any authenticated user) needs
// this list too, and it's just type names/quotas, not anyone's personal
// data.
export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const types = await prisma.leaveType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return NextResponse.json(types);
  } catch (error) {
    console.error('GET /api/payroll/leave-types error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.name || !body.code) {
      return NextResponse.json({ message: 'name and code are required' }, { status: 400 });
    }

    const leaveType = await prisma.leaveType.create({
      data: {
        name: body.name,
        code: body.code.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
        isPaid: body.isPaid ?? true,
        annualQuota: body.annualQuota != null && body.annualQuota !== '' ? Number(body.annualQuota) : null,
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'LEAVE_TYPE', entityId: leaveType.id, newValue: leaveType, description: `Leave type "${leaveType.name}" created`, request });

    return NextResponse.json(leaveType, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A leave type with that code already exists' }, { status: 409 });
    }
    console.error('POST /api/payroll/leave-types error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create leave type' }, { status: 400 });
  }
}
