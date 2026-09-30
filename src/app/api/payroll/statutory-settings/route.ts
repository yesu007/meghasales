import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requireAnyPermission, requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { isSaturday } from '@/lib/payroll/teamWeekOff';

export const dynamic = 'force-dynamic';

const FIELDS = ['pfWageCeiling', 'pfEmployerRate', 'esiGrossThreshold', 'esiEmployerRate', 'tanNumber', 'pfEstablishmentCode', 'esiEstablishmentCode', 'ptRegistrationNumber', 'weeklyOffSaturdays'] as const;

export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requireAnyPermission(['view_statutory_settings', 'view_timesheet']);
  if (denied) return denied;

  try {
    const profile = await prisma.companyProfile.findFirst({ select: { ...Object.fromEntries(FIELDS.map((f) => [f, true])), teamWeekOffStartDate: true } });
    if (!profile) return NextResponse.json({});
    const { teamWeekOffStartDate, ...rest } = profile as Record<string, unknown> & { teamWeekOffStartDate: Date | null };
    return NextResponse.json({ ...rest, teamWeekOffStartDate: teamWeekOffStartDate ? teamWeekOffStartDate.toISOString().slice(0, 10) : null });
  } catch (error) {
    console.error('GET /api/payroll/statutory-settings error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Same singleton CompanyProfile row Settings already edits (company/
// address/finance/branding/terms tabs) — this just adds the payroll-
// specific rate/threshold/registration fields on top, gated by
// manage_salary_structures rather than being open to whoever can touch
// the general company profile.
export async function PATCH(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('edit_statutory_settings');
  if (denied) return denied;

  try {
    const existing = await prisma.companyProfile.findFirst();
    if (!existing) return NextResponse.json({ message: 'Company profile not found' }, { status: 404 });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    for (const field of FIELDS) {
      if (body[field] !== undefined) data[field] = body[field] === '' ? null : body[field];
    }
    // Team alternate Saturdays: the Saturday Team A is off (YYYY-MM-DD), or '' / null to switch the rotation off.
    if (body.teamWeekOffStartDate !== undefined) {
      const v = body.teamWeekOffStartDate ? String(body.teamWeekOffStartDate).slice(0, 10) : '';
      if (v && !isSaturday(v)) return NextResponse.json({ message: "Team A's first week-off must be a Saturday" }, { status: 400 });
      data.teamWeekOffStartDate = v ? new Date(`${v}T00:00:00.000Z`) : null;
    }

    const profile = await prisma.companyProfile.update({ where: { id: existing.id }, data });
    await logAudit({ action: 'UPDATE', entityType: 'PAYROLL_STATUTORY_SETTINGS', entityId: profile.id, newValue: data, description: 'Payroll statutory settings updated', request });

    return NextResponse.json(profile);
  } catch (error: any) {
    console.error('PATCH /api/payroll/statutory-settings error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update statutory settings' }, { status: 400 });
  }
}
