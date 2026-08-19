/* Sprachen PWA — caches the offline Daily shell so the player starts without the Mac. */
const SHELL_CACHE = "sprachen-shell-v1";
const STATIC_CACHE = "sprachen-static-v1";
const OFFLINE_PATH = "/daily/offline";
const PRECACHE_URLS = [
  OFFLINE_PATH,
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/apple-icon",
  "/icon",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await cacheShell();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_SHELL") {
    event.waitUntil(cacheShell());
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(STATIC_CACHE, request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(cacheFirst(SHELL_CACHE, request, true));
});

async function handleNavigation(request) {
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(SHELL_CACHE);
      const url = new URL(request.url);
      if (url.pathname === OFFLINE_PATH || url.pathname === `${OFFLINE_PATH}/`) {
        await cache.put(OFFLINE_PATH, fresh.clone());
        await cacheDocumentAssets(cache, fresh.clone());
      }
    }
    return fresh;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const offline = await cache.match(OFFLINE_PATH);
    if (offline) return offline;
    return new Response("Offline — open Daily on the Mac and tap Offline laden.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

async function cacheFirst(cacheName, request, fallbackNetwork = false) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) await cache.put(request, fresh.clone());
    return fresh;
  } catch (error) {
    if (fallbackNetwork) {
      const shell = await caches.open(SHELL_CACHE);
      const fallback = await shell.match(request);
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function cacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.allSettled(
    PRECACHE_URLS.map(async (url) => {
      const response = await fetch(url, { credentials: "same-origin" });
      if (response.ok) await cache.put(url, response.clone());
      if (url === OFFLINE_PATH && response.ok) {
        await cacheDocumentAssets(cache, response);
      } else {
        response.body?.cancel?.();
      }
    }),
  );
}

async function cacheDocumentAssets(cache, response) {
  const html = await response.text();
  const urls = new Set();
  for (const match of html.matchAll(/\/_next\/static\/[A-Za-z0-9/_.%-]+/g)) {
    urls.add(match[0]);
  }
  await Promise.allSettled(
    [...urls].map(async (url) => {
      const asset = await fetch(url, { credentials: "same-origin" });
      if (asset.ok) await cache.put(url, asset);
    }),
  );
}
