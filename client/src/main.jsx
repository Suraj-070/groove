import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Landing from './Landing.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

// Simple path-based routing — no react-router needed
const path = window.location.pathname

// PWA standalone mode always goes straight to app
const isPWA = window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true

// /app or /app/* → render the Groove app
// PWA mode → always render the app directly
// anything else (/ or unknown) → render landing page
const isApp = path.startsWith('/app') || isPWA

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {isApp ? <App /> : <Landing />}
    </ErrorBoundary>
  </StrictMode>,
)

// ── PWA Install Prompt ────────────────────────────────────
let deferredPrompt = null

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e
  window.dispatchEvent(new CustomEvent('pwa-installable'))
  console.log('[PWA] Install prompt ready')
})

window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  console.log('[PWA] App installed!')
})

window.__triggerPWAInstall = async () => {
  if (!deferredPrompt) return false
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  return outcome === 'accepted'
}

// ── Register Service Worker ───────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[SW] Registered:', reg.scope)
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage('SKIP_WAITING')
              window.location.reload()
            }
          })
        })
      })
      .catch((err) => console.warn('[SW] Registration failed:', err))
  })
}