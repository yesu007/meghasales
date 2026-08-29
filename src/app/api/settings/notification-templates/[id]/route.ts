import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_notification_templates');
  if (denied) return denied;
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.notificationTemplate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Template not found' }, { status: 404 });

    const template = await prisma.notificationTemplate.update({
      where: { id },
      data: {
        ...(body.subject !== undefined && { subject: body.subject }),
        ...(body.body !== undefined && { body: body.body }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    await logAudit({
      action: 'UPDATE',
      entityType: 'NOTIFICATION_TEMPLATE',
      entityId: id,
      oldValue: existing,
      newValue: template,
      description: `Notification template "${template.eventType}/${template.channel}" updated`,
      request,
    });

    return NextResponse.json(template);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update template' }, { status: 400 });
  }
}
