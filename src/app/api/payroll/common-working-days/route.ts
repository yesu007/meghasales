import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { describeCommonWorkingDays, teamLabel, validateCommonWorkingDay } from '@/lib/payroll/teamWeekOff';
import { loadWeekOffConfig, refreshCommonWorkingDays } from '@/lib/payroll/weekOffConfig';

export const dynamic = 'force-dynamic';


// Common Working Saturdays (Time & Attendance → Settings) — a Saturday
// both teams work. It pauses the Team A / Team B rotation: the team whose
// turn it was takes the next Saturday (its carried-forward week off) and
// the alternation continues from there (see teamWeekOff.ts). Same view/
// create/delete permissions as the Holiday Calendar next to it.
export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_timesheet');
  if (denied) return denied;

  try {
    const [rows, config] = await Promise.all([
      prisma.commonWorkingDay.findMany({ select: { id: true, note: true } }),
      loadWeekOffConfig(prisma),
    ]);
    const noteById = new Map(rows.map((r) => [r.id, r.note]));
    return NextResponse.json({
      teamStartDate: config.teamStartDate,
      // Derived fresh from the dates, so it's right even if the rotation start changed.
      days: describeCommonWorkingDays(config).reverse().map((d) => ({ ...d, teamLabel: teamLabel(d.team), note: noteById.get(d.id!) ?? null })),
    });
  } catch (error) {
    console.error('GET /api/payroll/common-working-days error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('create_timesheet');
  if (denied) return denied;

  try {
    const body = await request.json();
    const date = String(body.date || '').slice(0, 10);
    const note = body.note ? String(body.note).trim().slice(0, 200) : null;

    const config = await loadWeekOffConfig(prisma);
    const check = validateCommonWorkingDay(date, config);
    if ('error' in check) return NextResponse.json({ message: check.error }, { status: 400 });

    const session = await getServerSession(authOptions);
    const createdById = session?.user ? parseInt((session.user as any).id, 10) : null;
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.commonWorkingDay.create({
        data: {
          date: new Date(`${date}T00:00:00.000Z`),
          team: check.team,
          carryForwardDate: new Date(`${check.carryForwardDate}T00:00:00.000Z`),
          note,
          createdById: Number.isFinite(createdById) ? createdById : null,
        },
      });
      await refreshCommonWorkingDays(tx); // later Saturdays shift by one week
      return created;
    });
    await logAudit({
      action: 'CREATE',
      entityType: 'COMMON_WORKING_DAY',
      entityId: row.id,
      newValue: { date, team: check.team, carryForwardDate: check.carryForwardDate, note },
      description: `Common Working Saturday ${date} — ${teamLabel(check.team)}'s turn carried forward to ${check.carryForwardDate}; rotation continues from there`,
      request,
    });
    return NextResponse.json({ id: row.id, date, team: check.team, carryForwardDate: check.carryForwardDate, note }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 'P2002') return NextResponse.json({ message: 'This Saturday is already a Common Working Day' }, { status: 409 });
    console.error('POST /api/payroll/common-working-days error:', error);
    return NextResponse.json({ message: error.message || 'Failed to add Common Working Day' }, { status: 400 });
  }
}
