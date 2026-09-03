import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isMailConfigured, sendMail } from '@/lib/mail';

export const dynamic = 'force-dynamic';

// Deliberately public — no requirePermission/session check, same footing as
// the login route itself, since the whole point is a user who's locked out
// can reach this without being authenticated.
//
// No token or reset code is ever generated or emailed to the requester —
// this only raises the alarm to whoever holds the ADMIN role, who then
// resets the password directly via the existing Edit User screen (see
// PUT /api/users/[id], which auto-resolves the PasswordResetRequest this
// creates once a new password is actually set).
//
// Always responds with the same generic message regardless of whether the
// email matched a real, active user — telling the caller "no such account"
// would let anyone enumerate which emails are registered.
const GENERIC_MESSAGE = 'If an account exists for that email, an administrator has been notified.';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return NextResponse.json({ message: 'Email is required' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email } });

    if (user && user.isActive) {
      const existingPending = await prisma.passwordResetRequest.findFirst({
        where: { userId: user.id, status: 'PENDING' },
      });
      // Reuses an existing pending request instead of piling up duplicates
      // if the same person clicks the link more than once before an admin
      // gets to it.
      const resetRequest = existingPending ?? await prisma.passwordResetRequest.create({ data: { userId: user.id } });

      const admins = await prisma.user.findMany({
        where: { isActive: true, roles: { some: { role: { name: 'ADMIN' } } } },
        select: { id: true, email: true },
      });

      const mailConfigured = await isMailConfigured();

      for (const admin of admins) {
        try {
          await prisma.notification.create({
            data: {
              userId: admin.id,
              title: 'Password reset requested',
              message: `${email} requested a password reset`,
              type: 'PASSWORD_RESET_REQUEST',
              channel: 'IN_APP',
              entityType: 'USER',
              entityId: user.id,
            },
          });
        } catch (error) {
          console.error(`Failed to notify admin ${admin.id} of password reset request ${resetRequest.id}:`, error);
        }

        if (mailConfigured) {
          try {
            await sendMail({
              to: admin.email,
              subject: 'Password reset requested',
              html: `<p><strong>${email}</strong> requested a password reset on MeghaSales CRM.</p><p>Reset it from Dashboard &gt; Users &gt; that user &gt; set a new password, then share it with them directly.</p>`,
            });
          } catch (error) {
            // Best-effort — the in-app notification above already covers
            // it, so a broken SMTP config here shouldn't fail the request.
            console.error(`Failed to email admin ${admin.id} of password reset request ${resetRequest.id}:`, error);
          }
        }
      }
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error('POST /api/auth/password-reset-request error:', error);
    // Still generic on unexpected failure — never confirm/deny account
    // existence, and never leak internals to an unauthenticated caller.
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }
}
