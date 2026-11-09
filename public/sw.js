// FusionX service worker: shows phone notifications and opens the right page when one is tapped.
// It caches nothing, so the site is always the live one.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data ? event.data.text() : "FusionX" }; }
  event.waitUntil(
    self.registration.showNotification(data.title || "FusionX", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/my-work" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/my-work";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) if (client.url === url && "focus" in client) return client.focus();
      return self.clients.openWindow(url);
    }),
  );
});
