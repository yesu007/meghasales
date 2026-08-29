import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// The (eventType, channel) set is fixed and pre-seeded by migration (see
// @@unique([eventType, channel]) on NotificationTemplate) — this route only
// lists them for editing; there's no POST, since admins edit content on an
// existing slot rather than creating arbitrary new ones.
export async function GET() {
  const denied = await requirePermission('manage_notification_templates');
  if (denied) return denied;
  try {
    const templates = await prisma.notificationTemplate.findMany({ orderBy: [{ eventType: 'asc' }, { channel: 'asc' }] });
    return NextResponse.json(templates);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
