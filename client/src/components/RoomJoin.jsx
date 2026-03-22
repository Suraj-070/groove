import { useState } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

const GrooveLogo = () => (
  <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
    <defs>
      <linearGradient id="rjg1" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#7c6aff"/><stop offset="100%" stopColor="#ff6a8a"/>
      </linearGradient>
      <linearGradient id="rjg2" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.95"/><stop offset="100%" stopColor="#e0daff"/>
      </linearGradient>
    </defs>
    <circle cx="28" cy="28" r="28" fill="url(#rjg1)" opacity="0.15"/>
    <circle cx="28" cy="28" r="22" fill="url(#rjg1)" opacity="0.2"/>
    <path d="M14 22 Q10 28 14 34" stroke="url(#rjg1)" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M42 22 Q46 28 42 34" stroke="url(#rjg1)" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M24 36V22l12-3v14" stroke="url(#rjg2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="22" cy="36" r="3.5" fill="url(#rjg2)"/>
    <circle cx="34" cy="33" r="3.5" fill="url(#rjg2)"/>
  </svg>
)

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

function Input({ label, type = 'text', value, onChange, placeholder, autoFocus, hint }) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.02em' }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          type={isPassword && show ? 'text' : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          style={{
            width: '100%', padding: isPassword ? '12px 42px 12px 14px' : '12px 14px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, color: '#fff', fontFamily: 'inherit', fontSize: '0.92rem',
            outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s', boxSizing: 'border-box',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(124,106,255,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(124,106,255,0.12)' }}
          onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', padding: 0 }}>
            {show ? '🙈' : '👁'}
          </button>
        )}
      </div>
      {hint && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>{hint}</span>}
    </div>
  )
}

function ErrorMsg({ msg }) {
  if (!msg) return null
  return (
    <div style={{ background: 'rgba(255,106,138,0.1)', border: '1px solid rgba(255,106,138,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem', color: '#ffb0c0' }}>
      {msg}
    </div>
  )
}

function SuccessMsg({ msg }) {
  if (!msg) return null
  return (
    <div style={{ background: 'rgba(0,201,116,0.1)', border: '1px solid rgba(0,201,116,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem', color: '#80e8c0', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span>✓</span>{msg}
    </div>
  )
}

function PrimaryBtn({ children, onClick, loading, disabled }) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      style={{ width: '100%', padding: '13px', background: 'linear-gradient(135deg,#7c6aff,#ff6a8a)', border: 'none', borderRadius: 12, color: '#fff', fontFamily: 'inherit', fontSize: '0.95rem', fontWeight: 700, cursor: loading || disabled ? 'not-allowed' : 'pointer', opacity: loading || disabled ? 0.7 : 1, transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 16px rgba(124,106,255,0.3)' }}
      onMouseEnter={e => { if (!loading && !disabled) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(124,106,255,0.4)' }}}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,106,255,0.3)' }}
    >
      {loading ? '...' : children}
    </button>
  )
}

function GhostBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0', transition: 'color 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.color = '#fff'}
      onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
    >
      {children}
    </button>
  )
}

function Divider({ label = 'or' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', fontWeight: 500 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
    </div>
  )
}

