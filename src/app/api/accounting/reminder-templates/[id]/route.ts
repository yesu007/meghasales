import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_invoices');
  if (denied) return denied;
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.reminderTemplate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Template not found' }, { status: 404 });

    const template = await prisma.reminderTemplate.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.subject !== undefined && { subject: body.subject }),
        ...(body.body !== undefined && { body: body.body }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'REMINDER_TEMPLATE', entityId: id, oldValue: existing, newValue: template, description: `Reminder template "${template.name}" updated`, request });

    return NextResponse.json(template);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update template' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_invoices');
  if (denied) return denied;
  try {
    const id = parseInt(params.id);
    const existing = await prisma.reminderTemplate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Template not found' }, { status: 404 });

    await prisma.reminderTemplate.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'REMINDER_TEMPLATE', entityId: id, oldValue: existing, description: `Reminder template "${existing.name}" deleted`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete template' }, { status: 400 });
  }
}
