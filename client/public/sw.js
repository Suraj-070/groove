// Groove Together — Service Worker
// Strategy: Network-first for API/socket, Cache-first for static assets

const CACHE_NAME = 'groove-v1'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/favicon-96x96.png',
  '/apple-touch-icon.png',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
]

// ── Install: pre-cache critical shell ────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// ── Activate: delete old caches ───────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch: smart routing ──────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never intercept: socket.io, YouTube API, external APIs
  if (
    url.pathname.startsWith('/socket.io') ||
    url.hostname.includes('youtube') ||
    url.hostname.includes('youtu.be') ||
    url.hostname.includes('musicbrainz') ||
    url.hostname.includes('acousticbrainz') ||
    url.hostname.includes('render.com') ||
    request.method !== 'GET'
  ) {
    return // let browser handle it normally
  }

  // For navigation requests (HTML pages) — network first, fall back to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // For static assets (JS, CSS, images, fonts) — cache first, then network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        // Only cache successful same-origin responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response
        }
        const toCache = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, toCache))
        return response
      })
    })
  )
})

// ── Offline fallback message ───────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

// ═══════════════════════════════════════════════════════════
// WEB PUSH NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let p;
  try { p = event.data.json(); }
  catch { p = { title: 'Groove Together', body: event.data.text() }; }

  // Vibration patterns per notification type
  const vibes = {
    chat:        [80, 40, 80],
    song_added:  [100, 50, 100, 50, 100],
    user_joined: [60],
    dj_crown:    [200, 100, 200],
  };

  const options = {
    body:      p.body  || '',
    // icon: your Groove logo shown in the notification body
    icon:      p.icon  || '/web-app-manifest-192x192.png',
    // badge: tiny monochrome icon shown in status bar (Android)
    badge:     p.badge || '/favicon-96x96.png',
    // image: large preview image below the body (song thumbnail etc)
    ...(p.image ? { image: p.image } : {}),
    tag:       p.tag   || 'groove',
    renotify:  p.renotify !== false,
    silent:    p.silent === true,
    vibrate:   vibes[p.type] || [100, 50, 100],
    timestamp: Date.now(),
    requireInteraction: false,  // auto-dismiss after a few seconds
    data: { ...(p.data || {}), type: p.type },
    actions: [
      { action: 'open',    title: 'Open Groove' },
      { action: 'dismiss', title: 'Dismiss'      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(p.title || 'Groove Together', options)
  );
});

// Notification click — focus existing tab or open new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';
  const full = new URL(url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Prefer already-open Groove tab
      const existing = list.find(c => c.url.startsWith(self.location.origin));
      if (existing) {
        existing.focus();
        return existing.navigate(full);
      }
      return clients.openWindow(full);
    })
  );
});

// Notification close tracking (optional analytics hook)
self.addEventListener('notificationclose', (event) => {
  // Could send analytics — left as a no-op for now
});