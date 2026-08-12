import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isPushConfigured } from '@/lib/push';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// Save (or refresh) the browser's push subscription for the logged-in user.
// Called from the client right after PushManager.subscribe() resolves.
export async function POST(request: NextRequest) {
  if (!isPushConfigured()) return NextResponse.json({ message: 'Push notifications are not configured' }, { status: 501 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { endpoint, keys } = body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ message: 'endpoint and keys.p256dh/keys.auth are required' }, { status: 400 });
    }

    // Upsert on endpoint (unique) rather than [userId, endpoint] — the same
    // endpoint re-subscribing under a different logged-in user (shared
    // machine) should move to that user, not create a duplicate row.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent: request.headers.get('user-agent') || undefined },
      create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: request.headers.get('user-agent') || undefined },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/push/subscribe error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Called when the user turns notifications off, or before re-subscribing.
export async function DELETE(request: NextRequest) {
  try {
    const { endpoint } = await request.json();
    if (!endpoint) return NextResponse.json({ message: 'endpoint is required' }, { status: 400 });

    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/push/subscribe error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
