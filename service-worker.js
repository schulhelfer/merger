const VERSION = 2;
const APP_VARIANT = `${VERSION}`;
const CACHE_NAME = `merger-pwa-v${VERSION}`;
const PDF_LIB_CDN_URL = "https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.min.js";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./service-worker.js",
  "./icon-32x32.png",
  "./icon-192x192.png",
  "./icon-512x512.png"
];

function sendVariantToClient(client) {
  if (!client) return;
  client.postMessage({ type: "APP_VARIANT", value: APP_VARIANT });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      try {
        const response = await fetch(PDF_LIB_CDN_URL, { mode: "no-cors" });
        await cache.put(PDF_LIB_CDN_URL, response);
      } catch (err) {
        // ignore install-time CDN errors; runtime loader can retry on first use
      }
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(async () => {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) sendVariantToClient(client);
    })
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  if (data.type === "GET_APP_VARIANT") {
    sendVariantToClient(event.source);
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.href === PDF_LIB_CDN_URL) {
    event.respondWith(
      caches.match(PDF_LIB_CDN_URL).then((cached) => {
        if (cached) return cached;
        return fetch(PDF_LIB_CDN_URL, { mode: "no-cors" }).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(PDF_LIB_CDN_URL, copy));
          return response;
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Always fetch these from network so installability metadata stays fresh.
  if (url.pathname.endsWith("/manifest.webmanifest") || url.pathname.endsWith("/service-worker.js")) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