export default function RoomJoin({ onJoin, user, onGuestLogin }) {
  const [roomId, setRoomId]       = useState(() => sessionStorage.getItem('groove_invite_room') || '')
  const [view, setView]           = useState('home') // home | login | register | magic | magic-sent | guest | forgot | reset
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')

  // Email + password
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [username, setUsername]   = useState('')
  const [confirmPw, setConfirmPw] = useState('')

  // Guest
  const [guestName, setGuestName] = useState('')

  const reset = (v) => { setError(''); setSuccess(''); setView(v) }

  // ── API calls ─────────────────────────────────────────
  const apiPost = async (path, body) => {
    const res = await fetch(`${BACKEND}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Something went wrong')
    return data
  }

  const handleRegister = async () => {
    if (!email.trim()) return setError('Email is required')
    if (!username.trim()) return setError('Username is required')
    if (!password) return setError('Password is required')
    if (password !== confirmPw) return setError('Passwords do not match')
    setLoading(true); setError('')
    try {
      const userData = await apiPost('/auth/email/register', { email, password, username })
      onGuestLogin(userData) // reuse the login handler
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleLogin = async () => {
    if (!email.trim() || !password) return setError('Email and password are required')
    setLoading(true); setError('')
    try {
      const userData = await apiPost('/auth/email/login', { email, password })
      onGuestLogin(userData)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const [magicLink, setMagicLink] = useState('')

  const handleMagicSend = async () => {
    if (!email.trim()) return setError('Email is required')
    setLoading(true); setError('')
    try {
      const data = await apiPost('/auth/magic/send', { email })
      if (data.devLink && !data.emailConfigured) {
        // Email not configured — show clickable link directly
        setMagicLink(data.devLink)
        setView('magic-sent')
      } else if (data.devToken) {
        // Dev mode auto-verify
        const userData = await apiPost('/auth/magic/verify', { token: data.devToken })
        onGuestLogin(userData)
      } else {
        setMagicLink('')
        setView('magic-sent')
      }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleForgot = async () => {
    if (!email.trim()) return setError('Email is required')
    setLoading(true); setError('')
    try {
      await apiPost('/auth/email/forgot', { email })
      setSuccess('If an account exists, a reset link has been sent to your email.')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleGuestSubmit = async () => {
    const name = guestName.trim()
    if (!name) return setError('Please enter a username')
    if (name.length < 2) return setError('Must be at least 2 characters')
    if (name.length > 20) return setError('Max 20 characters')
    onGuestLogin({ username: name })
  }

  const handleJoin = () => {
    if (!roomId.trim()) return
    onJoin({ roomId: roomId.toUpperCase().trim() })
  }

  const handleCreate = () => {
    onJoin({ roomId: Math.random().toString(36).substring(2, 8).toUpperCase() })
  }

  // ── Card wrapper ──────────────────────────────────────
  const Card = ({ children }) => (
    <div className="room-join">
      <div className="join-card">
        <div className="join-logo"><GrooveLogo /></div>
        <h1 className="join-title">
          <span className="join-title-big">GROOVE</span>
          <span className="join-title-small">· together ·</span>
        </h1>
        {children}
      </div>
    </div>
  )

  // ── Not logged in views ───────────────────────────────
  if (!user) {

    // Magic link sent confirmation
    if (view === 'magic-sent') return (
      <Card>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          {magicLink ? (
            <>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✨</div>
              <p style={{ fontWeight: 700, color: '#fff', marginBottom: 8 }}>Your magic link is ready!</p>
              <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
                Email isn't configured yet — click the button below to sign in directly.
              </p>
              <a href={magicLink}
                style={{ display: 'inline-block', padding: '13px 32px', background: 'linear-gradient(135deg,#7c6aff,#ff6a8a)', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none', marginBottom: 16 }}>
                Sign In Now →
              </a>
            </>
          ) : (
            <>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📬</div>
              <p style={{ fontWeight: 700, color: '#fff', marginBottom: 8 }}>Check your inbox!</p>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 20 }}>
                We sent a magic link to <strong style={{ color: '#c4b5fd' }}>{email}</strong>. Click it to sign in — expires in 15 minutes.
              </p>
            </>
          )}
          <GhostBtn onClick={() => { reset('magic'); setEmail(''); setMagicLink('') }}>← Try a different email</GhostBtn>
        </div>
      </Card>
    )

    // Magic link view
    if (view === 'magic') return (
      <Card>
        <p className="join-sub" style={{ marginBottom: 20 }}>We'll email you a sign-in link — no password needed.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ErrorMsg msg={error} />
          <Input label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoFocus />
          <PrimaryBtn onClick={handleMagicSend} loading={loading}>Send Magic Link ✨</PrimaryBtn>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <GhostBtn onClick={() => reset('home')}>← Back</GhostBtn>
            <GhostBtn onClick={() => reset('login')}>Use password instead</GhostBtn>
          </div>
        </div>
      </Card>
    )

    // Register view
    if (view === 'register') return (
      <Card>
        <p className="join-sub" style={{ marginBottom: 20 }}>Create your Groove account</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ErrorMsg msg={error} />
          <Input label="Username" value={username} onChange={setUsername} placeholder="Your display name" autoFocus />
          <Input label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Min 6 characters" hint="At least 6 characters" />
          <Input label="Confirm password" type="password" value={confirmPw} onChange={setConfirmPw} placeholder="Repeat password" />
          <PrimaryBtn onClick={handleRegister} loading={loading}>Create Account</PrimaryBtn>
          <Divider />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <GhostBtn onClick={() => reset('home')}>← Back</GhostBtn>
            <GhostBtn onClick={() => reset('login')}>Already have an account?</GhostBtn>
          </div>
        </div>
      </Card>
    )

    // Login view
    if (view === 'login') return (
      <Card>
        <p className="join-sub" style={{ marginBottom: 20 }}>Sign in to your account</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ErrorMsg msg={error} />
          <Input label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoFocus />
          <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Your password" />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <GhostBtn onClick={() => reset('forgot')}>Forgot password?</GhostBtn>
          </div>
          <PrimaryBtn onClick={handleLogin} loading={loading}>Sign In</PrimaryBtn>
          <Divider />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <GhostBtn onClick={() => reset('home')}>← Back</GhostBtn>
            <GhostBtn onClick={() => reset('register')}>Create account</GhostBtn>
          </div>
        </div>
      </Card>
    )

    // Forgot password view
    if (view === 'forgot') return (
      <Card>
        <p className="join-sub" style={{ marginBottom: 20 }}>Reset your password</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ErrorMsg msg={error} />
          <SuccessMsg msg={success} />
          {!success && <>
            <Input label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoFocus />
            <PrimaryBtn onClick={handleForgot} loading={loading}>Send Reset Link</PrimaryBtn>
          </>}
          <GhostBtn onClick={() => reset('login')}>← Back to sign in</GhostBtn>
        </div>
      </Card>
    )

    // Guest view
    if (view === 'guest') return (
      <Card>
        <p className="join-sub" style={{ marginBottom: 20 }}>Choose your display name</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ErrorMsg msg={error} />
          <Input value={guestName} onChange={v => { setGuestName(v); setError('') }} placeholder="e.g. DreamCatcher..." autoFocus />
          <PrimaryBtn onClick={handleGuestSubmit}>Enter Groove →</PrimaryBtn>
          <GhostBtn onClick={() => reset('home')}>← Back</GhostBtn>
          <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>Guest accounts don't save your library or history</p>
        </div>
      </Card>
    )

    // HOME — main login options
    return (
      <Card>
        <p className="join-sub">Listen to music in sync with your friends</p>
        <div className="join-form" style={{ gap: 10 }}>
          {/* Google */}
          <button className="google-login-btn" onClick={() => window.location.href = `${BACKEND}/auth/google`}>
            <GoogleIcon />
            Continue with Google
          </button>

          <Divider />

          {/* Email options */}
          <button onClick={() => reset('login')}
            style={{ width: '100%', padding: '12px', background: 'rgba(124,106,255,0.1)', border: '1px solid rgba(124,106,255,0.25)', borderRadius: 12, color: '#c4b5fd', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,106,255,0.18)'; e.currentTarget.style.borderColor = 'rgba(124,106,255,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,106,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(124,106,255,0.25)' }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
            Sign in with Email
          </button>

          <button onClick={() => reset('magic')}
            style={{ width: '100%', padding: '12px', background: 'rgba(255,184,106,0.08)', border: '1px solid rgba(255,184,106,0.2)', borderRadius: 12, color: '#ffd080', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,184,106,0.14)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,184,106,0.08)'}
          >
            ✨ Magic Link — no password
          </button>

          <button onClick={() => reset('register')}
            style={{ width: '100%', padding: '12px', background: 'rgba(0,201,116,0.07)', border: '1px solid rgba(0,201,116,0.18)', borderRadius: 12, color: '#80e8c0', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,201,116,0.12)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,201,116,0.07)'}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            Create Account
          </button>

          <Divider />

          <button className="guest-login-btn" onClick={() => reset('guest')}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
            Continue as Guest
          </button>
        </div>
      </Card>
    )
  }

  // ── Logged in — room join ────────────────────────────────
  const providerLabel = user.isGuest ? '👤 Guest' : user.provider === 'google' ? '🔵 via Google' : '✉️ via Email'

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
            onChange={e => setRoomId(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            maxLength={10}
          />
          <button className="btn-primary" onClick={handleJoin} disabled={!roomId.trim()}>Join Room</button>
          <div className="divider"><span>or</span></div>
          <button className="btn-secondary" onClick={handleCreate}>Create New Room</button>
        </div>
      </div>
    </div>
  )
}