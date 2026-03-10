import { useState } from 'react'

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
    {/* Background circle */}
    <circle cx="28" cy="28" r="28" fill="url(#logoGrad)" opacity="0.15"/>
    <circle cx="28" cy="28" r="22" fill="url(#logoGrad)" opacity="0.2"/>
    {/* Sound waves left */}
    <path d="M14 22 Q10 28 14 34" stroke="url(#logoGrad)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/>
    <path d="M10 18 Q4 28 10 38" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4"/>
    {/* Sound waves right */}
    <path d="M42 22 Q46 28 42 34" stroke="url(#logoGrad)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/>
    <path d="M46 18 Q52 28 46 38" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4"/>
    {/* Music note */}
    <path d="M24 36V22l12-3v14" stroke="url(#noteGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="22" cy="36" r="3.5" fill="url(#noteGrad)"/>
    <circle cx="34" cy="33" r="3.5" fill="url(#noteGrad)"/>
  </svg>
)

export default function RoomJoin({ onJoin, user }) {
  const [roomId, setRoomId] = useState('')

  const handleDiscordLogin = () => {
    window.location.href = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/auth/discord`
  }

  const handleJoin = () => {
    if (!roomId.trim()) return
    onJoin({ roomId: roomId.toUpperCase().trim() })
  }

  const handleCreate = () => {
    const generated = Math.random().toString(36).substring(2, 8).toUpperCase()
    onJoin({ roomId: generated })
  }

  // Not logged in yet
  if (!user) {
    return (
      <div className="room-join">
        <div className="join-card">
          <div className="join-logo"><GrooveLogo /></div>
          <h1 className="join-title"><span className="join-title-big">GROOVE</span><span className="join-title-small">· together ·</span></h1>
          <p className="join-sub">Listen to music in sync with your friends</p>

          <button className="discord-login-btn" onClick={handleDiscordLogin}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.003.022.015.04.03.05a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
            </svg>
            Login with Discord
          </button>

          <p className="join-note">Your library will be saved permanently to your Discord account</p>
        </div>
      </div>
    )
  }

  // Logged in — show room join
  return (
    <div className="room-join">
      <div className="join-card">
        <div className="join-logo"><GrooveLogo /></div>
        <h1 className="join-title"><span className="join-title-big">GROOVE</span><span className="join-title-small">· together ·</span></h1>

        {/* Discord user info */}
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
            <p className="discord-sub">Logged in with Discord</p>
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
