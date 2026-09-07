const CACHE_NAME = 'groove-v6'

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/silence.mp3',          // critical for iOS background audio
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

// ── Install ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
          )
        )
      )
      .then(() => self.skipWaiting())
  )
})

// ── Activate ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

// ── Fetch — cache-first for static, network-first for API ─
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Always network for API/socket calls
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/auth') ||
    url.hostname !== self.location.hostname
  ) {
    return  // let browser handle
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        }
        return response
      }).catch(() => caches.match('/index.html'))
    })
  )
})

// ── Push notifications ────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'Groove Together', {
      body: data.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      data: data,
      tag: 'groove-notification',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow('/')
  )
})

// Force update when main app requests it
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
