/**
 * Service Worker - Sunan Motor
 * Full offline PWA: cache-first untuk aset, network-first untuk API
 * Version: 3.0
 */

const CACHE_VERSION = "sunan-motor-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Aset statis yang wajib di-cache saat install
const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/sunan-full.png",
  "/icons/sunan-32.png",
  "/icons/sunan-192.png",
  "/icons/sunan-512.png",
  "/icons/favicon-32x32.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192x192.png",
  "/icons/icon-192x192-maskable.png",
  "/icons/icon-512x512.png",
  "/icons/icon-512x512-maskable.png",
];

// ============================================================
// INSTALL — cache semua aset statis
// ============================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((e) => console.warn("[SW] Precache failed:", url, e))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE — hapus cache lama
// ============================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — strategi caching
// ============================================================
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Hanya handle GET dari origin yang sama
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  // API calls — network first, jangan cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkOnly(request));
    return;
  }

  // _next/static — cache first (immutable)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Icons & images — cache first
  if (url.pathname.startsWith("/icons/") || request.destination === "image") {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navigasi halaman — network first dengan fallback ke cache
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Default — stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ============================================================
// STRATEGI FETCH
// ============================================================

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({ status: "error", message: "Tidak ada koneksi internet." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 503 });
  }
}

async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback ke root
    const root = await caches.match("/");
    return root || new Response("Offline", { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || (await fetchPromise) || new Response("", { status: 503 });
}

// ============================================================
// BACKGROUND SYNC (untuk browser yang support)
// ============================================================
self.addEventListener("sync", (event) => {
  if (event.tag === "sunan-motor-sync") {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "BACKGROUND_SYNC_TRIGGER" });
  }
}

// ============================================================
// MESSAGE HANDLER — komunikasi dengan app
// ============================================================
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data?.type === "CLEAR_CACHE") {
    event.waitUntil(
      Promise.all([
        caches.delete(STATIC_CACHE),
        caches.delete(DYNAMIC_CACHE),
      ]).then(() => {
        event.source?.postMessage({ type: "CACHE_CLEARED" });
      })
    );
  }
});

// ============================================================
// PUSH NOTIFICATIONS
// ============================================================
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || "Sunan Motor", {
        body: data.body || "",
        icon: "/icons/sunan-192.png",
        badge: "/icons/sunan-32.png",
        tag: "sunan-motor-notif",
      })
    );
  } catch { /* ignore */ }
});
