import webpush from 'web-push';
import prisma from '@/lib/prisma';

// Lazily configured — importing this module must not throw when VAPID keys
// aren't set (e.g. local dev without push configured), only sending should.
let vapidConfigured = false;

function ensureVapidConfigured(): void {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!publicKey || !privateKey) {
    throw new Error('Push notifications are not configured (missing VAPID keys)');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export function isPushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// Best-effort fan-out to every subscription a user has (one per browser/
// device they've opted in on). A dead subscription (410 Gone / 404) is
// pruned so it stops being retried on every future reminder; any other
// failure is swallowed per-subscription so one bad endpoint never blocks
// delivery to the user's other devices.
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (!isPushConfigured()) return { sent: 0, pruned: 0 };
  ensureVapidConfigured();

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  let pruned = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
        sent += 1;
      } catch (error: any) {
        const statusCode = error?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          pruned += 1;
        } else {
          console.error(`Push send failed for subscription ${sub.id}:`, error?.message || error);
        }
      }
    })
  );

  return { sent, pruned };
}
