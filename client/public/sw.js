const CACHE_NAME = 'groove-v4'

// Only cache files we KNOW exist — don't fail install if optional files missing
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
]

// ── Install ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // addAll fails if any file 404s — use individual adds with catch instead
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
          )
        )
      })
      .then(() => self.skipWaiting())
  )
})

// ── Activate ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

// ── Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET and external/API requests
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/socket.io') ||
    url.hostname.includes('youtube') ||
    url.hostname.includes('youtu.be') ||
    url.hostname.includes('musicbrainz') ||
    url.hostname.includes('acousticbrainz') ||
    url.hostname.includes('render.com') ||
    url.hostname !== self.location.hostname
  ) {
    return
  }

  // Navigation — network first, fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // Static assets — cache first, then network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response
        }
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        return response
      })
    })
  )
})

// ── Messages ──────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

// ── Push Notifications ────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  let p
  try { p = event.data.json() }
  catch { p = { title: 'Groove Together', body: event.data.text() } }

  const vibes = {
    chat:        [80, 40, 80],
    song_added:  [100, 50, 100, 50, 100],
    user_joined: [60],
    dj_crown:    [200, 100, 200],
  }

  event.waitUntil(
    self.registration.showNotification(p.title || 'Groove Together', {
      body:    p.body || '',
      icon:    p.icon  || '/web-app-manifest-192x192.png',
      badge:   p.badge || '/favicon-96x96.png',
      ...(p.image ? { image: p.image } : {}),
      tag:     p.tag   || 'groove',
      renotify: p.renotify !== false,
      silent:  p.silent === true,
      vibrate: vibes[p.type] || [100, 50, 100],
      timestamp: Date.now(),
      requireInteraction: false,
      data: { ...(p.data || {}), type: p.type },
      actions: [
        { action: 'open',    title: 'Open Groove' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return
  const url = event.notification.data?.url || '/'
  const full = new URL(url, self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find(c => c.url.startsWith(self.location.origin))
      if (existing) { existing.focus(); return existing.navigate(full) }
      return clients.openWindow(full)
    })
  )
})

self.addEventListener('notificationclose', () => {})