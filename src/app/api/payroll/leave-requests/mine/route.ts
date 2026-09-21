import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { findOverlappingDepartmentColleagues, ANNUAL_LEAVE_EXCLUDED_CODES, ANNUAL_LEAVE_CONFIG_CODE, countsTowardAnnualLeave, getAnnualLeaveConfig, computeAccruedPoolDays } from '@/lib/payroll/leaveEngine';
import { round2 } from '@/lib/payroll/runEngine';
import { isPushConfigured, sendPushToUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// Self-service, like my-payslips — no permission check, scoped to
// whichever Employee the session resolves to. Balance is always summed
// live from APPROVED requests this calendar year rather than read from a
// stored running total (there isn't one — see LeaveType's schema
// comment), so it can never drift out of sync with the request list
// shown right next to it.
export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) return NextResponse.json({ employee: null, requests: [], balances: [] });

    const currentYear = new Date().getFullYear();
    const [requests, leaveTypes, annualLeaveConfig] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: { employeeId: employee.id },
        include: { leaveType: { select: { name: true, code: true, isPaid: true } } },
        orderBy: { startDate: 'desc' },
      }),
      prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      getAnnualLeaveConfig(prisma),
    ]);

    // The ANNUAL_LEAVE_CONFIG_CODE row (Time-off Policy's "Annual Leave"
    // entry) is a configuration source only — it's where the admin sets the
    // pool's entitlement, not something an employee requests or sees as its
    // own balance card, so it's dropped here before building any of the
    // per-type cards below.
    const applicableLeaveTypes = leaveTypes.filter((lt) => lt.code !== ANNUAL_LEAVE_CONFIG_CODE);

    // Every leave type except LOP/Earned/Paid Holidays (see
    // countsTowardAnnualLeave in leaveEngine.ts) gets its own card (showing
    // just its individual used-days, no quota of its own — see leaveType
    // interface comment on `remaining: null`), plus one extra synthetic
    // "Annual Leave" card summing all of them against the shared
    // accrual-based pool. This is exclusion-based, not a fixed list, so a
    // new paid leave type added later automatically joins the pool.
    // Everything excluded (Loss of Pay, Earned, Paid Holidays) keeps its
    // own card exactly as before.
    const poolTypes = applicableLeaveTypes.filter((lt) => countsTowardAnnualLeave(lt.code));
    const otherTypes = applicableLeaveTypes.filter((lt) => !countsTowardAnnualLeave(lt.code));

    const balances: Array<{ leaveTypeId: number; name: string; code: string; isPaid: boolean; quota: number | null; usedDays: number; remaining: number | null; accruedDays?: number }> = [];

    const poolUsedDaysByType = new Map<number, number>();
    for (const lt of poolTypes) {
      const usedDays = requests
        .filter((r) => r.leaveTypeId === lt.id && r.status === 'APPROVED' && new Date(r.startDate).getFullYear() === currentYear)
        .reduce((s, r) => s + Number(r.days), 0);
      poolUsedDaysByType.set(lt.id, usedDays);
      // No quota/remaining of its own — the shared cap lives on the
      // combined "Annual Leave" card pushed below, not per member type.
      balances.push({ leaveTypeId: lt.id, name: lt.name, code: lt.code, isPaid: true, quota: null, usedDays, remaining: null });
    }

    // The combined "Annual Leave" card only appears once the entitlement is
    // actually configured (Time & Attendance > Time-off Policy > a leave
    // type named "Annual Leave", code ANNUAL, with its Annual Quota set —
    // see getAnnualLeaveConfig in leaveEngine.ts). Unconfigured, each pool
    // type above still shows its own used-days card, just with no combined
    // cap — never a fake/default entitlement.
    if (poolTypes.length > 0 && annualLeaveConfig) {
      const usedDays = Array.from(poolUsedDaysByType.values()).reduce((s, d) => s + d, 0);
      const accruedDays = computeAccruedPoolDays(annualLeaveConfig.annualDays, currentYear);
      const remaining = Math.max(0, round2(accruedDays - usedDays));
      balances.push({
        leaveTypeId: 0, // synthetic — not a real LeaveType row, represents the combined pool
        name: 'Annual Leave',
        code: 'COMMON_POOL',
        isPaid: true,
        quota: annualLeaveConfig.annualDays,
        usedDays,
        remaining,
        accruedDays,
      });
    }

    for (const lt of otherTypes) {
      const usedDays = requests
        .filter((r) => r.leaveTypeId === lt.id && r.status === 'APPROVED' && new Date(r.startDate).getFullYear() === currentYear)
        .reduce((s, r) => s + Number(r.days), 0);
      const quota = lt.annualQuota != null ? Number(lt.annualQuota) : null;
      balances.push({ leaveTypeId: lt.id, name: lt.name, code: lt.code, isPaid: lt.isPaid, quota, usedDays, remaining: quota != null ? quota - usedDays : null });
    }

    return NextResponse.json({ employee: { employeeCode: employee.employeeCode }, requests, balances });
  } catch (error) {
    console.error('GET /api/payroll/leave-requests/mine error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) return NextResponse.json({ message: 'You do not have a payroll profile to apply leave against' }, { status: 404 });

    const body = await request.json();
    const { leaveTypeId, startDate, endDate, days, reason } = body;
    if (!leaveTypeId || !startDate || !endDate || days == null) {
      return NextResponse.json({ message: 'leaveTypeId, startDate, endDate, and days are required' }, { status: 400 });
    }

    const leaveType = await prisma.leaveType.findUnique({ where: { id: Number(leaveTypeId) } });
    if (!leaveType || !leaveType.isActive) return NextResponse.json({ message: 'Leave type not found' }, { status: 404 });
    // The Annual Leave pool's own entitlement config row is not something
    // to apply for directly (the My Leave form already hides it from the
    // dropdown) — reject it here too in case it's ever hit directly.
    if (leaveType.code === ANNUAL_LEAVE_CONFIG_CODE) {
      return NextResponse.json({ message: 'Annual Leave is a configuration entry, not a leave type you can apply for — apply for Casual/Sick/etc. instead' }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return NextResponse.json({ message: 'endDate must be on or after startDate' }, { status: 400 });

    // A pending or already-approved request on overlapping dates would
    // double-book the same days — block it here rather than letting an
    // approver discover the conflict later.
    const overlapping = await prisma.leaveRequest.findFirst({
      where: { employeeId: employee.id, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: end }, endDate: { gte: start } },
    });
    if (overlapping) return NextResponse.json({ message: 'You already have a pending or approved request overlapping these dates' }, { status: 409 });

    // Every leave type except LOP/Earned/Paid Holidays (see
    // countsTowardAnnualLeave in leaveEngine.ts) draws from ONE shared,
    // monthly-accruing balance instead of each carrying its own annual
    // quota — checked here ahead of (and instead of) that type's own
    // annualQuota column. This is exclusion-based: a new paid leave type an
    // admin adds later automatically joins this shared pool unless its code
    // is added to ANNUAL_LEAVE_EXCLUDED_CODES. The excluded types keep the
    // original per-type check in the else-if below, untouched. The pool's
    // entitlement itself comes from Time-off Policy (getAnnualLeaveConfig)
    // — if it hasn't been configured yet, no cap applies at all here (falls
    // straight through to the plain create at the bottom), rather than
    // enforcing a made-up default.
    const annualLeaveConfig = countsTowardAnnualLeave(leaveType.code) ? await getAnnualLeaveConfig(prisma) : null;
    if (annualLeaveConfig) {
      const currentYear = start.getFullYear();
      const poolTypeIds = (await prisma.leaveType.findMany({ where: { code: { notIn: ANNUAL_LEAVE_EXCLUDED_CODES } }, select: { id: true } })).map((t) => t.id);
      const used = await prisma.leaveRequest.aggregate({
        where: { employeeId: employee.id, leaveTypeId: { in: poolTypeIds }, status: 'APPROVED', startDate: { gte: new Date(`${currentYear}-01-01`) } },
        _sum: { days: true },
      });
      const usedDays = Number(used._sum.days || 0);
      const accruedDays = computeAccruedPoolDays(annualLeaveConfig.annualDays, currentYear);
      const requestedDays = Number(days);

      if (usedDays + requestedDays > accruedDays) {
        const availableDays = Math.max(0, round2(accruedDays - usedDays));
        const excessDays = round2(requestedDays - availableDays);

        // First attempt (no acknowledgement yet) — the My Leave form's own
        // confirmation modal uses these fields to ask "...the excess leave
        // will be treated as Loss of Pay. Do you want to continue?" instead
        // of blocking the request outright.
        if (!body.acknowledgeLossOfPay) {
          return NextResponse.json(
            {
              message: 'Your leave request exceeds your available paid leave balance. The excess leave will be treated as Loss of Pay.',
              quotaExceeded: true,
              leaveTypeName: leaveType.name,
              availableDays,
              excessDays,
            },
            { status: 400 },
          );
        }

        // Acknowledged — split into up to two requests: the common pool's
        // remaining days under the originally-picked leave type, and the
        // rest logged against Loss of Pay (LOP), same date range on both.
        // No re-check of the overlap/balance rules below this branch since
        // this whole block is itself the "exceeds balance" path they guard.
        const lopType = await prisma.leaveType.findFirst({ where: { code: 'LOP', isActive: true } });
        if (!lopType) return NextResponse.json({ message: 'Loss of Pay leave type is not configured — contact HR/Admin' }, { status: 400 });

        const created = await prisma.$transaction(async (tx) => {
          const rows = [];
          if (availableDays > 0) {
            rows.push(await tx.leaveRequest.create({ data: { employeeId: employee.id, leaveTypeId: leaveType.id, startDate: start, endDate: end, days: availableDays, reason: reason || null } }));
          }
          rows.push(await tx.leaveRequest.create({ data: { employeeId: employee.id, leaveTypeId: lopType.id, startDate: start, endDate: end, days: excessDays, reason: reason || null } }));
          return rows;
        });

        const departmentOverlapWarning = await notifyDepartmentOverlapIfAny(employee, created[0].id, start, end);

        return NextResponse.json({ split: true, requests: created, availableDays, excessDays, departmentOverlapWarning }, { status: 201 });
      }
      // Within the available common-pool balance — falls through to the
      // plain create below, same as any other non-exceeding request.
    } else if (leaveType.annualQuota != null) {
      const currentYear = start.getFullYear();
      const used = await prisma.leaveRequest.aggregate({
        where: { employeeId: employee.id, leaveTypeId: leaveType.id, status: 'APPROVED', startDate: { gte: new Date(`${currentYear}-01-01`) } },
        _sum: { days: true },
      });
      const usedDays = Number(used._sum.days || 0);
      const quota = Number(leaveType.annualQuota);
      const requestedDays = Number(days);

      if (usedDays + requestedDays > quota) {
        const availableDays = Math.max(0, round2(quota - usedDays));
        const excessDays = round2(requestedDays - availableDays);

        // First attempt (no acknowledgement yet) — same "would exceed" shape
        // as before, plus the extra fields the My Leave form's own
        // confirmation modal needs to ask "...the additional N day(s) will
        // be treated as Loss of Pay. Continue?" instead of just blocking.
        if (!body.acknowledgeLossOfPay) {
          return NextResponse.json(
            {
              message: 'Your leave request exceeds your available paid leave balance. The excess leave will be treated as Loss of Pay.',
              quotaExceeded: true,
              leaveTypeName: leaveType.name,
              availableDays,
              excessDays,
            },
            { status: 400 },
          );
        }

        // Acknowledged — split into up to two requests: the quota's own
        // remaining days under the originally-picked leave type, and the
        // rest logged against Loss of Pay (LOP), same date range on both.
        // No re-check of the overlap/quota rules below this branch since
        // this whole block is itself the "over quota" path they guard.
        const lopType = await prisma.leaveType.findFirst({ where: { code: 'LOP', isActive: true } });
        if (!lopType) return NextResponse.json({ message: 'Loss of Pay leave type is not configured — contact HR/Admin' }, { status: 400 });

        const created = await prisma.$transaction(async (tx) => {
          const rows = [];
          if (availableDays > 0) {
            rows.push(await tx.leaveRequest.create({ data: { employeeId: employee.id, leaveTypeId: leaveType.id, startDate: start, endDate: end, days: availableDays, reason: reason || null } }));
          }
          rows.push(await tx.leaveRequest.create({ data: { employeeId: employee.id, leaveTypeId: lopType.id, startDate: start, endDate: end, days: excessDays, reason: reason || null } }));
          return rows;
        });

        const departmentOverlapWarning = await notifyDepartmentOverlapIfAny(employee, created[0].id, start, end);

        return NextResponse.json({ split: true, requests: created, availableDays, excessDays, departmentOverlapWarning }, { status: 201 });
      }
    }

    const leaveRequest = await prisma.leaveRequest.create({
      data: { employeeId: employee.id, leaveTypeId: leaveType.id, startDate: start, endDate: end, days: Number(days), reason: reason || null },
    });

    const departmentOverlapWarning = await notifyDepartmentOverlapIfAny(employee, leaveRequest.id, start, end);

    return NextResponse.json({ ...leaveRequest, departmentOverlapWarning }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/leave-requests/mine error:', error);
    return NextResponse.json({ message: error.message || 'Failed to apply for leave' }, { status: 400 });
  }
}

// Best-effort — notification/push failures must never fail the leave
// application itself, so this runs after the request row is already
// committed. Notifies the applier (so they know their leave may need
// extra coordination) and every approve_leave holder (so the person about
// to decide sees the staffing risk up front, not after the fact). Returns
// the applier-facing message so the UI can also surface it inline on
// submit, not just via the notification bell.
async function notifyDepartmentOverlapIfAny(
  employee: { id: number; userId: number | null; department: string | null; firstName: string; lastName: string },
  leaveRequestId: number,
  start: Date,
  end: Date
): Promise<string | null> {
  if (!employee.department) return null;

  const colleagues = await findOverlappingDepartmentColleagues(prisma, employee.department, employee.id, start, end);
  if (colleagues.length === 0) return null;

  const names = colleagues.map((c) => c.name).join(', ');
  const applierMessage = `${colleagues.length} other ${employee.department} employee${colleagues.length === 1 ? ' is' : 's are'} already on leave overlapping your requested dates: ${names}.`;
  const approverMessage = `${employee.firstName} ${employee.lastName}'s leave request overlaps with ${colleagues.length} other ${employee.department} employee${colleagues.length === 1 ? '' : 's'} already on leave: ${names}.`;

  const approvers = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { roles: { some: { role: { name: 'ADMIN' } } } },
        { roles: { some: { role: { permissions: { some: { permission: { name: 'approve_leave' } } } } } } },
      ],
    },
    select: { id: true },
  });

  const recipients = new Map<number, string>();
  if (employee.userId) recipients.set(employee.userId, applierMessage);
  for (const approver of approvers) {
    if (approver.id !== employee.userId) recipients.set(approver.id, approverMessage);
  }

  await prisma.notification.createMany({
    data: Array.from(recipients.entries()).map(([userId, message]) => ({
      userId,
      title: 'Multiple department leave overlap',
      message,
      type: 'LEAVE_DEPARTMENT_OVERLAP',
      channel: 'IN_APP',
      entityType: 'LEAVE_REQUEST',
      entityId: leaveRequestId,
    })),
  });

  if (isPushConfigured()) {
    for (const [userId, message] of Array.from(recipients.entries())) {
      try {
        await sendPushToUser(userId, { title: 'Multiple department leave overlap', body: message, url: '/dashboard/payroll/leave' });
      } catch (error) {
        console.error(`Push send failed for user ${userId}:`, error);
      }
    }
  }

  return applierMessage;
}
