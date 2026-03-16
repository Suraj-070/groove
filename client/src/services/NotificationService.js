const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

// Get SW registration with a timeout — navigator.serviceWorker.ready
// can hang if old SW is stuck in waiting state
async function getSwRegistration(timeoutMs = 3000) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SW ready timeout')), timeoutMs)
    )
  ])
}

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
    // If a new SW is waiting, tell it to skip waiting and take over immediately
    // This fixes the "SW stuck in waiting" problem that causes ready to hang
    if (reg.waiting) {
      reg.waiting.postMessage('SKIP_WAITING')
    }
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing
      if (newSW) {
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            newSW.postMessage('SKIP_WAITING')
          }
        })
      }
    })
    return reg
  } catch (e) {
    console.warn('[Groove SW] failed:', e.message)
    return null
  }
}

export async function getPushStatus() {
  if (!isPushSupported()) return { supported: false }
  try {
    const reg = await getSwRegistration()
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
  const reg = await getSwRegistration()
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
    const reg = await getSwRegistration()
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