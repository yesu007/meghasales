import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requirePermission('view_accounting');
  if (denied) return denied;
  try {
    const templates = await prisma.reminderTemplate.findMany({ orderBy: [{ reminderType: 'asc' }, { channel: 'asc' }] });
    return NextResponse.json(templates);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_invoices');
  if (denied) return denied;
  try {
    const body = await request.json();
    if (!body.name || !body.reminderType || !body.channel || !body.body) {
      return NextResponse.json({ message: 'name, reminderType, channel, and body are required' }, { status: 400 });
    }

    const template = await prisma.reminderTemplate.create({
      data: {
        name: body.name,
        reminderType: body.reminderType,
        channel: body.channel,
        subject: body.subject || null,
        body: body.body,
        isActive: body.isActive !== false,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'REMINDER_TEMPLATE', entityId: template.id, newValue: template, description: `Reminder template "${template.name}" created`, request });

    return NextResponse.json(template, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to create template' }, { status: 400 });
  }
}
