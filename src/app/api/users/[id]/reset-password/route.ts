import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { hashPassword } from '@/lib/password';
import { validateNewPassword } from '@/lib/passwordPolicy';

export const dynamic = 'force-dynamic';

// Admin side of the forgot-password flow (see POST
// /api/auth/password-reset-request) — what the PASSWORD_RESET_REQUEST
// notification opens. Same manage_users gate as PUT /api/users/[id]; never
// selects or returns the password hash.
const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  roles: { include: { role: { select: { id: true, name: true } } } },
  employee: { select: { employeeCode: true } },
} as const;

const REQUEST_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  resolvedBy: { select: { firstName: true, lastName: true } },
} as const;

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('edit_users');
  if (denied) return denied;

  const id = parseId(params.id);
  if (!id) return NextResponse.json({ message: 'Invalid user id' }, { status: 400 });

  try {
    const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });

    const [pendingRequest, latestRequest] = await Promise.all([
      prisma.passwordResetRequest.findFirst({ where: { userId: id, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, select: REQUEST_SELECT }),
      prisma.passwordResetRequest.findFirst({ where: { userId: id }, orderBy: { createdAt: 'desc' }, select: REQUEST_SELECT }),
    ]);

    return NextResponse.json({
      user: { ...user, roles: user.roles.map((ur) => ur.role), employeeCode: user.employee?.employeeCode ?? null, employee: undefined },
      pendingRequest,
      latestRequest,
    });
  } catch (error) {
    console.error('GET /api/users/[id]/reset-password error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('edit_users');
  if (denied) return denied;

  const id = parseId(params.id);
  if (!id) return NextResponse.json({ message: 'Invalid user id' }, { status: 400 });

  try {
    const body = await request.json().catch(() => ({}));
    const invalid = validateNewPassword(body?.newPassword, body?.confirmPassword);
    if (invalid) return NextResponse.json({ message: invalid }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });

    const session = await getServerSession(authOptions);
    const adminId = parseInt(session!.user.id, 10);
    const hashed = await hashPassword(body.newPassword);

    // Only resolves a request that's actually still open — a stale
    // notification (already handled by another admin, or by the user
    // changing their own password) can't be replayed into a second reset.
    // Admins can still set a password outside this flow via Edit User.
    const resolvedCount = await prisma.$transaction(async (tx) => {
      const resolved = await tx.passwordResetRequest.updateMany({
        where: { userId: id, status: 'PENDING' },
        data: { status: 'RESOLVED', resolvedById: Number.isFinite(adminId) ? adminId : null, resolvedAt: new Date() },
      });
      if (resolved.count > 0) await tx.user.update({ where: { id }, data: { password: hashed } });
      return resolved.count;
    });

    if (resolvedCount === 0) {
      return NextResponse.json({ message: 'This user has no pending password reset request' }, { status: 409 });
    }

    await logAudit({ action: 'UPDATE', entityType: 'USER', entityId: id, description: `Password reset by admin for: ${user.email}`, request });

    return NextResponse.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('POST /api/users/[id]/reset-password error:', error);
    return NextResponse.json({ message: 'Failed to reset password' }, { status: 500 });
  }
}
