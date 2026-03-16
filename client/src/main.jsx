import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// ── PWA Install Prompt ────────────────────────────────────
let deferredPrompt = null

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e
  // Dispatch custom event so any component can trigger install
  window.dispatchEvent(new CustomEvent('pwa-installable'))
  console.log('[PWA] Install prompt ready')
})

window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  console.log('[PWA] App installed!')
})

// Expose install trigger globally
window.__triggerPWAInstall = async () => {
  if (!deferredPrompt) return false
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  return outcome === 'accepted'
}

// ── Register Service Worker for PWA support ───────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[SW] Registered:', reg.scope)

        // When a new SW is waiting, reload to activate it
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available — you could show a "Update available" toast here
              newWorker.postMessage('SKIP_WAITING')
              window.location.reload()
            }
          })
        })
      })
      .catch((err) => console.warn('[SW] Registration failed:', err))
  })
}
