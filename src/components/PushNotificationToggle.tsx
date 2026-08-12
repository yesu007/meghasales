'use client';

import { useEffect, useState } from 'react';
import { BellIcon, BellSlashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

type Status = 'checking' | 'unsupported' | 'unconfigured' | 'denied' | 'subscribed' | 'unsubscribed';

// Standard VAPID-key transform — PushManager.subscribe needs a Uint8Array,
// browsers hand out (and web-push generates) the key as a URL-safe base64
// string.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// A per-user opt-in for browser push notifications, scoped to wherever it's
// dropped in — used on the Admin Tickets page so ticket-deadline reminders
// (already generated server-side, see lib/adminTicket/dispatcher.ts) can
// reach the assignee even when the CRM tab isn't open.
export default function PushNotificationToggle() {
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    if (!vapidPublicKey) {
      setStatus('unconfigured');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }

    (async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        const existing = await registration.pushManager.getSubscription();
        setStatus(existing ? 'subscribed' : 'unsubscribed');
      } catch (error) {
        console.error('Service worker registration failed:', error);
        setStatus('unsupported');
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource,
      });

      const json = subscription.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error('Failed to save subscription');

      setStatus('subscribed');
      toast.success('Deadline reminders enabled for this browser');
    } catch (error) {
      console.error('Push subscribe failed:', error);
      toast.error('Could not enable notifications');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => undefined);
      }
      setStatus('unsubscribed');
      toast.success('Deadline reminders turned off for this browser');
    } catch (error) {
      console.error('Push unsubscribe failed:', error);
      toast.error('Could not turn off notifications');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'checking' || status === 'unsupported' || status === 'unconfigured') return null;

  if (status === 'denied') {
    return (
      <span className="flex items-center gap-1.5 px-2 min-h-[44px] text-sm text-slate-400" title="Blocked in browser settings — re-enable notifications for this site to turn reminders back on">
        <BellSlashIcon className="h-4 w-4" /> Reminders blocked
      </span>
    );
  }

  const subscribed = status === 'subscribed';
  return (
    <button
      onClick={subscribed ? disable : enable}
      disabled={busy}
      className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium border disabled:opacity-60 ${
        subscribed ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
      }`}
      title="Get a browser notification when a ticket's deadline is approaching or overdue"
    >
      {subscribed ? <BellIcon className="h-4 w-4" /> : <BellSlashIcon className="h-4 w-4" />}
      {subscribed ? 'Deadline reminders on' : 'Enable deadline reminders'}
    </button>
  );
}
