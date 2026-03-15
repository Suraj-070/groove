const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function isPushSupported() {
  return 'serviceWorker' in navigator &&
         'PushManager'   in window &&
         'Notification'  in window &&
         (location.protocol === 'https:' || location.hostname === 'localhost')
}

export async function getPushStatus() {
  if (!isPushSupported()) return { supported: false }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: !!sub,
  }
}

export async function subscribeToPush(prefs = {}) {
  if (!isPushSupported()) throw new Error('Push not supported on this device')
  if (Notification.permission === 'denied')
    throw new Error('Notifications blocked. Enable them in browser settings.')
  const keyRes = await fetch(`${BACKEND}/push/vapid-public-key`, { credentials: 'include' })
  if (!keyRes.ok) throw new Error('Push not configured on server')
  const { key } = await keyRes.json()
  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key)
  })
  const res = await fetch(`${BACKEND}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ subscription: subscription.toJSON(), prefs })
  })
  if (!res.ok) throw new Error('Failed to save subscription')
  return subscription
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await sub.unsubscribe()
    await fetch(`${BACKEND}/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ endpoint: sub.endpoint })
    })
  }
}

export async function updatePushPrefs(prefs) {
  await fetch(`${BACKEND}/push/prefs`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ prefs })
  })
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[Groove SW] serviceWorker not in navigator')
    return null
  }
  try {
    // Register the SW
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    // Wait for it to be active — critical for PushManager to work
    await navigator.serviceWorker.ready
    console.log('[Groove SW] registered and ready:', reg.scope)
    return reg
  } catch (e) {
    console.warn('[Groove SW] registration failed:', e.message)
    return null
  }
}

// Comprehensive support check with individual failure reasons
export function getPushSupportDetails() {
  const checks = {
    serviceWorker: 'serviceWorker' in navigator,
    pushManager:   'PushManager'   in window,
    notification:  'Notification'  in window,
    isSecure:      location.protocol === 'https:' || location.hostname === 'localhost',
  }
  const supported = Object.values(checks).every(Boolean)
  return { supported, checks }
}