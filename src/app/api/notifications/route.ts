import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const currentUserId = parseInt(session.user.id, 10);

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '20');
    const isRead = searchParams.get('isRead') || '';
    const type = searchParams.get('type') || '';

    // Notifications are personal — always scoped to the caller's own id,
    // never to a client-supplied userId (previously anyone could read
    // anyone else's notifications by passing their id in the query string).
    const where: Prisma.NotificationWhereInput = { userId: currentUserId };
    const AND: Prisma.NotificationWhereInput[] = [];

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
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const currentUserId = parseInt(session.user.id, 10);

  try {
    const body = await request.json();

    // Mark as read — always scoped to the caller's own notifications, never
    // a client-supplied userId.
    if (body.markAllRead) {
      await prisma.notification.updateMany({
        where: { userId: currentUserId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
      return NextResponse.json({ message: 'All marked as read' });
    }

    if (body.id) {
      const result = await prisma.notification.updateMany({
        where: { id: parseInt(body.id), userId: currentUserId },
        data: { isRead: true, readAt: new Date() },
      });
      if (result.count === 0) return NextResponse.json({ message: 'Notification not found' }, { status: 404 });
      return NextResponse.json({ message: 'Marked as read' });
    }

    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  } catch (error: any) {
    console.error('PUT /api/notifications error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update' }, { status: 400 });
  }
}
