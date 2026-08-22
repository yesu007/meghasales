import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// smtpPassword is never included in the response — same convention as
// User password updates (PUT /api/users/[id]) omitting the stored hash.
// smtpPasswordSet tells the settings UI whether a password already exists
// so it can show "leave blank to keep the current password" instead of a
// blank field that looks unconfigured.
function toResponse(config: { smtpPassword: string | null } & Record<string, any>) {
  const { smtpPassword, ...rest } = config;
  return { ...rest, smtpPasswordSet: !!smtpPassword };
}

export async function GET() {
  const denied = await requirePermission('manage_email_settings');
  if (denied) return denied;

  try {
    let config = await prisma.emailConfig.findFirst({ orderBy: { id: 'asc' } });
    if (!config) {
      config = await prisma.emailConfig.create({ data: {} });
    }
    return NextResponse.json(toResponse(config));
  } catch (error) {
    console.error('GET /api/settings/email-config error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const denied = await requirePermission('manage_email_settings');
  if (denied) return denied;

  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();

    let config = await prisma.emailConfig.findFirst({ orderBy: { id: 'asc' } });
    if (!config) config = await prisma.emailConfig.create({ data: {} });

    const updated = await prisma.emailConfig.update({
      where: { id: config.id },
      data: {
        ...(body.smtpHost !== undefined && { smtpHost: body.smtpHost }),
        ...(body.smtpPort !== undefined && { smtpPort: parseInt(body.smtpPort, 10) }),
        ...(body.smtpSecure !== undefined && { smtpSecure: !!body.smtpSecure }),
        ...(body.smtpUser !== undefined && { smtpUser: body.smtpUser }),
        // Blank/omitted password leaves the existing one unchanged — only a
        // non-empty value overwrites it.
        ...(body.smtpPassword && { smtpPassword: body.smtpPassword }),
        ...(body.fromEmail !== undefined && { fromEmail: body.fromEmail }),
        ...(body.fromName !== undefined && { fromName: body.fromName }),
        ...(body.isActive !== undefined && { isActive: !!body.isActive }),
        updatedById: currentUserId(session),
      },
    });

    return NextResponse.json(toResponse(updated));
  } catch (error) {
    console.error('PUT /api/settings/email-config error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
