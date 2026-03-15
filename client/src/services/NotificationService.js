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
         'Notification'  in window
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
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    return reg
  } catch (e) {
    console.warn('SW registration failed:', e)
    return null
  }
}
