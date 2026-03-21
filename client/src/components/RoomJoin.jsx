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

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

export default function RoomJoin({ onJoin, user, onGuestLogin }) {
  const [roomId, setRoomId]         = useState(() => sessionStorage.getItem('groove_invite_room') || '')
  const [guestName, setGuestName]   = useState('')
  const [guestError, setGuestError] = useState('')
  const [view, setView]             = useState('login') // 'login' | 'guest'

  const handleGoogleLogin = () => { window.location.href = `${BACKEND}/auth/google` }

  const handleGuestSubmit = () => {
    const name = guestName.trim()
    if (!name)            { setGuestError('Please enter a username'); return }
    if (name.length < 2)  { setGuestError('Must be at least 2 characters'); return }
    if (name.length > 20) { setGuestError('Max 20 characters'); return }
    onGuestLogin({ username: name })
  }

  const handleJoin = () => {
    if (!roomId.trim()) return
    onJoin({ roomId: roomId.toUpperCase().trim() })
  }

  const handleCreate = () => {
    onJoin({ roomId: Math.random().toString(36).substring(2, 8).toUpperCase() })
  }

  // Not logged in
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

          {view === 'login' ? (
            <div className="join-form">
              <button className="google-login-btn" onClick={handleGoogleLogin}>
                <GoogleIcon />
                Continue with Google
              </button>
              <div className="divider"><span>or</span></div>
              <button className="guest-login-btn" onClick={() => setView('guest')}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                </svg>
                Continue as Guest
              </button>
              <p className="join-note">Guest accounts don't save your library or history</p>
            </div>
          ) : (
            <div className="guest-form">
              <p className="guest-form-title">Choose your display name</p>
              <input
                className="join-form-input"
                type="text"
                placeholder="e.g. DreamCatcher..."
                value={guestName}
                onChange={(e) => { setGuestName(e.target.value); setGuestError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleGuestSubmit()}
                maxLength={20}
                autoFocus
              />
              {guestError && <p className="guest-error">{guestError}</p>}
              <button className="btn-primary" onClick={handleGuestSubmit}>Enter Groove →</button>
              <button className="btn-back" onClick={() => { setView('login'); setGuestError('') }}>← Back</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Logged in — room join
  const providerLabel = user.isGuest ? '👤 Guest' : '🔵 via Google'

  return (
    <div className="room-join">
      <div className="join-card">
        <div className="join-logo"><GrooveLogo /></div>
        <h1 className="join-title">
          <span className="join-title-big">GROOVE</span>
          <span className="join-title-small">· together ·</span>
        </h1>

        <div className="discord-user">
          {user.avatar
            ? <img src={user.avatar} alt="" className="discord-avatar" />
            : <div className="discord-avatar-placeholder">{user.username?.slice(0, 2).toUpperCase()}</div>
          }
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
          <button className="btn-primary" onClick={handleJoin} disabled={!roomId.trim()}>
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