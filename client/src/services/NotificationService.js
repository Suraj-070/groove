const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// Simple check — just the three APIs we need
export function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager'   in window    &&
    'Notification'  in window
  )
}

// Register and wait until active
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    // Wait for SW to become active — required before using PushManager
    if (reg.installing) {
      await new Promise(resolve => {
        reg.installing.addEventListener('statechange', function handler(e) {
          if (e.target.state === 'activated') {
            reg.installing?.removeEventListener('statechange', handler)
            resolve()
          }
        })
      })
    }
    await navigator.serviceWorker.ready
    return reg
  } catch (e) {
    console.warn('[Groove SW] failed:', e.message)
    return null
  }
}

export async function getPushStatus() {
  if (!isPushSupported()) return { supported: false }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return {
      supported: true,
      permission: Notification.permission,
      subscribed: !!sub,
    }
  } catch (e) {
    return { supported: false, error: e.message }
  }
}

export async function subscribeToPush(prefs = {}) {
  if (!isPushSupported()) throw new Error('Push not supported')

  // Request permission first if not granted
  if (Notification.permission !== 'granted') {
    const result = await Notification.requestPermission()
    if (result !== 'granted') throw new Error('Permission denied')
  }

  // Get VAPID key from server
  const keyRes = await fetch(`${BACKEND}/push/vapid-public-key`, {
    credentials: 'include'
  })
  if (!keyRes.ok) throw new Error('Push not configured on server')
  const { key } = await keyRes.json()

  // Subscribe
  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key)
  })

  // Save to server
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
  try {
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
  } catch (e) {
    console.warn('[Groove Push] unsubscribe failed:', e.message)
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
