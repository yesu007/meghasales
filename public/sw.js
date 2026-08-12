// Minimal push-only service worker. It doesn't do any caching/offline
// work — its one job is turning a push message into a native OS/browser
// notification and routing a click back into the app.

self.addEventListener('push', (event) => {
  let data = { title: 'MeghaSales CRM', body: 'You have a new notification.', url: '/dashboard/notifications' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the default text above.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard/notifications';

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clientsList.find((c) => c.url.includes(url));
      if (existing) {
        await existing.focus();
      } else {
        await self.clients.openWindow(url);
      }
    })()
  );
});
