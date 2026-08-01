import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isAdminTicketModuleEnabled } from '@/lib/adminTicket/featureFlag';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isAdminTicketModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_admin_tickets');
  if (denied) return denied;

  try {
    const categories = await prisma.adminTicketCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error('GET /api/admin-ticket/categories error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminTicketModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_admin_tickets');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.name || !body.code) {
      return NextResponse.json({ message: 'name and code are required' }, { status: 400 });
    }

    const category = await prisma.adminTicketCategory.create({
      data: {
        name: body.name,
        code: body.code,
        defaultPriority: body.defaultPriority || 'MEDIUM',
        defaultSlaDays: body.defaultSlaDays != null ? Number(body.defaultSlaDays) : null,
        escalationRoleId: body.escalationRoleId != null ? Number(body.escalationRoleId) : null,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'ADMIN_TICKET_CATEGORY', entityId: category.id, newValue: category, description: `Admin ticket category "${category.name}" created`, request });

    return NextResponse.json(category, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A category with that code already exists' }, { status: 409 });
    }
    console.error('POST /api/admin-ticket/categories error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create category' }, { status: 400 });
  }
}
