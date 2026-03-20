import { useState } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

const GrooveLogo = () => (
  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="logoGrad" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#7c6aff"/>
        <stop offset="100%" stopColor="#ff6a8a"/>
      </linearGradient>
      <linearGradient id="noteGrad" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.95"/>
        <stop offset="100%" stopColor="#e0daff"/>
      </linearGradient>
    </defs>
    <circle cx="28" cy="28" r="28" fill="url(#logoGrad)" opacity="0.15"/>
    <circle cx="28" cy="28" r="22" fill="url(#logoGrad)" opacity="0.2"/>
    <path d="M14 22 Q10 28 14 34" stroke="url(#logoGrad)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/>
    <path d="M10 18 Q4 28 10 38" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4"/>
    <path d="M42 22 Q46 28 42 34" stroke="url(#logoGrad)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/>
    <path d="M46 18 Q52 28 46 38" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4"/>
    <path d="M24 36V22l12-3v14" stroke="url(#noteGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="22" cy="36" r="3.5" fill="url(#noteGrad)"/>
    <circle cx="34" cy="33" r="3.5" fill="url(#noteGrad)"/>
  </svg>
)

// Error messages per type
const ERROR_CONFIG = {
  rate_limit: {
    icon: '⏳',
    title: 'Discord is temporarily unavailable',
    body: "Discord's servers are rate-limiting login attempts from our server. This fixes itself automatically — please wait 15–30 minutes before trying again.",
    tip: '💡 You can still join as a guest while waiting',
    canRetry: false,
  },
  denied: {
    icon: '🚫',
    title: 'Login cancelled',
    body: 'You cancelled the Discord authorization. Click below to try again.',
    tip: null,
    canRetry: true,
  },
  config: {
    icon: '⚙️',
    title: 'Discord not configured',
    body: 'The Discord app credentials are misconfigured on the server. Please contact the admin.',
    tip: null,
    canRetry: false,
  },
  generic: {
    icon: '⚠️',
    title: 'Login failed',
    body: 'Something went wrong connecting to Discord. Please try again in a moment.',
    tip: null,
    canRetry: true,
  },
}

function AuthErrorBanner({ type, onDismiss, onRetry }) {
  const cfg = ERROR_CONFIG[type] || ERROR_CONFIG.generic
  return (
    <div className="rj-auth-error">
      <div className="rj-auth-error-icon">{cfg.icon}</div>
      <div className="rj-auth-error-body">
        <p className="rj-auth-error-title">{cfg.title}</p>
        <p className="rj-auth-error-sub">{cfg.body}</p>
        {cfg.tip && <p className="rj-auth-error-tip">{cfg.tip}</p>}
        <div className="rj-auth-error-actions">
          <button className="rj-auth-error-dismiss" onClick={onDismiss}>Dismiss</button>
          {cfg.canRetry && (
            <button className="rj-auth-error-retry" onClick={onRetry}>
              Try again with Discord
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RoomJoin({ onJoin, user, onGuestLogin }) {
  const [roomId, setRoomId] = useState(() =>
    sessionStorage.getItem('groove_invite_room') || ''
  )
  const [guestName, setGuestName]   = useState('')
  const [showGuest, setShowGuest]   = useState(false)
  const [guestError, setGuestError] = useState('')

  // Detect auth error from redirect URL on mount
  const [loginError, setLoginError] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('error') !== 'auth_failed') return null
    window.history.replaceState({}, '', '/')
    const reason = p.get('reason') || ''
    if (reason === 'rate_limit' || reason.includes('1015')) return 'rate_limit'
    if (reason === 'denied' || reason.includes('access_denied')) return 'denied'
    if (reason === 'config' || reason.includes('invalid_client')) return 'config'
    return 'generic'
  })

  const handleDiscordLogin = () => {
    setLoginError(null)
    window.location.href = `${BACKEND}/auth/discord`
  }

  const handleGoogleLogin = () => {
    window.location.href = `${BACKEND}/auth/google`
  }

  const handleGuestSubmit = () => {
    const name = guestName.trim()
    if (!name)         { setGuestError('Please enter a username'); return }
    if (name.length < 2)  { setGuestError('Must be at least 2 characters'); return }
    if (name.length > 20) { setGuestError('Max 20 characters'); return }
    onGuestLogin({ username: name })
  }

  const handleJoin = () => {
    if (!roomId.trim()) return
    onJoin({ roomId: roomId.toUpperCase().trim() })
  }

  const handleCreate = () => {
    const generated = Math.random().toString(36).substring(2, 8).toUpperCase()
    onJoin({ roomId: generated })
  }

  // ── Not logged in ─────────────────────────────────────────
  if (!user) {
    return (
      <div className="room-join">
        <div className="join-card">
          <div className="join-logo"><GrooveLogo /></div>
          <h1 className="join-title">
            <span className="join-title-big">GROOVE</span>
            <span className="join-title-small">· together ·</span>
          </h1>
          <p className="join-sub">Listen to music in sync with your friends</p>

          {/* Auth error banner — shows when redirected back after failed login */}
          {loginError && (
            <AuthErrorBanner
              type={loginError}
              onDismiss={() => setLoginError(null)}
              onRetry={handleDiscordLogin}
            />
          )}

          {!showGuest ? (
            <>
              <button className="discord-login-btn" onClick={handleDiscordLogin}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.003.022.015.04.03.05a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                </svg>
                Continue with Discord
              </button>

              <button className="google-login-btn" onClick={handleGoogleLogin}>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <div className="divider"><span>or</span></div>

              <button className="guest-login-btn" onClick={() => setShowGuest(true)}>
                👤 Continue as Guest
              </button>

              <p className="join-note">Guest accounts don't save your library</p>
            </>
          ) : (
            <div className="guest-form">
              <p className="guest-form-title">Choose a username</p>
              <input
                type="text"
                placeholder="Your display name..."
                value={guestName}
                onChange={(e) => { setGuestName(e.target.value); setGuestError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleGuestSubmit()}
                maxLength={20}
                autoFocus
              />
              {guestError && <p className="guest-error">{guestError}</p>}
              <button className="btn-primary" onClick={handleGuestSubmit}>
                Join as Guest
              </button>
              <button className="btn-back" onClick={() => { setShowGuest(false); setGuestError('') }}>
                ← Back to login
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Logged in — show room join ────────────────────────────
  const providerLabel = user.isGuest
    ? '👤 Guest'
    : user.provider === 'google'
    ? '🔵 via Google'
    : '🎮 via Discord'

  return (
    <div className="room-join">
      <div className="join-card">
        <div className="join-logo"><GrooveLogo /></div>
        <h1 className="join-title">
          <span className="join-title-big">GROOVE</span>
          <span className="join-title-small">· together ·</span>
        </h1>

        <div className="discord-user">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="discord-avatar" />
          ) : (
            <div className="discord-avatar-placeholder">
              {user.username?.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="discord-name">{user.username}</p>
            <p className="discord-sub">{providerLabel}</p>
          </div>
        </div>

        <div className="join-form">
          <input
            type="text"
            placeholder="Room code (e.g. GROOVE1)"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            maxLength={10}
          />
          <button className="btn-primary" onClick={handleJoin}>
            Join Room
          </button>
          <div className="divider"><span>or</span></div>
          <button className="btn-secondary" onClick={handleCreate}>
            Create New Room
          </button>
        </div>
      </div>
    </div>
  )
}