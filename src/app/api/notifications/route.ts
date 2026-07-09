import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '20');
    const isRead = searchParams.get('isRead') || '';
    const type = searchParams.get('type') || '';
    const userId = searchParams.get('userId') || '';

    const where: Prisma.NotificationWhereInput = {};
    const AND: Prisma.NotificationWhereInput[] = [];

    if (userId) AND.push({ userId: parseInt(userId) });
    if (isRead === 'true') AND.push({ isRead: true });
    if (isRead === 'false') AND.push({ isRead: false });
    if (type) AND.push({ type: type });

    if (AND.length > 0) where.AND = AND;

    const [notifications, totalElements, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * size,
        take: size,
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, isRead: false } }),
    ]);

    const content = notifications.map((n) => ({
      id: n.id,
      userId: n.userId,
      userName: `${n.user.firstName} ${n.user.lastName}`,
      title: n.title,
      message: n.message,
      type: n.type,
      channel: n.channel,
      entityType: n.entityType,
      entityId: n.entityId,
      isRead: n.isRead,
      readAt: n.readAt,
      createdAt: n.createdAt,
    }));

    return NextResponse.json({
      content,
      page,
      size,
      totalElements,
      totalPages: Math.ceil(totalElements / size),
      unreadCount,
    });
  } catch (error: any) {
    console.error('GET /api/notifications error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // Mark as read
    if (body.markAllRead) {
      const where: Prisma.NotificationWhereInput = { isRead: false };
      if (body.userId) where.userId = parseInt(body.userId);
      await prisma.notification.updateMany({
        where,
        data: { isRead: true, readAt: new Date() },
      });
      return NextResponse.json({ message: 'All marked as read' });
    }

    if (body.id) {
      await prisma.notification.update({
        where: { id: parseInt(body.id) },
        data: { isRead: true, readAt: new Date() },
      });
      return NextResponse.json({ message: 'Marked as read' });
    }

    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  } catch (error: any) {
    console.error('PUT /api/notifications error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update' }, { status: 400 });
  }
}
