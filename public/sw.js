/* TSI INV — push + homescreen service worker */
self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

async function handlePush(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "TSI INV",
      body: event.data ? event.data.text() : "Stock needs attention",
    };
  }

  const title = data.title || "TSI INV";
  const body = data.body || "Stock needs attention";
  const options = {
    body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || "tsi-stock",
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [220, 100, 220, 100, 220],
    data: data.data || { url: "/" },
  };

  // Always show a system notification (needed for userVisibleOnly push).
  // iOS often suppresses the banner while the Home Screen app is open, but
  // still bumps the icon badge — clients get a message for an in-app banner.
  await self.registration.showNotification(title, options);

  try {
    if (self.navigator && "setAppBadge" in self.navigator) {
      await self.navigator.setAppBadge(1);
    }
  } catch {
    /* ignore */
  }

  const clientsList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clientsList) {
    client.postMessage({
      type: "STOCK_ALERT",
      title,
      body,
      url: options.data.url || "/",
    });
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  const url = new URL(target, self.location.origin).href;

  event.waitUntil(
    (async () => {
      try {
        if (self.navigator && "clearAppBadge" in self.navigator) {
          await self.navigator.clearAppBadge();
        }
      } catch {
        /* ignore */
      }

      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientsList) {
        if ("focus" in client && client.url.startsWith(self.location.origin)) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })()
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
