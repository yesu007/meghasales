import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { hashPassword, verifyPassword } from '@/lib/password';
import { validateNewPassword } from '@/lib/passwordPolicy';

export const dynamic = 'force-dynamic';

// Self-service Change Password — any logged-in user, no permission needed,
// but always scoped to the caller's own session id (never a client-supplied
// user id), and only after re-verifying their current password.
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const userId = parseInt(session.user.id, 10);
  if (!Number.isFinite(userId)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const { currentPassword, newPassword, confirmPassword } = body ?? {};

    if (typeof currentPassword !== 'string' || !currentPassword) {
      return NextResponse.json({ message: 'Current password is required' }, { status: 400 });
    }
    const invalid = validateNewPassword(newPassword, confirmPassword);
    if (invalid) return NextResponse.json({ message: invalid }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, password: true, isActive: true } });
    if (!user || !user.isActive) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    if (!(await verifyPassword(currentPassword, user.password))) {
      return NextResponse.json({ message: 'Current password is incorrect' }, { status: 400 });
    }
    if (await verifyPassword(newPassword, user.password)) {
      return NextResponse.json({ message: 'New password must be different from the current password' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { password: await hashPassword(newPassword) } }),
      // The user evidently knows a working password again, so any
      // outstanding "forgot password" request of theirs is moot.
      prisma.passwordResetRequest.updateMany({
        where: { userId, status: 'PENDING' },
        data: { status: 'RESOLVED', resolvedById: userId, resolvedAt: new Date() },
      }),
    ]);

    await logAudit({ action: 'UPDATE', entityType: 'USER', entityId: userId, description: `Password changed by user: ${user.email}`, request });

    return NextResponse.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('PUT /api/users/me/password error:', error);
    return NextResponse.json({ message: 'Failed to change password' }, { status: 500 });
  }
}
