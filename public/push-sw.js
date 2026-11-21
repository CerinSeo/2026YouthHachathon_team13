self.addEventListener('push', (event) => {
  if (!event.data) return;
  const { title, body } = event.data.json();
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: '/app-icon-192.png',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL('/?notice=yangjae-demo', self.location.origin);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === target.origin);
    if (existing) {
      try {
        const opened = await existing.navigate(target.href);
        if (opened) return opened.focus();
      } catch {
        // A window can close between lookup and navigation.
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
