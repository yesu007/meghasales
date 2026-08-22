import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { sendMail } from '@/lib/mail';

export const dynamic = 'force-dynamic';

// Lets an admin verify Zoho SMTP credentials from the settings page without
// waiting for a real deadline reminder to fire, or even saving first.
// Defaults to the caller's own address (via their Employee record, same
// resolution the reminder dispatcher uses) so there's nothing to type for
// the common case.
export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_email_settings');
  if (denied) return denied;

  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user ? parseInt(session.user.id, 10) : NaN;
    const body = await request.json().catch(() => ({}));

    let to: string | null = body.to || null;
    if (!to && Number.isFinite(userId)) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, employee: { select: { email: true } } } });
      to = user?.employee?.email || user?.email || null;
    }
    if (!to) return NextResponse.json({ message: 'No recipient email available' }, { status: 400 });

    // Test exactly what's currently in the settings form, not only what's
    // already saved — this is the fix for a repeatedly-hit trap: typing a
    // new password and clicking "Send Test Email" without clicking "Save"
    // first used to silently test the old saved credentials instead. The
    // password field is the one exception: the form always shows it blank
    // (never pre-filled with the real value), so a blank body.smtpPassword
    // means "use whatever's already saved", not "no password".
    const saved = await prisma.emailConfig.findFirst({ orderBy: { id: 'asc' } });
    const smtpHost = body.smtpHost || saved?.smtpHost;
    const smtpPort = body.smtpPort !== undefined ? parseInt(body.smtpPort, 10) : saved?.smtpPort;
    const smtpSecure = body.smtpSecure !== undefined ? !!body.smtpSecure : !!saved?.smtpSecure;
    const smtpUser = body.smtpUser || saved?.smtpUser;
    const smtpPassword = body.smtpPassword || saved?.smtpPassword;
    const fromEmail = body.fromEmail || saved?.fromEmail;
    const fromName = body.fromName !== undefined ? body.fromName : saved?.fromName;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword || !fromEmail) {
      return NextResponse.json({ message: 'Fill in SMTP host, port, mail address, app password, and from address before testing' }, { status: 400 });
    }

    await sendMail(
      {
        to,
        subject: 'MeghaSales — test email',
        html: '<p>This is a test email from MeghaSales’ Zoho Mail configuration. If you received this, sending is working.</p>',
      },
      { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPassword, fromEmail, fromName }
    );

    return NextResponse.json({ sent: true, to });
  } catch (error: any) {
    console.error('POST /api/settings/email-config/test error:', error);
    return NextResponse.json({ message: error.message || 'Failed to send test email' }, { status: 400 });
  }
}
